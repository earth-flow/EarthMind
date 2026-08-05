import type { SandboxFileEntry } from "@/controllers/API/queries/file-management/use-get-sandbox-files";
import type { ProjectFileEntry } from "@/controllers/API/queries/folders/use-get-project-files";
import type { FileType } from "@/types/file_management";
import type { FileTreeFolder, FileTreeNode } from "./types";

// v1 upload naming convention prefixes every stored filename with
// "YYYY-MM-DD_HH-MM-SS_" (see api/v1/files.py's upload_file) -- strip it for
// display only; the raw file_name (with prefix) is still what's sent to the
// download endpoint via ref.path.
const TIMESTAMP_PREFIX = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_/;

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function sortTree(node: FileTreeFolder): FileTreeFolder {
  node.children.sort(compareNodes);
  for (const child of node.children) {
    if (child.type === "folder") sortTree(child);
  }
  return node;
}

/** Finds (or creates) the folder for `segments` under `root`, mutating root's tree. */
function ensureFolder(
  root: FileTreeFolder,
  segments: string[],
  idPrefix: string,
): FileTreeFolder {
  let cursor = root;
  let idSoFar = idPrefix;
  for (const segment of segments) {
    idSoFar = `${idSoFar}/${segment}`;
    let next = cursor.children.find(
      (child): child is FileTreeFolder =>
        child.type === "folder" && child.name === segment,
    );
    if (!next) {
      next = { type: "folder", id: idSoFar, name: segment, children: [] };
      cursor.children.push(next);
    }
    cursor = next;
  }
  return cursor;
}

/**
 * Builds a real nested folder tree from the sandbox's recursive file paths
 * (e.g. "reports/2026/summary.docx") -- the only one of the three sources
 * with genuine subdirectories, since it's a real on-disk sandbox (see
 * FileSystemTool's shared sandbox root).
 */
export function buildSandboxTree(
  files: SandboxFileEntry[],
  rootId: string,
  rootName: string,
): FileTreeFolder | null {
  if (files.length === 0) return null;
  const root: FileTreeFolder = {
    type: "folder",
    id: rootId,
    name: rootName,
    children: [],
  };

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    const dirSegments = segments.slice(0, -1);
    const fileName = segments[segments.length - 1] ?? file.path;
    const folder = ensureFolder(root, dirSegments, rootId);
    folder.children.push({
      type: "file",
      id: `sandbox:${file.path}`,
      name: fileName,
      size: file.size,
      ref: { source: "sandbox", path: file.path, name: fileName },
    });
  }

  return sortTree(root);
}

/**
 * Groups v1 flow-scoped files by the flow that produced them -- one folder
 * per flow, since v1 storage itself has no path hierarchy (see
 * useGetProjectFiles's doc comment: it's an aggregation across per-flow
 * lists, not a real nested store).
 */
export function buildFlowOutputsTree(
  files: ProjectFileEntry[],
  rootId: string,
  rootName: string,
): FileTreeFolder | null {
  if (files.length === 0) return null;
  const root: FileTreeFolder = {
    type: "folder",
    id: rootId,
    name: rootName,
    children: [],
  };

  const byFlow = new Map<
    string,
    { flowName: string; entries: ProjectFileEntry[] }
  >();
  for (const file of files) {
    const bucket = byFlow.get(file.flow_id);
    if (bucket) {
      bucket.entries.push(file);
    } else {
      byFlow.set(file.flow_id, { flowName: file.flow_name, entries: [file] });
    }
  }

  for (const [flowId, { flowName, entries }] of Array.from(byFlow)) {
    const folder: FileTreeFolder = {
      type: "folder",
      id: `${rootId}/${flowId}`,
      name: flowName,
      children: entries.map((file) => {
        const displayName = file.file_name.replace(TIMESTAMP_PREFIX, "");
        return {
          type: "file" as const,
          id: `flow:${file.flow_id}:${file.file_name}`,
          name: displayName,
          ref: {
            source: "v1" as const,
            path: `${file.flow_id}/${file.file_name}`,
            name: displayName,
          },
        };
      }),
    };
    root.children.push(folder);
  }

  return sortTree(root);
}

/**
 * v2 (user-scoped) files have no folder concept at all -- listed flat under
 * one "My Files" root.
 */
export function buildMyFilesTree(
  files: FileType[],
  rootId: string,
  rootName: string,
): FileTreeFolder | null {
  if (files.length === 0) return null;
  const root: FileTreeFolder = {
    type: "folder",
    id: rootId,
    name: rootName,
    children: files.map((file) => ({
      type: "file" as const,
      id: `v2:${file.id}`,
      name: file.name,
      size: file.size,
      ref: { source: "v2" as const, fileId: file.id, name: file.name },
    })),
  };
  return sortTree(root);
}

export type ProjectFileTreeLabels = {
  sandbox: string;
  flowOutputs: string;
  myFiles: string;
};

/**
 * Top-level tree for the Project Files view: one folder per storage source
 * (agent sandbox, flow outputs grouped by flow, the user's own saved files),
 * kept as separate roots rather than merged into one namespace so files from
 * different storage systems that happen to share a name never collide, and
 * so it's always clear at a glance where a file came from.
 */
export function buildProjectFileTree(
  sandboxFiles: SandboxFileEntry[],
  projectFiles: ProjectFileEntry[],
  myFiles: FileType[],
  labels: ProjectFileTreeLabels,
): FileTreeNode[] {
  const roots = [
    buildSandboxTree(sandboxFiles, "root:sandbox", labels.sandbox),
    buildFlowOutputsTree(projectFiles, "root:flows", labels.flowOutputs),
    buildMyFilesTree(myFiles, "root:v2", labels.myFiles),
  ];
  return roots.filter((node): node is FileTreeFolder => node !== null);
}
