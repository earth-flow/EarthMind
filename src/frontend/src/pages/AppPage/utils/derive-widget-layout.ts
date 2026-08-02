import type { WidgetLayoutItem } from "@/types/appPage/widget";
import type { AllNodeType } from "@/types/flow";
import type { FlowPoolType } from "@/types/zustand/flow";
import { resolveWidgetKind } from "./resolve-widget-kind";

/**
 * Auto-derives the App page's widget layout from the flow's current shape and
 * run data, rather than a persisted/manually-placed layout — persistence and
 * a widget picker are explicitly M4 scope. One widget per node output that
 * both exists on the node's schema and has a non-empty result in flowPool for
 * its latest run.
 *
 * Because this reads live flowPool state (already updated by the existing
 * build pipeline), widgets appear/update as a flow runs without needing the
 * M3 appRunStore work — a useful side effect, not a substitute for it.
 */
export function deriveDefaultWidgetLayout(
  nodes: AllNodeType[],
  flowPool: FlowPoolType,
): WidgetLayoutItem[] {
  const items: WidgetLayoutItem[] = [];

  for (const node of nodes) {
    if (node.type !== "genericNode") continue;
    const outputs = node.data.node?.outputs;
    if (!outputs || outputs.length === 0) continue;

    const runs = flowPool[node.id];
    const lastRun = runs?.[runs.length - 1];
    if (!lastRun) continue;

    for (const output of outputs) {
      if (output.hidden) continue;
      const kind = resolveWidgetKind(lastRun.data?.outputs?.[output.name]);
      if (kind === "empty") continue;

      items.push({
        id: `${node.id}:${output.name}`,
        binding: { nodeId: node.id, outputName: output.name },
        title: `${node.data.node?.display_name ?? node.data.type} · ${output.display_name}`,
      });
    }
  }

  return items;
}
