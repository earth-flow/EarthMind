import TextOutputView from "@/shared/components/textOutputView";
import type { WidgetContentProps } from "@/types/appPage/widget";

/** Renders "text" typed outputs via the shared read-only textarea view. */
export function TextWidget({ output }: WidgetContentProps) {
  return <TextOutputView left={false} value={output.message} />;
}
