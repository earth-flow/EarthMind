import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs-button";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useFlowStore from "@/stores/flowStore";

const EDITOR_VIEW = "editor";
const APP_VIEW = "app";

/**
 * Switches a flow between its editor canvas (``/flow/:id``) and its App
 * runtime (``/flow/:id/app``). Renders only while a flow is open.
 */
export default function FlowViewToggle(): JSX.Element | null {
  const { t } = useTranslation();
  const navigate = useCustomNavigate();
  const { pathname } = useLocation();

  const onFlowPage = useFlowStore((state) => state.onFlowPage);
  const currentFlowId = useFlowStore((state) => state.currentFlow?.id);

  if (!onFlowPage || !currentFlowId) return null;

  const currentView = pathname.endsWith(`/${APP_VIEW}`)
    ? APP_VIEW
    : EDITOR_VIEW;

  const handleViewChange = (view: string) => {
    if (view === currentView) return;

    navigate(
      view === APP_VIEW
        ? `/flow/${currentFlowId}/${APP_VIEW}`
        : `/flow/${currentFlowId}`,
    );
  };

  return (
    <Tabs value={currentView} onValueChange={handleViewChange}>
      <TabsList className="h-8" data-testid="flow_view_toggle">
        <TabsTrigger value={EDITOR_VIEW} data-testid="flow_view_toggle_editor">
          {t("app.viewToggle.editor")}
        </TabsTrigger>
        <TabsTrigger value={APP_VIEW} data-testid="flow_view_toggle_app">
          {t("app.viewToggle.app")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
