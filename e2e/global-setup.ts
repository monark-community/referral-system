import { request, type FullConfig } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function requireHealthy(url: string, label: string) {
  const context = await request.newContext();
  try {
    const response = await context.get(url);
    if (!response.ok()) {
      throw new Error(`${label} readiness check returned ${response.status()} for ${url}`);
    }
  } finally {
    await context.dispose();
  }
}

async function requireHardhat(url: string) {
  const context = await request.newContext();
  try {
    const response = await context.post(url, {
      data: { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    });
    const payload = await response.json();
    if (!response.ok() || payload.error || payload.result !== "0x7a69") {
      throw new Error(`Hardhat readiness check failed: ${JSON.stringify(payload)}`);
    }
  } finally {
    await context.dispose();
  }
}

export default async function globalSetup(config: FullConfig) {
  const artifactRoot = process.env.E2E_ARTIFACTS_ROOT ?? path.resolve("playwright-output", "local");
  const authDirectory = path.join(artifactRoot, "test-results", ".auth");
  await mkdir(authDirectory, { recursive: true });
  await writeFile(
    path.join(authDirectory, "empty.json"),
    JSON.stringify({ cookies: [], origins: [] }, null, 2),
    "utf8",
  );

  await Promise.all([
    requireHealthy(config.projects[0].use.baseURL as string, "Web"),
    requireHealthy(`${process.env.E2E_API_BASE_URL ?? "http://api:3001"}/ready`, "API"),
    requireHardhat(process.env.E2E_HARDHAT_RPC_URL ?? "http://hardhat:8545"),
  ]);
}
