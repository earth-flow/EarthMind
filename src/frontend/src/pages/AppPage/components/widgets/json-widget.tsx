import JsonOutputViewComponent from "@/components/core/jsonOutputComponent/json-output-view";
import type { WidgetContentProps } from "@/types/appPage/widget";

/** Renders "data"/"object" typed outputs via the existing JSON tree viewer. */
export function JsonWidget({ binding, output }: WidgetContentProps) {
  return (
    <JsonOutputViewComponent
      nodeId={binding.nodeId}
      outputName={binding.outputName}
      data={output.message}
    />
  );
}
