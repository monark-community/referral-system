import assert from "node:assert/strict";
import test from "node:test";
import {
  createProjectName,
  isVersionAtLeast,
  parseArguments,
  parseComposeVersion,
  validateDeploymentArtifact,
} from "./run.mjs";

const validArtifact = {
  chainId: 31337,
  contractName: "ReferralProgram",
  address: "0x1234567890123456789012345678901234567890",
  deploymentTransactionHash:
    "0x1234567890123456789012345678901234567890123456789012345678901234",
  deploymentBlockNumber: "1",
};

test("creates a safe, unique Compose project name", () => {
  assert.equal(
    createProjectName({ now: 1728000000000, pid: 42, random: "a1b2c3" }),
    "reffinity-e2e-1728000000000-42-a1b2c3",
  );
});

test("parses and compares Compose versions", () => {
  assert.deepEqual(parseComposeVersion("Docker Compose version v2.40.0-desktop.1"), [2, 40, 0]);
  assert.equal(isVersionAtLeast([2, 40, 0]), true);
  assert.equal(isVersionAtLeast([2, 24, 3]), false);
});

test("accepts a complete deployment artifact", () => {
  assert.equal(validateDeploymentArtifact(validArtifact), validArtifact);
});

test("forwards Playwright arguments and consumes runner-only flags", () => {
  assert.deepEqual(parseArguments(["--keep-on-failure", "--grep", "@smoke"]), {
    command: [],
    keepOnFailure: true,
    playwrightArgs: ["--grep", "@smoke"],
  });
});

test("keeps explicit child-command support after a separator", () => {
  assert.deepEqual(parseArguments(["--keep-on-failure", "--", "node", "probe.mjs"]), {
    command: ["node", "probe.mjs"],
    keepOnFailure: true,
    playwrightArgs: [],
  });
});

for (const [name, artifact] of [
  ["wrong chain", { ...validArtifact, chainId: 1 }],
  ["wrong contract", { ...validArtifact, contractName: "Other" }],
  ["bad address", { ...validArtifact, address: "0x123" }],
  ["bad transaction", { ...validArtifact, deploymentTransactionHash: "0x123" }],
  ["bad block", { ...validArtifact, deploymentBlockNumber: "-1" }],
]) {
  test(`rejects an artifact with ${name}`, () => {
    assert.throws(() => validateDeploymentArtifact(artifact));
  });
}
