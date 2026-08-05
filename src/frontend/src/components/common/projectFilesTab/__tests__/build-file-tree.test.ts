import type { SandboxFileEntry } from "@/controllers/API/queries/file-management/use-get-sandbox-files";
import type { ProjectFileEntry } from "@/controllers/API/queries/folders/use-get-project-files";
import type { FileType } from "@/types/file_management";
import {
  buildFlowOutputsTree,
  buildMyFilesTree,
  buildProjectFileTree,
  buildSandboxTree,
} from "../build-file-tree";

const LABELS = {
  sandbox: "Sandbox",
  flowOutputs: "Flow Outputs",
  myFiles: "My Files",
};

function sandboxFile(path: string, size = 10): SandboxFileEntry {
  return { path, name: path.split("/").pop() ?? path, size, modified_at: 0 };
}

describe("buildSandboxTree", () => {
  it("returns null for an empty file list", () => {
    expect(buildSandboxTree([], "root", "Sandbox")).toBeNull();
  });

  it("nests files under real directory segments from their path", () => {
    const tree = buildSandboxTree(
      [sandboxFile("reports/2026/summary.docx")],
      "root",
      "Sandbox",
    );

    expect(tree?.name).toBe("Sandbox");
    expect(tree?.children).toHaveLength(1);
    const reports = tree?.children[0];
    expect(reports).toMatchObject({ type: "folder", name: "reports" });
    if (reports?.type !== "folder") throw new Error("expected folder");
    const year = reports.children[0];
    expect(year).toMatchObject({ type: "folder", name: "2026" });
    if (year?.type !== "folder") throw new Error("expected folder");
    expect(year.children[0]).toMatchObject({
      type: "file",
      name: "summary.docx",
      ref: { source: "sandbox", path: "reports/2026/summary.docx" },
    });
  });

  it("places a root-level file directly under the sandbox root", () => {
    const tree = buildSandboxTree(
      [sandboxFile("notes.txt")],
      "root",
      "Sandbox",
    );
    expect(tree?.children[0]).toMatchObject({
      type: "file",
      name: "notes.txt",
    });
  });

  it("shares a folder across two files in the same directory", () => {
    const tree = buildSandboxTree(
      [sandboxFile("reports/a.docx"), sandboxFile("reports/b.docx")],
      "root",
      "Sandbox",
    );
    expect(tree?.children).toHaveLength(1);
    const reports = tree?.children[0];
    if (reports?.type !== "folder") throw new Error("expected folder");
    expect(reports.children).toHaveLength(2);
  });

  it("sorts folders before files, alphabetically within each group", () => {
    const tree = buildSandboxTree(
      [sandboxFile("b.txt"), sandboxFile("a.txt"), sandboxFile("sub/c.txt")],
      "root",
      "Sandbox",
    );
    expect(tree?.children.map((c) => c.name)).toEqual([
      "sub",
      "a.txt",
      "b.txt",
    ]);
  });
});

describe("buildFlowOutputsTree", () => {
  it("returns null for an empty file list", () => {
    expect(buildFlowOutputsTree([], "root", "Flow Outputs")).toBeNull();
  });

  it("groups files into one folder per flow", () => {
    const files: ProjectFileEntry[] = [
      {
        flow_id: "flow-1",
        flow_name: "Flow One",
        file_name: "2026-08-05_00-00-00_report.docx",
      },
      {
        flow_id: "flow-2",
        flow_name: "Flow Two",
        file_name: "2026-08-05_00-00-00_data.csv",
      },
    ];
    const tree = buildFlowOutputsTree(files, "root", "Flow Outputs");

    expect(tree?.children).toHaveLength(2);
    expect(tree?.children.map((c) => c.name).sort()).toEqual([
      "Flow One",
      "Flow Two",
    ]);
  });

  it("strips the storage timestamp prefix for display, keeping it in the download ref path", () => {
    const files: ProjectFileEntry[] = [
      {
        flow_id: "flow-1",
        flow_name: "Flow One",
        file_name: "2026-08-05_12-30-00_report.docx",
      },
    ];
    const tree = buildFlowOutputsTree(files, "root", "Flow Outputs");
    const folder = tree?.children[0];
    if (folder?.type !== "folder") throw new Error("expected folder");
    const leaf = folder.children[0];

    expect(leaf).toMatchObject({
      type: "file",
      name: "report.docx",
      ref: {
        source: "v1",
        path: "flow-1/2026-08-05_12-30-00_report.docx",
        name: "report.docx",
      },
    });
  });

  it("groups multiple files from the same flow into one folder", () => {
    const files: ProjectFileEntry[] = [
      { flow_id: "flow-1", flow_name: "Flow One", file_name: "a.docx" },
      { flow_id: "flow-1", flow_name: "Flow One", file_name: "b.docx" },
    ];
    const tree = buildFlowOutputsTree(files, "root", "Flow Outputs");
    expect(tree?.children).toHaveLength(1);
    const folder = tree?.children[0];
    if (folder?.type !== "folder") throw new Error("expected folder");
    expect(folder.children).toHaveLength(2);
  });
});

describe("buildMyFilesTree", () => {
  it("returns null for an empty file list", () => {
    expect(buildMyFilesTree([], "root", "My Files")).toBeNull();
  });

  it("lists v2 files flat, with a v2 ref", () => {
    const files: FileType[] = [
      {
        id: "file-1",
        user_id: "user-1",
        provider: "local",
        name: "notes.txt",
        path: "user-1/notes.txt",
        created_at: "",
        size: 42,
      },
    ];
    const tree = buildMyFilesTree(files, "root", "My Files");

    expect(tree?.children).toEqual([
      {
        type: "file",
        id: "v2:file-1",
        name: "notes.txt",
        size: 42,
        ref: { source: "v2", fileId: "file-1", name: "notes.txt" },
      },
    ]);
  });
});

describe("buildProjectFileTree", () => {
  it("omits empty sources instead of rendering an empty folder", () => {
    const tree = buildProjectFileTree([], [], [], LABELS);
    expect(tree).toEqual([]);
  });

  it("includes one root folder per non-empty source", () => {
    const tree = buildProjectFileTree(
      [sandboxFile("a.txt")],
      [],
      [
        {
          id: "file-1",
          user_id: "user-1",
          provider: "local",
          name: "b.txt",
          path: "user-1/b.txt",
          created_at: "",
          size: 1,
        },
      ],
      LABELS,
    );

    expect(tree.map((node) => node.name)).toEqual(["Sandbox", "My Files"]);
  });
});
