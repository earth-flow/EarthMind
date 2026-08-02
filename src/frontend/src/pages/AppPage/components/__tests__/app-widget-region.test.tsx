import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import enTranslations from "@/locales/en.json";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useMessagesStore } from "@/stores/messagesStore";
import type { VertexBuildTypeAPI } from "@/types/api";
import type { AllNodeType } from "@/types/flow";
import type { Message } from "@/types/messages";
import { AppWidgetRegion } from "../app-widget-region";

function makeMessage(overrides: Partial<Message>): Message {
  return {
    flow_id: "flow-1",
    text: "",
    sender: "User",
    sender_name: "User",
    session_id: "session-1",
    timestamp: "",
    files: [],
    id: "msg-1",
    edit: false,
    background_color: "",
    text_color: "",
    ...overrides,
  };
}

function makeGenericNode(overrides: {
  id: string;
  type: string;
  displayName: string;
  outputName: string;
  outputDisplayName: string;
}): AllNodeType {
  return {
    id: overrides.id,
    type: "genericNode",
    position: { x: 0, y: 0 },
    data: {
      id: overrides.id,
      type: overrides.type,
      node: {
        display_name: overrides.displayName,
        outputs: [
          { name: overrides.outputName, display_name: overrides.outputDisplayName },
        ],
        template: {},
      },
    },
  } as unknown as AllNodeType;
}

