import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";

type AppWidgetRegionProps = {
  isChatOpen: boolean;
  onShowChat: () => void;
};

/**
 * Host region for the App page's visual widgets.
 *
 * M1 ships the region and its empty state only. The widget grid, the widget
 * registry and the node bindings that feed them land in M2 — this component
 * is the seam they plug into.
 */
export function AppWidgetRegion({
  isChatOpen,
  onShowChat,
}: AppWidgetRegionProps): JSX.Element {
  const { t } = useTranslation();

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
    </div>
  );
}
