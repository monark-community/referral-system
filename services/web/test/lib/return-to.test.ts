// Purpose: Tests for remembering the page to come back to after logging in

import {
  clearReturnTo,
  rememberReturnTo,
  returnToPath,
} from "@/lib/return-to";

beforeEach(() => sessionStorage.clear());

test("goes to the dashboard unless a page was remembered", () => {
  expect(returnToPath()).toBe("/referrals");
  rememberReturnTo("/campaigns/private/abc");
  expect(returnToPath()).toBe("/campaigns/private/abc");
  clearReturnTo();
  expect(returnToPath()).toBe("/referrals");
});

test.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "javascript:alert(1)",
  "",
])("never sends anyone to another site: %s", (path) => {
  rememberReturnTo(path);
  expect(returnToPath()).toBe("/referrals");
});

test("ignores a stored value that was changed by hand", () => {
  sessionStorage.setItem("reffinity:return-to", "//evil.example");
  expect(returnToPath()).toBe("/referrals");
});
