"use client";

import {
  prepareDirectRewardWithdrawal,
  type DirectRewardEvent,
} from "@/lib/api/campaigns";
import { useMyDirectRewards } from "@/lib/api/campaign-hooks";
import { formatNativeAmount } from "@/lib/native-amount";
import { Button } from "@/components/ui/button";
import { CampaignTransactionButton } from "./campaign-actions";
import {
  campaignPanel,
  CampaignEmpty,
  CampaignLoading,
  CampaignNotice,
  shortWallet,
} from "./campaign-ui";

function historyLabel(event: DirectRewardEvent) {
  return event.type === "ACCRUED" ? "Direct reward credited" : "Rewards withdrawn";
}

export function DirectRewardAccountPanel() {
  const query = useMyDirectRewards();

  if (query.isPending) return <CampaignLoading />;
  if (query.isError)
    return (
      <section className={`${campaignPanel} space-y-3`}>
        <h2 className="text-lg font-semibold">Direct reward balance</h2>
        <CampaignNotice error>
          {query.error instanceof Error
            ? query.error.message
            : "Direct rewards could not be loaded."}{" "}
          <Button variant="link" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CampaignNotice>
      </section>
    );

  const account = query.data;
  const hasBalance = BigInt(account.balanceWei) > BigInt(0);

  return (
    <section className={`${campaignPanel} space-y-5`} aria-labelledby="direct-rewards-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Available to withdraw
          </p>
          <h2 id="direct-rewards-title" className="mt-2 text-lg font-semibold">
            Direct reward balance
          </h2>
          <p className="mt-2 text-3xl font-semibold text-primary">
            {formatNativeAmount(account.balanceWei)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              native currency
            </span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Authoritative chain balance for {shortWallet(account.wallet)} on chain {account.chainId}.
          </p>
        </div>
        <div className="max-w-sm space-y-2">
          <CampaignTransactionButton
            key={account.balanceWei}
            label="Withdraw full balance"
            disabled={!hasBalance}
            prepare={async () => {
              const prepared = await prepareDirectRewardWithdrawal();
              if (
                prepared.wallet.toLowerCase() !== account.wallet.toLowerCase() ||
                prepared.destination.toLowerCase() !== account.wallet.toLowerCase() ||
                prepared.chain.functionName !== "withdrawDirectRewards" ||
                prepared.chain.args[0].toLowerCase() !== account.wallet.toLowerCase()
              )
                throw new Error(
                  "The prepared withdrawal no longer matches your authenticated wallet. Refresh and try again.",
                );
              return prepared.chain;
            }}
            confirmedMessage="Withdrawal confirmed. Your balance and history will update after the listener synchronizes."
          />
          <p className="text-xs text-muted-foreground">
            Withdrawal sends your complete available balance to your authenticated wallet. The
            balance may take a moment to update after confirmation.
          </p>
          {!hasBalance && (
            <p className="text-xs text-muted-foreground">
              There are no Direct rewards available to withdraw.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 pt-5">
        <h3 className="font-medium">Direct reward history</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Accruals and withdrawals appear after the chain listener confirms them.
        </p>
        {account.history.length ? (
          <ol className="mt-4 divide-y divide-border/60">
            {account.history.map((event) => (
              <li
                key={event.id}
                className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-start"
              >
                <div>
                  <p className="text-sm font-medium">{historyLabel(event)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(event.observedAt).toLocaleString()} · block {event.blockNumber}
                  </p>
                  {event.type === "WITHDRAWN" && event.destination && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sent to {shortWallet(event.destination)}
                    </p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p
                    className={`text-sm font-medium ${
                      event.type === "ACCRUED" ? "text-green-400" : ""
                    }`}
                  >
                    {event.type === "ACCRUED" ? "+" : "−"}
                    {formatNativeAmount(event.amountWei)} native currency
                  </p>
                  {event.balanceAfterWei !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Balance after: {formatNativeAmount(event.balanceAfterWei)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4">
            <CampaignEmpty
              title="No Direct reward activity yet"
              description="Confirmed reward credits and withdrawals will appear here."
            />
          </div>
        )}
      </div>
    </section>
  );
}
