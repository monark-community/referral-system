import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFiles = ["docker-compose.yml", "docker-compose.e2e.yml"];
const minimumComposeVersion = [2, 24, 4];

let activeChild;

export function createProjectName({ now = Date.now(), pid = process.pid, random } = {}) {
  const suffix = random ?? randomBytes(3).toString("hex");
  return `reffinity-e2e-${now}-${pid}-${suffix}`.toLowerCase();
}

export function parseComposeVersion(output) {
  const match = output.match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Could not parse Docker Compose version from: ${output.trim()}`);
  }
  return match.slice(1).map(Number);
}

export function isVersionAtLeast(actual, minimum = minimumComposeVersion) {
  for (let index = 0; index < minimum.length; index += 1) {
    if ((actual[index] ?? 0) > minimum[index]) return true;
    if ((actual[index] ?? 0) < minimum[index]) return false;
  }
  return true;
}

export function validateDeploymentArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Deployment artifact must contain a JSON object");
  }

  if (value.chainId !== 31337) {
    throw new Error(`Deployment artifact has unexpected chainId: ${value.chainId}`);
  }
  if (value.contractName !== "ReferralProgram") {
    throw new Error(`Deployment artifact has unexpected contractName: ${value.contractName}`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value.address ?? "")) {
    throw new Error("Deployment artifact has an invalid contract address");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(value.deploymentTransactionHash ?? "")) {
    throw new Error("Deployment artifact has an invalid deployment transaction hash");
  }
  if (!/^(0|[1-9]\d*)$/.test(value.deploymentBlockNumber ?? "")) {
    throw new Error("Deployment artifact has an invalid deployment block number");
  }

  return value;
}

function run(command, args, { env = process.env, capture = false, allowFailure = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const stdout = [];
    const stderr = [];
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    activeChild = child;

    if (capture) {
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
    }

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      const result = {
        code: code ?? 1,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (result.code === 0 || allowFailure) {
        resolvePromise(result);
      } else {
        const details = capture ? `\n${result.stderr || result.stdout}` : "";
        reject(new Error(`${command} exited with code ${result.code}${details}`));
      }
    });
  });
}

function composeArgs(projectName, args) {
  return [
    "compose",
    "-p",
    projectName,
    ...composeFiles.flatMap((file) => ["-f", file]),
    "--profile",
    "local-chain",
    ...args,
  ];
}

function runCompose(projectName, args, options = {}) {
  return run("docker", composeArgs(projectName, args), options);
}

async function verifyComposeVersion() {
  const result = await run("docker", ["compose", "version"], { capture: true });
  const actual = parseComposeVersion(`${result.stdout}\n${result.stderr}`);
  if (!isVersionAtLeast(actual)) {
    throw new Error(
      `Docker Compose ${actual.join(".")} is too old; ${minimumComposeVersion.join(".")} or newer is required for !reset support`,
    );
  }
}

async function readDeploymentArtifact(projectName, artifactPath, env) {
  await rm(artifactPath, { force: true });
  await runCompose(projectName, [
    "cp",
    "hardhat-deploy:/test-deployment/referral-program.json",
    artifactPath,
  ], { env });
  return validateDeploymentArtifact(JSON.parse(await readFile(artifactPath, "utf8")));
}

async function captureServiceLogs(projectName, env, artifactDirectory) {
  const logDirectory = join(artifactDirectory, "service-logs");
  await mkdir(logDirectory, { recursive: true });
  const targets = [
    ["api.log", ["api"]],
    ["web.log", ["web"]],
    ["hardhat.log", ["hardhat", "hardhat-deploy"]],
    ["compose.log", []],
  ];

  for (const [filename, services] of targets) {
    const result = await runCompose(
      projectName,
      ["logs", "--no-color", "--timestamps", ...services],
      { env, capture: true, allowFailure: true },
    );
    await writeFile(join(logDirectory, filename), `${result.stdout}${result.stderr}`, "utf8");
  }
}

async function verifyDeployedBytecode(projectName, address, env) {
  const script = [
    "const address = process.argv[1];",
    "const response = await fetch('http://127.0.0.1:8545', {",
    "  method: 'POST',",
    "  headers: { 'content-type': 'application/json' },",
    "  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),",
    "});",
    "const payload = await response.json();",
    "if (!response.ok || payload.error || !payload.result || payload.result === '0x') {",
    "  throw new Error(`No deployed bytecode at ${address}: ${JSON.stringify(payload)}`);",
    "}",
  ].join("\n");
  await runCompose(projectName, ["exec", "-T", "hardhat", "node", "-e", script, address], { env });
}

async function assertCleanBoot(projectName, address, env) {
  const databaseQuery = [
    "SELECT CASE WHEN",
    "  (SELECT COUNT(*) FROM users) = 0 AND",
    "  (SELECT COUNT(*) FROM referrals) = 0 AND",
    "  (SELECT COUNT(*) FROM referral_point_allocations) = 0",
    "THEN 'clean' ELSE 'dirty' END;",
  ].join(" ");
  const database = await runCompose(
    projectName,
    ["exec", "-T", "postgres", "psql", "-U", "reffinity", "-d", "reffinity", "-tAc", databaseQuery],
    { env, capture: true },
  );
  if (database.stdout.trim() !== "clean") {
    throw new Error(`E2E database did not start empty: ${database.stdout.trim()}`);
  }

  const apiAddress = await runCompose(
    projectName,
    ["exec", "-T", "api", "node", "-e", "process.stdout.write(process.env.REFERRAL_CONTRACT_ADDRESS || '')"],
    { env, capture: true },
  );
  const webAddress = await runCompose(
    projectName,
    ["exec", "-T", "web", "node", "-e", "process.stdout.write(process.env.NEXT_PUBLIC_REFERRAL_CONTRACT_ADDRESS || '')"],
    { env, capture: true },
  );
  if (apiAddress.stdout.trim().toLowerCase() !== address.toLowerCase()) {
    throw new Error("API contract address does not match the deployment artifact");
  }
  if (webAddress.stdout.trim().toLowerCase() !== address.toLowerCase()) {
    throw new Error("Web contract address does not match the deployment artifact");
  }

  const mailboxProbe = [
    "const response = await fetch('http://127.0.0.1:3001/__e2e/emails', {",
    "  headers: { 'x-e2e-mailbox-key': process.env.E2E_MAILBOX_KEY },",
    "});",
    "const payload = await response.json();",
    "if (!response.ok || !Array.isArray(payload.messages) || payload.messages.length !== 0) {",
    "  throw new Error(`E2E mailbox is unavailable or not empty: ${JSON.stringify(payload)}`);",
    "}",
  ].join("\n");
  await runCompose(projectName, ["exec", "-T", "api", "node", "--input-type=module", "-e", mailboxProbe], { env });

  const contractProbe = [
    "const address = process.argv[1];",
    "const call = async (data) => {",
    "  const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' },",
    "    body: JSON.stringify({ jsonrpc: '2.0', id: data, method: 'eth_call', params: [{ to: address, data }, 'latest'] }) });",
    "  const payload = await response.json();",
    "  if (payload.error) throw new Error(JSON.stringify(payload.error));",
    "  return BigInt(payload.result);",
    "};",
    "const [pool, direct, grandparent] = await Promise.all([",
    "  call('0x20304ff6'),", // viewReferralPointPool()
    "  call('0xdb2bdc79'),", // directReferralBps()
    "  call('0x1d5ff98d'),", // grandparentReferralBps()
    "]);",
    "if (pool !== 100n || direct !== 8000n || grandparent !== 2000n) {",
    "  throw new Error(`Unexpected contract defaults: pool=${pool}, direct=${direct}, grandparent=${grandparent}`);",
    "}",
  ].join("\n");
  await runCompose(projectName, ["exec", "-T", "hardhat", "node", "-e", contractProbe, address], { env });
}

export function parseArguments(args) {
  const separator = args.indexOf("--");
  if (separator !== -1) {
    return {
      command: args.slice(separator + 1),
      keepOnFailure: args.slice(0, separator).includes("--keep-on-failure"),
      playwrightArgs: [],
    };
  }

  return {
    command: [],
    keepOnFailure: args.includes("--keep-on-failure"),
    playwrightArgs: args.filter((argument) => argument !== "--keep-on-failure"),
  };
}

export async function main(args = process.argv.slice(2)) {
  const { command, keepOnFailure, playwrightArgs } = parseArguments(args);
  const projectName = createProjectName();
  const scratchDirectory = join(tmpdir(), projectName);
  const artifactPath = join(scratchDirectory, "referral-program.json");
  const playwrightArtifactDirectory = resolve(repositoryRoot, "playwright-output", projectName);
  let interruptedSignal;
  let cleanupStarted = false;
  let runFailed = false;
  let composeEnvironment = {
    ...process.env,
    E2E_ARTIFACTS_DIR: playwrightArtifactDirectory,
  };

  const onSignal = (signal) => {
    interruptedSignal = signal;
    if (activeChild && !activeChild.killed) activeChild.kill(signal);
  };
  const onSigint = () => onSignal("SIGINT");
  const onSigterm = () => onSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const cleanup = async () => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    console.log(`\n[e2e] Cleaning up ${projectName}`);
    try {
      await runCompose(
        projectName,
        ["down", "--volumes", "--remove-orphans"],
        { env: composeEnvironment, allowFailure: true },
      );
    } catch (error) {
      console.error(`[e2e] Cleanup command could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
    await rm(scratchDirectory, { recursive: true, force: true });
  };

  try {
    await mkdir(scratchDirectory, { recursive: true });
    await mkdir(playwrightArtifactDirectory, { recursive: true });
    console.log(`[e2e] Project: ${projectName}`);
    await verifyComposeVersion();

    console.log("[e2e] Starting fresh PostgreSQL and Hardhat services");
    await runCompose(projectName, ["up", "-d", "--build", "--wait", "--wait-timeout", "180", "postgres", "hardhat"], { env: composeEnvironment });

    console.log("[e2e] Deploying ReferralProgram");
    await runCompose(projectName, ["up", "--build", "--no-deps", "hardhat-deploy"], { env: composeEnvironment });
    const deployment = await readDeploymentArtifact(projectName, artifactPath, composeEnvironment);
    composeEnvironment = {
      ...composeEnvironment,
      REFERRAL_CONTRACT_ADDRESS: deployment.address,
    };
    await verifyDeployedBytecode(projectName, deployment.address, composeEnvironment);

    console.log(`[e2e] Migrating an empty database for ${deployment.address}`);
    await runCompose(projectName, ["up", "--build", "--no-deps", "db-migrate"], { env: composeEnvironment });

    console.log("[e2e] Building and starting API and web services");
    await runCompose(
      projectName,
      ["up", "-d", "--build", "--no-deps", "--wait", "--wait-timeout", "240", "api", "web"],
      { env: composeEnvironment },
    );

    console.log("[e2e] Verifying the clean stack");
    await assertCleanBoot(projectName, deployment.address, composeEnvironment);

    if (command.length > 0) {
      console.log(`[e2e] Running: ${command.join(" ")}`);
      await run(command[0], command.slice(1), {
        env: {
          ...composeEnvironment,
          COMPOSE_PROJECT_NAME: projectName,
          E2E_DEPLOYMENT_ARTIFACT: artifactPath,
        },
      });
    } else {
      const playwrightCommand = ["npx", "playwright", "test", ...playwrightArgs];
      console.log(`[e2e] Running in the Compose network: ${playwrightCommand.join(" ")}`);
      await captureServiceLogs(projectName, composeEnvironment, playwrightArtifactDirectory);
      try {
        await runCompose(
          projectName,
          ["run", "--build", "--no-deps", "--rm", "e2e", ...playwrightCommand],
          { env: composeEnvironment },
        );
      } finally {
        await captureServiceLogs(projectName, composeEnvironment, playwrightArtifactDirectory);
      }
    }

    console.log("[e2e] Passed");
    console.log(`[e2e] Playwright artifacts: ${playwrightArtifactDirectory}`);
  } catch (error) {
    runFailed = true;
    throw error;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    if (runFailed && keepOnFailure && !interruptedSignal) {
      console.log(`[e2e] Failed stack retained for inspection: ${projectName}`);
      console.log(`[e2e] Clean it up with: docker compose -p ${projectName} -f docker-compose.yml -f docker-compose.e2e.yml --profile local-chain down --volumes --remove-orphans`);
    } else {
      await cleanup();
    }
  }

  if (interruptedSignal) {
    process.kill(process.pid, interruptedSignal);
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[e2e] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
