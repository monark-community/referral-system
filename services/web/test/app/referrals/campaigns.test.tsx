import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CampaignsPage from "@/app/referrals/campaigns/page";
import CampaignDetailPage from "@/app/referrals/campaigns/[id]/page";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import {
  ParticipantSubmission,
  CampaignReviewQueue,
  CampaignStatusControls,
} from "@/components/campaigns/campaign-actions";
import { SafeProof } from "@/components/campaigns/campaign-ui";
import { useAuth } from "@/contexts/auth-context";
import * as api from "@/lib/api/campaigns";
import type { Campaign, CampaignSubmission } from "@/lib/api/campaigns";
import { buildUser } from "../../fixtures";

const mockPush = jest.fn();
const mockSend = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: "campaign-1" }),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/api/campaigns", () => ({
  getCampaigns: jest.fn(),
  getMyCampaigns: jest.fn(),
  getCampaign: jest.fn(),
  createCampaign: jest.fn(),
  updateCampaign: jest.fn(),
  changeCampaignStatus: jest.fn(),
  getMySubmission: jest.fn(),
  submitCampaignProof: jest.fn(),
  getCampaignSubmissions: jest.fn(),
  reviewCampaignSubmission: jest.fn(),
}));
jest.mock("@/hooks/use-campaign-transaction", () => ({
  useCampaignTransaction: () => ({
    send: mockSend,
    phase: "idle",
    busy: false,
  }),
  campaignError: (error: Error) => error.message,
}));

const campaign: Campaign = {
  id: "campaign-1",
  key: "campaign-1",
  title: "Join our Discord",
  description: "Meet the community",
  instructions: "Join and share your username",
  status: "ACTIVE",
  isSystem: false,
  owner: { name: "Dave", walletAddress: "0xdave" },
  category: "COMMUNITY",
  reward: { type: "POINTS", completerPoints: 30, referralPoolPoints: 10 },
  maxCompletions: 50,
  spotsLeft: 49,
  isPrivate: false,
  endsAt: "2099-11-01T00:00:00Z",
  publishedAt: "2026-10-01T00:00:00Z",
  createdAt: "2026-10-01T00:00:00Z",
};
const submission: CampaignSubmission = {
  id: "submission-1",
  campaignId: campaign.id,
  status: "UNDER_REVIEW",
  proof: "alice#1234",
  rejectionReason: null,
  completerReward: 30,
  createdAt: "2026-10-01T00:00:00Z",
  submittedAt: "2026-10-01T00:00:01Z",
  reviewedAt: null,
  verifiedAt: null,
  rejectedAt: null,
  rewardedAt: null,
  submission: { transactionHash: "0xabc", blockNumber: "1", logIndex: 0 },
  decision: null,
  reward: null,
  chain: null,
};

function mount(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>{component}</QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useAuth)
    .mockReturnValue({
      user: buildUser(),
      isAuthenticated: true,
      refreshUser: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
  jest
    .mocked(api.getCampaigns)
    .mockResolvedValue({
      campaigns: [
        campaign,
        {
          id: "system",
          key: "system",
          title: "Referral program",
          description: "",
          isSystem: true,
          status: "ACTIVE",
        },
      ],
    });
  jest
    .mocked(api.getMyCampaigns)
    .mockResolvedValue({ created: [], joined: [] });
  jest.mocked(api.getCampaign).mockResolvedValue({ campaign });
  jest.mocked(api.getMySubmission).mockResolvedValue({ fulfillment: null });
  jest
    .mocked(api.getCampaignSubmissions)
    .mockResolvedValue({ fulfillments: [] });
  mockSend.mockResolvedValue(undefined);
});

test("filters campaigns and directs the built-in campaign to the existing referral dashboard", async () => {
  mount(<CampaignsPage />);
  expect(
    await screen.findByRole("heading", { name: campaign.title }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Referral program/ }),
  ).toHaveAttribute("href", "/referrals");
  await userEvent.selectOptions(
    screen.getByLabelText("Filter by category"),
    "SOCIAL_MEDIA",
  );
  expect(screen.getByText("No matching campaigns")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(
    screen.getByRole("heading", { name: campaign.title }),
  ).toBeInTheDocument();
});

