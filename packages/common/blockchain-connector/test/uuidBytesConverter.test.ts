// Purpose: Tests converting database UUIDs to and from the bytes32 IDs used on chain

import { uuidToBytes32, bytes32ToUuid } from "../uuidBytesConverter.js";

describe("uuidBytesConverter", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const bytes32 = `0x123e4567e89b12d3a456426614174000${"0".repeat(32)}`;

  test("uuidToBytes32 strips the dashes and pads to 32 bytes", () => {
    expect(uuidToBytes32(uuid)).toBe(bytes32);
    expect(uuidToBytes32(uuid)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("bytes32ToUuid restores the dashed UUID", () => {
    expect(bytes32ToUuid(bytes32 as `0x${string}`)).toBe(uuid);
  });

  test("converting there and back returns the same UUID", () => {
    expect(bytes32ToUuid(uuidToBytes32(uuid))).toBe(uuid);
  });
});
