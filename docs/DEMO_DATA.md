# Demo data initializer

`npm run demo:seed` fills a fresh local stack with 15 users in a referral tree and 7 campaigns, so the dashboards, the referral tree and the campaign board have something to show.

Nothing is faked. Every user joins the program through the real contract (through their referrer's link, like the website's sign-up), and every campaign is published, submitted to and approved with real transactions. The API's blockchain listener then copies the results into the database. Every point total, referral share, milestone level and reward history entry is what the contracts paid.

## Run it

Start a fresh local stack, then run the seed from the repository root:

```powershell
docker compose --profile local-chain up -d --build --wait
npm run demo:seed
```

- It takes about a minute and prints a table of users and campaigns at the end.
- The API must be running, since it records what happens on chain. The script checks this first.
- It reads `DATABASE_URL` from `services/api/.env`. If that file is missing, set `$env:DATABASE_URL = "postgresql://reffinity:reffinity_dev@localhost:5432/reffinity"` first. It refuses a non-local database and any chain other than local Hardhat.
- On a new clone, run `npm install`, `npm run build:packages` and `npm run db:generate` once first.

**Running it again is safe.** It skips whatever is already done and finishes anything left, so if it stops halfway, run it again.

**Start from a fresh stack.** Hardhat keeps its chain in memory, so restarting the `hardhat` container wipes the chain but keeps the database. The seed notices that and stops without sending anything. Reset both with `docker compose --profile local-chain down -v` and start again. It also stops if one of its wallets already belongs to another account.

## Logging in as a demo user

1. In MetaMask, import the Hardhat mnemonic `test test test test test test test test test test test junk`.
2. Add the network `http://localhost:8545` (chain ID `31337`).
3. Add accounts until you reach the number you need. MetaMask's first account is Hardhat #0.

Every demo user has a verified email and has accepted the terms, so **Login** goes straight to the dashboard with no email step. No emails are sent. Email verification is unchanged for everyone else.

If MetaMask was used with an older local chain, clear its history first, or transactions fail with "nonce too high": Settings → Developer tools → Delete activity and nonce data (Settings → Advanced → Clear activity tab data in older MetaMask versions). Do it on the localhost network, for each account that was used before. Newly imported accounts don't need it.

Don't use Hardhat account #0 (`0xf39F…2266`). It deployed the contract and isn't a demo user.

## Who's who

Points are the totals right after seeding. Bronze starts at 500 points and Silver at 1,500.

| Account | Name | Referral code | Referred by | Points |
|---|---|---|---|---|
| #1 | CampaignOwnerSteve | STEVEDEMO1 | | 0 |
| #2 | ReferrerBob | BOBREFERS1 | | 1,020 |
| #3 | ReferredAlice | ALICEDEMO1 | Bob | 910 |
| #4 | ReferredCarol | CAROLDEMO1 | Bob | 510 |
| #5 | SecondLevelDave | DAVEDEMO01 | Alice | 800 |
| #6 | SecondLevelErin | ERINDEMO01 | Carol | 350 |
| #7 | PrizeWinnerWendy | WENDYDEMO1 | | 575 |
| #8 | ReferredIvan | IVANDEMO01 | Bob | 460 |
| #9 | SecondLevelFrank | FRANKDEMO1 | Alice | 200 |
| #10 | SecondLevelHana | HANADEMO01 | Carol | 200 |
| #11 | SecondLevelJade | JADEDEMO01 | Ivan | 200 |
| #12 | ThirdLevelGrace | GRACEDEMO1 | Dave | 150 |
| #13 | ThirdLevelKai | KAIDEMO001 | Dave | 500 |
| #14 | ReferredLeo | LEODEMO001 | Wendy | 600 |
| #15 | CampaignOwnerOlivia | OLIVIADEMO | | 0 |

Accounts **#16 to #19 are left unused** for signing up someone new during the demo.

```
ReferrerBob
├── ReferredAlice
│   ├── SecondLevelDave
│   │   ├── ThirdLevelGrace
│   │   └── ThirdLevelKai
│   └── SecondLevelFrank
├── ReferredCarol
│   ├── SecondLevelErin
│   └── SecondLevelHana
└── ReferredIvan
    └── SecondLevelJade

PrizeWinnerWendy
└── ReferredLeo

CampaignOwnerSteve and CampaignOwnerOlivia referred no one.
```

The two campaign owners stay out of the tree on purpose, because a creator never gets the referral share from their own campaign.

## Campaigns

| Campaign | Owner | State | Submissions |
|---|---|---|---|
| Follow Us on X | Steve | Published, public | 4 paid (Alice, Carol, Dave, Grace), 1 waiting for review (Erin) |
| Join Our Discord Community | Steve | Published, public | 5 paid (Bob, Frank, Hana, Jade, Kai) |
| Share Our Launch Post | Steve | **Draft** | none |
| Community Welcome Mission | Steve | Published, private | 2 paid (Wendy, Leo) |
| Pre-Selected Prize Winners | Steve | **Draft**, pre-verified, private | Winners listed: Wendy, Alice |
| Post a Photo with Our Product | Olivia | Published, public | 3 paid (Ivan, Dave, Leo) |
| Beta Test Our App and Share Feedback | Olivia | Published, public | 3 paid (Alice, Kai, Erin) |

The board shows the four public published campaigns, plus the built-in referral campaign.

## Ready-made demo moments

| To show | Do this | What changes |
|---|---|---|
| A new sign-up through a referral link | Open `http://localhost:3000/invite/BOBREFERS1` with account #16 and choose **Join the Program** | Bob +100, the new person +50 |
| The two-level split on sign-up | Same, with `/invite/ALICEDEMO1` | Alice +80, Bob +20, the new person +50 |
| Publishing a campaign | As Steve, open the draft **Share Our Launch Post** and publish it | It appears on the board |
| Approving a submission | As Steve, approve Erin's submission on **Follow Us on X** | Erin +100, Carol +40, Bob +10 |
| Completing a campaign | As Frank, submit to **Follow Us on X**, then approve it as Steve | Frank +100, Alice +40, Bob +10 |

The pre-verified draft can be published, but reserving and claiming winners has no screens yet.

## Changing the data

Edit [`services/api/prisma/demo-data.json`](../services/api/prisma/demo-data.json), then reset the stack and run the seed again. The script checks the file before it changes anything:

- Each user's `hardhatAccount` must be #1 to #19, and `walletAddress` must be that account's address. Account #0 deployed the contract and is the API's own signer.
- Referral codes are 10 capital letters or digits, like the ones the API generates.
- A campaign's `completions` list who submits. `REWARDED` ones are approved and paid, `UNDER_REVIEW` ones are left for the owner.
- Owners can't submit to their own campaigns, and pre-verified campaigns stay drafts.
- Points aren't in the file. They come from the contracts.

## Docker-only alternative

After rebuilding the API image with these files, the seed can also run inside the API container:

```powershell
docker compose --profile local-chain exec api npm run demo:seed
```
