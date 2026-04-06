# /packages/common/blockchain-connector

> Viem Interfaces For Interacting with Smart Contracts through Typescript Projects

- **Scope**: Clients, Contract ABIs and contects, and Read and Write type callable functions to the Contracts
- **Purpose**: Central Helper Package to Interact with the Blockchain as a single source of truth

## Notes:

- Read and Write functions are seperated because they are fundamentally different. Reads can be anonymous and don't change the chain. Writes need to be signed by a user and alter the chain. ( In general the reads are handled entirely by the package, whereas the write just serve the correct context to be used by the appropriate action )

## Content

- [readReferralContract.service.ts](readReferralContract.service.ts) is a file that calls read functions from the chain
- [writeReferralContractHelper.ts](writeReferralContractHelper.ts) is a file that serves the write context to the caller
- [clients.ts](clients.ts) handles the viem clients - objects that act as an interface to the chain
- [test/](test) folder holds Jest tests.
  - As of Apr-05-2026 go through the 'happy path' not edge cases mainly to verify basic functionality
