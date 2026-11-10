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
not built yet. Public campaigns and manual private campaigns work as before, so nothing above
changes.

### What it is

It's for a contest judged somewhere else, where the creator already knows who won. The rules
below were agreed with Sam on Nov 9:

- **The creator makes the list beforehand.** They type the winners' wallet addresses into the
  draft. Nobody submits proof, and there's no approval step: the list is the decision.
- **Wallet-based.** A winner doesn't need a Reffinity account to be listed. Signing in with the
  listed wallet creates one the first time.
- **Private only.** The contract refuses a public pre-verified campaign.
- **Funding works like any Direct campaign.** The creator can fund fewer runs than there are
  winners and top up as they claim. Winners past the funded runs wait.

### The flow, start to finish

1. **Creator, draft form:** picks Private, then "I pick the winners myself", types the winners'
   wallets (names optional), and presses Save draft.
2. **Creator, campaign page:** Publish campaign in wallet. A Direct campaign sends its starting
   funds in the same transaction.
3. **Creator, Winners section:** Confirm winner in wallet, once per wallet. If the "N winners
   are waiting for funds" banner shows, Add funds first.
4. **Creator, off the site:** copies the private link and sends it to the winners.
5. **Winner, link page:** Log in to claim with the listed wallet (a new wallet gets an account
   automatically), then Claim reward in wallet. Once signed in, the same reward also shows on
   the dashboard's "Rewards to claim" card.
6. **Winner, afterwards:** points are paid on the claim. A Direct reward lands in the Direct
   reward balance on `/referrals/campaigns`, and Withdraw full balance sends it to their wallet.

If the money runs out partway, the winners left see "Waiting for the creator to add funds" until
the creator tops up. Ending the campaign doesn't stop anyone from claiming.

### Why there are two wallet steps

1. **The creator confirms each winner on chain.** The contract only lets the campaign owner's
   wallet register a winner, and the site holds no wallet keys. So the creator's MetaMask sends
   one transaction per listed wallet, after publishing.
2. **The winner claims.** The contract pays a listed reward only when that same wallet sends the
   claim, so nobody else can take it or send it somewhere else, even someone who breaks into the
   site. That's why the reward isn't paid out automatically. A Direct reward then sits in the
   winner's reward balance until they use the existing Withdraw.

Once a wallet is confirmed on chain it can't be taken off; the contract has no call for that
yet. Before then, the creator can remove it freely.

### To build

1. **Draft form** (`/referrals/campaigns/new` and draft editing). When Private is chosen, ask
   "How are winners picked?": "People submit proof and I approve them" (`MANUAL`, the default)
   or "I pick the winners myself" (`PRE_VERIFIED`). For `PRE_VERIFIED`, show a table of wallet
   address plus optional name, and send `verificationType: "PRE_VERIFIED"` and
   `winners: [{ walletAddress, label }]`. Leave `maxCompletions` out: the API sets it to the
   number of wallets, and sending it is a 400. Field errors come back as, for example,
   `winners[1].walletAddress`. Switching back to manual sends `verificationType: "MANUAL"`.
   - Hide the "available completions" field and show the number of wallets instead.
   - When the creator switches to Public, also send `verificationType: "MANUAL"`; otherwise the
     API answers 400 on `isPrivate`.
   - Check the list before sending (the API checks it too): 1 to 100 valid addresses, no
     repeats, and not the creator's own wallet.
   - For a Direct campaign, start the funded completions at the number of wallets. Funding more
     than that leaves ETH in the campaign with no way to get it back yet.
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
   - Ask for confirmation before sending a wallet's chain call, showing the address, because it
     can't be undone.
   - Ending the campaign doesn't close it: winners can still claim after it ends, and the creator
     can still top up. Today the funding panel hides on `ENDED` (`CampaignFundingControls` in
     `src/components/campaigns/campaign-actions.tsx`), and so does the private link
     (`src/app/referrals/campaigns/[id]/page.tsx`). Keep both on an ended pre-verified campaign.
   - The owner's notice on that page says "Review participant submissions below"; change it for
     a pre-verified campaign.
4. **Private link page** (`/campaigns/private/:code`). When `verificationType` is `PRE_VERIFIED`,
   hide the proof form. For a signed-in user, call `GET /api/campaigns/:id/winners/me`. A 404
   means they aren't listed ("The creator picks the winners for this campaign"); otherwise show
   their `state`, with a Claim button that sends `chain` when it is `CLAIMABLE`. Winners hear
   about the campaign from the creator, who sends them this link as for any private campaign.
5. **Dashboard** (`/referrals`). Add a "Rewards to claim" card from
   `GET /api/campaigns/rewards/pre-verified/me`, with the same Claim button. A claimed Direct
   reward then shows in the existing Direct reward account, ready to withdraw.

### Buttons, page by page

New labels follow the existing "… in wallet" style for anything that opens MetaMask.

