import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import enTranslations from "@/locales/en.json";
import { AppWidgetRegion } from "../app-widget-region";

describe("AppWidgetRegion", () => {
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
});
