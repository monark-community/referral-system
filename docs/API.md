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

The API includes a background blockchain listener service that watches the smart contract for two events:

### PointsAdded Event
When points are awarded on-chain, the listener:
1. Finds the user by wallet address
2. Updates their `earnedPoints` in the database
3. Reads and updates their `milestoneLevel` from the chain

### InviteChanged Event
When an invite status changes on-chain, the listener:
1. Converts the bytes32 invite ID to a UUID
2. Finds the matching Referral record
3. Updates its `status` in the database

The listener tracks its sync position in the `ChainSyncState` table to avoid reprocessing events after restarts.
