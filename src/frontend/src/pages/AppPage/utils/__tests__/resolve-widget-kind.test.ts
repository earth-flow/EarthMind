import {
  extractAllChatFileRefs,
  extractFileRef,
  kindForExtension,
  resolveWidgetKind,
  wrapFileRefAsOutput,
} from "../resolve-widget-kind";

describe("resolveWidgetKind", () => {
  it("returns empty when there is no output yet", () => {
    expect(resolveWidgetKind(undefined)).toBe("empty");
    expect(resolveWidgetKind({ type: "text", message: null })).toBe("empty");
  });

  it.each([
    ["error", "error"],
    ["ValueError", "error"],
  ])("resolves %s typed outputs to the error kind", (type, expected) => {
    expect(
      resolveWidgetKind({
        type,
        message: { errorMessage: "boom", stackTrace: "" },
      }),
    ).toBe(expected);
  });

  it("resolves array/message typed outputs to table", () => {
    expect(resolveWidgetKind({ type: "array", message: [{ a: 1 }] })).toBe(
      "table",
    );
    expect(resolveWidgetKind({ type: "message", message: [{ a: 1 }] })).toBe(
      "table",
    );
  });

  it("resolves data/object typed outputs to json", () => {
    expect(resolveWidgetKind({ type: "data", message: { a: 1 } })).toBe("json");
    expect(resolveWidgetKind({ type: "object", message: { a: 1 } })).toBe(
      "json",
    );
  });

  it("resolves a GeoJSON-shaped object output to geojson, not json", () => {
    expect(
      resolveWidgetKind({
        type: "object",
        message: { type: "FeatureCollection", features: [] },
      }),
    ).toBe("geojson");
  });

  it("resolves text typed outputs to text", () => {
    expect(resolveWidgetKind({ type: "text", message: "hello" })).toBe("text");
  });

  it("prioritizes a bridged Terrabox file reference over the type table", () => {
    // Even though the type is "object" (which would otherwise resolve to json),
    // a _generated_files entry means there's a real file to preview instead.
    expect(
      resolveWidgetKind({
        type: "object",
        message: {
          success: true,
          _generated_files: [
            { field: "saved", file_id: "abc", name: "scene.tif", size: 10 },
          ],
        },
      }),
    ).toBe("file");
  });

  it.each([
    ["scene.png", "image"],
    ["report.pdf", "pdf"],
    ["report.docx", "docx"],
    ["table.xlsx", "xlsx"],
    ["table.csv", "xlsx"],
    ["shapes.geojson", "geojson"],
    ["model.gltf", "mesh"],
    ["model.glb", "mesh"],
    ["model.obj", "mesh"],
    ["model.stl", "mesh"],
    ["scan.pcd", "pointcloud"],
    ["scan.ply", "pointcloud"],
    ["scene.splat", "gs"],
    ["scene.ksplat", "gs"],
    ["scene.spz", "gs"],
    ["clip.mp4", "video"],
    ["clip.webm", "video"],
    ["clip.avi", "video"],
    ["archive.zip", "file"],
  ])("maps a bridged file named %s to the %s kind", (name, expected) => {
    expect(
      resolveWidgetKind({
        type: "object",
        message: {
          _generated_files: [{ field: "saved", file_id: "abc", name, size: 1 }],
        },
      }),
    ).toBe(expected);
  });

  it("falls back to chat-style message.files when there is no bridged file", () => {
    expect(
      resolveWidgetKind({
        type: "object",
        message: { files: ["flow-1/photo.png"] },
      }),
    ).toBe("image");
  });

  it("returns empty for an unrecognized type", () => {
    expect(resolveWidgetKind({ type: "stream", message: {} })).toBe("empty");
  });
});

describe("extractFileRef", () => {
  it("returns null for a plain, file-less message", () => {
    expect(extractFileRef({ success: true })).toBeNull();
    expect(extractFileRef(null)).toBeNull();
  });

  it("resolves a bridged (v2) file reference", () => {
    expect(
      extractFileRef({
        _generated_files: [
          { field: "saved", file_id: "abc-123", name: "scene.tif", size: 10 },
        ],
      }),
    ).toEqual({ source: "v2", fileId: "abc-123", name: "scene.tif" });
  });

  it("resolves a chat-style (v1) string file entry", () => {
    expect(extractFileRef({ files: ["flow-1/photo.png"] })).toEqual({
      source: "v1",
      path: "flow-1/photo.png",
      name: "photo.png",
    });
  });

  it("resolves a chat-style (v1) object file entry", () => {
    expect(
      extractFileRef({
        files: [{ path: "flow-1/report.pdf", name: "report.pdf", type: "pdf" }],
      }),
    ).toEqual({ source: "v1", path: "flow-1/report.pdf", name: "report.pdf" });
  });

  it("resolves a sandbox file reference (only ever produced by wrapFileRefAsOutput, never a real flowPool payload)", () => {
    expect(
      extractFileRef({
        _sandbox_file: { path: "reports/summary.docx", name: "summary.docx" },
      }),
    ).toEqual({
      source: "sandbox",
      path: "reports/summary.docx",
      name: "summary.docx",
    });
  });
});

describe("extractAllChatFileRefs", () => {
  it("resolves every entry, unlike extractFileRef which only returns the first", () => {
    expect(
      extractAllChatFileRefs([
        "flow-1/a.docx",
        { path: "flow-1/b.xlsx", name: "b.xlsx" },
      ]),
    ).toEqual([
      { source: "v1", path: "flow-1/a.docx", name: "a.docx" },
      { source: "v1", path: "flow-1/b.xlsx", name: "b.xlsx" },
    ]);
  });

  it("skips entries that aren't a recognizable chat file idiom", () => {
    expect(extractAllChatFileRefs([42, null, "", {}])).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(extractAllChatFileRefs([])).toEqual([]);
  });
});

describe("wrapFileRefAsOutput", () => {
  it("wraps a v1 ref as the same message.files shape extractFileRef reads", () => {
    const ref = {
      source: "v1" as const,
      path: "flow-1/report.docx",
      name: "report.docx",
    };
    const output = wrapFileRefAsOutput(ref);

    expect(output.type).toBe("docx");
    expect(extractFileRef(output.message)).toEqual(ref);
  });

  it("wraps a v2 ref as the same _generated_files shape extractFileRef reads", () => {
    const ref = { source: "v2" as const, fileId: "abc-123", name: "scene.glb" };
    const output = wrapFileRefAsOutput(ref);

    expect(output.type).toBe("mesh");
    expect(extractFileRef(output.message)).toEqual(ref);
  });

  it("wraps a sandbox ref as the _sandbox_file shape extractFileRef reads", () => {
    const ref = {
      source: "sandbox" as const,
      path: "reports/summary.docx",
      name: "summary.docx",
    };
    const output = wrapFileRefAsOutput(ref);

    expect(output.type).toBe("docx");
    expect(extractFileRef(output.message)).toEqual(ref);
  });
});

describe("kindForExtension", () => {
  it("resolves an unrecognized extension to the generic file kind", () => {
    expect(kindForExtension("zip")).toBe("file");
    expect(kindForExtension("")).toBe("file");
  });
});
