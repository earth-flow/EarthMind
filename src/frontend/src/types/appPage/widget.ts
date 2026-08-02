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
  | "json"
  | "table"
  | "text"
  | "file"
  | "error"
  | "knowledge_graph"
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
 * EarthMind has two independent file storage systems -- see file-ref.ts for
 * the full explanation. Declared here (rather than in file-ref.ts) so both
 * AttachmentWidgetLayoutItem and file-ref.ts's helpers can share one type
 * without a types-importing-from-pages inversion.
 */
export type ResolvedFileRef =
  | { source: "v1"; path: string; name: string }
  | { source: "v2"; fileId: string; name: string };

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

/** One entry in the App page's widget tabs. */
export type WidgetLayoutItem =
  | OutputWidgetLayoutItem
  | KnowledgeGraphWidgetLayoutItem
  | AttachmentWidgetLayoutItem;

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
