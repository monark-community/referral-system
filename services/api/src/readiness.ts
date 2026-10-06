// Process-local readiness state. Liveness remains available at /health while startup runs.

export interface ReadinessSnapshot {
  ready: boolean;
  reason: string;
}

let readiness: ReadinessSnapshot = {
  ready: false,
  reason: "blockchain_listener_initializing",
};

export function getReadiness(): ReadinessSnapshot {
  return { ...readiness };
}

export function markReady(): void {
  readiness = { ready: true, reason: "ready" };
}

export function markNotReady(reason: string): void {
  readiness = { ready: false, reason };
}
