export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface SpringState {
  value: number;
  velocity: number;
}

/** Slightly overdamped spring preset (zeta ~ 1.04) for smooth, non-bouncy rail slides. */
export const RAIL_SPRING: SpringConfig = {
  stiffness: 180,
  damping: 28,
  mass: 1,
};

/** Advances a 1D damped harmonic oscillator using semi-implicit Euler integration. */
export function stepSpring(
  state: SpringState,
  target: number,
  dtSeconds: number,
  config: SpringConfig = RAIL_SPRING,
): SpringState & { settled: boolean } {
  const dt = Math.min(0.032, Math.max(0.001, dtSeconds));
  const displacement = state.value - target;
  const acceleration = (-config.stiffness * displacement - config.damping * state.velocity) / config.mass;
  const velocity = state.velocity + acceleration * dt;
  const value = state.value + velocity * dt;

  if (Math.abs(value - target) < 0.25 && Math.abs(velocity) < 0.5) {
    return { value: target, velocity: 0, settled: true };
  }
  return { value, velocity, settled: false };
}

/** Returns the index whose center coordinate is closest to `viewportCenter`. */
export function findNearestSnapIndex(centers: readonly number[], viewportCenter: number): number {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const distance = Math.abs(centers[i]! - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}
