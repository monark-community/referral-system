// Purpose: Remembers the page to come back to after logging in or joining, such as a private campaign's link
// Notes:
// - Kept in sessionStorage, so it belongs to this tab and is gone when the tab closes
// - Only paths on this site are kept, so it can never send someone to another site
// - The page asked for clears it once the user is signed in there

const KEY = "reffinity:return-to";
const DASHBOARD = "/referrals";

// "//host" and "/\host" are read by browsers as another site, so a path needs exactly one leading slash
function isSitePath(path: string | null): path is string {
  return (
    !!path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\")
  );
}

export function rememberReturnTo(path: string) {
  if (isSitePath(path)) sessionStorage.setItem(KEY, path);
}

/** Where to go once signed in: the remembered page, or the dashboard. */
export function returnToPath(): string {
  if (typeof window === "undefined") return DASHBOARD;
  const path = sessionStorage.getItem(KEY);
  return isSitePath(path) ? path : DASHBOARD;
}

export function clearReturnTo() {
  sessionStorage.removeItem(KEY);
}
