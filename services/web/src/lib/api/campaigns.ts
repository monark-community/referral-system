import { apiClient } from "./client";

export type CampaignStatus =
  "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED" | "CANCELLED";
export type SubmissionStatus =
  "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "REWARDED";
export type CampaignCategory = "SOCIAL_MEDIA" | "COMMUNITY";
type Bytes32 = `0x${string}`;

export type CampaignCall =
  | {
      functionName: "createCampaign";
      args: [Bytes32, number, number, number, number, number];
    }
  | { functionName: "submitCampaignFulfillment"; args: [Bytes32, Bytes32] }
  | {
      functionName: "verifyCampaignFulfillment" | "rejectCampaignFulfillment";
      args: [Bytes32];
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
  reward: {
    type: "POINTS";
    completerPoints: number;
    referralPoolPoints: number;
  };
  maxCompletions: number;
  spotsLeft: number;
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
  completerReward: number;
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

export interface CampaignInput {
  title: string;
  description: string;
  instructions: string;
  category: CampaignCategory;
  completerPoints: number;
  referralPoolPoints: number;
  maxCompletions: number;
  endsAt: string;
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
export const submitCampaignProof = (id: string, proof: string) =>
  apiClient<{ fulfillment: CampaignSubmission }>(
    `${path(id)}/fulfillments`,
    post({ proof }),
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