**Draft form** (`/referrals/campaigns/new`, and editing a draft):

| Button or choice | Where | Shown when | What it does |
|---|---|---|---|
| "How are winners picked?" (two options, like Visibility) | Right under Visibility | Private is selected | Picks `MANUAL` or `PRE_VERIFIED` |
| Wallet table (address, optional name) | Under that choice | "I pick the winners myself" is selected | Holds the list; replaces "Available completions" |
| Add wallet | Under the wallet table | Same | Adds an empty row (on the page only, nothing saved yet) |
| Remove | On each row | Same | Takes the row out (on the page only) |
| Save draft / Save changes (existing) | Bottom of the form | Always | Sends the draft with `verificationType` and `winners` |

**Creator's campaign page** (`/referrals/campaigns/:id`), "Manage campaign" section, all existing:

| Button | Change for a pre-verified campaign |
|---|---|
| Publish campaign in wallet | None |
| Private link and copy button | Also show it when the campaign is `ENDED` |
| Direct campaign funding: Preview funding, then Confirm funding in wallet | Also show it when the campaign is `ENDED` |
| Pause / End / Cancel | None |

**Creator's campaign page**, new "Winners" section, in place of "Submission review queue":

| Button | Where | Shown when | What it does |
|---|---|---|---|
| Add funds | In a banner at the top: "N winners are waiting for funds" | `funding.runsShort` is above 0 | Fills the funding panel's "Runs to add" with `runsShort` and scrolls to it |
| Confirm winner in wallet | On each wallet's row | The row's `state` is `READY_TO_PUT_ON_CHAIN` | Asks "Confirm 0x…? This can't be undone", then sends the row's `chain` call |
| Remove | On each wallet's row | The row's `status` is `LISTED`, the campaign is published and not cancelled, and it isn't the last wallet | `DELETE /api/campaigns/:id/winners/:winnerId` (in a draft, edit the list in the draft form instead) |
| Add wallet | Under the list | The campaign is `ACTIVE` and before its end date | Address and optional name, then `POST /api/campaigns/:id/winners` |

**Private link page** (`/campaigns/private/:code`). The proof form and "Take part" box go away:

| Button | Shown when | What it does |
|---|---|---|
| Log in to claim (the existing log-in button, new text) | Logged out | Same as today: log in, then come back to the link |
| Claim reward in wallet | Signed in and `state` is `CLAIMABLE` | Sends the `chain` call from `GET /api/campaigns/:id/winners/me` |
| None, text only | Signed in and not listed (404), or any other `state` | Shows the wording below |

**Dashboard** (`/referrals`), new "Rewards to claim" card. Hide the card when the list is empty:

| Button | Where | Shown when | What it does |
|---|---|---|---|
| Claim reward in wallet | On each campaign's row | `state` is `CLAIMABLE` | Same as on the link page |
| View Direct balance (a link) | Under a claimed Direct reward | `state` is `CLAIMED` | Goes to `/referrals/campaigns`, where the existing Withdraw full balance button is |

### Wording

Suggested wording for a listed wallet's `state`, on the creator's page:

| `state` | Text |
|---------|------|
| `NOT_PUBLISHED` | Publish the campaign first |
| `READY_TO_PUT_ON_CHAIN` | Confirm winner in wallet button |
| `WAITING_FOR_FUNDS` | Add funds: no funded run left |
| `WAITING_FOR_CLAIM` | Waiting for the winner to claim |
| `CLAIMED` | Claimed |
| `CLOSED` | Campaign cancelled |

And for the winner:

| `state` | Text |
|---------|------|
| `NOT_ON_CHAIN_YET` | You're on the list. The creator still has to confirm it. |
| `CLAIMABLE` | Claim reward in wallet button |
| `WAITING_FOR_FUNDS` | Waiting for the creator to add funds |
| `PAUSED` | The creator paused this campaign |
| `CLAIMED` | Claimed |

### Notes

- A winner must sign in with the exact wallet on the list. If they already have an account on
  another wallet, the reward won't show there.
- The wallet's name (`label`) is the creator's own note. The API never sends it to the winner.
- `spotsLeft` means nothing for a pre-verified campaign (it is just the number of wallets), so
  don't show it there.
- Statuses change when the listener sees each transaction, so keep the five-second polling used
  elsewhere after a receipt.
- The `@api` end-to-end test `e2e/tests/pre-verified-campaign-api.spec.ts` runs the whole flow on
  the real contract, and shows each call in order.
- To try it by hand: create the campaign with one Hardhat wallet in MetaMask and list a second
  wallet that has never signed in. Publish, confirm the winner, then switch MetaMask to the second
  wallet, sign in from the link and claim.

Not built yet: listing a winner by their account instead of their wallet (Sam wasn't sure it's
needed), and removing a wallet once it's on chain (needs a contract change).

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
