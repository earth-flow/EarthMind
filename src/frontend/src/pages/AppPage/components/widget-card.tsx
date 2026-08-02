import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import type { WidgetKind } from "@/types/appPage/widget";

export const KIND_ICON: Record<WidgetKind, string> = {
  image: "Image",
  pdf: "FileText",
  docx: "FileText",
  xlsx: "FileSpreadsheet",
  geojson: "Map",
  mesh: "Box",
  json: "Braces",
  table: "Table",
  text: "AlignLeft",
  file: "File",
  error: "AlertCircle",
  knowledge_graph: "Network",
  empty: "LayoutDashboard",
};

type WidgetCardProps = {
  kind: WidgetKind;
  title: string;
  children: React.ReactNode;
};

/** Common chrome (title bar + scrollable content area) shared by every widget, so individual widgets only render content. */
export function WidgetCard({ kind, title, children }: WidgetCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-md border bg-background"
      data-testid={`app-widget-${kind}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <ForwardedIconComponent
          name={KIND_ICON[kind]}
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <span className="truncate text-sm font-medium" title={title}>
          {title}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {kind === "empty" ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("app.widgets.noOutputYet")}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
