import type { VertexBuildTypeAPI } from "@/types/api";
import type { AllNodeType } from "@/types/flow";
import type { FlowPoolType } from "@/types/zustand/flow";
import { deriveDefaultWidgetLayout } from "../derive-widget-layout";

function makeNode(overrides: {
  id: string;
  displayName: string;
  outputs: Array<{ name: string; display_name: string; hidden?: boolean }>;
}): AllNodeType {
  return {
    id: overrides.id,
    type: "genericNode",
    position: { x: 0, y: 0 },
    data: {
      id: overrides.id,
      type: overrides.displayName,
      node: {
        display_name: overrides.displayName,
        outputs: overrides.outputs,
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
        { name: "summary", display_name: "Summary" },
      ],
    });
    const flowPool: FlowPoolType = {
      "node-1": [
        makeRun({
          table: { type: "array", message: [{ a: 1 }] },
          summary: { type: "text", message: "done" },
        }),
      ],
    };

    const layout = deriveDefaultWidgetLayout([node], flowPool);

    expect(layout).toEqual([
      {
        id: "node-1:table",
        binding: { nodeId: "node-1", outputName: "table" },
        title: "Report Writer · Table",
      },
      {
        id: "node-1:summary",
        binding: { nodeId: "node-1", outputName: "summary" },
        title: "Report Writer · Summary",
      },
    ]);
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
        makeRun({ value: { type: "text", message: "2" } }),
      ],
    };

    expect(deriveDefaultWidgetLayout([node], flowPool)).toHaveLength(1);
  });
});
