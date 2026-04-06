# /packages/common/contracts

> Smart Contracts and Related Files

- **Scope**: Code, Scripts, Deployment, and Local-node configuration for blockchain related aspects
- **Purpose**: On-chain tracking of User refferal status - limited to users wallet, status, points but no personal information

## Content

- [contracts - The Solidity Contrtacts](contracts)
    - [ReferralProgram.sol - User facing contract, calls to other contracts go through this](contracts/ReferralProgram.sol)
- [scripts - dev scripts that can be used for direct calling of the contrqacts](scripts)
    - [deploy.js](scripts/deploy.js)
    - [watch.js](scripts/watch.js)
- [test - hardhat test scripts to be called using 'npx hardhat test'](test)
    - [ReferralProgram.js](test/ReferralProgram.js)
