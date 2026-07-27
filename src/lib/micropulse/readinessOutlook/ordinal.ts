/**
 * Ordinal proportional-odds logistic regression — pure, dependency-free.
 *
 * This is the interpretable model at the core of the Readiness Outlook (Perri 2021
 * used ordinal regression on load → wellness class; Rossi 2022 / Rothschild 2024 both
 * show a simple linear/ordinal model matches a black-box tree at this scale, so we ship
 * the interpretable one). The fitted coefficients ARE the "why" — no post-hoc explainer.
 *
 * Model (cumulative logit): for K ordered classes 1..K and feature vector x,
 *   P(Y ≤ k | x) = sigmoid(θ_k − β·x),   k = 1..K−1
 *   P(Y = k)     = P(Y ≤ k) − P(Y ≤ k−1)
 * The thresholds are kept strictly ordered (θ_1 < θ_2 < …) by reparameterising
 * θ_k = θ_1 + Σ_{j<k} softplus(δ_j), so ordering is guaranteed by construction.
 *
 * Fit: L2-regularised MAP by batch gradient descent (analytic gradient). Small feature
 * count (≤ ~6) and small n (a squad over a season) → this is cheap and stable, and it's
 * meant to be cached/retrained weekly, never on a hot path.
 *
 * Everything is deterministic (fixed init, no RNG) so a cached fit reproduces exactly.
 */

export interface OrdinalSample {
  /** Feature vector (already normalised by the caller — e.g. per-player z-scores). */
  x: number[];
  /** Observed class, 1-based (1..K). */
  y: number;
}

export interface OrdinalModel {
  /** Number of ordered classes. */
  k: number;
  /** Feature coefficients β (length = feature count). Sign/size = the plain-language why. */
  beta: number[];
  /** The K−1 ordered cut-points θ (ascending). */
  thetas: number[];
  /** Final mean negative log-likelihood (for diagnostics). */
  nll: number;
  iterations: number;
}

const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const softplus = (z: number): number => (z > 20 ? z : Math.log1p(Math.exp(z)));
const sigmoidOf = sigmoid;
const EPS = 1e-9;

/** Rebuild ascending thresholds from the unconstrained parameters [θ1, δ2..δ_{K-1}]. */
function buildThetas(raw: number[], k: number): number[] {
  const thetas = new Array(k - 1);
  thetas[0] = raw[0];
  for (let j = 1; j < k - 1; j++) thetas[j] = thetas[j - 1] + softplus(raw[j]);
  return thetas;
}

/** P(Y ≤ k) for k=0..K (with the 0 and K sentinels = 0 and 1). */
function cumulative(thetas: number[], dot: number, k: number): number[] {
  const cum = new Array(k + 1);
  cum[0] = 0;
  for (let j = 1; j < k; j++) cum[j] = sigmoidOf(thetas[j - 1] - dot);
  cum[k] = 1;
  return cum;
}

/** Per-class probabilities P(Y = 1..K) for a feature vector under a fitted model. */
export function predictProba(model: OrdinalModel, x: number[]): number[] {
  const dot = model.beta.reduce((s, b, i) => s + b * (x[i] ?? 0), 0);
  const cum = cumulative(model.thetas, dot, model.k);
  const p = new Array(model.k);
  for (let c = 1; c <= model.k; c++) p[c - 1] = Math.max(0, cum[c] - cum[c - 1]);
  const total = p.reduce((s, v) => s + v, 0) || 1;
  return p.map((v) => v / total);
}

/** Most-likely class (1-based). */
export function predictClass(model: OrdinalModel, x: number[]): number {
  const p = predictProba(model, x);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  return best + 1;
}

/** Probability-weighted (expected) class — the honest "somewhere around here" read. */
export function expectedClass(model: OrdinalModel, x: number[]): number {
  const p = predictProba(model, x);
  return p.reduce((s, v, i) => s + v * (i + 1), 0);
}

export interface FitOptions {
  k: number;
  /** L2 penalty on β (not on thresholds). Default 1.0 — deliberately strong at small n. */
  l2?: number;
  lr?: number;
  maxIter?: number;
  tol?: number;
}

