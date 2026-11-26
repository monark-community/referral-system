# Demo data initializer

The demo initializer adds seven clearly named users, a two-level referral network, and three campaign drafts owned by `CampaignOwnerSteve`. It is idempotent, so it can be run again before each demo.

## Run it

Start the local stack and initialize the demo data:

```powershell
docker compose --profile local-chain up -d --build
$env:DATABASE_URL = "postgresql://reffinity:reffinity_dev@localhost:5432/reffinity"
npm run demo:seed
```

If the containers are already running, only the last two commands are needed. The script refuses non-local database URLs by default.

The users use the standard Hardhat mnemonic and accounts. In MetaMask, import the local development mnemonic `test test test test test test test test test test test junk`, connect to `http://localhost:8545` (chain ID `31337`), and select account #1 (`0x7099...79C8`) to demo as `CampaignOwnerSteve`.

The three campaigns are drafts on purpose. Open **My Campaigns** as Steve and publish one during the demo; this sends the real contract transaction and lets the blockchain listener activate it. The public manual campaign is the simplest live path. The pre-verified campaign already includes two winner wallets.

## Email verification

Email verification remains enabled for ordinary sign-ups. Only the deterministic demo accounts are inserted as already verified (`emailVerified=true`) and have no verification token. If a demo user's email is changed through the app, the existing profile flow resets it to unverified and requires the normal email link again.

Edit [`services/api/prisma/demo-data.json`](../services/api/prisma/demo-data.json) to change names, point totals, or campaign content, then rerun `npm run demo:seed`.

## Docker-only alternative

After rebuilding the API image with these files, the initializer can also run inside the API container:

```powershell
docker compose --profile local-chain exec api npm run demo:seed
```
