# Reffinity API Documentation

Base URL: `http://localhost:3001/api`

## Overview

The Reffinity API is a RESTful service built with Express.js that powers the Reffinity referral platform. It handles wallet-based authentication, user profiles, referral tracking, email verification, and milestone/points management.

### Architecture

```
Frontend (Next.js)  <-->  API (Express.js)  <-->  PostgreSQL (via Prisma)
                                  |
                          Blockchain Listener  <-->  Ethereum Smart Contract
```

### Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are issued on wallet authentication and expire after 7 days. To authenticate, users sign a message with their Ethereum wallet (e.g., MetaMask) and the API verifies the signature using EIP-191.

### Common Error Responses

All error responses follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Bad request — invalid input or validation error |
| 401 | Unauthorized — missing or invalid JWT token |
| 404 | Not found — resource does not exist |
| 500 | Internal server error |

### User Object

Most endpoints return a `user` object with this shape:

```json
{
  "id": "uuid",
  "walletAddress": "0x...",
  "name": "string | null",
  "email": "string | null",
  "phone": "string | null",
  "emailVerified": false,
  "referralCode": "ABC1234XYZ",
  "earnedPoints": 0,
  "pendingPoints": 0,
  "milestoneLevel": 0,
  "disabledAt": "timestamp | null",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

---

## Health Check

### `GET /health`

Check if the API server is running.

**Auth required:** No

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## Authentication

### `POST /api/auth/wallet`

Authenticate with an Ethereum wallet signature. Creates a new user if the wallet address has not been seen before.

**Auth required:** No

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `walletAddress` | string | Yes | Ethereum address (0x + 40 hex characters) |
| `signature` | string | Yes | EIP-191 signature of the message |
| `message` | string | Yes | The message that was signed |
| `referralCode` | string | No | Referral code from another user (case-insensitive) |

**Example request:**

```json
{
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "signature": "0x...",
  "message": "Sign in to Reffinity",
  "referralCode": "ABC1234XYZ"
}
```

**Response (200):**

```json
{
  "user": { ... },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "isNewUser": true,
  "bytesInviteId": "0x00000000000000000000000000000000...",
  "referrerWalletAddress": "0x..."
}
```

| Field | Description |
|-------|-------------|
| `user` | The user object (see shape above) |
| `token` | JWT token for subsequent authenticated requests |
| `isNewUser` | `true` if this wallet address was just registered |
| `bytesInviteId` | The referral record ID as a bytes32 hex string (for smart contract use). Empty string if no referral. |
| `referrerWalletAddress` | The referrer's wallet address. Only present if a valid referral code was used. |

**Error responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 401 | `"Invalid signature"` | Wallet signature verification failed |
| 500 | `"Authentication failed"` | Server error |

---

### `GET /api/auth/me`

Get the currently authenticated user's data.

**Auth required:** Yes

**Response (200):**

```json
{
  "user": { ... }
}
```

**Error responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 401 | `"Not authenticated"` | Missing or invalid token |
| 404 | `"User not found"` | User was deleted |

---

### `POST /api/auth/logout`

Log out the current user. With JWT-based auth, this is primarily a client-side operation (remove the stored token). This endpoint exists for future session invalidation features.

**Auth required:** Yes

**Response (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## User Profile

### `GET /api/users/profile`

Get the current user's profile.

**Auth required:** Yes

**Response (200):**

```json
{
  "user": { ... }
}
```

---

### `PUT /api/users/profile`

Update the current user's profile. If the email address changes, email verification is reset.

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name (1-100 characters) |
| `email` | string | Yes | Valid email address |
| `phone` | string | No | Phone number |

**Example request:**

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "phone": "+1234567890"
}
```

**Response (200):**

```json
{
  "user": { ... },
  "emailChanged": true
}
```

| Field | Description |
|-------|-------------|
| `emailChanged` | `true` if the email was changed (verification status is reset) |

**Error responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 400 | `"Email already in use"` | Another user has this email |
| 400 | Validation errors | Invalid name, email, or phone format |

