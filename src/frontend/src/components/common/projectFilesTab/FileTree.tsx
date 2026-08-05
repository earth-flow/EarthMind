import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { useGetDownloadFileV2 } from "@/controllers/API/queries/file-management/use-get-download-file";
import { useGetDownloadSandboxFile } from "@/controllers/API/queries/file-management/use-get-sandbox-files";
import { useGetDownloadFileMutation } from "@/controllers/API/queries/files/use-download-files";
import type { ResolvedFileRef } from "@/types/appPage/widget";
import { formatFileSize } from "@/utils/stringManipulation";
import { extensionOf, fileIconForExtension } from "./file-icon";
import type { FileTreeFolder, FileTreeLeaf, FileTreeNode } from "./types";

type OnOpenFile = (ref: ResolvedFileRef, title: string) => void;

function countFiles(node: FileTreeNode): number {
  if (node.type === "file") return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

function FolderRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: FileTreeFolder;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={onToggle}
      data-testid={`project-files-folder-${node.id}`}
      role="treeitem"
      aria-expanded={expanded}
    >
      <ForwardedIconComponent
        name={expanded ? "ChevronDown" : "ChevronRight"}
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      />
      <ForwardedIconComponent
        name={expanded ? "FolderOpen" : "Folder"}
        className="h-4 w-4 shrink-0 text-muted-foreground"
      />
      <span className="truncate text-sm font-medium">{node.name}</span>
      <span className="text-xs text-muted-foreground">
        ({countFiles(node)})
      </span>
    </div>
  );
}

type FileLeafShellProps = {
  depth: number;
  name: string;
  size?: number;
  onDoubleClick: () => void;
  onDownload: () => void;
  testId: string;
};

function FileLeafShell({
  depth,
  name,
  size,
  onDoubleClick,
  onDownload,
  testId,
}: FileLeafShellProps) {
  const { t } = useTranslation();
  return (
    <div
      className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
      style={{ paddingLeft: `${depth * 16 + 28}px` }}
      onDoubleClick={onDoubleClick}
      data-testid={testId}
      role="treeitem"
      title={name}
    >
      <ForwardedIconComponent
        name={fileIconForExtension(extensionOf(name))}
        className="h-4 w-4 shrink-0 text-muted-foreground"
      />
      <span className="flex-1 truncate text-sm">{name}</span>
      {!!size && size > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatFileSize(size)}
        </span>
      )}
      <Button
        variant="ghost"
        size="iconMd"
        className="shrink-0 opacity-0 group-hover:opacity-100"
        aria-label={t("files.download")}
        data-testid={`download-${testId}`}
        onClick={(event) => {
          event.stopPropagation();
          onDownload();
        }}
      >
        <ForwardedIconComponent name="Download" className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Each leaf kind instantiates exactly one download hook -- these can't be
// merged into a single component that branches on ref.source, since that
// would call a different hook per render path (rules-of-hooks violation).
// One component per source keeps each hook call unconditional, mirroring
// this file's pre-tree flat-list predecessor.

function SandboxFileLeaf({
  node,
  depth,
  onOpenFile,
}: {
  node: FileTreeLeaf & { ref: { source: "sandbox" } };
  depth: number;
  onOpenFile?: OnOpenFile;
}) {
  const { mutate: download } = useGetDownloadSandboxFile({
    path: node.ref.path,
    name: node.name,
  });
  return (
    <FileLeafShell
      depth={depth}
      name={node.name}
      size={node.size}
      onDoubleClick={() =>
        onOpenFile ? onOpenFile(node.ref, node.name) : download()
      }
      onDownload={() => download()}
      testId={`project-file-sandbox-${node.id}`}
    />
  );
}

function FlowFileLeaf({
  node,
  depth,
  onOpenFile,
}: {
  node: FileTreeLeaf & { ref: { source: "v1" } };
  depth: number;
  onOpenFile?: OnOpenFile;
}) {
  const { mutate: download } = useGetDownloadFileMutation({
    path: node.ref.path,
    filename: node.name,
  });
  return (
    <FileLeafShell
      depth={depth}
      name={node.name}
      size={node.size}
      onDoubleClick={() =>
        onOpenFile ? onOpenFile(node.ref, node.name) : download(undefined)
      }
      onDownload={() => download(undefined)}
      testId={`project-file-flow-${node.id}`}
    />
  );
}

function V2FileLeaf({
  node,
  depth,
  onOpenFile,
}: {
  node: FileTreeLeaf & { ref: { source: "v2" } };
  depth: number;
  onOpenFile?: OnOpenFile;
}) {
  const { mutate: download } = useGetDownloadFileV2({
    id: node.ref.fileId,
    filename: node.name,
    type: extensionOf(node.name),
  });
  return (
    <FileLeafShell
      depth={depth}
      name={node.name}
      size={node.size}
      onDoubleClick={() =>
        onOpenFile ? onOpenFile(node.ref, node.name) : download()
      }
      onDownload={() => download()}
      testId={`project-file-v2-${node.id}`}
    />
  );
}

function FileLeafRow({
  node,
  depth,
  onOpenFile,
}: {
  node: FileTreeLeaf;
  depth: number;
  onOpenFile?: OnOpenFile;
}) {
  if (node.ref.source === "sandbox") {
    return (
      <SandboxFileLeaf
        node={node as FileTreeLeaf & { ref: { source: "sandbox" } }}
        depth={depth}
        onOpenFile={onOpenFile}
      />
    );
  }
  if (node.ref.source === "v1") {
    return (
      <FlowFileLeaf
        node={node as FileTreeLeaf & { ref: { source: "v1" } }}
        depth={depth}
        onOpenFile={onOpenFile}
      />
    );
  }
  return (
    <V2FileLeaf
      node={node as FileTreeLeaf & { ref: { source: "v2" } }}
      depth={depth}
      onOpenFile={onOpenFile}
    />
  );
}

type FileTreeProps = {
  nodes: FileTreeNode[];
  /** Only supplied on the App page (see widget-host.tsx) -- double-clicking a file opens a preview tab there. Elsewhere (the Projects page tab), double-click falls back to downloading, since there's no tab strip to open one in. */
  onOpenFile?: OnOpenFile;
};

/**
 * Recursive tree view for the unified project file browser -- mirrors
 * FlowPage/components/TraceComponent/SpanTree.tsx's expand/collapse pattern
 * (per-node Set<id> of expanded ids, root level expanded by default).
 */
export function FileTree({ nodes, onOpenFile }: FileTreeProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(nodes.map((node) => node.id)),
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderNode = useCallback(
    (node: FileTreeNode, depth: number): JSX.Element => {
      if (node.type === "file") {
        return (
          <FileLeafRow
            key={node.id}
            node={node}
            depth={depth}
            onOpenFile={onOpenFile}
          />
        );
      }
      const expanded = expandedIds.has(node.id);
      return (
        <div key={node.id} role="group">
          <FolderRow
            node={node}
            depth={depth}
            expanded={expanded}
            onToggle={() => toggleExpand(node.id)}
          />
          {expanded &&
            node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    },
    [expandedIds, onOpenFile, toggleExpand],
  );

  return (
    <div
      className="flex flex-col"
      role="tree"
      aria-label={t("mainPage.tabFiles")}
      data-testid="project-files-tree"
    >
      {nodes.map((node) => renderNode(node, 0))}
    </div>
  );
}