describe("AppWidgetRegion", () => {
  afterEach(() => {
    useFlowStore.setState({ nodes: [], flowPool: {} });
    useFlowsManagerStore.setState({ currentFlowId: "" });
    useMessagesStore.setState({ messages: [] });
  });

  it("renders the empty state while no widgets exist", () => {
    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(
      screen.getByText(enTranslations["app.widgets.emptyTitle"]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enTranslations["app.widgets.emptyDescription"]),
    ).toBeInTheDocument();
  });

  it("stays on the empty state for chat-only output (plain text is already in the chat panel)", () => {
    useFlowStore.setState({
      nodes: [
        makeGenericNode({
          id: "node-1",
          type: "TextNode",
          displayName: "Text Node",
          outputName: "text",
          outputDisplayName: "Text",
        }),
      ],
      flowPool: {
        "node-1": [
          {
            data: { outputs: { text: { type: "text", message: "hello" } } },
          } as unknown as VertexBuildTypeAPI,
        ],
      },
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(
      screen.getByText(enTranslations["app.widgets.emptyTitle"]),
    ).toBeInTheDocument();
  });

  it("hides the show-chat button while the chat panel is open", () => {
    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(
      screen.queryByTestId("app_show_chat_button"),
    ).not.toBeInTheDocument();
  });

  // The chat panel owns its own close control, so this button is the only
  // way back once it has been dismissed.
  it("offers a show-chat button once the chat panel is closed", () => {
    render(<AppWidgetRegion isChatOpen={false} onShowChat={jest.fn()} />);

    expect(screen.getByTestId("app_show_chat_button")).toBeInTheDocument();
  });

  it("reopens the chat panel when the show-chat button is clicked", async () => {
    const onShowChat = jest.fn();

    render(<AppWidgetRegion isChatOpen={false} onShowChat={onShowChat} />);
    await userEvent.click(screen.getByTestId("app_show_chat_button"));

    expect(onShowChat).toHaveBeenCalledTimes(1);
  });

  it("renders one tab per file/component output, showing the first tab's content by default", () => {
    useFlowStore.setState({
      nodes: [
        makeGenericNode({
          id: "node-1",
          type: "JsonNode",
          displayName: "Json Node",
          outputName: "payload",
          outputDisplayName: "Payload",
        }),
      ],
      flowPool: {
        "node-1": [
          {
            data: { outputs: { payload: { type: "object", message: { a: 1 } } } },
          } as unknown as VertexBuildTypeAPI,
        ],
      },
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(
      screen.queryByText(enTranslations["app.widgets.emptyTitle"]),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("app-widget-tab-node-1:payload"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-widget-json")).toBeInTheDocument();
  });

  it("switches the visible widget when a different tab is selected", async () => {
    useFlowStore.setState({
      nodes: [
        makeGenericNode({
          id: "node-1",
          type: "JsonNode",
          displayName: "Json Node",
          outputName: "payload",
          outputDisplayName: "Payload",
        }),
        makeGenericNode({
          id: "node-2",
          type: "TableNode",
          displayName: "Table Node",
          outputName: "rows",
          outputDisplayName: "Rows",
        }),
      ],
      flowPool: {
        "node-1": [
          {
            data: { outputs: { payload: { type: "object", message: { a: 1 } } } },
          } as unknown as VertexBuildTypeAPI,
        ],
        "node-2": [
          {
            data: { outputs: { rows: { type: "array", message: [{ a: 1 }] } } },
          } as unknown as VertexBuildTypeAPI,
        ],
      },
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(screen.getByTestId("app-widget-json")).toBeInTheDocument();
    expect(screen.queryByTestId("app-widget-table")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("app-widget-tab-node-2:rows"),
    );

    expect(screen.getByTestId("app-widget-table")).toBeInTheDocument();
    expect(screen.queryByTestId("app-widget-json")).not.toBeInTheDocument();
  });

  it("renders a tab for a non-image file attached to a chat message on this flow", () => {
    useFlowsManagerStore.setState({ currentFlowId: "flow-1" });
    useMessagesStore.setState({
      messages: [makeMessage({ files: ["flow-1/report.docx"] })],
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(
      screen.getByTestId("app-widget-tab-attachment:flow-1/report.docx"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-widget-docx")).toBeInTheDocument();
  });

  it("closes a tab when its close button is clicked, without selecting it first", async () => {
    useFlowStore.setState({
      nodes: [
        makeGenericNode({
          id: "node-1",
          type: "JsonNode",
          displayName: "Json Node",
          outputName: "payload",
          outputDisplayName: "Payload",
        }),
        makeGenericNode({
          id: "node-2",
          type: "TableNode",
          displayName: "Table Node",
          outputName: "rows",
          outputDisplayName: "Rows",
        }),
      ],
      flowPool: {
        "node-1": [
          {
            data: { outputs: { payload: { type: "object", message: { a: 1 } } } },
          } as unknown as VertexBuildTypeAPI,
        ],
        "node-2": [
          {
            data: { outputs: { rows: { type: "array", message: [{ a: 1 }] } } },
          } as unknown as VertexBuildTypeAPI,
        ],
      },
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(screen.getByTestId("app-widget-json")).toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("app-widget-tab-close-node-1:payload"),
    );

    expect(
      screen.queryByTestId("app-widget-tab-node-1:payload"),
    ).not.toBeInTheDocument();
    // Falls back to the remaining tab rather than the empty state.
    expect(screen.getByTestId("app-widget-table")).toBeInTheDocument();
  });

  it("falls back to the empty state once every tab has been closed", async () => {
    useFlowStore.setState({
      nodes: [
        makeGenericNode({
          id: "node-1",
          type: "JsonNode",
          displayName: "Json Node",
          outputName: "payload",
          outputDisplayName: "Payload",
        }),
      ],
      flowPool: {
        "node-1": [
          {
            data: { outputs: { payload: { type: "object", message: { a: 1 } } } },
          } as unknown as VertexBuildTypeAPI,
        ],
      },
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    await userEvent.click(
      screen.getByTestId("app-widget-tab-close-node-1:payload"),
    );

    expect(
      screen.getByText(enTranslations["app.widgets.emptyTitle"]),
    ).toBeInTheDocument();
  });

  it("ignores chat messages belonging to a different flow", () => {
    useFlowsManagerStore.setState({ currentFlowId: "flow-1" });
    useMessagesStore.setState({
      messages: [
        makeMessage({ flow_id: "flow-2", files: ["flow-2/report.docx"] }),
      ],
    });

    render(<AppWidgetRegion isChatOpen onShowChat={jest.fn()} />);

    expect(
      screen.getByText(enTranslations["app.widgets.emptyTitle"]),
    ).toBeInTheDocument();
  });
});
