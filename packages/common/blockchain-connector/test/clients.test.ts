// Purpose: Tests the Clients helper functions
// Notes:
// - For nopw just tests basic config and initialization success

import { createWebSocketClient, createClient } from "../clients.js";

describe("testing clients files", () => {
  test("createClient should create a configured client", () => {
    const { publicClient } = createClient("localhost");

    expect(publicClient).toBeDefined();
    expect(publicClient).toHaveProperty("chain");
    expect(publicClient).toHaveProperty("transport");
    expect(publicClient.chain).toHaveProperty("id", 31337);
    expect(publicClient.transport.type).toBe("http");
  });

  test("createWebSocketClient should create a configured client", () => {
    const { publicClient } = createWebSocketClient("localhost");

    expect(publicClient).toBeDefined();
    expect(publicClient).toHaveProperty("chain");
    expect(publicClient).toHaveProperty("transport");
    expect(publicClient.chain).toHaveProperty("id", 31337);
    expect(publicClient.transport.type).toBe("webSocket");
  });

  test("createWebSocketClient should create a client able to handle Smart Contract Events", () => {
    const { publicClient } = createWebSocketClient("localhost");

    // Check if the  the watchContractEvent method exists, which is specific to WebSocket clients
    expect(typeof publicClient.watchContractEvent).toBe("function");
  });

  test("both clients use the Sepolia chain when asked", () => {
    expect(createClient("sepolia").publicClient.chain).toHaveProperty("id", 11155111);
    expect(createWebSocketClient("sepolia").publicClient.chain).toHaveProperty("id", 11155111);
  });

  describe("missing RPC settings", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test("createClient throws when RPC_URL is not set", () => {
      delete process.env.RPC_URL;

      expect(() => createClient("localhost")).toThrow("RPC_URL is not defined");
    });

    test("createWebSocketClient throws when RPC_WEBSOCKET_URL is not set", () => {
      delete process.env.RPC_WEBSOCKET_URL;

      expect(() => createWebSocketClient("localhost")).toThrow(
        "RPC_WEBSOCKET_URL is not defined",
      );
    });
  });
});
