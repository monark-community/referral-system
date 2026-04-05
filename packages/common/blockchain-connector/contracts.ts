// Purpose: Provides the contract address -- chain identifier and ABI -- Interface to interact with the chain functions, events, etc (read Low level API)
// Notes:
// - Listeners are used to lighten the load of calling directly to the chain and have the DB as an intermediary, points and invites are the most common calls and have listeners

import { RefferalABI } from "@reffinity/common-contracts";
import type { Address } from "viem";

export const contracts = {
  referral: {
    abi: RefferalABI,
    address: {
      local: "0x5fbdb2315678afecb367f032d93f642f64180aa3" as Address,
      testnet: "", // No Testnet Address as of yet - will not work
    },
  },
};
