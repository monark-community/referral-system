# Browser E2E harness

Run the isolated stack and Chromium suite with `npm run test:e2e`. The runner executes
Playwright inside the Compose network, then removes only that run's containers, network,
and volumes. Reports, traces, screenshots, videos, and service logs are written beneath
`playwright-output/<run-id>/` and are ignored by Git.

## Commands and expected runtime

| Goal | Command | Typical local runtime |
| --- | --- | --- |
| Pull-request smoke (clean boot + two-user public referral) | `npm run test:e2e:smoke` | 3–6 minutes on a warm Docker cache |
| API integration suite | `npm run test:e2e:api` | 4–7 minutes |
| Browser journey suite | `npm run test:e2e:browser` | 5–8 minutes |
| Every integration and browser test | `npm run test:e2e` | 6–10 minutes |
| One named test | `npm run test:e2e -- --grep "returning user"` | 3–6 minutes |
| Keep a failed stack for inspection | `npm run test:e2e:smoke -- --keep-on-failure` | Same as smoke |

All commands are headless by default. Playwright arguments after `--` are forwarded to the
container, so `npm run test:e2e -- --headed --grep "@smoke"` runs Chromium in headed mode
when the Docker host provides a display server. The portable debugging path is to retain a
failed stack and inspect the HTML report, trace, video, screenshots, and service logs under
the printed `playwright-output/<run-id>/` directory. The runner prints the exact cleanup
command whenever it retains a stack.

Before opening a pull request, run the unit suites plus `npm run test:e2e:smoke`. Run
`test:e2e:api` when changing API persistence, authentication, listener, or contract
integration, and `test:e2e:browser` when changing wallet or referral UI behavior. The full
suite remains an explicit local run; it is not scheduled on every push.

## Locator convention

Prefer accessible locators in this order: role and accessible name, label, placeholder or
visible text. Add a stable `data-testid` only when the UI has no useful semantic locator.
Do not locate by CSS structure or generated class names.

The automatic fixture attaches browser output, endpoint probes, and the runner's API, web,
Hardhat, and combined Compose log snapshots whenever a test fails.

Tests that mutate PostgreSQL or Hardhat state should request the `cleanBaseline` fixture.
It serializes a guarded reset through the API, pauses the blockchain listener, reverts the
chain to its post-deployment snapshot, truncates only the disposable E2E database, clears
the in-memory mailbox, and waits for the listener to synchronize again. A test that needs
to reset partway through can call the `resetState` fixture function directly. Read-only or
uniquely namespaced tests may omit the fixture and share the suite-level stack. Blockchain-
mutating tests intentionally run with one Playwright worker until this lifecycle is proven
reliable enough to parallelize.

API integration tests live in `e2e/tests/api-integration.spec.ts` and carry the `@api` suite
tag. They use Playwright's request client against the same real API, PostgreSQL, and Hardhat
stack as browser tests, avoiding a duplicate integration environment alongside the mocked Jest
unit suites.

Core browser journeys live in `e2e/tests/core-journeys.spec.ts` and carry the `@phase6` tag.
Their preconditions, actions, and expected postconditions are summarized in
`docs/Phase_6_Browser_Test_Cases.md`.

The single `@smoke` journey performs clean boot validation and then onboards both the
referrer and referee through the UI, verifies both test emails, accepts the public referral
on-chain, and checks the resulting UI, API projection, and contract relationship. Pull
requests run only this journey in the `Browser E2E Smoke Tests` workflow. API (`@api`) and
browser (`@phase6`) suites stay separately selectable for explicit runs.

## Deterministic wallets

The E2E image enables a test-only injected wallet built from Hardhat's standard mnemonic.
`walletFor(role)` allocates a distinct account per Playwright worker and role. Use
`beginFullOnboarding(page, role)` for the real UI signature/transaction path,
`createAuthenticatedContext(role)` for fast Node-signed API authentication, and
`createUserContext(role)` when a separate unauthenticated browser context is required.

The production web image does not include this connector. `Dockerfile.web` fails its build if
the public wallet flag is enabled without the separate `E2E_BUILD=true` acknowledgement.
