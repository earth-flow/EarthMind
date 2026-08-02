import type { VertexBuildTypeAPI } from "@/types/api";
import type { AllNodeType } from "@/types/flow";
import type { Message } from "@/types/messages";
import type { FlowPoolType } from "@/types/zustand/flow";
import { deriveDefaultWidgetLayout } from "../derive-widget-layout";

function makeMessage(overrides: {
  files: Message["files"] | string;
}): Message {
  return {
    flow_id: "flow-1",
    text: "",
    sender: "User",
    sender_name: "User",
    session_id: "session-1",
    timestamp: "",
    files: overrides.files as Message["files"],
    id: "msg-1",
    edit: false,
    background_color: "",
    text_color: "",
  };
}

function makeNode(overrides: {
  id: string;
  displayName: string;
  nodeType?: string;
  outputs?: Array<{ name: string; display_name: string; hidden?: boolean }>;
  template?: Record<string, { value?: unknown }>;
}): AllNodeType {
  return {
    id: overrides.id,
    type: "genericNode",
    position: { x: 0, y: 0 },
    data: {
      id: overrides.id,
      type: overrides.nodeType ?? overrides.displayName,
      node: {
        display_name: overrides.displayName,
        outputs: overrides.outputs ?? [],
        template: overrides.template ?? {},
      },
    },
  } as unknown as AllNodeType;
}

/** Builds a minimal fake flowPool run, only populating the `data.outputs` field the resolver reads. */
function makeRun(
  outputs: Record<string, { type: string; message: unknown }>,
): VertexBuildTypeAPI {
  return { data: { outputs } } as unknown as VertexBuildTypeAPI;
}

