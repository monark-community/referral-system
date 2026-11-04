import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CampaignsPage from "@/app/referrals/campaigns/page";
import CampaignDetailPage from "@/app/referrals/campaigns/[id]/page";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { DirectRewardAccountPanel } from "@/components/campaigns/direct-reward-account";
import {
  CampaignFundingControls,
  ParticipantSubmission,
  CampaignReviewQueue,
  CampaignStatusControls,
} from "@/components/campaigns/campaign-actions";
import { SafeProof } from "@/components/campaigns/campaign-ui";
import { useAuth } from "@/contexts/auth-context";
import * as api from "@/lib/api/campaigns";
import { ApiError } from "@/lib/api/client";
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
  getMyDirectRewards: jest.fn(),
  prepareDirectRewardWithdrawal: jest.fn(),
  prepareCampaignFunding: jest.fn(),
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
const directCampaign: Campaign = {
  ...campaign,
  id: "direct-campaign",
  key: "direct-campaign",
  title: "Funded launch task",
  reward: {
    type: "DIRECT",
    completerRewardWei: "3000000000000000",
    referralPoolWei: "1000000000000000",
    rewardPerRunWei: "4000000000000000",
    initialFundingRuns: 10,
    initialFundingWei: "40000000000000000",
    chainBalanceWei: "8000000000000000",
    chainStatus: "ACTIVE",
  },
};
const directRewardAccount: api.DirectRewardAccount = {
  wallet: "0x1111111111111111111111111111111111111111",
  chainId: 31337,
  balanceWei: "7000000000000000",
  history: [
    {
      id: "credit-1",
      chainId: 31337,
      transactionHash: "0xcredit",
      logIndex: 1,
      blockNumber: "42",
      type: "ACCRUED",
      account: "0x1111111111111111111111111111111111111111",
      destination: null,
      amountWei: "10000000000000000",
      balanceAfterWei: "10000000000000000",
      observedAt: "2026-11-03T12:00:00.000Z",
    },
    {
      id: "withdrawal-1",
      chainId: 31337,
      transactionHash: "0xwithdrawal",
      logIndex: 2,
      blockNumber: "43",
      type: "WITHDRAWN",
      account: "0x1111111111111111111111111111111111111111",
      destination: "0x1111111111111111111111111111111111111111",
      amountWei: "3000000000000000",
      balanceAfterWei: "7000000000000000",
      observedAt: "2026-11-03T12:05:00.000Z",
    },
  ],
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
  jest.mocked(api.getMyDirectRewards).mockResolvedValue({
    ...directRewardAccount,
    balanceWei: "0",
    history: [],
  });
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

test("shows the authoritative Direct balance and listener-confirmed history", async () => {
  jest.mocked(api.getMyDirectRewards).mockResolvedValue(directRewardAccount);
  mount(<DirectRewardAccountPanel />);
  expect(
    await screen.findByRole("heading", { name: "Direct reward balance" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/0.007/)).toHaveLength(2);
  expect(screen.getByText(/Authoritative chain balance/)).toHaveTextContent(
    /chain 31337/,
  );
  expect(screen.getByText("Direct reward credited")).toBeInTheDocument();
  expect(screen.getByText("Rewards withdrawn")).toBeInTheDocument();
  expect(screen.getByText("+0.01 native currency")).toBeInTheDocument();
  expect(screen.getByText("−0.003 native currency")).toBeInTheDocument();
  expect(screen.getByText(/Sent to 0x1111…1111/)).toBeInTheDocument();
});

test("prepares and confirms a full-balance withdrawal to the authenticated wallet", async () => {
  const chain = {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "withdrawDirectRewards",
    args: [directRewardAccount.wallet],
  } as const;
  jest.mocked(api.getMyDirectRewards).mockResolvedValue(directRewardAccount);
  jest.mocked(api.prepareDirectRewardWithdrawal).mockResolvedValue({
    wallet: directRewardAccount.wallet,
    destination: directRewardAccount.wallet,
    balanceWei: directRewardAccount.balanceWei,
    chain: { ...chain, args: [...chain.args] },
  });
  mount(<DirectRewardAccountPanel />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw full balance" }),
  );
  await waitFor(() =>
    expect(api.prepareDirectRewardWithdrawal).toHaveBeenCalledWith(),
  );
  expect(mockSend).toHaveBeenCalledWith(chain);
  expect(
    await screen.findByText(/Withdrawal confirmed.*listener synchronizes/),
  ).toBeInTheDocument();
  expect(screen.getByText(/complete available balance/)).toHaveTextContent(
    /authenticated wallet/,
  );
});

test("disables Direct withdrawal when the chain balance is zero", async () => {
  mount(<DirectRewardAccountPanel />);
  expect(
    await screen.findByRole("button", { name: "Withdraw full balance" }),
  ).toBeDisabled();
  expect(screen.getByText(/no Direct rewards available/)).toBeInTheDocument();
  expect(api.prepareDirectRewardWithdrawal).not.toHaveBeenCalled();
});

test("surfaces an unavailable Direct reward chain with retry", async () => {
  jest
    .mocked(api.getMyDirectRewards)
    .mockRejectedValue(new ApiError("Could not read Direct rewards from the chain", 503));
  mount(<DirectRewardAccountPanel />);
  expect(
    await screen.findByText("Could not read Direct rewards from the chain"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

test.each(["Wallet rejected the request", "execution reverted"])(
  "keeps a failed Direct withdrawal retryable: %s",
  async (message) => {
    jest.mocked(api.getMyDirectRewards).mockResolvedValue(directRewardAccount);
    jest.mocked(api.prepareDirectRewardWithdrawal).mockResolvedValue({
      wallet: directRewardAccount.wallet,
      destination: directRewardAccount.wallet,
      balanceWei: directRewardAccount.balanceWei,
      chain: {
        chainId: 31337,
        contractAddress: "0xcontract",
        functionName: "withdrawDirectRewards",
        args: [directRewardAccount.wallet],
      },
    });
    mockSend.mockRejectedValue(new Error(message));
    mount(<DirectRewardAccountPanel />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Withdraw full balance" }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Withdraw full balance" }),
    ).toBeEnabled();
  },
);

test("rejects a stale withdrawal prepared for another destination", async () => {
  jest.mocked(api.getMyDirectRewards).mockResolvedValue(directRewardAccount);
  jest.mocked(api.prepareDirectRewardWithdrawal).mockResolvedValue({
    wallet: directRewardAccount.wallet,
    destination: "0x2222222222222222222222222222222222222222",
    balanceWei: directRewardAccount.balanceWei,
    chain: {
      chainId: 31337,
      contractAddress: "0xcontract",
      functionName: "withdrawDirectRewards",
      args: ["0x2222222222222222222222222222222222222222"],
    },
  });
  mount(<DirectRewardAccountPanel />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw full balance" }),
  );
  expect(
    await screen.findByText(/no longer matches your authenticated wallet/),
  ).toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();
});

test("surfaces a withdrawal that became stale before wallet preparation", async () => {
  jest.mocked(api.getMyDirectRewards).mockResolvedValue(directRewardAccount);
  jest.mocked(api.prepareDirectRewardWithdrawal).mockRejectedValue(
    new ApiError("There are no Direct rewards to withdraw", 409, {
      code: "NO_DIRECT_REWARDS",
    }),
  );
  mount(<DirectRewardAccountPanel />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Withdraw full balance" }),
  );
  expect(
    await screen.findByText("There are no Direct rewards to withdraw"),
  ).toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Withdraw full balance" }),
  ).toBeEnabled();
});

test("presents Direct rewards and funded runs on shared campaign views", async () => {
  jest.mocked(api.getCampaigns).mockResolvedValue({
    campaigns: [directCampaign],
  });
  mount(<CampaignsPage />);
  expect(
    await screen.findByRole("heading", { name: directCampaign.title }),
  ).toBeInTheDocument();
  expect(screen.getByText("0.003")).toBeInTheDocument();
  expect(screen.getByText("native currency per completion")).toBeInTheDocument();
  expect(screen.getByText("Direct reward")).toBeInTheDocument();
  expect(screen.getByText("2 funded runs remaining")).toBeInTheDocument();
});

test("shows tiny Direct rewards and underfunding without displaying zero", async () => {
  jest.mocked(api.getCampaigns).mockResolvedValue({
    campaigns: [
      {
        ...directCampaign,
        reward: {
          type: "DIRECT",
          completerRewardWei: "1",
          referralPoolWei: "0",
          rewardPerRunWei: "1",
          initialFundingRuns: 10,
          initialFundingWei: "10",
          chainBalanceWei: "0",
          chainStatus: "PENDING_FUNDING",
        },
      },
    ],
  });
  mount(<CampaignsPage />);
  expect(await screen.findByText("<0.000001")).toBeInTheDocument();
  expect(screen.getByText("Awaiting more funding")).toBeInTheDocument();
});

test("previews and confirms repeatable Direct campaign top-ups", async () => {
  const chain = {
    chainId: 31337,
    contractAddress: "0xcontract",
    functionName: "fundCampaign",
    args: ["0xdirect"],
    valueWei: "12000000000000000",
  } as const;
  jest.mocked(api.prepareCampaignFunding).mockResolvedValue({
    funding: {
      requestedRuns: 3,
      valueWei: "12000000000000000",
      currentBalanceWei: "8000000000000000",
      currentRunsRemaining: 2,
      projectedBalanceWei: "20000000000000000",
      projectedRunsRemaining: 5,
    },
    chain: { ...chain, args: [...chain.args] },
  });
  mount(<CampaignFundingControls campaign={directCampaign} />);
  expect(screen.getByText(/2 funded runs remaining/)).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Runs to add"));
  await userEvent.type(screen.getByLabelText("Runs to add"), "3");
  await userEvent.click(screen.getByRole("button", { name: "Preview funding" }));
  await waitFor(() =>
    expect(api.prepareCampaignFunding).toHaveBeenCalledWith(
      directCampaign.id,
      3,
    ),
  );
  expect(screen.getByText("0.012 native currency")).toBeInTheDocument();
  expect(screen.getByText(/2 → 5/)).toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();

  await userEvent.click(
    screen.getByRole("button", { name: "Confirm funding in wallet" }),
  );
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith(chain));
  expect(
    await screen.findByText(/Funding transaction confirmed/),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Preview funding" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Confirm funding in wallet" }),
  );
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
});

