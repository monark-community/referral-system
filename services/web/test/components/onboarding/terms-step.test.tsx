// Purpose: Tests for onboarding step 2 - accepting the terms and conditions

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TermsStep } from "@/components/onboarding/steps/terms-step";
import { acceptTerms } from "@/lib/api/user";
import { useAuth } from "@/contexts/auth-context";
import { buildUser } from "../../fixtures";

jest.mock("@/lib/api/user", () => ({ acceptTerms: jest.fn() }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

const mockUpdateUser = jest.fn();

function renderStep() {
  const onSuccess = jest.fn();
  const onBack = jest.fn();
  render(<TermsStep onSuccess={onSuccess} onBack={onBack} />);
  return { onSuccess, onBack };
}

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue({ updateUser: mockUpdateUser } as unknown as ReturnType<typeof useAuth>);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("Continue stays disabled until the terms checkbox is ticked", async () => {
  renderStep();
  const checkbox = screen.getByRole("checkbox");
  expect(checkbox).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

  await userEvent.click(checkbox);

  expect(checkbox).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("accepting the terms saves the updated user and moves on", async () => {
  const user = buildUser();
  jest.mocked(acceptTerms).mockResolvedValue({ user });
  const { onSuccess } = renderStep();

  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(acceptTerms).toHaveBeenCalledTimes(1);
  expect(mockUpdateUser).toHaveBeenCalledWith(user);
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("shows the API error and stays on the step when accepting fails", async () => {
  jest.mocked(acceptTerms).mockRejectedValue(new Error("Not authenticated"));
  const { onSuccess } = renderStep();

  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Not authenticated");
  expect(onSuccess).not.toHaveBeenCalled();
});

test("Back returns to the previous step", async () => {
  const { onBack } = renderStep();

  await userEvent.click(screen.getByRole("button", { name: "Back" }));

  expect(onBack).toHaveBeenCalledTimes(1);
});
