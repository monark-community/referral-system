# Reffinity

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![GitHub Issues](https://img.shields.io/github/issues/monark-community/Reffinity)
![GitHub Issues](https://img.shields.io/github/issues-pr/monark-community/Reffinity)
![GitHub Stars](https://img.shields.io/github/stars/monark-community/Reffinity)
![GitHub Forks](https://img.shields.io/github/forks/monark-community/Reffinity)

## Project Overview

### Outline

Reffinity is a referral tracking engine that tracks invitations via your wallet and rewards you based on your activity. Using Smart Contracts on the blockchain we store who referred who, how many points they have gained for different referral actions, and trigger rewards when you reach a milestone.

### Team Members and Roles

- Sam Spencer - Developer
- Aryan Pandit - Developer
- Peter Bou-Farah - Developer

### Objectives

Creating smart contracts that:

- Track and store referees and who they refered to
- Track each referees points and increase it based on activities
- Trigger rewards for the community when milestones are hit
- Prevent abuse by transparently displaying transactions and refferals on blockchain

Create a Web App that:

- Interacts with the smart contracts to interperet the trusted data in a meaningful way
- Acts as the off-chain "Real World" area, storing information like account information and rewards
- Performs any buisness logic that combines user input, the smart contract data, and external information

Create a UI that:

- Presents the referals and points in a meaningful and understandable way
- Interacts with a users wallet (ideally with metamask) to perform any transactions
- Allows users to create referal links and share them with others
- Allows the user to view their status, and change any settings with their account
- Is accessible and usable

### Expected/anticipated architecture

Frontend:

- Next.js coupled with a https://ui.shadcn.com/ based component library

Backend:

- Node.js with a PostgreSQL DB

Sepolia Testnet:

- Runing our custom smart contracts

_External_

- MetaMask Wallet - to proccess transactions to the testnet
- JSON-RPC Bridge - API Bridge between our appication and the Sepolia network
- Indexer - graphs the blockchain data and transforms it into SQL-like datasets

### Anticipated risks (engineering challenges, etc.)

- Connecting the smart contracts with the web app
- Securely handling the wallets of users
- Immutablility of the blockchain ( ensuring once we go from tests to more permenent solutions we are sure)

### Legal and social issues.

- As a group having elements away from traditional programing methods and working with the blockchain for the first time

### Initial plans for first release, tool setup, etc

- Node.js setup
- Solidity
- Link handling with the web app api
- Initial Smart Contract setup with basic functionality
- Connecting Node.js app to the smart contract

## Project Structure

```
referral-system/
├── packages/
│   ├── shared/                   # Shared types and utilities
│   ├── smart-contracts/          # Solidity contracts + ZK circuits
│   │   ├── contracts/            # Smart contracts
│   │   ├── circuits/             # Circom ZK circuits
│   │   └── test/                 # Contract tests
│   └── subgraph/                 # The Graph indexing
├── services/
│   ├── api/                      # Backend API (Node.js + PostgreSQL)
│   │   ├── src/controllers/      # API endpoints
│   │   └── src/middlewares/      # Auth, validation
│   │   ├── src/models/           # Data Models
│   │   ├── src/routes/           # API Routes with OpenAPI documentation
│   │   ├── src/services/         # Business logic
│   └── web/                      # Frontend (Next.js + React)
│       ├── app/                  # App router pages
│       ├── components/           # UI components
│       └── services/             # API clients, blockchain
└── infra/
    └── docker-compose.yaml       # Optional global infrastructure
```

## Getting Started

TODO

## Available Scripts

TODO

## Deployment

TODO

## Documentation

- [GitHub Issues](https://github.com/monark-community/referral-system/issues)
- [Client Meeting Notes](https://github.com/monark-community/referral-system/wiki/Client%E2%80%90Meeting%E2%80%90Notes)

## Contribution

See [CONTRIBUTION.md](./CONTRIBUTION.md) to learn about contributions guidelines.

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) to learn about the code of conduct.

## License

See the [LICENSE](./LICENSE) file to learn more about this project's licensing.
