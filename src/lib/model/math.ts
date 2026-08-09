export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Shrinks an observed rate towards a prior. `weight` is the size of the observed
 * sample and `priorWeight` how much sample the prior is treated as being worth,
 * so a player with 90 minutes played barely moves off their prior.
 */
export function shrink(
  observed: number,
  weight: number,
  prior: number,
  priorWeight: number,
): number {
  const total = weight + priorWeight;
  if (total <= 0) return prior;
  return (observed * weight + prior * priorWeight) / total;
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/** P(X = 0) for a Poisson count — i.e. a clean sheet given expected goals. */
export function poissonZero(lambda: number): number {
  return Math.exp(-Math.max(0, lambda));
}

/** P(X >= threshold) for a Poisson count. */
export function poissonTail(threshold: number, lambda: number): number {
  if (threshold <= 0) return 1;
  if (lambda <= 0) return 0;
  let cumulative = 0;
  for (let k = 0; k < threshold; k++) cumulative += poissonPmf(k, lambda);
  return clamp(1 - cumulative, 0, 1);
}

/**
 * Expected value of floor(X / 2) for a Poisson count, which is exactly how many
 * times a goalkeeper or defender is docked a point for goals conceded.
 */
export function expectedConcededPenalties(lambda: number): number {
  if (lambda <= 0) return 0;
  let expected = 0;
  const maxGoals = Math.max(8, Math.ceil(lambda + 6 * Math.sqrt(lambda)));
  for (let k = 2; k <= maxGoals; k++) {
    expected += Math.floor(k / 2) * poissonPmf(k, lambda);
  }
  return expected;
}

/**
 * Expected value of floor(X / divisor), used for a goalkeeper's save points
 * (one point per three saves).
 */
export function expectedFloorDivide(lambda: number, divisor: number): number {
  if (lambda <= 0) return 0;
  let expected = 0;
  const maxCount = Math.max(12, Math.ceil(lambda + 6 * Math.sqrt(lambda)));
  for (let k = divisor; k <= maxCount; k++) {
    expected += Math.floor(k / divisor) * poissonPmf(k, lambda);
  }
  return expected;
}

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}
