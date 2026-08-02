import type { WidgetLayoutItem } from "@/types/appPage/widget";
import type { AllNodeType } from "@/types/flow";
import type { Message } from "@/types/messages";
import type { FlowPoolType } from "@/types/zustand/flow";
import {
  extensionOf,
  extractAllChatFileRefs,
  kindForExtension,
  resolveWidgetKind,
} from "./resolve-widget-kind";

/**
 * Chat nodes' own input/output text is already visible in the docked chat
 * panel, so surfacing it again as a tab is pure duplication -- the App page
 * widgets are for generated files/components, not conversation transcript.
 */
const CHAT_NODE_TYPES = new Set(["ChatInput", "ChatOutput"]);

/**
 * Components whose selected Knowledge Base name lives in this template
 * field, keyed by the component's `name` (matches `node.data.type`). Kept as
 * a small table since the two components use different field names for the
 * same underlying concept (`knowledge_base` vs `memory_base`).
 */
const KB_NAME_FIELD_BY_NODE_TYPE: Record<string, string> = {
  Knowledge: "knowledge_base",
  MemoryBase: "memory_base",
};

/**
 * Message.files comes back from the store as an actual array, "[]", "", or a
 * JSON-stringified array depending on where it's been round-tripped through
 * -- mirrors the same defensive parsing chat-view.tsx does when building chat
 * history, since this is the first place in pages/AppPage/ to read it.
 */
function normalizeMessageFiles(files: unknown): unknown[] {
  if (Array.isArray(files)) return files;
  if (files === "[]" || files === "" || files == null) return [];
  if (typeof files === "string") {
    try {
      const parsed = JSON.parse(files);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Auto-derives the App page's widget layout from the flow's current shape and
 * run data, rather than a persisted/manually-placed layout — persistence and
 * a widget picker are explicitly M4 scope. One widget per node output that
 * both exists on the node's schema and has a non-empty, non-text result in
 * flowPool for its latest run (plain text/chat transcript stays in the chat
 * panel rather than getting its own tab), one Knowledge Graph tab per
 * distinct Knowledge Base the flow reads from, plus one tab per distinct file
 * the user has attached to a chat message for this flow (an input to the
 * flow, not a generated output -- e.g. a Word doc or mesh dropped into the
 * chat box). Attached images are skipped: the chat bubble already shows a
 * full inline preview of those, so a tab would be pure duplication, the same
 * reasoning that excludes plain-text outputs above.
 *
 * Because this reads live flowPool state (already updated by the existing
 * build pipeline), widgets appear/update as a flow runs without needing the
 * M3 appRunStore work — a useful side effect, not a substitute for it.
 */
export function deriveDefaultWidgetLayout(
  nodes: AllNodeType[],
  flowPool: FlowPoolType,
  messages: Message[] = [],
): WidgetLayoutItem[] {
  const items: WidgetLayoutItem[] = [];
  const seenKbNames = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "genericNode") continue;
    if (CHAT_NODE_TYPES.has(node.data.type)) continue;

    const outputs = node.data.node?.outputs;
    if (outputs && outputs.length > 0) {
      const runs = flowPool[node.id];
      const lastRun = runs?.[runs.length - 1];

      if (lastRun) {
        for (const output of outputs) {
          if (output.hidden) continue;
          const kind = resolveWidgetKind(lastRun.data?.outputs?.[output.name]);
          if (kind === "empty" || kind === "text") continue;

          items.push({
            source: "output",
            id: `${node.id}:${output.name}`,
            binding: { nodeId: node.id, outputName: output.name },
            title: `${node.data.node?.display_name ?? node.data.type} · ${output.display_name}`,
          });
        }
      }
    }

    const kbNameField = KB_NAME_FIELD_BY_NODE_TYPE[node.data.type];
    const kbName = kbNameField
      ? node.data.node?.template?.[kbNameField]?.value
      : undefined;
    if (typeof kbName === "string" && kbName && !seenKbNames.has(kbName)) {
      seenKbNames.add(kbName);
      items.push({
        source: "knowledge_graph",
        id: `kg:${kbName}`,
        kbName,
        title: `Knowledge Graph · ${kbName}`,
      });
    }
  }

  const seenAttachmentPaths = new Set<string>();
  for (const message of messages) {
    const refs = extractAllChatFileRefs(normalizeMessageFiles(message.files));
    for (const ref of refs) {
      if (seenAttachmentPaths.has(ref.path)) continue;
      const kind = kindForExtension(extensionOf(ref.name));
      if (kind === "image") continue;
      seenAttachmentPaths.add(ref.path);
      items.push({
        source: "attachment",
        id: `attachment:${ref.path}`,
        fileRef: ref,
        title: ref.name,
      });
    }
  }

  return items;
}