describe("deriveDefaultWidgetLayout", () => {
  it("returns no widgets for an empty flow", () => {
    expect(deriveDefaultWidgetLayout([], {})).toEqual([]);
  });

  it("returns no widgets for a node that hasn't run yet", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Image Gen",
      outputs: [{ name: "image", display_name: "Image" }],
    });

    expect(deriveDefaultWidgetLayout([node], {})).toEqual([]);
  });

  it("returns no widgets when the latest run has no usable output", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Image Gen",
      outputs: [{ name: "image", display_name: "Image" }],
    });
    const flowPool: FlowPoolType = {
      "node-1": [makeRun({ image: { type: "stream", message: {} } })],
    };

    expect(deriveDefaultWidgetLayout([node], flowPool)).toEqual([]);
  });

  it("produces one widget per eligible output, titled with node and output display names", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Report Writer",
      outputs: [
        { name: "table", display_name: "Table" },
        { name: "details", display_name: "Details" },
      ],
    });
    const flowPool: FlowPoolType = {
      "node-1": [
        makeRun({
          table: { type: "array", message: [{ a: 1 }] },
          details: { type: "object", message: { a: 1 } },
        }),
      ],
    };

    const layout = deriveDefaultWidgetLayout([node], flowPool);

    expect(layout).toEqual([
      {
        source: "output",
        id: "node-1:table",
        binding: { nodeId: "node-1", outputName: "table" },
        title: "Report Writer · Table",
      },
      {
        source: "output",
        id: "node-1:details",
        binding: { nodeId: "node-1", outputName: "details" },
        title: "Report Writer · Details",
      },
    ]);
  });

  it("skips plain-text outputs -- that's already visible in the chat panel", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Report Writer",
      outputs: [{ name: "summary", display_name: "Summary" }],
    });
    const flowPool: FlowPoolType = {
      "node-1": [makeRun({ summary: { type: "text", message: "done" } })],
    };

    expect(deriveDefaultWidgetLayout([node], flowPool)).toEqual([]);
  });

  it("skips ChatInput and ChatOutput nodes entirely -- redundant with the docked chat panel", () => {
    const chatInput = makeNode({
      id: "node-1",
      displayName: "Chat Input",
      nodeType: "ChatInput",
      outputs: [{ name: "message", display_name: "Message" }],
    });
    const chatOutput = makeNode({
      id: "node-2",
      displayName: "Chat Output",
      nodeType: "ChatOutput",
      outputs: [{ name: "message", display_name: "Message" }],
    });
    const flowPool: FlowPoolType = {
      "node-1": [makeRun({ message: { type: "array", message: [{ a: 1 }] } })],
      "node-2": [makeRun({ message: { type: "array", message: [{ a: 1 }] } })],
    };

    expect(
      deriveDefaultWidgetLayout([chatInput, chatOutput], flowPool),
    ).toEqual([]);
  });

  it("skips hidden outputs and non-genericNode nodes", () => {
    const genericNode = makeNode({
      id: "node-1",
      displayName: "Report Writer",
      outputs: [
        { name: "hidden_output", display_name: "Hidden", hidden: true },
      ],
    });
    const noteNode = {
      id: "note-1",
      type: "noteNode",
      position: { x: 0, y: 0 },
      data: {},
    } as unknown as AllNodeType;
    const flowPool: FlowPoolType = {
      "node-1": [makeRun({ hidden_output: { type: "text", message: "x" } })],
    };

    expect(
      deriveDefaultWidgetLayout([genericNode, noteNode], flowPool),
    ).toEqual([]);
  });

  it("uses only the latest run when a node has been run more than once", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Counter",
      outputs: [{ name: "value", display_name: "Value" }],
    });
    const flowPool: FlowPoolType = {
      "node-1": [
        makeRun({ value: { type: "stream", message: {} } }),
        makeRun({ value: { type: "array", message: [{ a: 1 }] } }),
      ],
    };

    expect(deriveDefaultWidgetLayout([node], flowPool)).toHaveLength(1);
  });

  it("adds a Knowledge Graph tab for a Knowledge component with a selected KB", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Knowledge",
      nodeType: "Knowledge",
      template: { knowledge_base: { value: "my_docs" } },
    });

    expect(deriveDefaultWidgetLayout([node], {})).toEqual([
      {
        source: "knowledge_graph",
        id: "kg:my_docs",
        kbName: "my_docs",
        title: "Knowledge Graph · my_docs",
      },
    ]);
  });

  it("adds a Knowledge Graph tab for a MemoryBase component with a selected KB", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Memory Base",
      nodeType: "MemoryBase",
      template: { memory_base: { value: "session_memory" } },
    });

    expect(deriveDefaultWidgetLayout([node], {})).toEqual([
      {
        source: "knowledge_graph",
        id: "kg:session_memory",
        kbName: "session_memory",
        title: "Knowledge Graph · session_memory",
      },
    ]);
  });

  it("dedups Knowledge Graph tabs when multiple nodes point at the same KB", () => {
    const knowledge = makeNode({
      id: "node-1",
      displayName: "Knowledge",
      nodeType: "Knowledge",
      template: { knowledge_base: { value: "shared_kb" } },
    });
    const memory = makeNode({
      id: "node-2",
      displayName: "Memory Base",
      nodeType: "MemoryBase",
      template: { memory_base: { value: "shared_kb" } },
    });

    expect(deriveDefaultWidgetLayout([knowledge, memory], {})).toHaveLength(
      1,
    );
  });

  it("skips a Knowledge component with no KB selected yet", () => {
    const node = makeNode({
      id: "node-1",
      displayName: "Knowledge",
      nodeType: "Knowledge",
      template: { knowledge_base: { value: "" } },
    });

    expect(deriveDefaultWidgetLayout([node], {})).toEqual([]);
  });

  it("adds a tab for a non-image file attached to a chat message", () => {
    const message = makeMessage({ files: ["flow-1/report.docx"] });

    expect(deriveDefaultWidgetLayout([], {}, [message])).toEqual([
      {
        source: "attachment",
        id: "attachment:flow-1/report.docx",
        fileRef: { source: "v1", path: "flow-1/report.docx", name: "report.docx" },
        title: "report.docx",
      },
    ]);
  });

  it("skips attached images -- the chat bubble already shows a full preview", () => {
    const message = makeMessage({ files: ["flow-1/photo.png"] });

    expect(deriveDefaultWidgetLayout([], {}, [message])).toEqual([]);
  });

  it("dedups the same attached file referenced across multiple messages", () => {
    const messages = [
      makeMessage({ files: ["flow-1/report.docx"] }),
      makeMessage({ files: ["flow-1/report.docx"] }),
    ];

    expect(deriveDefaultWidgetLayout([], {}, messages)).toHaveLength(1);
  });

  it("resolves multiple files attached to the same message", () => {
    const message = makeMessage({
      files: ["flow-1/report.docx", "flow-1/data.xlsx"],
    });

    expect(deriveDefaultWidgetLayout([], {}, [message])).toEqual([
      {
        source: "attachment",
        id: "attachment:flow-1/report.docx",
        fileRef: { source: "v1", path: "flow-1/report.docx", name: "report.docx" },
        title: "report.docx",
      },
      {
        source: "attachment",
        id: "attachment:flow-1/data.xlsx",
        fileRef: { source: "v1", path: "flow-1/data.xlsx", name: "data.xlsx" },
        title: "data.xlsx",
      },
    ]);
  });

  it("normalizes message.files when it arrives as a JSON string, '[]', or ''", () => {
    expect(
      deriveDefaultWidgetLayout(
        [],
        {},
        [makeMessage({ files: '["flow-1/report.docx"]' })],
      ),
    ).toHaveLength(1);
    expect(
      deriveDefaultWidgetLayout([], {}, [makeMessage({ files: "[]" })]),
    ).toEqual([]);
    expect(
      deriveDefaultWidgetLayout([], {}, [makeMessage({ files: "" })]),
    ).toEqual([]);
  });

  it("defaults to no attachment tabs when messages is omitted", () => {
    expect(deriveDefaultWidgetLayout([], {})).toEqual([]);
  });
});