---

## Email Verification

### `POST /api/users/verify-email/send`

Send a verification email to the current user's email address.

**Auth required:** Yes

**Preconditions:**
- User must have an email set (via profile update)
- Email must not already be verified

**Response (200):**

```json
{
  "success": true,
  "message": "Verification email sent"
}
```

**Error responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 400 | `"Email not set. Please update your profile first."` | No email on profile |
| 400 | `"Email already verified"` | Email is already verified |

> **Note:** In development mode, the verification URL is logged to the server console instead of being emailed.

---

### `GET /api/users/verify-email/:token`

Verify an email address using the token from the verification email. This endpoint is accessed by clicking the link in the email.

**Auth required:** No

**URL parameters:**

| Parameter | Description |
|-----------|-------------|
| `token` | The verification token from the email link |

**Behavior:** This endpoint does not return JSON. It redirects the browser:

| Outcome | Redirect URL |
|---------|-------------|
| Success | `{FRONTEND_URL}/referrals/email-verified?success=true` |
| Invalid/expired token | `{FRONTEND_URL}/referrals/email-verified?error=invalid` |
| Server error | `{FRONTEND_URL}/referrals/email-verified?error=server` |

---

## Referrals

### `GET /api/users/referral/:code`

Validate a referral code and get the referrer's wallet address. Used during sign-up to verify a referral link is valid.

**Auth required:** No

**URL parameters:**

| Parameter | Description |
|-----------|-------------|
| `code` | The referral code to validate (case-insensitive) |

**Response (200):**

