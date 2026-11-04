# Campaign frontend

The campaign pages use the Points and Direct endpoints documented under **User Campaigns** in
[API.md](API.md#user-campaigns).

These screens create public and private manual campaigns, and serve a private campaign's
shared link.

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
