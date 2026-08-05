// Deliberately independent of pages/AppPage/utils/resolve-widget-kind.ts's
// kindForExtension: this module lives under components/common (shared by
// both HomePage and the App page's widget-host.tsx), and AppPage's own
// widget-host already imports ProjectFilesTab from here -- importing back
// into pages/AppPage/* for an icon lookup would create a circular import
// between the two. A small, independent extension->icon table is a
// reasonable duplication to avoid that, not a shared source of truth either
// side depends on for correctness.
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);
const MESH_EXTENSIONS = new Set(["gltf", "glb", "obj", "stl"]);
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

export function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Lucide icon name (see ForwardedIconComponent) for a file tree leaf, by extension. */
export function fileIconForExtension(extension: string): string {
  if (IMAGE_EXTENSIONS.has(extension)) return "Image";
  if (extension === "pdf") return "FileText";
  if (extension === "docx") return "FileText";
  if (SPREADSHEET_EXTENSIONS.has(extension)) return "FileSpreadsheet";
  if (extension === "geojson") return "Map";
  if (MESH_EXTENSIONS.has(extension)) return "Box";
  if (GAUSSIAN_SPLAT_EXTENSIONS.has(extension)) return "Sparkles";
  if (POINTCLOUD_EXTENSIONS.has(extension)) return "Boxes";
  if (VIDEO_EXTENSIONS.has(extension)) return "Video";
  if (extension === "json") return "Braces";
  return "File";
}
