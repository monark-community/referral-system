const NATIVE_DECIMALS = 18;
const NATIVE_UNIT = BigInt("1000000000000000000");

/** Convert a human-readable native amount to wei without floating-point arithmetic. */
export function parseNativeAmountToWei(value: string) {
  const amount = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(amount)) {
    throw new Error(
      "Native currency amounts must be positive decimals with at most 18 decimal places.",
    );
  }
  const [whole, fraction = ""] = amount.split(".");
  return (
    BigInt(whole) * NATIVE_UNIT +
    BigInt(fraction.padEnd(NATIVE_DECIMALS, "0"))
  );
}

/** Exact, lossless display used for editable fields and transaction previews. */
export function formatNativeAmountExact(wei: string | bigint) {
  const value = typeof wei === "bigint" ? wei : BigInt(wei);
  const whole = value / NATIVE_UNIT;
  const fraction = (value % NATIVE_UNIT)
    .toString()
    .padStart(NATIVE_DECIMALS, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Compact display that never rounds a non-zero reward down to zero. */
export function formatNativeAmount(
  wei: string | bigint,
  maximumFractionDigits = 6,
) {
  const value = typeof wei === "bigint" ? wei : BigInt(wei);
  if (value === BigInt(0)) return "0";
  const exact = formatNativeAmountExact(value);
  const [whole, fraction = ""] = exact.split(".");
  if (!fraction || fraction.length <= maximumFractionDigits) return exact;
  if (whole === "0" && /^0+$/.test(fraction.slice(0, maximumFractionDigits))) {
    return `<0.${"0".repeat(Math.max(0, maximumFractionDigits - 1))}1`;
  }
  const compactFraction = fraction
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}
