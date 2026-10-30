// Purpose: Tests for the page a private campaign's link opens
// Notes:
// - Covers the logged-out view, taking part with the link's code, the creator opening their own link, and a bad link
// - The signed-in sidebar is stubbed; it has its own tests

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PrivateCampaignPage from "@/app/campaigns/private/[code]/page";
import { useAuth } from "@/contexts/auth-context";
import * as api from "@/lib/api/campaigns";
import type { Campaign, CampaignSubmission } from "@/lib/api/campaigns";
import { ApiError } from "@/lib/api/client";
import { rememberReturnTo, returnToPath } from "@/lib/return-to";
import { buildUser } from "../../fixtures";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ code: "secret-code" }),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/api/campaigns", () => ({
  getPrivateCampaign: jest.fn(),
  getMySubmission: jest.fn(),
  submitCampaignProof: jest.fn(),
}));
jest.mock("@/hooks/use-campaign-transaction", () => ({
  useCampaignTransaction: () => ({
    send: jest.fn(),
    phase: "idle",
    busy: false,
  }),
  campaignError: (error: Error) => error.message,
}));
jest.mock("@/components/layout/responsive-shell", () => ({
  ResponsiveShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const campaign: Campaign = {
  id: "campaign-1",
  key: "campaign-1",
  title: "Private beta feedback",
  description: "For our early testers",
  instructions: "Try the beta and share your username",
  status: "ACTIVE",
  isSystem: false,
  owner: { name: "Dave", walletAddress: "0xdave" },
  category: "COMMUNITY",
  reward: { type: "POINTS", completerPoints: 30, referralPoolPoints: 10 },
  maxCompletions: 50,
  spotsLeft: 49,
  isPrivate: true,
  endsAt: "2099-11-01T00:00:00Z",
  publishedAt: "2026-10-01T00:00:00Z",
  createdAt: "2026-10-01T00:00:00Z",
};
const saved: CampaignSubmission = {
  id: "submission-1",
  campaignId: campaign.id,
  status: "SUBMITTED",
  proof: "beta-tester#4321",
  rejectionReason: null,
  completerReward: 30,
  createdAt: "2026-10-01T00:00:00Z",
  submittedAt: null,
  reviewedAt: null,
  verifiedAt: null,
  rejectedAt: null,
  rewardedAt: null,
  submission: null,
  decision: null,
  reward: null,
  chain: {
    functionName: "submitCampaignFulfillment",
    args: ["0xcampaign", "0xsubmission"],
  },
};

function signedIn(user = buildUser()) {
  jest.mocked(useAuth).mockReturnValue({
    user,
    isAuthenticated: true,
    isLoading: false,
    refreshUser: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PrivateCampaignPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  jest.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    refreshUser: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(api.getPrivateCampaign).mockResolvedValue({ campaign });
});

test("anyone with the link can read the campaign, and logging in comes back to it", async () => {
  mount();
  expect(
    await screen.findByRole("heading", { name: campaign.title }),
  ).toBeInTheDocument();
  expect(screen.getByText(campaign.instructions!)).toBeInTheDocument();
  expect(screen.getByText("Private")).toBeInTheDocument();
  expect(api.getPrivateCampaign).toHaveBeenCalledWith("secret-code");
  expect(api.getMySubmission).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Save proof & continue" }),
  ).not.toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "Log in or join to take part" }),
  );
  expect(mockPush).toHaveBeenCalledWith("/referrals/welcome");
  expect(returnToPath()).toBe("/campaigns/private/secret-code");
});

test("a logged-out visitor sees when the campaign isn't taking proof", async () => {
  jest
    .mocked(api.getPrivateCampaign)
    .mockResolvedValue({ campaign: { ...campaign, status: "PAUSED" } });
  mount();
  expect(
    await screen.findByText(/This campaign is paused/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Log in to see your submission" }),
  ).toBeInTheDocument();
});

test("a signed-in visitor takes part with the code from the link", async () => {
  rememberReturnTo("/campaigns/private/secret-code");
  signedIn();
  // The API doesn't answer for a private campaign until you've submitted to it
  jest
    .mocked(api.getMySubmission)
    .mockRejectedValueOnce(new ApiError("Campaign not found", 404))
    .mockResolvedValue({ fulfillment: saved });
  jest
    .mocked(api.submitCampaignProof)
    .mockResolvedValue({ fulfillment: saved });
  mount();
  await userEvent.type(
    await screen.findByLabelText("Username or proof"),
    "beta-tester#4321",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save proof & continue" }),
  );
  await waitFor(() =>
    expect(api.submitCampaignProof).toHaveBeenCalledWith(
      campaign.id,
      "beta-tester#4321",
      "secret-code",
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Confirm submission in wallet" }),
  ).toBeInTheDocument();
  // Back on the page they asked for, so the return trip is done
  expect(returnToPath()).toBe("/referrals");
});

test("the creator opening their own link is pointed to where they manage it", async () => {
  const creator = buildUser();
  signedIn(creator);
  jest.mocked(api.getPrivateCampaign).mockResolvedValue({
    campaign: {
      ...campaign,
      owner: { name: "Alice", walletAddress: creator.walletAddress.toUpperCase() },
    },
  });
  mount();
  expect(
    await screen.findByRole("link", { name: "Manage it and review submissions" }),
  ).toHaveAttribute("href", "/referrals/campaigns/campaign-1");
  expect(api.getMySubmission).not.toHaveBeenCalled();
});

test("a wrong or unpublished link says it doesn't open a campaign", async () => {
  jest
    .mocked(api.getPrivateCampaign)
    .mockRejectedValue(new ApiError("Campaign not found", 404));
  mount();
  expect(
    await screen.findByText(/This link doesn’t open a campaign/),
  ).toBeInTheDocument();
});
