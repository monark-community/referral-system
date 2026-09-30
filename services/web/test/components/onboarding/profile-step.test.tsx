// Purpose: Tests for onboarding step 3 - profile form validation, saving, and sending the verification email

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileStep } from "@/components/onboarding/steps/profile-step";
import { updateProfile, sendVerificationEmail } from "@/lib/api/user";
import { useAuth } from "@/contexts/auth-context";
import { buildUser } from "../../fixtures";

jest.mock("@/lib/api/user", () => ({
  updateProfile: jest.fn(),
  sendVerificationEmail: jest.fn(),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));

const mockUpdateUser = jest.fn();

function renderStep(currentUser = buildUser({ name: null, email: null })) {
  jest.mocked(useAuth).mockReturnValue({
    user: currentUser,
    updateUser: mockUpdateUser,
  } as unknown as ReturnType<typeof useAuth>);
  const onSuccess = jest.fn();
  const onBack = jest.fn();
  render(<ProfileStep onSuccess={onSuccess} onBack={onBack} />);
  return { onSuccess, onBack };
}

async function fillForm({ name = "", email = "", phone = "" }) {
  if (name) await userEvent.type(screen.getByLabelText(/Name/), name);
  if (email) await userEvent.type(screen.getByLabelText(/Email/), email);
  if (phone) await userEvent.type(screen.getByLabelText(/Phone/), phone);
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("prefills the form from the current user", () => {
  renderStep(buildUser({ name: "Alice", email: "alice@example.com", phone: "+1 555 0100" }));

  expect(screen.getByLabelText(/Name/)).toHaveValue("Alice");
  expect(screen.getByLabelText(/Email/)).toHaveValue("alice@example.com");
  expect(screen.getByLabelText(/Phone/)).toHaveValue("+1 555 0100");
});

test("requires a name and an email before saving", async () => {
  renderStep();

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByText("Name is required")).toBeInTheDocument();
  expect(screen.getByText("Email is required")).toBeInTheDocument();
  expect(updateProfile).not.toHaveBeenCalled();
});

// "alice@example" passes the browser's own type="email" check, so only the step's validation catches it
test("rejects an email without a domain suffix and an invalid phone number", async () => {
  renderStep();
  await fillForm({ name: "Alice", email: "alice@example", phone: "call me" });

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByText("Please enter a valid email address")).toBeInTheDocument();
  expect(screen.getByText("Please enter a valid phone number")).toBeInTheDocument();
  expect(updateProfile).not.toHaveBeenCalled();
});

test("clears a field's error once the user types in it", async () => {
  renderStep();
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  await userEvent.type(screen.getByLabelText(/Name/), "A");

  expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  expect(screen.getByText("Email is required")).toBeInTheDocument();
});

test("saves the cleaned-up profile, sends the verification email, and moves on", async () => {
  const savedUser = buildUser({ email: "alice@example.com", emailVerified: false });
  jest.mocked(updateProfile).mockResolvedValue({ user: savedUser, emailChanged: true });
  jest.mocked(sendVerificationEmail).mockResolvedValue({ success: true, message: "Sent" });
  const { onSuccess } = renderStep();
  await fillForm({ name: "  Alice  ", email: "Alice@Example.com" });

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(updateProfile).toHaveBeenCalledWith({
    name: "Alice",
    email: "alice@example.com",
    phone: undefined,
  });
  expect(mockUpdateUser).toHaveBeenCalledWith(savedUser);
  expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("still moves on when the verification email fails to send", async () => {
  jest.mocked(updateProfile).mockResolvedValue({ user: buildUser(), emailChanged: true });
  jest.mocked(sendVerificationEmail).mockRejectedValue(new Error("SMTP down"));
  const { onSuccess } = renderStep();
  await fillForm({ name: "Alice", email: "alice@example.com" });

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("shows the API error and stays on the step when saving fails", async () => {
  jest.mocked(updateProfile).mockRejectedValue(new Error("Email already in use"));
  const { onSuccess } = renderStep();
  await fillForm({ name: "Alice", email: "alice@example.com" });

  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Email already in use");
  expect(onSuccess).not.toHaveBeenCalled();
});
