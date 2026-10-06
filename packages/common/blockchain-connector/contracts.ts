// Purpose: Provides the contract address -- chain identifier and ABI -- Interface to interact with the chain functions, events, etc (read Low level API)
// Notes:
// - Listeners are used to lighten the load of calling directly to the chain and have the DB as an intermediary, points and invites are the most common calls and have listeners

import { RefferalABI } from "@reffinity/common-contracts";
import { getAddress, isAddress, type Address } from "viem";

const DEFAULT_LOCAL_REFERRAL_CONTRACT_ADDRESS =
  "0x5fbdb2315678afecb367f032d93f642f64180aa3";

export function configuredLocalReferralAddress(): Address {
  const configuredAddress =
    process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS ??
    process.env.REFERRAL_CONTRACT_ADDRESS;

  if (!configuredAddress) {
    return DEFAULT_LOCAL_REFERRAL_CONTRACT_ADDRESS as Address;
  }

  if (!isAddress(configuredAddress)) {
    throw new Error("Configured referral contract address is not a valid Ethereum address");
  }

  return getAddress(configuredAddress);
}

export const contracts = {
  referral: {
    abi: RefferalABI,
    address: {
      local: configuredLocalReferralAddress(),
      testnet: "", // No Testnet Address as of yet - will not work
    },
  },
};
