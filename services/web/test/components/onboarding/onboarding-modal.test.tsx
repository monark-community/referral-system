// Purpose: Tests for the onboarding modal - which step it shows, when it can be closed, and the success step
// Notes:
// - The individual steps are stubbed here; each step has its own test file

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";
import { SuccessStep } from "@/components/onboarding/steps/success-step";
import { useAuth } from "@/contexts/auth-context";
import type { OnboardingStep } from "@/hooks/use-onboarding";
import { buildUser } from "../../fixtures";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/components/onboarding/steps/wallet-connect-step", () => ({
  WalletConnectStep: ({ onNeedsVerification }: { onNeedsVerification: () => void }) => (
    <button onClick={onNeedsVerification}>wallet step</button>
  ),
}));
jest.mock("@/components/onboarding/steps/terms-step", () => ({
  TermsStep: () => <div>terms step</div>,
}));
jest.mock("@/components/onboarding/steps/profile-step", () => ({
  ProfileStep: () => <div>profile step</div>,
}));
jest.mock("@/components/onboarding/steps/email-verify-step", () => ({
  EmailVerifyStep: () => <div>verify-email step</div>,
}));

function renderModal(step: OnboardingStep, isOpen = true) {
  const props = {
    isOpen,
    step,
    onClose: jest.fn(),
    onNextStep: jest.fn(),
    onPreviousStep: jest.fn(),
    onGoToStep: jest.fn(),
  };
  render(<OnboardingModal {...props} />);
  return props;
}

beforeEach(() => {
  jest.mocked(useAuth).mockReturnValue({
    user: buildUser({ name: "Alice", referralCode: "ALICE12345" }),
  } as unknown as ReturnType<typeof useAuth>);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("OnboardingModal", () => {
  test("renders nothing while closed", () => {
    renderModal("wallet", false);

    expect(screen.queryByText("Connect Wallet")).not.toBeInTheDocument();
  });

  test.each([
    ["wallet", "Connect Wallet", "Step 1 of 5"],
    ["terms", "Terms of Service", "Step 2 of 5"],
    ["profile", "Your Profile", "Step 3 of 5"],
    ["verify-email", "Email Verification", "Step 4 of 5"],
  ] as const)("shows the %s step with its title and position", (step, title, position) => {
    renderModal(step);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(position)).toBeInTheDocument();
    expect(screen.getByText(`${step} step`)).toBeInTheDocument();
  });

  test.each(["wallet", "terms"] as const)("cannot be closed on the %s step", (step) => {
    renderModal(step);

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  test("can be closed from the profile step onwards", async () => {
    const { onClose } = renderModal("profile");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("jumps to email verification for a returning user with an unverified email", async () => {
    const { onGoToStep } = renderModal("wallet");

    await userEvent.click(screen.getByRole("button", { name: "wallet step" }));

    expect(onGoToStep).toHaveBeenCalledWith("verify-email");
  });
});

describe("SuccessStep", () => {
  test("greets the user and shows their referral code", () => {
    render(<SuccessStep onComplete={jest.fn()} />);

    expect(screen.getByText(/Hi Alice, your account has been created/)).toBeInTheDocument();
    expect(screen.getByText("ALICE12345")).toBeInTheDocument();
  });

  test("Go to Dashboard closes onboarding and opens the dashboard", async () => {
    const onComplete = jest.fn();
    render(<SuccessStep onComplete={onComplete} />);

    await userEvent.click(screen.getByRole("button", { name: "Go to Dashboard" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/referrals");
  });
});
