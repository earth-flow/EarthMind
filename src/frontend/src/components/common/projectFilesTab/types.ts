import type { ResolvedFileRef } from "@/types/appPage/widget";

export type FileTreeLeaf = {
  type: "file";
  /** Stable across renders -- also used as the id for the App page's opened-file tabs. */
  id: string;
  /** Display name (v1 flow-output files have their storage timestamp prefix stripped). */
  name: string;
  /** Undefined when the source doesn't report size (v1 storage) -- shown blank, not faked. */
  size?: number;
  ref: ResolvedFileRef;
};

export type FileTreeFolder = {
  type: "folder";
  id: string;
  name: string;
  children: FileTreeNode[];
};

export type FileTreeNode = FileTreeFolder | FileTreeLeaf;
