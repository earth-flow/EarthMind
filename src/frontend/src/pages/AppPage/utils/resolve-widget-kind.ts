import type { OutputLogType } from "@/types/api";
import type { GeneratedFileRef, WidgetKind } from "@/types/appPage/widget";
import type { ResolvedFileRef } from "./file-ref";

const RECORD_TYPES = new Set(["array", "message"]);
const JSON_TYPES = new Set(["data", "object"]);
const GEOJSON_MESSAGE_TYPES = new Set([
  "FeatureCollection",
  "Feature",
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
  "MultiPolygon",
  "GeometryCollection",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function kindForExtension(extension: string): WidgetKind {
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "xlsx";
  if (extension === "geojson") return "geojson";
  return "file";
}

/** A chat-style `Message.files` entry: a bare "flow_id/name" string or an object. */
type ChatFileEntry = string | { path: string; name?: string; type?: string };

function isGeneratedFileRef(value: unknown): value is GeneratedFileRef {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as GeneratedFileRef).file_id === "string" &&
    typeof (value as GeneratedFileRef).name === "string"
  );
}

function isChatFileEntry(value: unknown): value is ChatFileEntry {
  if (typeof value === "string") return value.length > 0;
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

/**
 * Extracts the first file reference out of an output's message payload, if
 * any, checking (in priority order) the bridged-file idiom this feature
 * introduces (`_generated_files`, see GeneratedFileRef) and the pre-existing
 * chat message idiom (`files`, string | {path,name,type}).
 */
export function extractFileRef(message: unknown): ResolvedFileRef | null {
  if (!message || typeof message !== "object") return null;
  const payload = message as Record<string, unknown>;

  const generated = payload._generated_files;
  if (
    Array.isArray(generated) &&
    generated.length > 0 &&
    isGeneratedFileRef(generated[0])
  ) {
    const first = generated[0] as GeneratedFileRef;
    return { source: "v2", fileId: first.file_id, name: first.name };
  }

  const files = payload.files;
  if (Array.isArray(files) && files.length > 0 && isChatFileEntry(files[0])) {
    const first = files[0] as ChatFileEntry;
    if (typeof first === "string") {
      return {
        source: "v1",
        path: first,
        name: first.split("/").pop() ?? first,
      };
    }
    return {
      source: "v1",
      path: first.path,
      name: first.name ?? first.path.split("/").pop() ?? first.path,
    };
  }

  return null;
}

function looksLikeGeoJson(message: unknown): boolean {
  return (
    !!message &&
    typeof message === "object" &&
    GEOJSON_MESSAGE_TYPES.has((message as { type?: unknown }).type as string)
  );
}

/**
 * Resolves a flowPool output entry to the widget kind that should render it.
 * Mirrors SwitchOutputView's type table (CustomNodes/GenericNode/.../
 * switchOutputView/index.tsx) for the non-file fallback cases, since that's
 * the established convention for reading an output's `type`/`message`.
 */
export function resolveWidgetKind(
  output: OutputLogType | undefined,
): WidgetKind {
  if (!output || output.message === undefined || output.message === null) {
    return "empty";
  }

  const { type, message } = output;

  if (type === "error" || type === "ValueError") {
    return "error";
  }

  const fileRef = extractFileRef(message);
  if (fileRef) {
    return kindForExtension(extensionOf(fileRef.name));
  }

  if (RECORD_TYPES.has(type)) {
    return "table";
  }
  if (JSON_TYPES.has(type)) {
    return looksLikeGeoJson(message) ? "geojson" : "json";
  }
  if (type === "text") {
    return "text";
  }

  return "empty";
}