test("loads drafts from mine without requesting the public detail endpoint", async () => {
  jest
    .mocked(api.getMyCampaigns)
    .mockResolvedValue({
      created: [
        {
          ...campaign,
          status: "DRAFT",
          publishedAt: null,
          chain: {
            functionName: "createCampaign",
            args: ["0x1234", 1, 1, 0, 30, 10],
          },
        },
      ],
      joined: [],
    });
  mount(<CampaignDetailPage />);
  expect(
    await screen.findByRole("button", { name: "Publish campaign in wallet" }),
  ).toBeInTheDocument();
  expect(api.getCampaign).not.toHaveBeenCalled();
  expect(api.getMySubmission).not.toHaveBeenCalled();
});

test("saves a validated draft and navigates to its review page before publishing", async () => {
  jest
    .mocked(api.createCampaign)
    .mockResolvedValue({ campaign: { ...campaign, status: "DRAFT" } });
  mount(<CampaignForm />);
  await userEvent.type(
    screen.getByLabelText("Campaign title"),
    "Community task",
  );
  await userEvent.type(
    screen.getByLabelText("Task instructions"),
    "Join our community",
  );
  await userEvent.type(
    screen.getByLabelText("End date and time"),
    "2099-11-01T12:00",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Community task",
        completerPoints: 30,
        referralPoolPoints: 10,
        maxCompletions: 50,
        isPrivate: false,
      }),
    ),
  );
  expect(mockPush).toHaveBeenCalledWith("/referrals/campaigns/campaign-1");
  expect(mockSend).not.toHaveBeenCalled();
});

test("rejected participants see final feedback without a resubmission form", async () => {
  jest
    .mocked(api.getMySubmission)
    .mockResolvedValue({
      fulfillment: {
        ...submission,
        status: "REJECTED",
        rejectionReason: "Wrong username",
        rejectedAt: "2026-10-02T00:00:00Z",
      },
    });
  mount(<ParticipantSubmission campaign={campaign} />);
  expect(
    await screen.findByText(/Creator’s feedback: Wrong username/),
  ).toBeInTheDocument();
  expect(screen.getByText(/This submission is final/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save proof & continue" }),
  ).not.toBeInTheDocument();
});

test("saved proof can be confirmed without posting another submission", async () => {
  const call = {
    functionName: "submitCampaignFulfillment",
    args: ["0xcampaign", "0xsubmission"],
  } as const;
  jest
    .mocked(api.getMySubmission)
    .mockResolvedValue({
      fulfillment: {
        ...submission,
        status: "SUBMITTED",
        submission: null,
        chain: { ...call, args: [...call.args] },
      },
    });
  mount(<ParticipantSubmission campaign={campaign} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm submission in wallet" }),
  );
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith(call));
  expect(api.submitCampaignProof).not.toHaveBeenCalled();
});

test("pausing a campaign blocks new proof", async () => {
  mount(<ParticipantSubmission campaign={{ ...campaign, status: "PAUSED" }} />);
  expect(
    await screen.findByText(/This campaign is paused/),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Username or proof")).not.toBeInTheDocument();
});

test("reviewers must give a rejection reason and a declined wallet leaves a retryable decision", async () => {
  jest
    .mocked(api.getCampaignSubmissions)
    .mockResolvedValue({
      fulfillments: [
        {
          ...submission,
          participant: {
            id: "alice",
            name: "Alice",
            walletAddress: buildUser().walletAddress,
          },
        },
      ],
    });
  const rejected: CampaignSubmission = {
    ...submission,
    status: "REJECTED",
    rejectionReason: "Wrong username",
    chain: {
      functionName: "rejectCampaignFulfillment",
      args: ["0xsubmission"],
    },
  };
  jest
    .mocked(api.reviewCampaignSubmission)
    .mockResolvedValue({ fulfillment: rejected });
  mockSend.mockRejectedValue(new Error("Wallet declined"));
  mount(<CampaignReviewQueue campaign={campaign} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Reject submission" }),
  );
  expect(
    screen.getByRole("button", { name: "Reject & confirm in wallet" }),
  ).toBeDisabled();
  await userEvent.type(
    screen.getByLabelText("Reason for rejection"),
    "Wrong username",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Reject & confirm in wallet" }),
  );
  await waitFor(() =>
    expect(api.reviewCampaignSubmission).toHaveBeenCalledWith(
      campaign.id,
      submission.id,
      "reject",
      "Wrong username",
    ),
  );
  expect(await screen.findByText("Wallet declined")).toBeInTheDocument();
  expect(mockSend).toHaveBeenCalledWith(rejected.chain);
});

test("a draft can be made private, and keeps that choice when edited", async () => {
  jest
    .mocked(api.createCampaign)
    .mockResolvedValue({ campaign: { ...campaign, status: "DRAFT" } });
  mount(<CampaignForm />);
  expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
  await userEvent.type(screen.getByLabelText("Campaign title"), "Beta test");
  await userEvent.type(
    screen.getByLabelText("Task instructions"),
    "Try the beta",
  );
  await userEvent.type(
    screen.getByLabelText("End date and time"),
    "2099-11-01T12:00",
  );
  await userEvent.click(screen.getByRole("radio", { name: "Private" }));
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Beta test", isPrivate: true }),
    ),
  );
});

