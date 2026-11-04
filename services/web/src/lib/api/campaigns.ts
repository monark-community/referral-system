import { apiClient } from "./client";

export type CampaignStatus =
  "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "CANCELLED";
export type SubmissionStatus =
  "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "REWARDED";
export type CampaignCategory = "SOCIAL_MEDIA" | "COMMUNITY";
type Bytes32 = `0x${string}`;
type Address = `0x${string}`;
type ChainAmount = number | string;

interface CampaignCallBase {
  chainId: number;
  contractAddress: Address;
  valueWei?: string;
}

export type CampaignCall = CampaignCallBase &
  (
    | {
      functionName: "createCampaign";
      args: [
        Bytes32,
        number,
        number,
        number,
        ChainAmount,
        ChainAmount,
      ];
    }
    | {
      functionName: "createCampaignWithVisibility";
      args: [
        Bytes32,
        number,
        number,
        number,
        ChainAmount,
        ChainAmount,
        number,
      ];
    }
    | { functionName: "submitCampaignFulfillment"; args: [Bytes32, Bytes32] }
    | { functionName: "fundCampaign"; args: [Bytes32] }
    | { functionName: "withdrawDirectRewards"; args: [Address] }
    | {
      functionName: "verifyCampaignFulfillment" | "rejectCampaignFulfillment";
      args: [Bytes32];
    }
  );

export type CampaignReward =
  | {
      type: "POINTS";
      completerPoints: number;
      referralPoolPoints: number;
    }
  | {
      type: "DIRECT";
      completerRewardWei: string;
      referralPoolWei: string;
      rewardPerRunWei: string;
      initialFundingRuns: number;
      initialFundingWei: string;
      chainBalanceWei?: string;
      chainStatus?: "ACTIVE" | "PENDING_FUNDING";
    };

export interface Campaign {
  id: string;
  key: string;
  title: string;
  description: string;
  status: CampaignStatus;
  isSystem: false;
  owner: { name: string | null; walletAddress: string };
  category: CampaignCategory;
  reward: CampaignReward;
  maxCompletions: number;
  spotsLeft: number;
  isPrivate: boolean;
  // Only the creator's own views carry the code for a private campaign's link
  privateCode?: string | null;
  endsAt: string;
  publishedAt: string | null;
  createdAt: string;
  instructions?: string;
  chain?: CampaignCall | null;
  submissions?: Record<SubmissionStatus, number>;
}

export interface SystemCampaign {
  id: string;
  key: string;
  title: string;
  description: string;
  status: string;
  isSystem: true;
}

interface ChainEvent {
  transactionHash: string;
  blockNumber: string | null;
  logIndex: number | null;
}

export interface CampaignSubmission {
  id: string;
  campaignId: string;
  status: SubmissionStatus;
  proof: string;
  rejectionReason: string | null;
  completerReward: number | string;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rewardedAt: string | null;
  submission: ChainEvent | null;
  decision: ChainEvent | null;
  reward: ChainEvent | null;
  chain: CampaignCall | null;
  participant?: { id: string; name: string | null; walletAddress: string };
}

interface CampaignInputBase {
  title: string;
  description: string;
  instructions: string;
  category: CampaignCategory;
  maxCompletions: number;
  endsAt: string;
  isPrivate: boolean;
}

export type CampaignInput =
  | (CampaignInputBase & {
      rewardType: "POINTS";
      completerPoints: number;
      referralPoolPoints: number;
    })
  | (CampaignInputBase & {
      rewardType: "DIRECT";
      completerRewardWei: string;
      referralPoolWei: string;
      initialFundingRuns: number;
    });

export interface CampaignFunding {
  requestedRuns: number;
  valueWei: string;
  currentBalanceWei: string;
  currentRunsRemaining: number;
  projectedBalanceWei: string;
  projectedRunsRemaining: number;
}

export interface DirectRewardEvent {
  id: string;
  chainId: number;
  transactionHash: string;
  logIndex: number;
  blockNumber: string;
  type: "ACCRUED" | "WITHDRAWN";
  account: string;
  destination: string | null;
  amountWei: string;
  balanceAfterWei: string | null;
  observedAt: string;
}

export interface DirectRewardAccount {
  wallet: Address;
  chainId: number;
  balanceWei: string;
  history: DirectRewardEvent[];
}

export interface MyCampaigns {
  created: Campaign[];
  joined: { campaign: Campaign; fulfillment: CampaignSubmission }[];
}

const path = (id: string) => `/campaigns/${encodeURIComponent(id)}`;
const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const getCampaigns = () =>
  apiClient<{ campaigns: (Campaign | SystemCampaign)[] }>("/campaigns");
export const getMyCampaigns = () => apiClient<MyCampaigns>("/campaigns/mine");
export const getCampaign = (id: string) =>
  apiClient<{ campaign: Campaign | SystemCampaign }>(path(id));
// No login needed: the code from the link is what opens a private campaign
export const getPrivateCampaign = (code: string) =>
  apiClient<{ campaign: Campaign }>(
    `/campaigns/private/${encodeURIComponent(code)}`,
  );
export const createCampaign = (input: CampaignInput) =>
  apiClient<{ campaign: Campaign }>("/campaigns", post(input));
export const updateCampaign = (id: string, input: CampaignInput) =>
  apiClient<{ campaign: Campaign }>(path(id), {
    ...post(input),
    method: "PATCH",
  });
export const changeCampaignStatus = (
  id: string,
  status: Exclude<CampaignStatus, "DRAFT">,
) => apiClient<{ campaign: Campaign }>(`${path(id)}/status`, post({ status }));
export const getMySubmission = (id: string) =>
  apiClient<{ fulfillment: CampaignSubmission | null }>(
    `${path(id)}/fulfillments/me`,
  );
// A private campaign also needs the code from its link
export const submitCampaignProof = (id: string, proof: string, code?: string) =>
  apiClient<{ fulfillment: CampaignSubmission }>(
    `${path(id)}/fulfillments`,
    post(code ? { proof, code } : { proof }),
  );
export const getCampaignSubmissions = (id: string) =>
  apiClient<{ fulfillments: CampaignSubmission[] }>(`${path(id)}/fulfillments`);
export const reviewCampaignSubmission = (
  id: string,
  submissionId: string,
  decision: "approve" | "reject",
  reason?: string,
) =>
  apiClient<{ fulfillment: CampaignSubmission }>(
    `${path(id)}/fulfillments/${encodeURIComponent(submissionId)}/${decision}`,
    post(decision === "reject" ? { reason } : {}),
  );

export const prepareCampaignFunding = (id: string, runs: number) =>
  apiClient<{ funding: CampaignFunding; chain: CampaignCall }>(
    `${path(id)}/funding`,
    post({ runs }),
  );

export const getMyDirectRewards = () =>
  apiClient<DirectRewardAccount>("/campaigns/rewards/direct/me");

export const prepareDirectRewardWithdrawal = (destination?: Address) =>
  apiClient<{
    wallet: Address;
    destination: Address;
    balanceWei: string;
    chain: CampaignCall;
  }>(
    "/campaigns/rewards/direct/withdraw",
    post(destination ? { destination } : {}),
  );
