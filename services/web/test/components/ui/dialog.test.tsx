// Purpose: Tests for the modal Dialog - visibility, body scroll locking, and the optional close button

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function renderDialog({
  open = true,
  onClose,
  showCloseButton,
}: { open?: boolean; onClose?: () => void; showCloseButton?: boolean } = {}) {
  return render(
    <Dialog open={open} onOpenChange={jest.fn()}>
      <DialogContent onClose={onClose} showCloseButton={showCloseButton}>
        <DialogTitle>Connect Wallet</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
}

describe("Dialog", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  test("renders nothing while closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByText("Connect Wallet")).not.toBeInTheDocument();
  });

  test("locks page scrolling while open and restores it when closed", () => {
    const { rerender } = renderDialog();
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Dialog open={false} onOpenChange={jest.fn()}>
        <DialogContent>
          <DialogTitle>Connect Wallet</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe("");
  });

  test("restores page scrolling when unmounted while open", () => {
    const { unmount } = renderDialog();

    unmount();

    expect(document.body.style.overflow).toBe("");
  });

  test("calls onClose from the close button", async () => {
    const onClose = jest.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("hides the close button when asked to or when there is no onClose", () => {
    const { unmount } = renderDialog({ onClose: jest.fn(), showCloseButton: false });
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    unmount();

    renderDialog();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
