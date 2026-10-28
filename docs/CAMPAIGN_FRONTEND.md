# Campaign frontend

The campaign pages use the existing endpoints documented under **User Campaigns** in
[API.md](API.md#user-campaigns). There are no new backend endpoints or database changes.

These screens create public manual campaigns. Private campaign creation and shared-link
access from the newer private-campaign backend are outside this frontend's scope.

## Pages

- `/referrals/campaigns`: campaign board, search and category filters, campaigns created
  by the signed-in user, and their submissions.
- `/referrals/campaigns/new`: create a draft with task instructions, category, reward,
  referral pool, available completions, and a local end date and time.
- `/referrals/campaigns/:id`: task details, draft editing and publishing, campaign
  management, participant proof and progress, or the creator's review queue.

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
does not serve drafts. Pause/resume uses the existing status endpoint. End/cancel requires
an explicit confirmation in the UI and leaves existing submissions available for review.

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
feedback, pause/resume, creator participation restrictions, and mobile overflow. Browser screenshots are saved
in the normal Playwright output directory.
