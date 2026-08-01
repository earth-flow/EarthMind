import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FlowPageSlidingContainerContent } from "@/components/core/playgroundComponent/sliding-container/components/flow-page-sliding-container";
import {
  SimpleSidebar,
  SimpleSidebarProvider,
} from "@/components/ui/simple-sidebar";
import { useGetFlow } from "@/controllers/API/queries/flows/use-get-flow";
import { useGetTypes } from "@/controllers/API/queries/flows/use-get-types";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useApplyFlowToCanvas from "@/hooks/flows/use-apply-flow-to-canvas";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useTypesStore } from "@/stores/typesStore";
import { isSiblingFlowView } from "@/utils/flow-view-routing";
import { AppWidgetRegion } from "./components/app-widget-region";

const CHAT_PANEL_WIDTH = "420px";
/** Fractions of the page width the chat panel may be dragged between. */
const CHAT_PANEL_MIN_WIDTH = 0.2;
const CHAT_PANEL_MAX_WIDTH = 0.7;

/**
 * Runtime view of a flow: visual widgets on the left, the playground chat
 * docked on the right.
 *
 * A sibling mode of ``FlowPage`` rather than a separate surface — both are
 * authenticated, both operate on the same flow, and the user moves between
 * them freely. The flow therefore has to be loaded into ``flowStore`` exactly
 * as the editor loads it: the chat and the build machinery read their
 * inputs/outputs from the store, not from the canvas.
 */
export default function AppPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useCustomNavigate();

  const types = useTypesStore((state) => state.types);
  useGetTypes({ enabled: Object.keys(types).length <= 0 });

  const currentFlow = useFlowStore((state) => state.currentFlow);
  const setOnFlowPage = useFlowStore((state) => state.setOnFlowPage);

  const flows = useFlowsManagerStore((state) => state.flows);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const setCurrentFlow = useFlowsManagerStore((state) => state.setCurrentFlow);

  const { mutateAsync: getFlow } = useGetFlow();
  const applyFlowToCanvas = useApplyFlowToCanvas();

  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);

  // ``onFlowPage`` gates the header's flow breadcrumb and build logging, both
  // of which the App page wants.
  useEffect(() => {
    setOnFlowPage(true);

    return () => {
      setOnFlowPage(false);
      // Mirrors FlowPage: switching back to the canvas keeps the same
      // in-memory flow, so neither view has to save or refetch on toggle.
      if (!isSiblingFlowView(window.location.pathname, id)) {
        setCurrentFlow(undefined);
      }
    };
  }, [id]);

  // Mirrors FlowPage's load guard: fetch only when the store is empty, so
  // moving Editor -> App preserves unsaved graph edits instead of silently
  // replacing them with the server copy.
  useEffect(() => {
    const loadFlowIntoStore = async () => {
      if (!flows || currentFlowId !== "" || Object.keys(types).length === 0) {
        return;
      }

      const existingFlow = flows.find((flow) => flow.id === id);
      if (!existingFlow) {
        navigate("/all");
        return;
      }

      applyFlowToCanvas(await getFlow({ id: existingFlow.id }));
    };

    loadFlowIntoStore();
  }, [id, flows, currentFlowId, types]);

  return (
    <div className="flow-page-positioning">
      {currentFlow && (
        <div className="flex h-full overflow-hidden" data-testid="app-page">
          <SimpleSidebarProvider
            width={CHAT_PANEL_WIDTH}
            minWidth={CHAT_PANEL_MIN_WIDTH}
            maxWidth={CHAT_PANEL_MAX_WIDTH}
            open={isChatOpen}
            onOpenChange={setIsChatOpen}
            fullscreen={isChatFullscreen}
            onMaxWidth={() => {
              setIsChatFullscreen(true);
              setIsChatOpen(true);
            }}
          >
            <main className="flex min-w-0 flex-1 overflow-hidden">
              <AppWidgetRegion
                isChatOpen={isChatOpen}
                onShowChat={() => setIsChatOpen(true)}
              />
            </main>
            <SimpleSidebar resizable={!isChatFullscreen} className="h-full">
              <FlowPageSlidingContainerContent
                isFullscreen={isChatFullscreen}
                setIsFullscreen={setIsChatFullscreen}
              />
            </SimpleSidebar>
          </SimpleSidebarProvider>
        </div>
      )}
    </div>
  );
}
