// Purpose: Unit tests for the shared UI helpers - class merging, point formatting, and link code parsing

import { cn, formatPoints, parseLinkCode } from "@/lib/utils";

describe("cn", () => {
  test("joins conditional classes and drops falsy ones", () => {
    const hidden = false;

    expect(cn("px-2", hidden && "hidden", undefined, "text-sm")).toBe("px-2 text-sm");
  });

  test("lets a later Tailwind class override a conflicting earlier one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatPoints", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1000, "1,000"],
    [15000, "15,000"],
    [1234567, "1,234,567"],
  ])("formats %d as %s", (value, expected) => {
    expect(formatPoints(value)).toBe(expected);
  });
});

describe("parseLinkCode", () => {
  test("returns nulls when there is no code", () => {
    expect(parseLinkCode(undefined)).toEqual({ referralCode: null, inviteCode: null });
    expect(parseLinkCode("")).toEqual({ referralCode: null, inviteCode: null });
  });

  test("treats a code without a dash as a public referral link", () => {
    expect(parseLinkCode("ALICE12345")).toEqual({ referralCode: "ALICE12345", inviteCode: null });
  });

  test("splits a private link into its referral and invite codes", () => {
    expect(parseLinkCode("ALICE12345-INV12345")).toEqual({
      referralCode: "ALICE12345",
      inviteCode: "INV12345",
    });
  });
});