/**
 * Fit the proportional-odds model. Returns coefficients whose sign is directly
 * interpretable: a positive β_i means a higher feature i pushes toward higher classes.
 */
export function fitOrdinal(samples: OrdinalSample[], opts: FitOptions): OrdinalModel {
  const { k } = opts;
  const l2 = opts.l2 ?? 1.0;
  const lr = opts.lr ?? 0.05;
  const maxIter = opts.maxIter ?? 4000;
  const tol = opts.tol ?? 1e-7;
  const nFeat = samples[0]?.x.length ?? 0;
  const n = samples.length;

  // Params: raw thresholds (K−1) then β (nFeat). Init thresholds spread around 0.
  const raw = new Array(k - 1).fill(0).map((_, j) => (j === 0 ? -1 : 0.3));
  const beta = new Array(nFeat).fill(0);

  let prevNll = Infinity;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const thetas = buildThetas(raw, k);
    const gBeta = new Array(nFeat).fill(0);
    const gRaw = new Array(k - 1).fill(0);
    let nll = 0;

    for (const s of samples) {
      const dot = beta.reduce((acc, b, i) => acc + b * s.x[i], 0);
      const yi = s.y; // 1..k
      const upper = yi < k ? sigmoidOf(thetas[yi - 1] - dot) : 1; // P(Y≤y)
      const lower = yi > 1 ? sigmoidOf(thetas[yi - 2] - dot) : 0; // P(Y≤y−1)
      const py = Math.max(EPS, upper - lower);
      nll -= Math.log(py);

      // d/d(dot) of P(Y≤k)=σ(θ−dot) is −σ(1−σ). β gradient accumulates over dot.
      const dUpper = yi < k ? upper * (1 - upper) : 0;
      const dLower = yi > 1 ? lower * (1 - lower) : 0;
      const dPy_dDot = (-dUpper + dLower); // ∂py/∂dot
      const dNll_dDot = -(dPy_dDot) / py;
      for (let i = 0; i < nFeat; i++) gBeta[i] += dNll_dDot * s.x[i];

      // Threshold gradients: py depends on θ_{y−1} (upper, +) and θ_{y−2} (lower, −).
      // ∂py/∂θ_{y-1} = dUpper ; ∂py/∂θ_{y-2} = −dLower.
      if (yi < k) gRaw[yi - 1] += (-(dUpper) / py); // wrt θ_{y-1} slot before chain
      if (yi > 1) gRaw[yi - 2] += (-(-dLower) / py);
    }

    // L2 on β only.
    for (let i = 0; i < nFeat; i++) { nll += 0.5 * l2 * beta[i] * beta[i]; gBeta[i] += l2 * beta[i]; }
    nll /= n;

    // Chain the θ-gradients back through the softplus reparam:
    // θ_j depends on raw[0..j]; ∂θ_j/∂raw[0]=1, ∂θ_j/∂raw[m]=sigmoid(raw[m]) for 1≤m≤j.
    const gRawParam = new Array(k - 1).fill(0);
    for (let j = 0; j < k - 1; j++) {
      // gRaw[j] here is ∂NLL/∂θ_j (accumulated above, summed, not yet /n)
      const gTheta = gRaw[j];
      gRawParam[0] += gTheta; // raw[0] flows into every θ_j
      for (let m = 1; m <= j; m++) gRawParam[m] += gTheta * sigmoidOf(raw[m]);
    }

    // Gradient step (mean gradients).
    for (let i = 0; i < nFeat; i++) beta[i] -= (lr * gBeta[i]) / n;
    for (let j = 0; j < k - 1; j++) raw[j] -= (lr * gRawParam[j]) / n;

    if (Math.abs(prevNll - nll) < tol) { prevNll = nll; iter++; break; }
    prevNll = nll;
  }

  return { k, beta, thetas: buildThetas(raw, k), nll: prevNll, iterations: iter };
}

/** Clamp a real-valued (expected) class into the 1..K range and round to nearest int. */
export function clampClass(value: number, k: number): number {
  return Math.max(1, Math.min(k, Math.round(value)));
}
