import { writeFile } from "node:fs/promises";
import path from "node:path";

export default async function globalTeardown() {
  const artifactRoot = process.env.E2E_ARTIFACTS_ROOT ?? path.resolve("playwright-output", "local");
  await writeFile(
    path.join(artifactRoot, "harness-complete.json"),
    JSON.stringify({ completedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}
