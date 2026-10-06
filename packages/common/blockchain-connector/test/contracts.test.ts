import { configuredLocalReferralAddress } from "../contracts.js";

describe("referral contract address configuration", () => {
  const originalPublicAddress =
    process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS;
  const originalServerAddress = process.env.REFERRAL_CONTRACT_ADDRESS;

  afterEach(() => {
    if (originalPublicAddress === undefined) {
      delete process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS;
    } else {
      process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS = originalPublicAddress;
    }

    if (originalServerAddress === undefined) {
      delete process.env.REFERRAL_CONTRACT_ADDRESS;
    } else {
      process.env.REFERRAL_CONTRACT_ADDRESS = originalServerAddress;
    }
  });

  test("retains the deterministic Hardhat address as the local development fallback", () => {
    delete process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS;
    delete process.env.REFERRAL_CONTRACT_ADDRESS;

    expect(configuredLocalReferralAddress()).toBe(
      "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    );
  });

  test("accepts a server-side deployment address", () => {
    delete process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS;
    process.env.REFERRAL_CONTRACT_ADDRESS =
      "0x1111111111111111111111111111111111111111";

    expect(configuredLocalReferralAddress()).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });

  test("uses the browser-safe deployment address when both forms are present", () => {
    process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS =
      "0x2222222222222222222222222222222222222222";
    process.env.REFERRAL_CONTRACT_ADDRESS =
      "0x1111111111111111111111111111111111111111";

    expect(configuredLocalReferralAddress()).toBe(
      "0x2222222222222222222222222222222222222222",
    );
  });

  test("rejects malformed configured addresses", () => {
    delete process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS;
    process.env.REFERRAL_CONTRACT_ADDRESS = "not-an-address";

    expect(() => configuredLocalReferralAddress()).toThrow(
      "Configured referral contract address is not a valid Ethereum address",
    );
  });
});
