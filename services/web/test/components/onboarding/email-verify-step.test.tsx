// Purpose: Tests for onboarding step 4 - polling for email verification and the resend cooldown
// Notes:
// - Uses fake timers to step through the 5s polling interval and 60s resend cooldown

import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailVerifyStep } from "@/components/onboarding/steps/email-verify-step";
import { sendVerificationEmail } from "@/lib/api/user";
import { useAuth } from "@/contexts/auth-context";
import { buildUser } from "../../fixtures";

jest.mock("@/lib/api/user", () => ({ sendVerificationEmail: jest.fn() }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

const mockRefreshUser = jest.fn();

function renderStep(emailVerified = false) {
  jest.mocked(useAuth).mockReturnValue({
    user: buildUser({ email: "alice@example.com", emailVerified }),
    refreshUser: mockRefreshUser,
  } as unknown as ReturnType<typeof useAuth>);
  const onSuccess = jest.fn();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<EmailVerifyStep onSuccess={onSuccess} />);
  return { onSuccess, user };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRefreshUser.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("tells the user where the verification link was sent", () => {
  renderStep();

  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  expect(screen.getByText("Waiting for verification...")).toBeInTheDocument();
});

test("polls for the latest user every 5 seconds", async () => {
  renderStep();
  expect(mockRefreshUser).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(15000);
  });

  expect(mockRefreshUser).toHaveBeenCalledTimes(3);
});

test("moves on shortly after the email is verified", () => {
  const { onSuccess } = renderStep(true);

  expect(screen.getByText("Email Verified!")).toBeInTheDocument();
  expect(onSuccess).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("resending starts a 60 second cooldown", async () => {
  jest.mocked(sendVerificationEmail).mockResolvedValue({ success: true, message: "Sent" });
  const { user } = renderStep();

  await user.click(screen.getByRole("button", { name: "Resend Email" }));

  expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("button", { name: "Resend in 60s" })).toBeDisabled();

  act(() => {
    jest.advanceTimersByTime(59000);
  });
  expect(screen.getByRole("button", { name: "Resend in 1s" })).toBeDisabled();

  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(screen.getByRole("button", { name: "Resend Email" })).toBeEnabled();
});

test("shows the error when resending fails", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.mocked(sendVerificationEmail).mockRejectedValue(new Error("Too many requests"));
  const { user } = renderStep();

  await user.click(screen.getByRole("button", { name: "Resend Email" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  expect(screen.getByRole("button", { name: "Resend Email" })).toBeEnabled();
});
