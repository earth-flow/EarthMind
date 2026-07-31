import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SidebarMenuButtons from "../sidebarFooterButtons";

// Mock the UI components
jest.mock("@/components/common/genericIconComponent", () => ({
  __esModule: true,
  default: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className}>
      {name}
    </span>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    className,
    disabled,
    unstyled,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
    unstyled?: boolean;
    [key: string]: unknown;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={className}
      disabled={disabled}
      data-unstyled={unstyled}
      {...props}
    >
      {children}
    </button>
  ),
}));

// Mock sidebar hook with default values
const mockUseSidebar = jest.fn();

jest.mock("@/components/ui/sidebar", () => ({
  SidebarMenuButton: ({
    children,
    asChild,
    className,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="sidebar-menu-button"
      data-as-child={asChild}
      className={className}
    >
      {children}
    </div>
  ),
  useSidebar: () => mockUseSidebar(),
}));

// Mock feature flags
jest.mock("@/customization/feature-flags", () => ({
  ENABLE_NEW_SIDEBAR: true,
}));

// Mock navigation hook
const mockNavigate = jest.fn();
jest.mock("@/customization/hooks/use-custom-navigate", () => ({
  useCustomNavigate: () => mockNavigate,
}));

// Mock modal component
jest.mock("@/modals/addMcpServerModal", () => ({
  __esModule: true,
  default: ({
    open,
    setOpen,
  }: {
    open: boolean;
    setOpen: (open: boolean) => void;
  }) => (
    <div data-testid="add-mcp-server-modal" data-open={open}>
      <button type="button" onClick={() => setOpen(false)}>
        Close Modal
      </button>
    </div>
  ),
}));

describe("SidebarMenuButtons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    // Reset to default sidebar state
    mockUseSidebar.mockReturnValue({
      activeSection: "components",
    });
  });

  describe("Non-MCP sections", () => {
    it.each(["components", "bundles", "search"])(
      "should render nothing in the %s section",
      (activeSection) => {
        mockUseSidebar.mockReturnValue({ activeSection });

        const { container } = render(<SidebarMenuButtons />);

        expect(container).toBeEmptyDOMElement();
      },
    );
  });

  describe("MCP Functionality", () => {
    beforeEach(() => {
      // Mock the sidebar to be in MCP section
      mockUseSidebar.mockReturnValue({
        activeSection: "mcp",
      });
    });

    it("should render MCP buttons when in MCP section", () => {
      render(<SidebarMenuButtons />);

      expect(
        screen.getByTestId("sidebar-add-mcp-server-button"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("sidebar-manage-servers-button"),
      ).toBeInTheDocument();
    });

    it("should render Add MCP Server button with correct content", () => {
      render(<SidebarMenuButtons />);

      const addButton = screen.getByTestId("sidebar-add-mcp-server-button");
      expect(addButton).toHaveTextContent("Add MCP Server");
      expect(screen.getByTestId("icon-Plus")).toBeInTheDocument();
    });

    it("should render Manage Servers button with correct content", () => {
      render(<SidebarMenuButtons />);

      const manageButton = screen.getByTestId("sidebar-manage-servers-button");
      expect(manageButton).toHaveTextContent("Manage Servers");
      expect(screen.getByTestId("icon-ArrowUpRight")).toBeInTheDocument();
    });

    it("should open modal when Add MCP Server button is clicked", async () => {
      const user = userEvent.setup();
      render(<SidebarMenuButtons />);

      expect(screen.getByTestId("add-mcp-server-modal")).toHaveAttribute(
        "data-open",
        "false",
      );

      const addButton = screen.getByTestId("sidebar-add-mcp-server-button");
      await user.click(addButton);

      expect(screen.getByTestId("add-mcp-server-modal")).toHaveAttribute(
        "data-open",
        "true",
      );
    });

    it("should navigate to settings when Manage Servers button is clicked", async () => {
      const user = userEvent.setup();
      render(<SidebarMenuButtons />);

      const manageButton = screen.getByTestId("sidebar-manage-servers-button");
      await user.click(manageButton);

      expect(mockNavigate).toHaveBeenCalledWith("/settings/mcp-servers");
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it("should disable MCP buttons when loading", () => {
      render(<SidebarMenuButtons isLoading={true} />);

      const addButton = screen.getByTestId("sidebar-add-mcp-server-button");
      const manageButton = screen.getByTestId("sidebar-manage-servers-button");

      expect(addButton).toBeDisabled();
      expect(manageButton).toBeDisabled();
    });

    it("should close modal when close button is clicked", async () => {
      const user = userEvent.setup();
      render(<SidebarMenuButtons />);

      // Open modal first
      const addButton = screen.getByTestId("sidebar-add-mcp-server-button");
      await user.click(addButton);
      expect(screen.getByTestId("add-mcp-server-modal")).toHaveAttribute(
        "data-open",
        "true",
      );

      // Close modal
      const closeButton = screen.getByText("Close Modal");
      await user.click(closeButton);
      expect(screen.getByTestId("add-mcp-server-modal")).toHaveAttribute(
        "data-open",
        "false",
      );
    });

    it("should apply correct styling to MCP buttons", () => {
      render(<SidebarMenuButtons />);

      const addButton = screen.getByTestId("sidebar-add-mcp-server-button");
      const manageButton = screen.getByTestId("sidebar-manage-servers-button");

      expect(addButton).toHaveClass(
        "flex",
        "items-center",
        "w-full",
        "h-full",
        "gap-3",
        "hover:bg-muted",
      );
      expect(addButton).toHaveAttribute("data-unstyled", "true");
      expect(manageButton).toHaveClass(
        "flex",
        "items-center",
        "w-full",
        "h-full",
        "gap-3",
        "hover:bg-muted",
      );
      expect(manageButton).toHaveAttribute("data-unstyled", "true");
    });

    it("should render MCP icons with correct styling", () => {
      render(<SidebarMenuButtons />);

      const plusIcon = screen.getByTestId("icon-Plus");
      const arrowIcon = screen.getByTestId("icon-ArrowUpRight");

      expect(plusIcon).toHaveClass("h-4", "w-4", "text-muted-foreground");
      expect(arrowIcon).toHaveClass("h-4", "w-4", "text-muted-foreground");
    });

    it("should render MCP button text with correct styling", () => {
      render(<SidebarMenuButtons />);

      const addSpan = screen.getByText("Add MCP Server");
      const manageSpan = screen.getByText("Manage Servers");

      expect(addSpan).toHaveClass(
        "group-data-[state=open]/collapsible:font-semibold",
      );
      expect(manageSpan).toHaveClass(
        "group-data-[state=open]/collapsible:font-semibold",
      );
    });

    it("should render modal component", () => {
      render(<SidebarMenuButtons />);

      expect(screen.getByTestId("add-mcp-server-modal")).toBeInTheDocument();
    });

    it("should render both SidebarMenuButtons in MCP mode", () => {
      render(<SidebarMenuButtons />);

      const sidebarMenuButtons = screen.getAllByTestId("sidebar-menu-button");
      expect(sidebarMenuButtons).toHaveLength(2); // Add + Manage buttons
    });
  });
});