test("shows funding preparation errors without opening the wallet", async () => {
  jest
    .mocked(api.prepareCampaignFunding)
    .mockRejectedValue(new Error("Could not read campaign funding from the chain"));
  mount(<CampaignFundingControls campaign={directCampaign} />);
  await userEvent.click(screen.getByRole("button", { name: "Preview funding" }));
  expect(
    await screen.findByText(/Could not read campaign funding/),
  ).toBeInTheDocument();
  expect(mockSend).not.toHaveBeenCalled();

  await userEvent.clear(screen.getByLabelText("Runs to add"));
  await userEvent.type(screen.getByLabelText("Runs to add"), "0");
  fireEvent.submit(screen.getByLabelText("Runs to add").closest("form")!);
  expect(
    await screen.findByText("Runs to add must be a positive whole number."),
  ).toBeInTheDocument();
  expect(api.prepareCampaignFunding).toHaveBeenCalledTimes(1);
});

test("highlights pending Direct funding separately from campaign lifecycle", () => {
  if (directCampaign.reward.type !== "DIRECT")
    throw new Error("Expected a Direct campaign fixture");
  mount(
    <CampaignFundingControls
      campaign={{
        ...directCampaign,
        reward: {
          ...directCampaign.reward,
          chainBalanceWei: "0",
          chainStatus: "PENDING_FUNDING",
        },
      }}
    />,
  );
  expect(screen.getByText("Needs funding")).toBeInTheDocument();
  expect(screen.getByText(/0 funded runs remaining/)).toBeInTheDocument();
});

