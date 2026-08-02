import DataOutputComponent from "@/components/core/dataOutputComponent";
import type { WidgetContentProps } from "@/types/appPage/widget";

/** Renders "array"/"message" typed outputs, reusing the same ag-grid table SwitchOutputView uses. */
export function TableWidget({ output }: WidgetContentProps) {
  const message = output.message;
  const rows = Array.isArray(message)
    ? message.every((item) => item?.data)
      ? message.map((item) => item.data)
      : message
    : Object.keys(message ?? {}).length > 0
      ? [message]
      : [];

  return <DataOutputComponent rows={rows} pagination columnMode="union" />;
}
