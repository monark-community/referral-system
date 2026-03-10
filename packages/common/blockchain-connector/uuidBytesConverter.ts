export function uuidToBytes32(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, "");
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}

export function bytes32ToUuid(bytes32: `0x${string}`): string {
  const hex = bytes32.slice(2); // remove 0x
  const uuidHex = hex.slice(0, 32); // first 16 bytes

  return [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join("-");
}