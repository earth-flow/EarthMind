import ProjectFilesTab from "@/components/common/projectFilesTab";
import useFlowStore from "@/stores/flowStore";
import type {
  AttachmentWidgetLayoutItem,
  KnowledgeGraphWidgetLayoutItem,
  OpenedFileWidgetLayoutItem,
  OutputWidgetLayoutItem,
  ProjectFilesWidgetLayoutItem,
  ResolvedFileRef,
  WidgetKind,
  WidgetLayoutItem,
} from "@/types/appPage/widget";
import type { FlowPoolType } from "@/types/zustand/flow";
import {
  extensionOf,
  kindForExtension,
  resolveWidgetKind,
  wrapFileRefAsOutput,
} from "../utils/resolve-widget-kind";
import { WIDGET_REGISTRY } from "../utils/widget-registry";
import { WidgetCard } from "./widget-card";
import { KnowledgeGraphWidget } from "./widgets/knowledge-graph-widget";

/**
 * Resolves the widget kind a layout item currently renders as, without
 * mounting it -- used by the tab strip to pick each tab's icon, mirroring
 * what OutputWidgetHost resolves internally to pick its content component.
 */
export function resolveItemWidgetKind(
  item: WidgetLayoutItem,
  flowPool: FlowPoolType,
): WidgetKind {
  if (item.source === "knowledge_graph") return "knowledge_graph";
  if (item.source === "project_files") return "project_files";
  if (item.source === "attachment" || item.source === "opened_file") {
    return kindForExtension(extensionOf(item.fileRef.name));
  }
  const runs = flowPool[item.binding.nodeId];
  const lastRun = runs?.[runs.length - 1];
  const output = lastRun?.data?.outputs?.[item.binding.outputName];
  return resolveWidgetKind(output);
}

/** Reads the bound output from flowPool, resolves its widget kind, and renders it inside the common card shell. */
function OutputWidgetHost({ item }: { item: OutputWidgetLayoutItem }) {
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

/** The graph isn't sourced from flowPool -- render it directly from the auto-detected kbName. */
function KnowledgeGraphWidgetHost({
  item,
}: {
  item: KnowledgeGraphWidgetLayoutItem;
}) {
  return (
    <WidgetCard kind="knowledge_graph" title={item.title}>
      <KnowledgeGraphWidget kbName={item.kbName} />
    </WidgetCard>
  );
}

/**
 * Both attachments and opened files have a fileRef but no flowPool output to
 * read -- wrapFileRefAsOutput adapts it into the same OutputLogType shape
 * the existing file-kind widget components already know how to unwrap via
 * extractFileRef, so no widget component needs a second, ref-shaped prop
 * just for these sources. Shared by AttachmentWidgetHost (auto-derived from
 * chat attachments) and OpenedFileWidgetHost (user double-clicked a file in
 * the Project Files tree) since the rendering logic is identical -- only how
 * the fileRef was obtained differs.
 */
function FileRefWidgetHost({
  fileRef,
  title,
}: {
  fileRef: ResolvedFileRef;
  title: string;
}) {
  const output = wrapFileRefAsOutput(fileRef);
  const kind = output.type as WidgetKind;
  const Content = WIDGET_REGISTRY[kind];

  return (
    <WidgetCard kind={kind} title={title}>
      {Content ? (
        <Content binding={{ nodeId: "", outputName: "" }} output={output} />
      ) : null}
    </WidgetCard>
  );
}

function AttachmentWidgetHost({ item }: { item: AttachmentWidgetLayoutItem }) {
  return <FileRefWidgetHost fileRef={item.fileRef} title={item.title} />;
}

function OpenedFileWidgetHost({ item }: { item: OpenedFileWidgetLayoutItem }) {
  return <FileRefWidgetHost fileRef={item.fileRef} title={item.title} />;
}

/** Project-wide files, not sourced from this flow's flowPool at all -- see ProjectFilesTab. */
function ProjectFilesWidgetHost({
  item,
  onOpenFile,
}: {
  item: ProjectFilesWidgetLayoutItem;
  onOpenFile: (ref: ResolvedFileRef, title: string) => void;
}) {
  return (
    <WidgetCard kind="project_files" title={item.title}>
      <ProjectFilesTab projectId={item.projectId} onOpenFile={onOpenFile} />
    </WidgetCard>
  );
}

export function WidgetHost({
  item,
  onOpenFile,
}: {
  item: WidgetLayoutItem;
  onOpenFile: (ref: ResolvedFileRef, title: string) => void;
}) {
  if (item.source === "knowledge_graph") {
    return <KnowledgeGraphWidgetHost item={item} />;
  }
  if (item.source === "attachment") {
    return <AttachmentWidgetHost item={item} />;
  }
  if (item.source === "opened_file") {
    return <OpenedFileWidgetHost item={item} />;
  }
  if (item.source === "project_files") {
    return <ProjectFilesWidgetHost item={item} onOpenFile={onOpenFile} />;
  }
  return <OutputWidgetHost item={item} />;
}
