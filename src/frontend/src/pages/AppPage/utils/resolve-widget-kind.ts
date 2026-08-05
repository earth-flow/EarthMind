import type { OutputLogType } from "@/types/api";
import type {
  GeneratedFileRef,
  ResolvedFileRef,
  WidgetKind,
} from "@/types/appPage/widget";

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
const MESH_EXTENSIONS = new Set(["gltf", "glb", "obj", "stl"]);
/**
 * .pcd is unambiguous. .ply is not: it's used both for ordinary point
 * clouds/meshes AND for gaussian-splat scenes (spherical-harmonic vertex
 * attributes on top of the same container format) -- extension alone can't
 * tell them apart. Defaults to the point-cloud widget, which still renders a
 * splat-format .ply as a (large, correctly colored) point cloud rather than
 * failing outright; .splat/.ksplat/.spz are gaussian-splat-only formats and
 * always go to the "gs" widget instead. LAS/LAZ (LiDAR) point clouds are a
 * deliberately deferred fast-follow -- no built-in three.js loader for them.
 */
const POINTCLOUD_EXTENSIONS = new Set(["ply", "pcd"]);
const GAUSSIAN_SPLAT_EXTENSIONS = new Set(["splat", "ksplat", "spz"]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "ogv",
  "ogg",
  "mov",
  "avi",
  "mkv",
  "m4v",
  "wmv",
]);

/** Exported for widget-host.tsx, which needs to resolve a kind for attachment items that have no flowPool output to read a `type` from. */
export function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function kindForExtension(extension: string): WidgetKind {
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "xlsx";
  if (extension === "geojson") return "geojson";
  if (MESH_EXTENSIONS.has(extension)) return "mesh";
  if (GAUSSIAN_SPLAT_EXTENSIONS.has(extension)) return "gs";
  if (POINTCLOUD_EXTENSIONS.has(extension)) return "pointcloud";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
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

function resolveChatFileEntry(entry: ChatFileEntry): {
  source: "v1";
  path: string;
  name: string;
} {
  if (typeof entry === "string") {
    return { source: "v1", path: entry, name: entry.split("/").pop() ?? entry };
  }
  return {
    source: "v1",
    path: entry.path,
    name: entry.name ?? entry.path.split("/").pop() ?? entry.path,
  };
}

/**
 * Resolves every entry in a chat-style `files` array (the same idiom as
 * Message.files) to a v1 file ref, unlike extractFileRef below which only
 * returns the first -- a node output realistically produces one file, but a
 * chat message can carry several attachments at once, so derive-widget-layout
 * needs all of them.
 */
export function extractAllChatFileRefs(
  files: unknown[],
): { source: "v1"; path: string; name: string }[] {
  return files.filter(isChatFileEntry).map(resolveChatFileEntry);
}

function isSandboxFileRef(
  value: unknown,
): value is { path: string; name: string } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { path?: unknown }).path === "string" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

/**
 * Extracts the first file reference out of an output's message payload, if
 * any, checking (in priority order) the bridged-file idiom this feature
 * introduces (`_generated_files`, see GeneratedFileRef), the sandbox-file
 * idiom wrapFileRefAsOutput introduces below (`_sandbox_file`, used only for
 * opened-file tabs -- never produced by a real flowPool payload), and the
 * pre-existing chat message idiom (`files`, string | {path,name,type}).
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

  const sandbox = payload._sandbox_file;
  if (isSandboxFileRef(sandbox)) {
    return { source: "sandbox", path: sandbox.path, name: sandbox.name };
  }

  const files = payload.files;
  if (Array.isArray(files)) {
    const refs = extractAllChatFileRefs(files);
    if (refs.length > 0) return refs[0];
  }

  return null;
}

/**
 * Builds a minimal OutputLogType wrapping a resolved file reference -- the
 * inverse of extractFileRef -- so a fileRef not sourced from any flowPool
 * output (e.g. a chat attachment, or a file opened from the Project Files
 * tree) can still be rendered by the existing output-bound widget components
 * in WIDGET_REGISTRY without duplicating each one's fetch/render logic for a
 * second, ref-shaped prop.
 */
export function wrapFileRefAsOutput(ref: ResolvedFileRef): OutputLogType {
  let message: unknown;
  if (ref.source === "v2") {
    message = {
      _generated_files: [
        { field: "", file_id: ref.fileId, name: ref.name, size: 0 },
      ],
    };
  } else if (ref.source === "sandbox") {
    message = { _sandbox_file: { path: ref.path, name: ref.name } };
  } else {
    message = { files: [{ path: ref.path, name: ref.name }] };
  }
  return { type: kindForExtension(extensionOf(ref.name)), message };
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
