// Purpose: Tests that each write context points at the referral contract with the right function name

import { WriteReferralContractHelper } from "../writeReferralContractHelper.js";
import { contracts } from "../contracts.js";

describe("WriteReferralContractHelper", () => {
  test.each([
    ["acceptInviteContext", "acceptInvite"],
    ["joinProgramContext", "joinProgram"],
    ["setPointsForActionContext", "setPointsForAction"],
    ["setReferralSplitContext", "setReferralSplit"],
    ["addMilestoneContext", "addNewMilestone"],
    ["createInviteContext", "createInvite"],
    ["createCampaignContext", "createCampaign"],
    ["createCampaignWithVisibilityContext", "createCampaignWithVisibility"],
    ["setMaxCampaignPointsPerCompletionContext", "setMaxCampaignPointsPerCompletion"],
    ["setMaxCampaignDirectRewardPerCompletionContext", "setMaxCampaignDirectRewardPerCompletion"],
    ["fundCampaignContext", "fundCampaign"],
    ["withdrawDirectRewardsContext", "withdrawDirectRewards"],
    ["submitCampaignFulfillmentContext", "submitCampaignFulfillment"],
    ["createPreVerifiedCampaignFulfillmentContext", "createPreVerifiedCampaignFulfillment"],
    ["completePreVerifiedCampaignFulfillmentContext", "completePreVerifiedCampaignFulfillment"],
    ["verifyCampaignFulfillmentContext", "verifyCampaignFulfillment"],
    ["rejectCampaignFulfillmentContext", "rejectCampaignFulfillment"],
  ] as const)("%s targets %s on the local referral contract", async (method, functionName) => {
    const context = await WriteReferralContractHelper[method]();

    expect(context).toEqual({
      abi: contracts.referral.abi,
      address: contracts.referral.address.local,
      functionName,
    });
  });
});
