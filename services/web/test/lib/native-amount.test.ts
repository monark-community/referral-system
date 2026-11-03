import {
  formatNativeAmount,
  formatNativeAmountExact,
  parseNativeAmountToWei,
} from "@/lib/native-amount";

test("converts native decimal amounts to wei without floating-point arithmetic", () => {
  expect(parseNativeAmountToWei("0.003").toString()).toBe(
    "3000000000000000",
  );
  expect(parseNativeAmountToWei("12.000000000000000001").toString()).toBe(
    "12000000000000000001",
  );
});

test("formats exact values for editable fields and funding previews", () => {
  expect(formatNativeAmountExact("3000000000000000")).toBe("0.003");
  expect(formatNativeAmountExact("12000000000000000001")).toBe(
    "12.000000000000000001",
  );
});

test("compact display never rounds a non-zero wei amount to zero", () => {
  expect(formatNativeAmount("1")).toBe("<0.000001");
  expect(formatNativeAmount("123456789000000000")).toBe("0.123456");
  expect(formatNativeAmount("0")).toBe("0");
});

test.each(["", ".1", "01", "-1", "1e3", "0.0000000000000000001"])(
  "rejects an invalid native amount: %s",
  (amount) => {
    expect(() => parseNativeAmountToWei(amount)).toThrow();
  },
);
