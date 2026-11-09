import {
  expectedChainId,
  getConfiguredBlockchainNetwork,
  parseBlockchainNetwork,
} from "../networks.js";

describe("blockchain network configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK;
    delete process.env.BLOCKCHAIN_NETWORK;
    delete process.env.CHAIN_TYPE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("defaults to localhost", () => {
    expect(getConfiguredBlockchainNetwork()).toBe("localhost");
    expect(expectedChainId("localhost")).toBe(31337);
  });

  test("selects Sepolia from the canonical variable", () => {
    process.env.BLOCKCHAIN_NETWORK = "sepolia";
    expect(getConfiguredBlockchainNetwork()).toBe("sepolia");
    expect(expectedChainId("sepolia")).toBe(11155111);
  });

  test("temporarily supports the legacy CHAIN_TYPE variable", () => {
    process.env.CHAIN_TYPE = "sepolia";
    expect(getConfiguredBlockchainNetwork()).toBe("sepolia");
  });

  test("rejects unknown networks", () => {
    expect(() => parseBlockchainNetwork("mainnet")).toThrow(
      'Unsupported blockchain network "mainnet"',
    );
  });
});
