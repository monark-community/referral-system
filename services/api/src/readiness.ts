// Purpose: Tracks process-local API readiness while database catch-up and listeners initialize
// Notes:
// - Liveness remains available at /health while /ready reports startup or shutdown state

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
