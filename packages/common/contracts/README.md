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
    - [ReferralProgram.js](test/ReferralProgram.js) - referrals, points and milestones (accounts #0-#6)
    - [Campaigns.js](test/Campaigns.js) - the campaign module on its own (accounts #10-#13)
    - [CampaignFacade.js](test/CampaignFacade.js) - campaigns through ReferralProgram, including payouts (accounts #14-#19)
    - [SharedAbi.js](test/SharedAbi.js) - `index.ts`, the ABI the API and web app use, matches the compiled contract

Test files run at the same time against one Hardhat node, so each uses its own accounts; two files
sending from the same account at once collide on its nonce. A new test file needs accounts of its
own, and the node funds #0-#19. After changing a contract, update `index.ts` to match, or
`SharedAbi.js` fails.
