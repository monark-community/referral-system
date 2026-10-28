import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CampaignForm } from "@/components/campaigns/campaign-form";

export default function NewCampaignPage() {
  return (
    <div className="space-y-5">
      <Link
        href="/referrals/campaigns"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All campaigns
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Create a campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One task. Clear instructions. Rewards for your community.
        </p>
      </div>
      <CampaignForm />
    </div>
  );
}
