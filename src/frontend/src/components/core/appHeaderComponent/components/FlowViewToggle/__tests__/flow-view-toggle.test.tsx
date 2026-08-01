import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowViewToggle from "..";

const mockNavigate = jest.fn();

let mockPathname = "/flow/flow-1";
let mockFlowState: {
  onFlowPage: boolean;
  currentFlow?: { id: string };
} = {
  onFlowPage: true,
  currentFlow: { id: "flow-1" },
};

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname }),
}));

jest.mock("@/customization/hooks/use-custom-navigate", () => ({
  useCustomNavigate: () => mockNavigate,
}));

jest.mock("@/stores/flowStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) => selector(mockFlowState),
}));

describe("FlowViewToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = "/flow/flow-1";
    mockFlowState = { onFlowPage: true, currentFlow: { id: "flow-1" } };
  });

  it("renders nothing when not on a flow page", () => {
    mockFlowState = { onFlowPage: false, currentFlow: { id: "flow-1" } };

    const { container } = render(<FlowViewToggle />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no flow is loaded", () => {
    mockFlowState = { onFlowPage: true, currentFlow: undefined };

    const { container } = render(<FlowViewToggle />);

    expect(container).toBeEmptyDOMElement();
  });

  it("marks Editor active on the canvas route", () => {
    render(<FlowViewToggle />);

    expect(screen.getByTestId("flow_view_toggle_editor")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("flow_view_toggle_app")).toHaveAttribute(
      "data-state",
      "inactive",
    );
  });

  it("marks App active on the app route", () => {
    mockPathname = "/flow/flow-1/app";

    render(<FlowViewToggle />);

    expect(screen.getByTestId("flow_view_toggle_app")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("flow_view_toggle_editor")).toHaveAttribute(
      "data-state",
      "inactive",
    );
  });

  it("navigates to the app route when App is selected", async () => {
    render(<FlowViewToggle />);

    await userEvent.click(screen.getByTestId("flow_view_toggle_app"));

    expect(mockNavigate).toHaveBeenCalledWith("/flow/flow-1/app");
  });

  it("navigates back to the canvas route when Editor is selected", async () => {
    mockPathname = "/flow/flow-1/app";

    render(<FlowViewToggle />);

    await userEvent.click(screen.getByTestId("flow_view_toggle_editor"));

    expect(mockNavigate).toHaveBeenCalledWith("/flow/flow-1");
  });

  it("does not navigate when the active view is reselected", async () => {
    render(<FlowViewToggle />);

    await userEvent.click(screen.getByTestId("flow_view_toggle_editor"));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // A trailing segment that merely ends in "app" (a flow named "app", say)
  // must not be mistaken for the App route.
  it("treats a canvas route whose id ends in 'app' as the editor view", () => {
    mockPathname = "/flow/my-app";
    mockFlowState = { onFlowPage: true, currentFlow: { id: "my-app" } };

    render(<FlowViewToggle />);

    expect(screen.getByTestId("flow_view_toggle_editor")).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
