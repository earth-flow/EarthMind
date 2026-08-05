import type { OutputLogType } from "@/types/api";

/** A single node output bound to a widget, per the App page's M1 binding design. */
export type WidgetBinding = {
  nodeId: string;
  outputName: string;
};

/**
 * Visual treatment a widget renders with. Resolved at runtime from the
 * output's flowPool payload (see resolve-widget-kind.ts) rather than stored
 * up front, since the same binding can legitimately produce different kinds
 * across runs (e.g. a "Write File" node saved as csv once, xlsx next time).
 */
export type WidgetKind =
  | "image"
  | "pdf"
  | "docx"
  | "xlsx"
  | "geojson"
  | "mesh"
  | "pointcloud"
  | "gs"
  | "video"
  | "json"
  | "table"
  | "text"
  | "file"
  | "error"
  | "knowledge_graph"
  | "project_files"
  | "empty";

/** One tab in the App page's widget region, bound to a node output. */
export type OutputWidgetLayoutItem = {
  source: "output";
  /** Stable across renders: `${nodeId}:${outputName}`. */
  id: string;
  binding: WidgetBinding;
  title: string;
};

/**
 * A tab rendering the entity graph of a Knowledge Base the flow reads from
 * (via a Knowledge or MemoryBase component), auto-detected rather than bound
 * to a node output -- the graph is a property of the KB itself, not of any
 * single run's flowPool payload.
 */
export type KnowledgeGraphWidgetLayoutItem = {
  source: "knowledge_graph";
  /** Stable across renders: `kg:${kbName}`. */
  id: string;
  kbName: string;
  title: string;
};

/**
 * EarthMind has three independent file storage systems -- see file-ref.ts for
 * the full explanation of v1/v2. "sandbox" is the third: the shared
 * FileSystemTool sandbox directory (see api/v1/sandbox_files.py), addressed
 * by its path relative to the sandbox root. Declared here (rather than in
 * file-ref.ts) so both AttachmentWidgetLayoutItem/OpenedFileWidgetLayoutItem
 * and file-ref.ts's helpers can share one type without a
 * types-importing-from-pages inversion.
 */
export type ResolvedFileRef =
  | { source: "v1"; path: string; name: string }
  | { source: "v2"; fileId: string; name: string }
  | { source: "sandbox"; path: string; name: string };

/**
 * A tab rendering a file the user attached directly to a chat message (an
 * input to the flow, not a generated output) -- e.g. a Word doc or mesh
 * dropped into the chat box before running. Auto-detected from
 * useMessagesStore rather than bound to a node output, since attachments
 * exist independently of any run.
 */
export type AttachmentWidgetLayoutItem = {
  source: "attachment";
  /** Stable across renders: `attachment:${fileRef.path}`. */
  id: string;
  fileRef: ResolvedFileRef;
  title: string;
};

/**
 * The permanent, always-first, non-closable tab showing every file relevant
 * to this flow's project (agent-generated sandbox files, flow-generated
 * files across the whole project, and the user's own saved files) -- see
 * components/common/projectFilesTab. Unlike the other widget kinds, this one
 * is not derived from flow shape/run data; it's synthesized directly in
 * app-widget-region.tsx and is never subject to closedIds filtering.
 */
export type ProjectFilesWidgetLayoutItem = {
  source: "project_files";
  /** Constant -- there's exactly one of these per App page. */
  id: "project_files";
  projectId: string;
  title: string;
};

/**
 * A tab opened by the user double-clicking a file in the Project Files tree
 * (see components/common/projectFilesTab/FileTree.tsx) -- distinct from
 * AttachmentWidgetLayoutItem (auto-derived from chat attachments) in that
 * this one is explicitly user-initiated and stays open across re-derives
 * until the user closes it, rather than tracking any flow/message state.
 */
export type OpenedFileWidgetLayoutItem = {
  source: "opened_file";
  /** Stable across renders: `opened:${fileRef.source}:${path-or-fileId}`. */
  id: string;
  fileRef: ResolvedFileRef;
  title: string;
};

/** One entry in the App page's widget tabs. */
export type WidgetLayoutItem =
  | OutputWidgetLayoutItem
  | KnowledgeGraphWidgetLayoutItem
  | AttachmentWidgetLayoutItem
  | OpenedFileWidgetLayoutItem
  | ProjectFilesWidgetLayoutItem;

/**
 * A bridged Terrabox-generated file, as attached to a Data output's payload
 * under the `_generated_files` key by the backend
 * (lfx.interface.earthflow_terrabox.bridge_generated_files). Lives in
 * EarthMind's v2 (user-scoped) file storage, addressed by file_id.
 */
export type GeneratedFileRef = {
  field: string;
  file_id: string;
  name: string;
  size: number;
};

/** Props every widget content component receives from WidgetHost. */
export type WidgetContentProps = {
  binding: WidgetBinding;
  output: OutputLogType;
};
