import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import useFlowStore from "@/stores/flowStore";
import { deriveDefaultWidgetLayout } from "../utils/derive-widget-layout";
import { WidgetHost } from "./widget-host";

type AppWidgetRegionProps = {
  isChatOpen: boolean;
  onShowChat: () => void;
};

/**
 * Host region for the App page's visual widgets.
 *
 * The widget layout is auto-derived from the flow's current shape and run
 * data (see deriveDefaultWidgetLayout) rather than persisted -- persistence
 * and a manual widget picker are M4 scope. With no eligible outputs yet
 * (fresh/never-run flow), this falls back to the original M1 empty state.
 */
export function AppWidgetRegion({
  isChatOpen,
  onShowChat,
}: AppWidgetRegionProps): JSX.Element {
  const { t } = useTranslation();
  const nodes = useFlowStore((state) => state.nodes);
  const flowPool = useFlowStore((state) => state.flowPool);

  const layout = useMemo(
    () => deriveDefaultWidgetLayout(nodes, flowPool),
    [nodes, flowPool],
  );

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      data-testid="app-widget-region"
    >
      {/* Toolbar. The chat panel owns its own close control, so this is the
          only way back once it has been dismissed. */}
      <div className="flex h-12 shrink-0 items-center justify-end px-4">
        {!isChatOpen && (
          <Button
            variant="outline"
            size="md"
            onClick={onShowChat}
            data-testid="app_show_chat_button"
          >
            <ForwardedIconComponent name="MessageSquare" className="h-4 w-4" />
            {t("app.chat.show")}
          </Button>
        )}
      </div>

      {layout.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            <ForwardedIconComponent
              name="LayoutDashboard"
              className="h-8 w-8 text-muted-foreground"
            />
            <span className="text-sm font-medium">
              {t("app.widgets.emptyTitle")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("app.widgets.emptyDescription")}
            </span>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
          {layout.map((item) => (
            <WidgetHost key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
