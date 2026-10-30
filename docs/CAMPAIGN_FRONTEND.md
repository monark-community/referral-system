# Campaign frontend

The campaign pages use the existing endpoints documented under **User Campaigns** in
[API.md](API.md#user-campaigns). There are no new backend endpoints or database changes.

These screens create public and private manual campaigns, and serve a private campaign's
shared link.

## Pages

- `/referrals/campaigns`: campaign board, search and category filters, campaigns created
  by the signed-in user, and their submissions.
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

Publishing, submitting, approving, and rejecting use the `chain` call returned by the
API and the existing contract ABI/address from the blockchain connector. The connected
wallet must match the signed-in account. Transactions use the existing local Hardhat
deployment (chain 31337), matching the rest of the application.

The UI waits for a successful transaction receipt and polls the existing campaign reads
every five seconds for the listener's updates. Transaction hashes are retained in local
storage, scoped to the chain, contract, user, operation, and campaign/submission, so retrying
after navigation or a confirmation timeout checks the existing transaction first. Reverted
and cancelled transactions may be retried. Wallet speed-ups update the stored hash.

Proof is saved before wallet confirmation. A declined wallet request leaves the saved
submission available to confirm later. Review decisions likewise remain available to
confirm or change until finalized on chain. A rejection reason is required, and finalized
rejections do not expose a resubmission form.

Drafts are loaded through `GET /campaigns/mine`; the public detail endpoint intentionally
does not serve drafts. Pause/resume uses the existing status endpoint. A published campaign
can be ended, and only a draft can be cancelled; both ask for confirmation, and ending leaves
existing submissions available for review.

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
npm run test:e2e -- --grep '@smoke|@campaigns'
```

The campaign browser journeys run against PostgreSQL, the API, the listener, and real
Hardhat wallet transactions. They cover draft visibility and editing, publishing,
community and social media proof, wallet rejection and retry, approval/reward, rejection
feedback, pause/resume, creator participation restrictions, private campaigns (the link,
the logged-out view, and logging in from the link), and mobile overflow. Browser screenshots are saved
in the normal Playwright output directory.
