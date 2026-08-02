import useFlowStore from "@/stores/flowStore";
import type { WidgetLayoutItem } from "@/types/appPage/widget";
import { resolveWidgetKind } from "../utils/resolve-widget-kind";
import { WIDGET_REGISTRY } from "../utils/widget-registry";
import { WidgetCard } from "./widget-card";

/** Reads the bound output from flowPool, resolves its widget kind, and renders it inside the common card shell. */
export function WidgetHost({ item }: { item: WidgetLayoutItem }) {
  const flowPool = useFlowStore((state) => state.flowPool);

  const runs = flowPool[item.binding.nodeId];
  const lastRun = runs?.[runs.length - 1];
  const output = lastRun?.data?.outputs?.[item.binding.outputName];
  const kind = resolveWidgetKind(output);

  const Content = kind === "empty" ? null : WIDGET_REGISTRY[kind];

  return (
    <WidgetCard kind={kind} title={item.title}>
      {Content && output ? (
        <Content binding={item.binding} output={output} />
      ) : null}
    </WidgetCard>
  );
}
