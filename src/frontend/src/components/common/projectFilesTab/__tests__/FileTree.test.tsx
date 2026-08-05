import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTree } from "../FileTree";
import type { FileTreeNode } from "../types";

const downloadSandbox = jest.fn();
const downloadFlow = jest.fn();
const downloadV2 = jest.fn();

jest.mock(
  "@/controllers/API/queries/file-management/use-get-sandbox-files",
  () => ({
    useGetDownloadSandboxFile: jest.fn(() => ({ mutate: downloadSandbox })),
  }),
);
jest.mock("@/controllers/API/queries/files/use-download-files", () => ({
  useGetDownloadFileMutation: jest.fn(() => ({ mutate: downloadFlow })),
}));
jest.mock(
  "@/controllers/API/queries/file-management/use-get-download-file",
  () => ({
    useGetDownloadFileV2: jest.fn(() => ({ mutate: downloadV2 })),
  }),
);

const TREE: FileTreeNode[] = [
  {
    type: "folder",
    id: "root:sandbox",
    name: "Sandbox",
    children: [
      {
        type: "file",
        id: "sandbox:report.docx",
        name: "report.docx",
        size: 100,
        ref: { source: "sandbox", path: "report.docx", name: "report.docx" },
      },
      {
        type: "folder",
        id: "root:sandbox/nested",
        name: "nested",
        children: [
          {
            type: "file",
            id: "sandbox:nested/data.csv",
            name: "data.csv",
            ref: {
              source: "sandbox",
              path: "nested/data.csv",
              name: "data.csv",
            },
          },
        ],
      },
    ],
  },
];

describe("FileTree", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("expands top-level folders by default", () => {
    render(<FileTree nodes={TREE} />);
    expect(
      screen.getByTestId("project-file-sandbox-sandbox:report.docx"),
    ).toBeInTheDocument();
  });

  it("collapses a nested folder's children by default, expanding on click", async () => {
    render(<FileTree nodes={TREE} />);

    expect(
      screen.queryByTestId("project-file-sandbox-sandbox:nested/data.csv"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("project-files-folder-root:sandbox/nested"),
    );

    expect(
      screen.getByTestId("project-file-sandbox-sandbox:nested/data.csv"),
    ).toBeInTheDocument();
  });

  it("toggles a folder closed again on a second click", async () => {
    render(<FileTree nodes={TREE} />);
    const folder = screen.getByTestId("project-files-folder-root:sandbox");

    await userEvent.click(folder);
    expect(
      screen.queryByTestId("project-file-sandbox-sandbox:report.docx"),
    ).not.toBeInTheDocument();

    await userEvent.click(folder);
    expect(
      screen.getByTestId("project-file-sandbox-sandbox:report.docx"),
    ).toBeInTheDocument();
  });

  it("calls onOpenFile on double-click when it's supplied, instead of downloading", async () => {
    const onOpenFile = jest.fn();
    render(<FileTree nodes={TREE} onOpenFile={onOpenFile} />);

    await userEvent.dblClick(
      screen.getByTestId("project-file-sandbox-sandbox:report.docx"),
    );

    expect(onOpenFile).toHaveBeenCalledWith(
      { source: "sandbox", path: "report.docx", name: "report.docx" },
      "report.docx",
    );
    expect(downloadSandbox).not.toHaveBeenCalled();
  });

  it("falls back to downloading on double-click when no onOpenFile is supplied", async () => {
    render(<FileTree nodes={TREE} />);

    await userEvent.dblClick(
      screen.getByTestId("project-file-sandbox-sandbox:report.docx"),
    );

    expect(downloadSandbox).toHaveBeenCalledTimes(1);
  });

  it("downloads via the explicit download button without opening a tab, even when onOpenFile is supplied", async () => {
    const onOpenFile = jest.fn();
    render(<FileTree nodes={TREE} onOpenFile={onOpenFile} />);

    await userEvent.click(
      screen.getByTestId("download-project-file-sandbox-sandbox:report.docx"),
    );

    expect(downloadSandbox).toHaveBeenCalledTimes(1);
    expect(onOpenFile).not.toHaveBeenCalled();
  });
});
