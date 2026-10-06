# Phase 6 Browser Test Cases

These are the core browser journeys implemented for Phase 6. Each test starts from the
disposable E2E stack and uses deterministic Hardhat wallets. Blockchain-derived assertions
poll observable API or UI state; they do not use fixed sleeps.

## 1. New-user onboarding and email verification

**Test:** `new user completes onboarding and verifies email through the local mailbox`

- **Preconditions:** Empty PostgreSQL database, baseline Hardhat snapshot, synchronized
  listener, and empty E2E mailbox.
- **Steps:** Open onboarding, connect and sign with a deterministic wallet, submit
  `joinProgram`, accept terms, save the profile, retrieve the verification message from the
  guarded mailbox, follow its link, and open the dashboard.
- **Postconditions:** The wallet identity, accepted terms, profile, and verified email are
  persisted; the contract transaction succeeded; the authenticated dashboard is reachable.

## 2. Returning-user login

**Test:** `returning user signs in and skips completed onboarding`

- **Preconditions:** A named API user exists for a wallet and that wallet has already joined
  the contract.
- **Steps:** Open the login modal in a fresh browser session, connect the same wallet, and
  sign the login message.
- **Postconditions:** The existing identity is restored, the dashboard opens, and the terms
  and profile onboarding steps are not shown again.

## 3. Public referral

**Test:** `public referral is accepted through the UI and appears in UI, API, and contract state`

- **Preconditions:** Alice exists, has joined the contract, and has a public referral code;
  Bob uses a separate empty browser context and wallet.
- **Steps:** Bob opens Alice's public invite URL, completes wallet authentication, and submits
  `acceptInvite`; the test polls Alice's referral network and opens her history page.
- **Postconditions:** Bob's on-chain referrer is Alice, the API reports one direct referral
  and 100 points, and Alice's UI shows a level-one 100-point reward.

## 4. Private invite single use

**Test:** `private invite can be consumed once and reuse is rejected in the browser`

- **Preconditions:** A joined referrer creates one private invite in PostgreSQL and registers
  its bytes32 identifier on-chain.
- **Steps:** The intended referee follows the private URL and accepts it through onboarding;
  a different wallet then follows the same URL and attempts the same flow.
- **Postconditions:** The first wallet is permanently attributed to the referrer, while the
  second attempt receives the private-invite-used error and creates no partially provisioned
  account or replacement referral.

## 5. Multi-level referral rewards

**Test:** `multi-level referral displays direct and level-two rewards`

- **Preconditions:** Three distinct wallets are available and the first wallet has joined the
  program.
- **Steps:** The second wallet accepts the first wallet's referral, the third accepts the
  second wallet's referral, and the test polls the first user's two-level network before
  opening referral history.
- **Postconditions:** The first user has one direct and one level-two member, receives 100
  direct points plus 20 grandparent points, and the UI displays both reward levels.

## 6. Contract immutability and isolated reset

**Test:** `restores the database, contract, mailbox, and listener to a clean baseline`

- **Preconditions:** Empty baseline state with a captured post-deployment Hardhat snapshot.
- **Steps:** Join through the UI, prove the participating wallet cannot change attribution by
  accepting an invite, request the guarded reset, clear browser authentication, and join again.
- **Postconditions:** The same-chain attribution change is rejected; PostgreSQL, contract,
  mailbox, and listener state return to baseline; the same wallet can complete onboarding in
  the restored chain generation.

## 7. Wallet-boundary authentication recovery

**Test:** `disconnected and rejected-signature states are recoverable through the onboarding UI`

- **Preconditions:** Empty baseline state and a deterministic provider initially returning no
  authorized account.
- **Steps:** Confirm the disconnected UI, connect the wallet, simulate rejection of
  `personal_sign`, verify the error, clear the rejection, and retry. The standard wallet test
  also verifies Hardhat chain switching and the successful transaction receipt.
- **Postconditions:** Disconnection and signature rejection are visible and recoverable;
  retrying reaches the terms step without recreating the browser context.

