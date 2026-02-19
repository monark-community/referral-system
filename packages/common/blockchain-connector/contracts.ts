import {RefferalABI} from "@reffinity/common-contracts"
import type {Address} from "viem"

export const contracts = {
    referral: {
        abi: RefferalABI,
        address: {
            local: "0x5fbdb2315678afecb367f032d93f642f64180aa3" as Address,
            testnet: "" // No Testnet Address as of yet - will not work
        }
    }
}