test("hides funding controls when a campaign cannot be funded", () => {
  mount(
    <>
      <CampaignFundingControls campaign={campaign} />
      <CampaignFundingControls
        campaign={{ ...directCampaign, status: "DRAFT", publishedAt: null }}
      />
      <CampaignFundingControls
        campaign={{ ...directCampaign, status: "ENDED" }}
      />
    </>,
  );
  expect(screen.queryByText("Direct campaign funding")).not.toBeInTheDocument();
});

test("does not show owner funding controls to a participant", async () => {
  jest.mocked(api.getCampaign).mockResolvedValue({ campaign: directCampaign });
  mount(<CampaignDetailPage />);
  expect(
    await screen.findByRole("heading", { name: directCampaign.title }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Direct campaign funding")).not.toBeInTheDocument();
});

test("shows Direct funding controls in the creator management area", async () => {
  const ownedDirectCampaign = {
    ...directCampaign,
    id: "campaign-1",
    key: "campaign-1",
  };
  jest.mocked(api.getMyCampaigns).mockResolvedValue({
    created: [ownedDirectCampaign],
    joined: [],
  });
  mount(<CampaignDetailPage />);
  expect(
    await screen.findByRole("heading", { name: "Manage campaign" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Direct campaign funding")).toBeInTheDocument();
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
            chainId: 31337,
            contractAddress: "0xcontract",
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
        rewardType: "POINTS",
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

test("saves an exactly converted Direct draft with initial funding", async () => {
  jest
    .mocked(api.createCampaign)
    .mockResolvedValue({ campaign: { ...campaign, status: "DRAFT" } });
  mount(<CampaignForm />);
  await userEvent.type(
    screen.getByLabelText("Campaign title"),
    "Funded community task",
  );
  await userEvent.type(
    screen.getByLabelText("Task instructions"),
    "Join and share your username",
  );
  await userEvent.type(
    screen.getByLabelText("End date and time"),
    "2099-11-01T12:00",
  );
  await userEvent.click(screen.getByRole("radio", { name: /Direct/ }));
  await userEvent.clear(
    screen.getByLabelText("Completion reward (native currency)"),
  );
  await userEvent.type(
    screen.getByLabelText("Completion reward (native currency)"),
    "0.003",
  );
  await userEvent.clear(
    screen.getByLabelText("Referral pool (native currency)"),
  );
  await userEvent.type(
    screen.getByLabelText("Referral pool (native currency)"),
    "0.001",
  );
  await userEvent.clear(screen.getByLabelText("Initially funded completions"));
  await userEvent.type(
    screen.getByLabelText("Initially funded completions"),
    "10",
  );
  await userEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(screen.getByText("0.04 native currency")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardType: "DIRECT",
        completerRewardWei: "3000000000000000",
        referralPoolWei: "1000000000000000",
        initialFundingRuns: 10,
        isPrivate: true,
      }),
    ),
  );
  expect(mockSend).not.toHaveBeenCalled();
});

test("restores an existing Direct draft and allows its reward type to change", async () => {
  const directDraft: Campaign = {
    ...campaign,
    status: "DRAFT",
    publishedAt: null,
    reward: {
      type: "DIRECT",
      completerRewardWei: "3000000000000000",
      referralPoolWei: "1000000000000000",
      rewardPerRunWei: "4000000000000000",
      initialFundingRuns: 10,
      initialFundingWei: "40000000000000000",
    },
  };
  jest.mocked(api.updateCampaign).mockResolvedValue({ campaign: directDraft });
  mount(<CampaignForm campaign={directDraft} />);
  expect(screen.getByRole("radio", { name: /Direct/ })).toBeChecked();
  expect(
    screen.getByLabelText("Completion reward (native currency)"),
  ).toHaveValue("0.003");
  expect(screen.getByLabelText("Initially funded completions")).toHaveValue(10);
  await userEvent.click(screen.getByRole("radio", { name: /Points/ }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api.updateCampaign).toHaveBeenCalledWith(
      campaign.id,
      expect.objectContaining({
        rewardType: "POINTS",
        completerPoints: 30,
        referralPoolPoints: 10,
      }),
    ),
  );
});

test("restores a private Direct draft through the shared campaign form", () => {
  if (directCampaign.reward.type !== "DIRECT")
    throw new Error("Expected a Direct campaign fixture");
  const privateDirectDraft: Campaign = {
    ...directCampaign,
    status: "DRAFT",
    publishedAt: null,
    isPrivate: true,
    privateCode: "private-direct-code",
    reward: {
      ...directCampaign.reward,
      chainBalanceWei: undefined,
      chainStatus: undefined,
    },
  };
  mount(<CampaignForm campaign={privateDirectDraft} />);
  expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
  expect(screen.getByRole("radio", { name: /Direct/ })).toBeChecked();
  expect(
    screen.getByLabelText("Completion reward (native currency)"),
  ).toHaveValue("0.003");
  expect(
    screen.getByLabelText("Referral pool (native currency)"),
  ).toHaveValue("0.001");
  expect(screen.getByLabelText("Initially funded completions")).toHaveValue(10);
});

test("rejects imprecise native amounts before saving", async () => {
  mount(<CampaignForm />);
  await userEvent.type(screen.getByLabelText("Campaign title"), "Direct task");
  await userEvent.type(
    screen.getByLabelText("Task instructions"),
    "Complete the task",
  );
  await userEvent.type(
    screen.getByLabelText("End date and time"),
    "2099-11-01T12:00",
  );
  await userEvent.click(screen.getByRole("radio", { name: /Direct/ }));
  await userEvent.clear(
    screen.getByLabelText("Completion reward (native currency)"),
  );
  await userEvent.type(
    screen.getByLabelText("Completion reward (native currency)"),
    "0.0000000000000000001",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByText(/at most 18 decimal places/),
  ).toBeInTheDocument();
  expect(api.createCampaign).not.toHaveBeenCalled();
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
    chainId: 31337,
    contractAddress: "0xcontract",
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

test("an underfunded Direct campaign blocks proof until the creator adds funding", async () => {
  mount(
    <ParticipantSubmission
      campaign={{
        ...directCampaign,
        reward: {
          type: "DIRECT",
          completerRewardWei: "3000000000000000",
          referralPoolWei: "1000000000000000",
          rewardPerRunWei: "4000000000000000",
          initialFundingRuns: 10,
          initialFundingWei: "40000000000000000",
          chainBalanceWei: "0",
          chainStatus: "PENDING_FUNDING",
        },
      }}
    />,
  );
  expect(
    await screen.findByText(/temporarily out of funded rewards/),
  ).toBeInTheDocument();
  expect(screen.getByText(/after the creator adds funding/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Username or proof")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save proof & continue" }),
  ).not.toBeInTheDocument();
});

test("a rewarded Direct submission is claimable rather than described as transferred", async () => {
  jest.mocked(api.getMySubmission).mockResolvedValue({
    fulfillment: {
      ...submission,
      status: "REWARDED",
      completerReward: "3000000000000000",
      rewardedAt: "2026-10-02T00:00:00Z",
    },
  });
  mount(<ParticipantSubmission campaign={directCampaign} />);
  expect(
    await screen.findByText(/You earned 0.003 native currency/),
  ).toBeInTheDocument();
  expect(screen.getByText("Direct balance credited")).toBeInTheDocument();
  expect(screen.getByText(/withdrawable Direct reward balance/)).toBeInTheDocument();
});

test("a rewarded Points submission keeps the existing confirmation message", async () => {
  jest.mocked(api.getMySubmission).mockResolvedValue({
    fulfillment: {
      ...submission,
      status: "REWARDED",
      completerReward: 30,
      rewardedAt: "2026-10-02T00:00:00Z",
    },
  });
  mount(<ParticipantSubmission campaign={campaign} />);
  expect(
    await screen.findByText(/You earned 30 points/),
  ).toBeInTheDocument();
  expect(screen.getByText("Points rewarded")).toBeInTheDocument();
  expect(screen.getByText(/Your reward is confirmed/)).toBeInTheDocument();
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
      chainId: 31337,
      contractAddress: "0xcontract",
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

test.each([
  ["public", false],
  ["private", true],
])("uses the same Direct approval messaging for %s campaigns", async (_, isPrivate) => {
  jest.mocked(api.getCampaignSubmissions).mockResolvedValue({
    fulfillments: [submission],
  });
  mount(
    <CampaignReviewQueue campaign={{ ...directCampaign, isPrivate }} />,
  );
  expect(
    await screen.findByRole("button", {
      name: "Approve & credit Direct rewards",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/credits withdrawable Direct balances to the completer/),
  ).toHaveTextContent(/eligible referrers/);
  expect(screen.getByText(/does not transfer native currency immediately/)).toBeInTheDocument();
});

test("routes an underfunded Direct approval back to campaign funding", async () => {
  jest.mocked(api.getCampaignSubmissions).mockResolvedValue({
    fulfillments: [submission],
  });
  jest.mocked(api.reviewCampaignSubmission).mockRejectedValue(
    new ApiError("This campaign does not have a funded run available", 409, {
      code: "INSUFFICIENT_FUNDING",
    }),
  );
  mount(<CampaignReviewQueue campaign={directCampaign} />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Approve & credit Direct rewards",
    }),
  );
  expect(
    await screen.findByText(/does not have a funded run available/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: "Add campaign funding, then retry approval.",
    }),
  ).toHaveAttribute("href", "#campaign-funding");
  expect(mockSend).not.toHaveBeenCalled();
});

test("refreshes Direct campaign state after a confirmed approval", async () => {
  const approved: CampaignSubmission = {
    ...submission,
    status: "APPROVED",
    chain: {
      chainId: 31337,
      contractAddress: "0xcontract",
      functionName: "verifyCampaignFulfillment",
      args: ["0xsubmission"],
    },
  };
  jest.mocked(api.getCampaignSubmissions).mockResolvedValue({
    fulfillments: [submission],
  });
  jest
    .mocked(api.reviewCampaignSubmission)
    .mockResolvedValue({ fulfillment: approved });
  const client = mount(<CampaignReviewQueue campaign={directCampaign} />);
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Approve & credit Direct rewards",
    }),
  );
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith(approved.chain));
  expect(
    await screen.findByText(/Transaction confirmed. The submission will update shortly/),
  ).toBeInTheDocument();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["campaigns"] });
  await waitFor(() =>
    expect(api.getCampaignSubmissions).toHaveBeenCalledTimes(2),
  );
});

