# Sepolia deployment

Reffinity runs against one configured blockchain network per deployment. With no
blockchain variables set, the application continues to use the local Hardhat
network on chain ID `31337`.

## 1. Deploy the contract

Set the deployment-only credentials in your shell or Hardhat keystore:

```powershell
$env:SEPOLIA_RPC_URL = "https://sepolia.example-provider.invalid/server-key"
$env:SEPOLIA_PRIVATE_KEY = "0x..."
npm run contracts:deploy:sepolia
```

The deploy command verifies chain ID `11155111` before sending a transaction.
Set `DEPLOYMENT_OUTPUT_PATH` if a machine-readable deployment artifact is
required. Record the resulting `ReferralProgram` address.

Never put `SEPOLIA_PRIVATE_KEY` in `.env.sepolia`, the API container, the web
image, or a `NEXT_PUBLIC_*` variable.

## 2. Configure the application

Copy `.env.sepolia.example` to `.env.sepolia` and replace every placeholder.
Important blockchain values are:

- `RPC_URL`: private server-side Sepolia provider endpoint.
- `RPC_WEBSOCKET_URL`: optional server-side WebSocket endpoint.
- `NEXT_PUBLIC_RPC_URL`: restricted browser-safe endpoint. This value is public.
- `REFERRAL_CONTRACT_ADDRESS`: the address produced by the deployment step.

The web values are embedded by `next build`. Rebuild the web image after
changing its network, RPC URL, API URL, or contract address.

## 3. Start the Sepolia stack

```powershell
npm run prod:sepolia
```

This starts PostgreSQL, migrations, the API, and the web application. It does
not start a Hardhat node or deploy a contract. The API remains unready unless:

- the RPC reports Sepolia chain ID `11155111`; and
- deployed bytecode exists at `REFERRAL_CONTRACT_ADDRESS`.

## Local development

The existing workflow is unchanged:

```powershell
npm run contracts:setup-local
npm run dev
```

Local defaults are documented in `.env.example`, `services/api/.env.example`,
and `services/web/.env.example`.

## Adding another testnet

Add its Viem chain definition to
`packages/common/blockchain-connector/networks.ts`, extend the allowed network
type, supply deployment credentials in `hardhat.config.ts`, and add a deployment
environment file. Do not add chain-ID ternaries elsewhere; API and web features
must consume the shared selected-chain configuration.