```json
{
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

**Error responses:**

| Status | Error | Cause |
|--------|-------|-------|
| 404 | `"Invalid referral code"` | No user has this referral code |

---

### `GET /api/users/referrals`

Get all referrals (invites) sent by the current user.

**Auth required:** Yes

**Response (200):**

```json
{
  "invites": [
    {
      "id": "uuid",
      "referrer": {
        "id": "uuid",
        "walletAddress": "0x...",
        "name": "Alice",
        "email": "alice@example.com",
        ...
      },
      "referee": {
        "id": "uuid",
        "walletAddress": "0x...",
        "name": "Bob",
        "email": "bob@example.com",
        ...
      },
      "status": 0,
      "points": 0,
      "isVerified": true,
      "description": "desc",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

**Referral status values:**

| Value | Meaning |
|-------|---------|
| 0 | Pending — referee signed up but not yet confirmed on-chain |
| 1 | Accepted — confirmed on-chain |
| 2 | Closed |

`points` is what the invite earns its referrer: their share of the referral pool (80 when they have a referrer, 100 when they don't). A grandparent's 20-point share is never put on an invite; see `GET /api/users/referral-rewards`.

---

### `GET /api/users/referral-rewards`

Get every referral payout the current user received, newest first. Includes direct referrals (level 1) and people their referrals referred (level 2).

**Auth required:** Yes

**Response (200):**

```json
{
  "rewardHistory": [
    {
      "id": "uuid",
      "transactionHash": "0x...",
      "blockNumber": "22",
      "logIndex": 3,
      "participant": {
        "walletAddress": "0x...",
        "name": "Carol"
      },
      "referralLevel": 2,
      "points": 20,
      "pointPool": 100,
      "unallocatedPoints": 0,
      "source": "signup",
      "observedAt": "2026-09-29T12:00:00.000Z"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `participant` | The person who joined; `name` is `null` if they have no account in the database |
| `referralLevel` | `1` if the user referred them directly, `2` if the user is their grandparent |
| `points` | What the user received from this payout |
| `pointPool` | The whole pool that was split between parent and grandparent |
| `source` | What paid the pool: `"signup"` (someone joined through an invite) or `"campaign"` |

---

### `GET /api/users/referral-network`

Get who referred the current user, and the people they referred two levels down with the points each one earned them. Only sign-ups confirmed on-chain are included.

**Auth required:** Yes

**Response (200):**

```json
{
  "ancestors": {
    "parent": { "walletAddress": "0x...", "name": "Bob" },
    "grandparent": { "walletAddress": "0x...", "name": "Carol" }
  },
  "referrals": [
    {
      "walletAddress": "0x...",
      "name": "Alice",
      "level": 1,
      "joinedAt": "2026-09-20T12:00:00.000Z",
      "pointsEarned": 80,
      "referrals": [
        {
          "walletAddress": "0x...",
          "name": "Dave",
          "level": 2,
          "joinedAt": "2026-09-21T12:00:00.000Z",
          "pointsEarned": 20
        }
      ]
    }
  ],
  "totals": {
    "level1Count": 1,
    "level2Count": 1,
    "level1Points": 80,
    "level2Points": 20
  }
}
```

| Field | Description |
|-------|-------------|
| `ancestors.parent` | Who referred the user, or `null` if they joined without an invite |
| `ancestors.grandparent` | Who referred the parent, or `null` |
| `referrals` | People the user referred (level 1), each with the people they referred (level 2) |
| `pointsEarned` | Points that person earned the user: the direct share for level 1, the grandparent share for level 2 |

---

### `POST /api/users/referrals/private`

Create a private invite for single use only attached to a specific user

**Auth required:** Yes

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | No | A description of the Invite |

**Example request:**

```json
{
  "description": "Desc",
}
```

**Response (200):**

```json
{
  "bytesinviteId": "0x...",
  "referralCode": "ABCDEFGHIJ",
  "inviteCode": "01234567",
  "referrerWallet": "0xAsad...",
}
```


---


## Terms of Service

### `POST /api/users/accept-terms`

Record that the current user has accepted the Terms of Service.

**Auth required:** Yes

**Request body:** None

**Response (200):**

```json
{
  "user": { ... }
}
```

---

## Account Management

### `POST /api/users/disable`

Disable the current user's account. Disabled accounts can still read data but are blocked from most write operations.

**Auth required:** Yes

**Request body:** None

**Response (200):**

```json
{
  "success": true,
  "disabledAt": "2025-01-01T00:00:00.000Z"
}
```

---

### `POST /api/users/enable`

Re-enable a previously disabled account.

**Auth required:** Yes

**Request body:** None

**Response (200):**

```json
{
  "success": true
}
```

---

## Milestones

### `GET /api/milestones/tiers`

Get all milestone tier definitions. This is a public endpoint.

**Auth required:** No

**Response (200):**

```json
{
  "tiers": [
    {
      "level": 0,
      "name": "Bronze",
      "pointsRequired": 0,
      "benefits": ["Basic referral tracking"]
    },
    {
      "level": 1,
      "name": "Silver",
      "pointsRequired": 100,
      "benefits": ["Priority support", "Bonus points"]
    }
  ]
}
```

Tiers are sorted by `level` ascending.

---

## Campaigns

Campaign definition reads are public. They expose the system-managed Referral campaign and the
user campaigns described under [User campaigns](#user-campaigns). Fulfillment state for the
Referral campaign is an additive, authenticated view of the existing referral flow; the contract
and existing referral APIs remain responsible for execution and points.

### `GET /api/campaigns`

Return active campaign summaries: the built-in Referral campaign, then the user campaigns taking
submissions (see [the board summary](#user-campaign-summary)).

**Auth required:** No

**Response (200):**

```json
{
  "campaigns": [
    {
      "id": "00000000-0000-4000-8000-000000000001",
      "key": "builtin-referral",
      "title": "Referral",
      "description": "Invite a new participant and establish the referral relationship used by campaign rewards.",
      "status": "ACTIVE",
      "isSystem": true,
      "schemaVersion": 1
    }
  ]
}
```

### `GET /api/campaigns/:idOrKey`

Return campaign detail by stable UUID or key. The response includes the task and its automatic
verification and points-reward policies.

**Auth required:** No

**Response (200):**

```json
{
  "campaign": {
    "id": "00000000-0000-4000-8000-000000000001",
    "key": "builtin-referral",
    "title": "Referral",
    "description": "Invite a new participant and establish the referral relationship used by campaign rewards.",
    "status": "ACTIVE",
    "isSystem": true,
    "schemaVersion": 1,
    "task": {
      "id": "00000000-0000-4000-8000-000000000002",
      "type": "REFERRAL",
      "strategyKey": "REFERRAL_V1",
      "schemaVersion": 1,
      "configuration": {},
      "verificationPolicy": {
        "id": "00000000-0000-4000-8000-000000000003",
        "type": "AUTOMATIC_CHAIN",
        "strategyKey": "REFERRAL_ACCEPTED_V1",
        "schemaVersion": 1,
        "configuration": {}
      },
      "rewardPolicy": {
        "id": "00000000-0000-4000-8000-000000000004",
        "type": "POINTS",
        "strategyKey": "REFERRAL_POINTS_V1",
        "schemaVersion": 1,
        "configuration": {
          "completerAction": "ACCEPTED_INVITE",
          "referralPoolAction": "REFERRED_NEW_USER",
          "referralAllocation": "CONTRACT_CONFIGURED_SPLIT"
        }
      }
    }
  }
}
```

| Status | Error | Cause |
|--------|-------|-------|
| 404 | `"Campaign not found"` | The identifier or key is unknown |
| 503 | `"Campaign configuration unavailable"` | Installed campaign configuration failed its invariant checks |

### `GET /api/campaigns/:idOrKey/fulfillments/me`

Return the authenticated user's current fulfillment for the built-in Referral campaign. A user
who has not completed it receives `{ "fulfillment": null }`. A `VERIFIED` row gets one safe
read-through refresh attempt before the durable status is returned.

**Auth required:** Yes

**Response (200):**

```json
{
  "fulfillment": {
    "id": "00000000-0000-4000-8000-000000000010",
    "campaignId": "00000000-0000-4000-8000-000000000001",
    "taskId": "00000000-0000-4000-8000-000000000002",
    "referralId": "00000000-0000-4000-8000-000000000020",
    "attempt": 1,
    "status": "REWARDED",
    "chainId": 31337,
    "verification": {
      "transactionHash": "0x...",
      "blockNumber": "42",
      "logIndex": 4,
      "observedAt": "2026-10-13T12:00:00.000Z"
    },
    "reward": {
      "transactionHash": "0x...",
      "blockNumber": "42",
      "logIndex": 5,
      "observedAt": "2026-10-13T12:00:00.000Z"
    }
  }
}
```

This endpoint never awards points or creates referral records. If receipt evidence remains
incomplete or temporarily unavailable, it returns the current durable status.

For a user campaign, it returns the user's [submission](#user-campaign-submission) instead, or
`{ "fulfillment": null }`.

---

## User Campaigns

Any signed-in user can create a campaign with one manually checked task, such as following an
account or joining a Discord. Rewards may be `POINTS` or `DIRECT` native-chain currency. For
Direct rewards, the completer and eligible referrers accrue withdrawable balances on chain; no
external native-currency transfer occurs during verification. The creator
approves or rejects each submission. A creator can't complete their own campaign or earn
referral points from it, and each user can submit to a campaign once.

**Who does what.** Every step that changes the chain is sent by the user's own wallet, since the
contract records the sender as the creator or participant:

1. The API saves the step and returns a `chain` object: the `ReferralProgram` function and the
   arguments to send, plus `chainId`, `contractAddress`, and payable `valueWei` when needed.
   Direct amounts are base-10 wei strings and must be converted to bigint only at the signing boundary.
2. The web app sends that transaction with the user's wallet.
3. The blockchain listener sees the event and updates the database. Re-sending a `chain` call
   that already went through fails on chain and changes nothing.

Proof, instructions and limits stay in the database; only IDs, statuses and payouts go on chain.
The contract caps what one completion can pay (the completer's reward plus the pool) at an
admin-set maximum, `maxCampaignPointsPerCompletion` (1000 in the local deployment).

**Campaign states.** `DRAFT` (only state that can be edited) → `ACTIVE` once the chain has it.
The creator can then move it between `ACTIVE` and `PAUSED`, or to `ENDED` or `CANCELLED`, which
are final; a draft can be cancelled too. Only an `ACTIVE` campaign before its `endsAt`, with a
spot left, takes submissions. Pausing, ending and cancelling happen in the API only; the contract
has no such states.

**Submission states.** `SUBMITTED` (proof saved) → `UNDER_REVIEW` (on chain) → `APPROVED` or
`REJECTED` (the creator's decision) → `REWARDED` (paid on chain). Every submission except a
rejected one holds a spot. Until the chain has the creator's decision, they can change it or
send it again; the chain's decision is final and wins over the API's.

**Errors** add a `code`, and a `field` for invalid input:

```json
{ "error": "maxCompletions: must be a whole number of at least 1", "code": "INVALID_INPUT", "field": "maxCompletions" }
```

| Status | `code` | Cause |
|--------|--------|-------|
| 400 | `INVALID_INPUT`, `INVALID_RUN_COUNT`, `INVALID_DESTINATION` | A field, run count, or destination is invalid |
| 400 | `REWARD_ABOVE_MAXIMUM` | The reward plus the pool is above the contract's maximum |
| 403 | `NOT_CAMPAIGN_OWNER` | Only the campaign's creator can do this |
| 403 | `OWN_CAMPAIGN` | Creators can't complete their own campaigns |
| 404 | `CAMPAIGN_NOT_FOUND`, `SUBMISSION_NOT_FOUND` | Unknown campaign, or a submission not in it |
| 409 | `NOT_EDITABLE` | Only a draft can be edited |
| 409 | `INVALID_STATUS_CHANGE` | That state change isn't allowed from the current state |
| 409 | `NOT_ACCEPTING_SUBMISSIONS` | Not active, or past its end date |
| 409 | `CAMPAIGN_FULL` | No spots left |
| 409 | `ALREADY_SUBMITTED` | The user has already submitted, even if rejected |
| 409 | `NOT_REVIEWABLE` | Not on chain yet, or already decided on chain |
| 409 | `WRONG_REWARD_TYPE`, `INSUFFICIENT_FUNDING`, `NO_DIRECT_REWARDS` | The requested Direct operation conflicts with chain state |
| 503 | `CHAIN_UNAVAILABLE` | Required chain state could not be read |

<a id="user-campaign-summary"></a>
**A campaign** on the board (`GET /api/campaigns`). Detail (`GET /api/campaigns/:idOrKey`) adds
`instructions`; a draft is only visible to its creator, under `/mine`:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "key": "11111111-1111-4111-8111-111111111111",
  "title": "Follow Dave's company",
  "description": "",
  "status": "ACTIVE",
  "isSystem": false,
  "schemaVersion": 1,
  "owner": { "name": "Dave", "walletAddress": "0x..." },
  "taskType": "BOUNTY",
  "category": "SOCIAL_MEDIA",
  "verificationType": "MANUAL",
  "reward": { "type": "POINTS", "completerPoints": 30, "referralPoolPoints": 10 },
  "maxCompletions": 50,
  "spotsLeft": 48,
  "endsAt": "2026-11-01T00:00:00.000Z",
  "publishedAt": "2026-10-17T12:00:00.000Z",
  "createdAt": "2026-10-17T11:00:00.000Z"
}
```

`category` is `SOCIAL_MEDIA` (proof is a link to the post or profile) or `COMMUNITY` (proof is
a username or short text).

<a id="user-campaign-submission"></a>
**A submission**, as its participant sees it. `submission`, `decision` and `reward` are the chain
events that confirmed each step, or `null`; block numbers are strings:

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "campaignId": "11111111-1111-4111-8111-111111111111",
  "status": "REWARDED",
  "proof": "https://x.com/alice/status/1",
  "rejectionReason": null,
  "completerReward": 30,
  "createdAt": "2026-10-17T12:00:00.000Z",
  "submittedAt": "2026-10-17T12:00:05.000Z",
  "reviewedAt": "2026-10-17T13:00:00.000Z",
  "verifiedAt": "2026-10-17T13:00:05.000Z",
  "rejectedAt": null,
  "rewardedAt": "2026-10-17T13:00:05.000Z",
  "chainId": 31337,
  "submission": { "transactionHash": "0x...", "blockNumber": "41", "logIndex": 0 },
  "decision": { "transactionHash": "0x...", "blockNumber": "42", "logIndex": 0 },
  "reward": { "transactionHash": "0x...", "blockNumber": "42", "logIndex": 4 },
  "chain": null
}
```

### `POST /api/campaigns`

Save a new campaign as a `DRAFT`. **Auth required:** Yes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Up to 120 characters |
| `instructions` | string | Yes | What to do, up to 2000 characters |
| `description` | string | No | Up to 500 characters |
| `category` | string | Yes | `SOCIAL_MEDIA` or `COMMUNITY` |
| `completerPoints` | integer | Yes | Paid to whoever completes it; 0 or more |
| `referralPoolPoints` | integer | Yes | Split 80/20 between the completer's referrer and grandparent; 0 or more |
| `maxCompletions` | integer | Yes | 1 or more |
| `endsAt` | ISO date | Yes | In the future |

The campaign must pay at least one point. **Response (201):** `{ "campaign": ... }`, the campaign
detail with the call that publishes it:

```json
"chain": {
  "functionName": "createCampaign",
  "args": ["0x1111111111114111811111111111111100000000000000000000000000000000", 1, 1, 0, 30, 10]
}
```

The arguments are the campaign id as bytes32, `TaskType.Bounty`, `VerificationType.Manual`,
`RewardType.Points`, the completer's reward and the pool. When the chain has it, the campaign is
`ACTIVE` and `chain` is `null`; the chain's reward is the one paid, even if the draft changed after sending.

For a Direct campaign send `rewardType: "DIRECT"`, `completerRewardWei`, `referralPoolWei`, and
`initialFundingRuns`. The API returns `RewardType.Direct` in `args` and
`valueWei = (completerRewardWei + referralPoolWei) * initialFundingRuns`. Wei values remain
decimal strings in JSON. The creator's wallet submits the descriptor with `value = BigInt(valueWei)`.

### `POST /api/campaigns/:id/funding`

Prepare an owner-only Direct top-up. Body: `{ "runs": 10 }`. The response reports current and
projected chain balances/runs and a payable `fundCampaign` descriptor. Any positive whole run
count is accepted independently of `maxCompletions`; preparing the call does not fund the campaign.
The contract does not emit a funding event, so detail/owner/submission/approval reads and bounded
startup reconciliation refresh the authoritative balance and status with `getCampaign`.

### `GET /api/campaigns/rewards/direct/me`

Return the authenticated wallet's authoritative `balanceWei` from the chain plus up to 100
listener-confirmed accrual/withdrawal history entries. **Auth required:** Yes.

### `POST /api/campaigns/rewards/direct/withdraw`

Prepare `withdrawDirectRewards(destination)` for the caller's complete accumulated balance.
Body is optional; `{ "destination": "0x..." }` redirects payment to another non-zero EVM address,
otherwise it defaults to the authenticated wallet. A prepared response never marks withdrawal
complete; only the confirmed chain event does. A destination that rejects native currency causes
the chain transaction to revert and leaves the accrued balance available for another destination.

### `PATCH /api/campaigns/:id`

Edit a draft. Send any of the fields above; the rest keep their value. **Auth required:** Yes
(creator). **Response (200):** `{ "campaign": ... }` with the updated `createCampaign` call.

### `POST /api/campaigns/:id/status`

Body: `{ "status": "PAUSED" }`, or `ACTIVE`, `ENDED` or `CANCELLED`. **Auth required:** Yes
(creator). **Response (200):** `{ "campaign": ... }`

### `GET /api/campaigns/mine`

Campaigns the user created, in every state and with their submission counts, and the
campaigns they submitted to. **Auth required:** Yes

```json
{
  "created": [
    {
      "...": "the campaign, with chain while it is a draft",
      "submissions": { "SUBMITTED": 0, "UNDER_REVIEW": 2, "APPROVED": 0, "REJECTED": 1, "REWARDED": 5 }
    }
  ],
  "joined": [{ "campaign": { "...": "board summary" }, "fulfillment": { "...": "submission" } }]
}
```

### `POST /api/campaigns/:id/fulfillments`

Submit proof. Body: `{ "proof": "https://x.com/alice/status/1" }`, up to 500 characters.
**Auth required:** Yes. **Response (201):** `{ "fulfillment": ... }`, `SUBMITTED`, with the call
that puts it on chain: `{ "functionName": "submitCampaignFulfillment", "args": [campaignId, fulfillmentId] }`
(both bytes32). The participant's `fulfillments/me` keeps returning this call until the chain has it.

### `GET /api/campaigns/:id/fulfillments`

The creator's review queue, oldest first; filter with `?status=UNDER_REVIEW`. **Auth required:**
Yes (creator). Each submission adds `participant: { id, name, walletAddress }`, and `chain` holds
the decision call while an `APPROVED` or `REJECTED` decision is not on chain yet.

### `POST /api/campaigns/:id/fulfillments/:fulfillmentId/approve`

Approve a submission that is `UNDER_REVIEW`. **Auth required:** Yes (creator). **Response (200):**
`{ "fulfillment": ... }` with `{ "functionName": "verifyCampaignFulfillment", "args": [fulfillmentId] }`.
Once mined, the contract pays the completer and the referral pool, and the submission becomes
`REWARDED`. The payout appears in `GET /api/users/referral-rewards` with `"source": "campaign"`.

### `POST /api/campaigns/:id/fulfillments/:fulfillmentId/reject`

Body: `{ "reason": "The link is to someone else's profile" }`, up to 500 characters.
**Auth required:** Yes (creator). **Response (200):** `{ "fulfillment": ... }` with
`{ "functionName": "rejectCampaignFulfillment", "args": [fulfillmentId] }`. Nothing is paid, and
the participant can't submit again; the spot is freed for someone else.

---

## User Milestone Progress

### `GET /api/milestones/user`

Get the current user's milestone progress, including their current tier and the next tier to reach.

**Auth required:** Yes

**Response (200):**

```json
{
  "milestoneLevel": 0,
  "earnedPoints": 45,
  "currentTier": {
    "level": 0,
    "name": "Bronze",
    "pointsRequired": 0,
    "benefits": ["Basic referral tracking"]
  },
  "nextTier": {
    "level": 1,
    "name": "Silver",
    "pointsRequired": 100,
    "benefits": ["Priority support", "Bonus points"]
  }
}
```

| Field | Description |
|-------|-------------|
| `milestoneLevel` | Current milestone level (0-indexed) |
| `earnedPoints` | Total points earned |
| `currentTier` | The user's current tier definition, or `null` if no matching tier |
| `nextTier` | The next tier the user can reach, or `null` if at max tier |

---

## Database Schema

### User

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `walletAddress` | String | Unique, lowercase Ethereum address |
| `name` | String? | Display name |
| `email` | String? | Unique email address |
| `phone` | String? | Phone number |
| `emailVerified` | Boolean | Whether email has been verified |
| `referralCode` | String | Unique 10-character referral code |
| `referredBy` | UUID? | ID of the user who referred this user |
| `termsAcceptedAt` | DateTime? | When the user accepted ToS |
| `earnedPoints` | Int | Points earned (synced from blockchain) |
| `pendingPoints` | Int | Points pending confirmation |
| `milestoneLevel` | Int | Current milestone tier level |
| `disabledAt` | DateTime? | When the account was disabled (`null` = active) |
| `createdAt` | DateTime | Account creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

### Referral

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `referrerId` | UUID | The user who shared the referral link |
| `refereeId` | UUID | The user who signed up via the link (unique) |
| `status` | Int | 0 = pending, 1 = accepted, 2 = closed |
| `points` | Int | Points associated with this referral |
| `createdAt` | DateTime | When the referral was created |
| `updatedAt` | DateTime | Last update timestamp |

### ReferralPointAllocation

One row per `ReferralPointsAllocated` event (a sign-up) or `CampaignRewardPaid` event (a user campaign completion), unique by `transactionHash` + `logIndex`, so a payout is stored once however many times the event is read.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `transactionHash`, `logIndex`, `blockNumber` | String, Int, BigInt | Where the event is on chain |
| `participantWalletAddress` | String | The person who joined |
| `pool` | Int | The whole referral pool |
| `directRecipientWalletAddress`, `directAmount` | String, Int | The parent and their share |
| `grandparentRecipientWalletAddress`, `grandparentAmount` | String, Int | The grandparent and their share (zero address and 0 if none) |
| `unallocatedAmount` | Int | Points nobody received |
| `source` | String | `"signup"` or `"campaign"`; defaults to `"signup"` |
| `observedAt` | DateTime | When the API stored the event |

### MilestoneTier

| Column | Type | Description |
|--------|------|-------------|
| `level` | Int | Primary key, 0-indexed tier level |
| `name` | String | Tier name (e.g., "Bronze", "Silver") |
| `pointsRequired` | Int | Points needed to reach this tier |
| `benefits` | String[] | List of benefit descriptions |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL (for CORS and redirects) |
| `JWT_SECRET` | `default-secret-change-me` | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiration |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `NODE_ENV` | — | `development` or `production` |
| `CHAIN_TYPE` | — | `localhost` or `sepolia` |

---

## Blockchain Integration

The API includes a background blockchain listener service that watches the smart contract for these events:

### PointsAdded Event
When points are awarded on-chain, the listener:
1. Finds the user by wallet address
2. Updates their `earnedPoints` (or `pendingPoints`) in the database
3. Reads and updates their `milestoneLevel` from the chain

It never changes an invite's `points`: a balance can go up from a direct referral or from a grandparent's share, so it can't tell which invite the points belong to.

### InviteChanged Event
When an invite status changes on-chain, the listener:
1. Converts the bytes32 invite ID to a UUID
2. Finds the matching Referral record
3. Updates its `status` in the database
4. For a new pending invite, sets its `points` to the referrer's share of the pool (read from the contract)

### ReferralPointsAllocated Event
When someone joins through an invite and the pool is split, the listener:
1. Stores the payout in `ReferralPointAllocation`
2. Sets the `points` of the invite between the parent and the new user to the parent's share

### User Campaign Events
For the [user campaign](#user-campaigns) events, the listener updates the campaign or submission
the event names, and skips an event for one the API didn't save or from the wrong wallet:

| Event | Effect |
|-------|--------|
| `CampaignCreated` | The draft becomes `ACTIVE`, with the reward the chain stores |
| `CampaignFulfillmentSubmitted` | The submission becomes `UNDER_REVIEW` |
| `CampaignFulfillmentVerified` | The creator's approval is final (`APPROVED`) |
| `CampaignFulfillmentRejected` | The creator's rejection is final (`REJECTED`) |
| `CampaignRewardPaid` | The submission becomes `REWARDED`, and the pool's split is stored in `ReferralPointAllocation` with `source: "campaign"`; invite points are never touched |

Each is safe to apply twice. The new balances themselves arrive as `PointsAdded` events, like any other.

The listener tracks its sync position in the `ChainSyncState` table to avoid reprocessing events after restarts.
User campaign events have their own position there; if one fails while catching up, the position
stops before it, so the next start tries it again.