test("an existing private draft opens with Private selected", () => {
  mount(
    <CampaignForm
      campaign={{ ...campaign, status: "DRAFT", isPrivate: true }}
    />,
  );
  expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
});

test("a published campaign can be paused or ended, but only a draft can be cancelled", async () => {
  jest
    .mocked(api.changeCampaignStatus)
    .mockResolvedValue({ campaign: { ...campaign, status: "ENDED" } });
  mount(<CampaignStatusControls campaign={campaign} />);
  expect(
    screen.getByRole("button", { name: "Pause campaign" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel campaign" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "End campaign" }));
  expect(
    screen.getByText(/permanently end the campaign/),
  ).toBeInTheDocument();
  const [, confirm] = screen.getAllByRole("button", { name: "End campaign" });
  await userEvent.click(confirm);
  await waitFor(() =>
    expect(api.changeCampaignStatus).toHaveBeenCalledWith(
      campaign.id,
      "ENDED",
    ),
  );
});

test("a draft can be cancelled, but not ended", async () => {
  mount(
    <CampaignStatusControls
      campaign={{ ...campaign, status: "DRAFT", publishedAt: null }}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "End campaign" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel campaign" }),
  );
  expect(
    screen.getByText(/permanently cancel this draft/),
  ).toBeInTheDocument();
});

test("the creator of a published private campaign gets its link to copy", async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  jest.mocked(api.getMyCampaigns).mockResolvedValue({
    created: [
      {
        ...campaign,
        isPrivate: true,
        privateCode: "secret-code",
        chain: null,
      },
    ],
    joined: [],
  });
  mount(<CampaignDetailPage />);
  const field = await screen.findByLabelText("Private campaign link");
  const link = `${window.location.origin}/campaigns/private/secret-code`;
  expect(field).toHaveValue(link);
  expect(screen.getByText("Private")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(writeText).toHaveBeenCalledWith(link);
  expect(
    await screen.findByRole("button", { name: "Copied" }),
  ).toBeInTheDocument();
});

test("a private draft explains its link comes after publishing", async () => {
  jest.mocked(api.getMyCampaigns).mockResolvedValue({
    created: [
      {
        ...campaign,
        status: "DRAFT",
        publishedAt: null,
        isPrivate: true,
        privateCode: "secret-code",
        chain: {
          functionName: "createCampaignWithVisibility",
          args: ["0x1234", 1, 1, 0, 30, 10, 1],
        },
      },
    ],
    joined: [],
  });
  mount(<CampaignDetailPage />);
  expect(
    await screen.findByText(/you’ll get a link to share/),
  ).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Private campaign link"),
  ).not.toBeInTheDocument();
});

test("a private campaign you submitted to opens from your own list, not by its id", async () => {
  // The joined list carries the summary: no instructions, and no code
  const summary = { ...campaign, instructions: undefined, isPrivate: true };
  jest.mocked(api.getMyCampaigns).mockResolvedValue({
    created: [],
    joined: [{ campaign: summary, fulfillment: submission }],
  });
  jest.mocked(api.getMySubmission).mockResolvedValue({ fulfillment: submission });
  mount(<CampaignDetailPage />);
  expect(
    await screen.findByRole("heading", { name: campaign.title }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Open the private link the creator sent you/),
  ).toBeInTheDocument();
  expect(await screen.findByText("Under review")).toBeInTheDocument();
  expect(api.getCampaign).not.toHaveBeenCalled();
});

test("proof never creates a javascript link", () => {
  mount(<SafeProof proof="javascript:alert(1)" />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
});
