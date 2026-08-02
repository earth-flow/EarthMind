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
  | "json"
  | "table"
  | "text"
  | "file"
  | "error"
  | "empty";

/** One entry in the App page's widget grid. */
export type WidgetLayoutItem = {
  /** Stable across renders: `${nodeId}:${outputName}`. */
  id: string;
  binding: WidgetBinding;
  title: string;
};

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