test("keeps pending Direct decisions changeable until chain confirmation", async () => {
  jest.mocked(api.getCampaignSubmissions).mockResolvedValue({
    fulfillments: [
      {
        ...submission,
        status: "APPROVED",
        chain: {
          chainId: 31337,
          contractAddress: "0xcontract",
          functionName: "verifyCampaignFulfillment",
          args: ["0xsubmission"],
        },
      },
    ],
  });
  mount(<CampaignReviewQueue campaign={directCampaign} />);
  expect(
    await screen.findByRole("button", { name: "Confirm approval in wallet" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Change decision" }));
  expect(
    screen.getByRole("button", { name: "Approve & credit Direct rewards" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Reject submission" }),
  ).toBeInTheDocument();
});

test("keeps a listener-confirmed Direct reward final in the review queue", async () => {
  jest.mocked(api.getCampaignSubmissions).mockResolvedValue({
    fulfillments: [
      {
        ...submission,
        status: "REWARDED",
        rewardedAt: "2026-10-02T00:00:00Z",
        chain: null,
      },
    ],
  });
  mount(<CampaignReviewQueue campaign={directCampaign} />);
  expect(
    await screen.findByText(/Direct rewards were credited/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Reject/ })).not.toBeInTheDocument();
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
          chainId: 31337,
          contractAddress: "0xcontract",
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
