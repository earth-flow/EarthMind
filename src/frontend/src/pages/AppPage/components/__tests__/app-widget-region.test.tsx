import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import enTranslations from "@/locales/en.json";
import useFlowStore from "@/stores/flowStore";
import type { VertexBuildTypeAPI } from "@/types/api";
import type { AllNodeType } from "@/types/flow";
import { AppWidgetRegion } from "../app-widget-region";

describe("AppWidgetRegion", () => {
  afterEach(() => {
    useFlowStore.setState({ nodes: [], flowPool: {} });
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

  it("renders a widget grid instead of the empty state once a node has run", () => {
    useFlowStore.setState({
      nodes: [
        {
          id: "node-1",
          type: "genericNode",
          position: { x: 0, y: 0 },
          data: {
            id: "node-1",
            type: "TextNode",
            node: {
              display_name: "Text Node",
              outputs: [{ name: "text", display_name: "Text" }],
            },
          },
        },
      ] as unknown as AllNodeType[],
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
      screen.queryByText(enTranslations["app.widgets.emptyTitle"]),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("app-widget-text")).toBeInTheDocument();
    expect(screen.getByText("Text Node · Text")).toBeInTheDocument();
  });
});
