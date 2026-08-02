import ErrorOutput from "@/CustomNodes/GenericNode/components/outputModal/components/switchOutputView/components";
import type { WidgetContentProps } from "@/types/appPage/widget";

/** Renders "error"/"ValueError" typed outputs the same way the output modal does. */
export function ErrorWidget({ output }: WidgetContentProps) {
  const message = output.message ?? {};
  return (
    <ErrorOutput
      value={`${message.errorMessage ?? ""}\n\n${message.stackTrace ?? ""}`}
    />
  );
}
