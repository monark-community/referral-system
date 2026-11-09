# Campaign frontend

The campaign pages use the Points and Direct endpoints documented under **User Campaigns** in
[API.md](API.md#user-campaigns).

These screens create public and private manual campaigns, and serve a private campaign's
shared link. Pre-verified campaigns have an API but no screens yet; see
[Pre-verified campaigns](#pre-verified-campaigns-api-ready-screens-to-build).

## Pages

- `/referrals/campaigns`: campaign board, Direct reward balance and history, search and
  category filters, campaigns created by the signed-in user, and their submissions.
- `/referrals/campaigns/new`: create a draft with task instructions, category, reward,
  referral pool, available completions, and a local end date and time.
- `/referrals/campaigns/:id`: task details, draft editing and publishing, campaign
  management, participant proof and progress, or the creator's review queue.
- `/campaigns/private/:code`: a private campaign's link. Anyone with it can read the campaign
  without logging in; a signed-in user submits proof with the link's code. It sits outside
  `/referrals` because the campaigns layout sends logged-out visitors to the welcome page.

Campaigns are linked from the desktop sidebar and the mobile dashboard menu. The built-in
referral campaign links to the existing referral dashboard.

## Wallet flow

Publishing, funding, submitting, approving, rejecting, and withdrawing use the `chain` call returned by the
API and the existing contract ABI/address from the blockchain connector. The connected
wallet must match the signed-in account. Transactions use the existing local Hardhat
deployment (chain 31337), matching the rest of the application.

The UI waits for a successful transaction receipt and polls the existing campaign reads
every five seconds for the listener's updates. Transaction hashes are retained in local
storage, scoped to the chain, contract, user, operation, arguments, and payable value, so retrying
after navigation or a confirmation timeout checks the existing transaction first. Reverted
and cancelled transactions may be retried. Wallet speed-ups update the stored hash. Funding
and withdrawals are repeatable operations: a confirmed transaction is protected from an
accidental duplicate, while a later intentional top-up or withdrawal receives a fresh attempt.

Proof is saved before wallet confirmation. A declined wallet request leaves the saved
submission available to confirm later. Review decisions likewise remain available to
confirm or change until finalized on chain. A rejection reason is required, and finalized
rejections do not expose a resubmission form.

Drafts are loaded through `GET /campaigns/mine`; the public detail endpoint intentionally
does not serve drafts. Pause/resume uses the existing status endpoint. A published campaign
can be ended, and only a draft can be cancelled; both ask for confirmation, and ending leaves
existing submissions available for review.

## Direct campaigns

The form's Points/Direct choice is independent of Public/Private visibility. A Direct draft
accepts human-readable native completion and referral-pool amounts plus an initial number of
funded completions. The browser converts those values to exact decimal-string wei without
floating-point arithmetic. API payloads and persisted values remain wei strings; conversion to
`bigint` happens only when the wallet sends a transaction.

The UI says **native currency** because campaign responses do not yet carry authoritative
network currency metadata. It does not hard-code ETH. Publishing a Direct campaign sends
`initialFundingWei` as the transaction value. This value funds the campaign contract; it is not
an application fee.

Published Direct campaigns show their authoritative contract balance and complete funded runs.
When less than one full run remains, `PENDING_FUNDING` appears as a reward-funding state beside
the normal campaign lifecycle badge. It does not replace `ACTIVE`, `PAUSED`, or another API
lifecycle state. Underfunded public and private campaigns temporarily hide proof submission and
reopen after the owner adds funding.

Owners top up from the existing campaign management area. They enter a positive whole run count,
review the API's current/projected balances and runs, and then explicitly confirm the payable
wallet transaction. Approval credits withdrawable Direct balances to the completer and eligible
referrers; it does not transfer native currency immediately. An insufficiently funded approval
links back to the funding panel.

The campaign board contains the signed-in user's Direct reward account. Its balance is read
authoritatively from the chain, while accrual and withdrawal history appears after listener
confirmation. The first frontend slice withdraws the complete available balance only to the
authenticated wallet. Although the API supports an alternate destination, the UI deliberately
does not expose it because redirecting native currency adds avoidable address risk. After a
receipt, the UI keeps polling so listener-delayed balance and history updates appear without a
duplicate send.

## Private campaigns

The draft form has a Public/Private choice, which can change until the campaign is
published. A private campaign is left off the board and doesn't open by its id. Once it is
published, the creator's page shows its one link, built from `privateCode`, with a copy
button.

A logged-out visitor on the link page gets a log-in/join button. The page is remembered for
the tab (`src/lib/return-to.ts`, in sessionStorage), and logging in or joining from the
welcome page comes back to it instead of the dashboard. Only paths on this site are kept.

`GET /campaigns/:id/fulfillments/me` answers 404 for a private campaign until the user has
submitted to it, so the link page reads that as "no submission yet". A participant's own
list (`/mine`) carries their private campaigns without the code, so the detail page shows
those from the list, and points to the link for the full task.

## Pre-verified campaigns (API ready, screens to build)

The API for [pre-verified campaigns](API.md#pre-verified-campaigns) is done; these screens are
not built yet. A pre-verified campaign is private. Its creator lists the winners' wallets with the
draft, nobody submits proof, and only the listed wallets can claim. A winner needs no account
beforehand: signing in with the listed wallet creates one. Public campaigns and manual private
campaigns work as before, so nothing above changes.

To build:

1. **Draft form** (`/referrals/campaigns/new` and draft editing). When Private is chosen, ask
   "How are winners picked?": "People submit proof and I approve them" (`MANUAL`, the default)
   or "I pick the winners myself" (`PRE_VERIFIED`). For `PRE_VERIFIED`, show a table of wallet
   address plus optional name, and send `verificationType: "PRE_VERIFIED"` and
   `winners: [{ walletAddress, label }]`. Leave `maxCompletions` out: the API sets it to the
   number of wallets, and sending it is a 400. Field errors come back as, for example,
   `winners[1].walletAddress`. Switching back to manual sends `verificationType: "MANUAL"`.
2. **Wallet calls** (`src/hooks/use-campaign-transaction.ts` and the `CampaignCall` type in
   `src/lib/api/campaigns.ts`). Add two cases, neither payable:
   `createPreVerifiedCampaignFulfillment` with args `[campaignId, winnerId, walletAddress]`, and
   `completePreVerifiedCampaignFulfillment` with args `[winnerId]`. Publishing needs no change:
   it is still `createCampaignWithVisibility`, with `2` as the verification type.
3. **Creator's campaign page** (`/referrals/campaigns/:id`). For a pre-verified campaign, show a
   Winners section from `GET /api/campaigns/:id/winners` instead of the review queue: each
   wallet, its name and its `state`. A wallet in `READY_TO_PUT_ON_CHAIN` gets a button that sends
   its `chain` call, one MetaMask confirmation per wallet. Add wallets with
   `POST /api/campaigns/:id/winners`, and remove a `LISTED` one with
   `DELETE /api/campaigns/:id/winners/:winnerId`. When `funding.runsShort` is above 0, show
   "N winners are waiting for funds" and open the existing funding panel with
   `runs = runsShort`.
4. **Private link page** (`/campaigns/private/:code`). When `verificationType` is `PRE_VERIFIED`,
   hide the proof form. For a signed-in user, call `GET /api/campaigns/:id/winners/me`. A 404
   means they aren't listed ("The creator picks the winners for this campaign"); otherwise show
   their `state`, with a Claim button that sends `chain` when it is `CLAIMABLE`.
5. **Dashboard** (`/referrals`). Add a "Rewards to claim" card from
   `GET /api/campaigns/rewards/pre-verified/me`, with the same Claim button. A claimed Direct
   reward then shows in the existing Direct reward account, ready to withdraw.

Suggested wording for a winner's `state`:

| `state` | Text |
|---------|------|
| `NOT_ON_CHAIN_YET` | You're on the list. The creator still has to confirm it. |
| `CLAIMABLE` | Claim button |
| `WAITING_FOR_FUNDS` | Waiting for the creator to add funds |
| `PAUSED` | The creator paused this campaign |
| `CLAIMED` | Claimed |

Notes:

- The wallet's name (`label`) is the creator's own note. The API never sends it to the winner.
- `spotsLeft` means nothing for a pre-verified campaign (it is just the number of wallets), so
  don't show it there.
- Statuses change when the listener sees each transaction, so keep the five-second polling used
  elsewhere after a receipt.
- The `@api` end-to-end test `e2e/tests/pre-verified-campaign-api.spec.ts` runs the whole flow on
  the real contract, and shows each call in order.

## Verification

From the repository root:

```sh
npm run build:packages
npm run build -w reffinity-web
npm test -w reffinity-web -- --runInBand --coverage=false --modulePathIgnorePatterns='/.next/'
npm run test:e2e -- --grep '@smoke|@campaigns|@direct-campaigns|@api'
```

The campaign browser journeys run against PostgreSQL, the API, the listener, and real
Hardhat wallet transactions. They cover draft visibility and editing, publishing,
community and social media proof, wallet rejection and retry, approval/reward, rejection
feedback, pause/resume, creator participation restrictions, private campaigns (the link,
the logged-out view, and logging in from the link), Direct creation and payout, depletion and
top-up recovery, authenticated-wallet withdrawal, and desktop/mobile overflow. Browser
screenshots are saved in the normal Playwright output directory.
