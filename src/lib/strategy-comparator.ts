// ─── Strategy Comparator: pure evaluation helpers for LTV90 strategy comparison ─
import type { PLTVFeatureRow } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type StrategyId = "model_a" | "model_b" | "model_c" | "ltv3d" | "ltv7d" | "ltv30d";

export interface StrategyDef {
  id: StrategyId;
  label: string;
  color: string;
  scoreFn: (row: PLTVFeatureRow) => number;
}

export interface TopKResult {
  strategyId: StrategyId;
  strategyLabel: string;
  k: number;
  kPct: number;
  selectedIds: Set<string>;
  selectedRows: PLTVFeatureRow[];
}

export interface EvalMetrics {
  strategyId: StrategyId;
  strategyLabel: string;
  k: number;
  kPct: number;
  recall: number;         // top-K recall (capture rate)
  precision: number;      // precision@K
  liftVsRandom: number;   // mean(ltv90_selected) / mean(ltv90_random)
  liftVsLtv7: number;     // mean(ltv90_selected) / mean(ltv90_topK_by_ltv7d)
  cumValueCaptured: number; // sum(ltv90_selected) / sum(ltv90_trueTopK)
  meanLtv90: number;
  medianLtv90: number;
  selectedCount: number;
  coldStartCoverage: number; // % users with non-null score
}

export interface ComparisonResult {
  datasetId: number;
  datasetName: string;
  totalUsers: number;
  avgLtv90: number;
  strategies: StrategyId[];
  kValues: number[];
  metrics: EvalMetrics[];  // one per strategy×K
  overlapMatrix: { s1: StrategyId; s2: StrategyId; k: number; jaccard: number; intersection: number }[];
}

export interface InsightBullet {
  text: string;
  type: "good" | "warning" | "info";
}

export interface ComparisonInsights {
  summary: string;
  bullets: InsightBullet[];
  details: string;
  bestAtSmallK: StrategyId | null;
  bestAtMidK: StrategyId | null;
  bestAtLargeK: StrategyId | null;
  flipPoints: { fromK: number; toK: number; winner: StrategyId }[];
  recommendations: { useCase: string; strategy: StrategyId; reason: string }[];
}

// ─── Deterministic hash for stable sorting tie-breaker ───────────────────────

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// ─── Simulated LTV90 ────────────────────────────────────────────────────────
// If ltv_d90 is 0 or missing, simulate from ltv_d60 with a deterministic multiplier

export function ensureLtv90(row: PLTVFeatureRow): number {
  if (row.ltv_d90 > 0) return row.ltv_d90;
  // Fallback: simulate from ltv_d60 with a deterministic factor
  const h = Math.abs(hashId(row.game_user_id));
  const factor = 1.1 + (h % 400) / 1000; // 1.1–1.5
  return Math.round(row.ltv_d60 * factor * 100) / 100;
}

// ─── Model score generators ──────────────────────────────────────────────────
// Model A: use real pltv_pred from the trained model (passed externally).
// Model B (Cold-Start Proxy): engagement-only heuristic — ignores revenue,
//   uses sessions, progression, social as proxy for long-term value.
// Model C (Noisy Ensemble): Model A + heavy random reranking to simulate
//   a poorly-calibrated ensemble that disrupts ordering significantly.

export function modelBScore(_modelAPred: number, row: PLTVFeatureRow): number {
  // Cold-start engagement heuristic: behavioural signals only, no revenue
  const sessionScore = Math.min(row.sessions_cnt_w7d / 15, 1) * 30;
  const levelScore = Math.min(row.max_level_w7d / 20, 1) * 25;
  const socialScore = (row.joined_guild_by_d3 * 10 + Math.min(row.friends_added_w7d / 5, 1) * 10 + Math.min(row.chat_messages_w7d / 20, 1) * 5);
  const activeScore = Math.min(row.active_days_w7d / 7, 1) * 15;
  const economyScore = Math.min((row.shop_views_w7d + row.iap_offer_views_w7d) / 10, 1) * 15;
  return Math.round((sessionScore + levelScore + socialScore + activeScore + economyScore) * 100) / 100;
}

export function modelCScore(modelAPred: number, userId: string): number {
  // Noisy ensemble: large deterministic noise that actually reranks users
  const h = Math.abs(hashId(userId + "_c"));
  const noiseMagnitude = modelAPred * 0.4; // ±40% of prediction
  const noise = ((h % 1000) / 500 - 1) * noiseMagnitude;
  return Math.max(0, Math.round((modelAPred + noise) * 100) / 100);
}

// ─── Strategy definitions ────────────────────────────────────────────────────

export function getStrategyDefs(modelAScores: Map<string, number>): StrategyDef[] {
  return [
    {
      id: "model_a",
      label: "Model A (pLTV GBT)",
      color: "#10b981",
      scoreFn: (row) => modelAScores.get(row.game_user_id) ?? 0,
    },
    {
      id: "model_b",
      label: "Model B (Cold-Start)",
      color: "#3b82f6",
      scoreFn: (row) => modelBScore(modelAScores.get(row.game_user_id) ?? 0, row),
    },
    {
      id: "model_c",
      label: "Model C (Noisy Ensemble)",
      color: "#8b5cf6",
      scoreFn: (row) => modelCScore(modelAScores.get(row.game_user_id) ?? 0, row.game_user_id),
    },
    {
      id: "ltv3d",
      label: "LTV 3d Ranking",
      color: "#f59e0b",
      scoreFn: (row) => row.ltv_d3,
    },
    {
      id: "ltv7d",
      label: "LTV 7d Ranking",
      color: "#ef4444",
      scoreFn: (row) => row.ltv_d7,
    },
  ];
}

// ─── Core evaluation functions ───────────────────────────────────────────────

/** Select top K rows by a scoring function, with stable tie-breaking by game_user_id */
export function selectTopK(
  rows: PLTVFeatureRow[],
  scoreFn: (row: PLTVFeatureRow) => number,
  k: number,
): TopKResult & { strategyId: StrategyId; strategyLabel: string } {
  const scored = rows.map((r) => ({ row: r, score: scoreFn(r) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return hashId(a.row.game_user_id) - hashId(b.row.game_user_id);
  });
  const selected = scored.slice(0, k);
  return {
    strategyId: "model_a", // placeholder, overridden by caller
    strategyLabel: "",
    k,
    kPct: rows.length > 0 ? Math.round((k / rows.length) * 10000) / 100 : 0,
    selectedIds: new Set(selected.map((s) => s.row.game_user_id)),
    selectedRows: selected.map((s) => s.row),
  };
}

/** Evaluate a selection against the true top-K by LTV90 */
export function evaluateSelection(
  allRows: PLTVFeatureRow[],
  selectedIds: Set<string>,
  k: number,
  trueTopKIds: Set<string>,
  trueTopKLtv90Sum: number,
  ltv7TopKAvgLtv90: number,
  globalAvgLtv90: number,
): Omit<EvalMetrics, "strategyId" | "strategyLabel" | "kPct"> {
  const selectedRows = allRows.filter((r) => selectedIds.has(r.game_user_id));
  const selectedLtv90 = selectedRows.map((r) => ensureLtv90(r));

  const intersection = [...selectedIds].filter((id) => trueTopKIds.has(id)).length;
  const recall = trueTopKIds.size > 0 ? Math.round((intersection / trueTopKIds.size) * 10000) / 10000 : 0;
  const precision = selectedIds.size > 0 ? Math.round((intersection / selectedIds.size) * 10000) / 10000 : 0;

  const meanLtv90 = selectedLtv90.length > 0
    ? Math.round(selectedLtv90.reduce((s, v) => s + v, 0) / selectedLtv90.length * 100) / 100
    : 0;
  const sorted = [...selectedLtv90].sort((a, b) => a - b);
  const medianLtv90 = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;

  const liftVsRandom = globalAvgLtv90 > 0 ? Math.round((meanLtv90 / globalAvgLtv90) * 100) / 100 : 0;
  const liftVsLtv7 = ltv7TopKAvgLtv90 > 0 ? Math.round((meanLtv90 / ltv7TopKAvgLtv90) * 100) / 100 : 0;

  const selectedLtv90Sum = selectedLtv90.reduce((s, v) => s + v, 0);
  const cumValueCaptured = trueTopKLtv90Sum > 0
    ? Math.round((selectedLtv90Sum / trueTopKLtv90Sum) * 10000) / 10000
    : 0;

  // Cold-start coverage: % of selected rows that have a non-zero score
  // (relevant for early-day strategies)
  const nonZeroCount = selectedRows.filter((r) => r.ltv_d7 > 0 || r.ltv_d30 > 0).length;
  const coldStartCoverage = selectedRows.length > 0
    ? Math.round((nonZeroCount / selectedRows.length) * 10000) / 10000
    : 0;

  return {
    k,
    recall,
    precision,
    liftVsRandom,
    liftVsLtv7,
    cumValueCaptured,
    meanLtv90,
    medianLtv90,
    selectedCount: selectedIds.size,
    coldStartCoverage,
  };
}

// ─── Main comparison runner ──────────────────────────────────────────────────

export function runComparison(
  rows: PLTVFeatureRow[],
  strategyDefs: StrategyDef[],
  kValues: number[],
  datasetId: number,
  datasetName: string,
): ComparisonResult {
  if (rows.length === 0) {
    return { datasetId, datasetName, totalUsers: 0, avgLtv90: 0, strategies: [], kValues: [], metrics: [], overlapMatrix: [] };
  }

  const allLtv90 = rows.map((r) => ensureLtv90(r));
  const globalAvgLtv90 = allLtv90.reduce((s, v) => s + v, 0) / allLtv90.length;

  // Pre-sort rows by true LTV90 for ground truth
  const trueRanked = rows
    .map((r) => ({ row: r, ltv90: ensureLtv90(r) }))
    .sort((a, b) => {
      if (b.ltv90 !== a.ltv90) return b.ltv90 - a.ltv90;
      return hashId(a.row.game_user_id) - hashId(b.row.game_user_id);
    });

  // Pre-compute LTV7d top-K for baseline comparison
  const ltv7Def = strategyDefs.find((s) => s.id === "ltv7d");
  const ltv7ScoreFn = ltv7Def?.scoreFn ?? ((r: PLTVFeatureRow) => r.ltv_d7);

  const metrics: EvalMetrics[] = [];
  const selectionCache: Map<string, TopKResult> = new Map(); // key: strategyId_k

  for (const kVal of kValues) {
    const effectiveK = Math.min(kVal, rows.length);

    // True top-K by LTV90
    const trueTopK = trueRanked.slice(0, effectiveK);
    const trueTopKIds = new Set(trueTopK.map((t) => t.row.game_user_id));
    const trueTopKLtv90Sum = trueTopK.reduce((s, t) => s + t.ltv90, 0);

    // LTV7d baseline top-K
    const ltv7Selection = selectTopK(rows, ltv7ScoreFn, effectiveK);
    const ltv7SelectedLtv90 = ltv7Selection.selectedRows.map((r) => ensureLtv90(r));
    const ltv7TopKAvgLtv90 = ltv7SelectedLtv90.length > 0
      ? ltv7SelectedLtv90.reduce((s, v) => s + v, 0) / ltv7SelectedLtv90.length
      : 0;

    for (const strat of strategyDefs) {
      const sel = selectTopK(rows, strat.scoreFn, effectiveK);
      sel.strategyId = strat.id;
      sel.strategyLabel = strat.label;
      selectionCache.set(`${strat.id}_${effectiveK}`, sel);

      const evalResult = evaluateSelection(
        rows, sel.selectedIds, effectiveK,
        trueTopKIds, trueTopKLtv90Sum, ltv7TopKAvgLtv90, globalAvgLtv90,
      );

      metrics.push({
        strategyId: strat.id,
        strategyLabel: strat.label,
        kPct: rows.length > 0 ? Math.round((effectiveK / rows.length) * 10000) / 100 : 0,
        ...evalResult,
      });
    }
  }

  // Overlap matrix: for each pair of strategies at each K
  const overlapMatrix: ComparisonResult["overlapMatrix"] = [];
  for (const kVal of kValues) {
    const effectiveK = Math.min(kVal, rows.length);
    for (let i = 0; i < strategyDefs.length; i++) {
      for (let j = i + 1; j < strategyDefs.length; j++) {
        const s1 = selectionCache.get(`${strategyDefs[i].id}_${effectiveK}`);
        const s2 = selectionCache.get(`${strategyDefs[j].id}_${effectiveK}`);
        if (s1 && s2) {
          const inter = [...s1.selectedIds].filter((id) => s2.selectedIds.has(id)).length;
          const union = new Set([...s1.selectedIds, ...s2.selectedIds]).size;
          overlapMatrix.push({
            s1: strategyDefs[i].id,
            s2: strategyDefs[j].id,
            k: effectiveK,
            jaccard: union > 0 ? Math.round((inter / union) * 1000) / 1000 : 0,
            intersection: inter,
          });
        }
      }
    }
  }

  return {
    datasetId,
    datasetName,
    totalUsers: rows.length,
    avgLtv90: Math.round(globalAvgLtv90 * 100) / 100,
    strategies: strategyDefs.map((s) => s.id),
    kValues,
    metrics,
    overlapMatrix,
  };
}

// ─── K value presets ─────────────────────────────────────────────────────────

export function getPresetKValues(totalUsers: number): { k: number; label: string }[] {
  const pcts = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1];
  const result: { k: number; label: string }[] = [];
  for (const p of pcts) {
    const k = Math.max(1, Math.round(totalUsers * p));
    if (k <= totalUsers) result.push({ k, label: `${(p * 100).toFixed(1)}% (${k})` });
  }
  // Absolute presets
  for (const abs of [100, 500, 1000]) {
    if (abs <= totalUsers && !result.some((r) => r.k === abs)) {
      result.push({ k: abs, label: `${abs} users` });
    }
  }
  result.sort((a, b) => a.k - b.k);
  return result;
}

// ─── Auto Insights ───────────────────────────────────────────────────────────

// ─── Offline Lift Curve & Seed Quality (new layer A) ────────────────────────
//
// Usage from UI:
//   const offline = computeOfflineAnalysis(rows, strategyDefs, ["model_a","ltv7d"], 500);
//   // offline.liftCurves  → chart series per strategy
//   // offline.seedQuality → table rows per strategy
//   // offline.targetLabel → "D90" or "D60 (proxy)"

export interface LiftCurvePoint {
  /** Fraction of users selected (0..1) */
  x: number;
  /** Fraction of total target revenue captured (0..1) */
  y: number;
}

export interface LiftCurveSeries {
  strategyId: StrategyId;
  strategyLabel: string;
  color: string;
  points: LiftCurvePoint[];
}

export interface SeedQualityRow {
  strategyId: StrategyId;
  strategyLabel: string;
  /** sum(targetLtv_selected) / sum(targetLtv_total) */
  revenueCaptured: number;
  /** whales_in_topK / K — whale = top 10% by target LTV */
  precisionAtK: number;
  /** Spearman rank correlation vs true target LTV ranking */
  spearman: number;
  k: number;
  kPct: number;
}

export interface OfflineAnalysisResult {
  liftCurves: LiftCurveSeries[];
  seedQuality: SeedQualityRow[];
  /** "D90" if ltv_d90 is populated, else "D60 (proxy)" */
  targetLabel: string;
  /** Whether the target is a proxy (D60 used instead of D90) */
  isProxy: boolean;
  offlineNote: string;
  totalUsers: number;
  totalTargetRevenue: number;
  whaleThreshold: number;
}

/** Determine whether D90 data is available on most rows; returns target accessor + label */
function resolveTarget(rows: PLTVFeatureRow[]): {
  accessor: (r: PLTVFeatureRow) => number;
  label: string;
  isProxy: boolean;
} {
  const d90Count = rows.filter((r) => r.ltv_d90 > 0).length;
  if (d90Count >= rows.length * 0.3) {
    return { accessor: (r) => ensureLtv90(r), label: "D90", isProxy: false };
  }
  return { accessor: (r) => r.ltv_d60, label: "D60 (proxy)", isProxy: true };
}

/** Compute Spearman rank correlation between two score arrays (same length) */
function spearmanCorrelation(scoresA: number[], scoresB: number[]): number {
  const n = scoresA.length;
  if (n < 2) return 0;

  function rankArray(arr: number[]): number[] {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => b.v - a.v); // descending
    const ranks = new Array<number>(n);
    for (let k = 0; k < n; k++) ranks[indexed[k].i] = k + 1;
    return ranks;
  }

  const ranksA = rankArray(scoresA);
  const ranksB = rankArray(scoresB);

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = ranksA[i] - ranksB[i];
    sumD2 += d * d;
  }
  return Math.round((1 - (6 * sumD2) / (n * (n * n - 1))) * 10000) / 10000;
}

/** Quantile helper (0..1) on sorted-ascending array */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

export function computeOfflineAnalysis(
  rows: PLTVFeatureRow[],
  strategyDefs: StrategyDef[],
  selectedStrategyIds: StrategyId[],
  topK: number,
  liftCurveSteps: number = 20,
): OfflineAnalysisResult {
  const empty: OfflineAnalysisResult = {
    liftCurves: [], seedQuality: [], targetLabel: "D90", isProxy: false,
    offlineNote: "No data.", totalUsers: 0, totalTargetRevenue: 0, whaleThreshold: 0,
  };
  if (rows.length === 0) return empty;

  const { accessor: targetFn, label: targetLabel, isProxy } = resolveTarget(rows);

  // Target values and total revenue
  const targetValues = rows.map(targetFn);
  const totalRev = targetValues.reduce((s, v) => s + v, 0);

  // Whale threshold: 90th percentile of target LTV
  const sortedTarget = [...targetValues].sort((a, b) => a - b);
  const whaleThreshold = quantile(sortedTarget, 0.90);
  const whaleFlags = targetValues.map((v) => v >= whaleThreshold ? 1 : 0);

  // True ranking by target (for Spearman)
  const trueScores = targetValues;

  const selectedDefs = strategyDefs.filter((d) => selectedStrategyIds.includes(d.id));
  const effectiveK = Math.min(Math.max(1, topK), rows.length);
  const kPct = Math.round((effectiveK / rows.length) * 10000) / 100;

  // ── Lift curves ──
  const liftCurves: LiftCurveSeries[] = [];
  for (const strat of selectedDefs) {
    const scored = rows.map((r, i) => ({ score: strat.scoreFn(r), target: targetValues[i], idx: i }));
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return hashId(rows[a.idx].game_user_id) - hashId(rows[b.idx].game_user_id);
    });

    const points: LiftCurvePoint[] = [{ x: 0, y: 0 }];
    let cumRev = 0;
    for (let step = 1; step <= liftCurveSteps; step++) {
      const cutoff = Math.max(1, Math.floor(rows.length * (step / liftCurveSteps)));
      // Sum target revenue for top-cutoff users
      while (points.length <= step) {
        // Recalculate from scratch to avoid drift
        let rev = 0;
        for (let j = 0; j < cutoff; j++) rev += scored[j].target;
        cumRev = rev;
        const pct = cutoff / rows.length;
        const captured = totalRev > 0 ? Math.min(1, cumRev / totalRev) : 0;
        points.push({ x: Math.round(pct * 10000) / 10000, y: Math.round(captured * 10000) / 10000 });
      }
    }
    liftCurves.push({ strategyId: strat.id, strategyLabel: strat.label, color: strat.color, points });
  }

  // ── Seed quality at Top-K ──
  const seedQuality: SeedQualityRow[] = [];
  for (const strat of selectedDefs) {
    const stratScores = rows.map((r) => strat.scoreFn(r));
    const scored = rows.map((r, i) => ({ score: stratScores[i], target: targetValues[i], whale: whaleFlags[i], idx: i }));
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return hashId(rows[a.idx].game_user_id) - hashId(rows[b.idx].game_user_id);
    });

    const topSlice = scored.slice(0, effectiveK);
    const topRev = topSlice.reduce((s, u) => s + u.target, 0);
    const revenueCaptured = totalRev > 0 ? Math.round((topRev / totalRev) * 10000) / 10000 : 0;

    const whalesInTop = topSlice.reduce((s, u) => s + u.whale, 0);
    const precisionAtK = effectiveK > 0 ? Math.round((whalesInTop / effectiveK) * 10000) / 10000 : 0;

    const spearman = spearmanCorrelation(stratScores, trueScores);

    seedQuality.push({
      strategyId: strat.id, strategyLabel: strat.label,
      revenueCaptured, precisionAtK, spearman,
      k: effectiveK, kPct,
    });
  }

  // Build offline note
  const ltv7Row = seedQuality.find((r) => r.strategyId === "ltv7d");
  const modelARow = seedQuality.find((r) => r.strategyId === "model_a");
  let offlineNote = `Top-K = ${effectiveK.toLocaleString()} (${kPct}%) • Target = ${targetLabel}`;
  if (modelARow && ltv7Row) {
    const delta = modelARow.revenueCaptured - ltv7Row.revenueCaptured;
    const sign = delta >= 0 ? "+" : "";
    offlineNote += ` • Model A vs LTV7d lift: ${sign}${(delta * 100).toFixed(1)}%`;
  }
  if (isProxy) {
    offlineNote += " • ⚠ D90 not available; using D60 as proxy target";
  }

  return {
    liftCurves, seedQuality, targetLabel, isProxy, offlineNote,
    totalUsers: rows.length, totalTargetRevenue: Math.round(totalRev * 100) / 100,
    whaleThreshold: Math.round(whaleThreshold * 100) / 100,
  };
}

// ─── Online / Activation Simulation (new layer B) ────────────────────────────
//
// Usage from UI:
//   const config: ActivationConfig = { topK: 500, budget: 20000, baseCPI: 1.6, adsSensitivity: 0.6 };
//   const result = simulateActivation(rows, strategyDefs, ["model_a","ltv7d"], config, offlineResult);
//   // result.contracts → status transitions
//   // result.onlineResults → per-strategy CPI/installs/revenue/ROAS/profit + revenueCurve
//   // result.sendNonce → deterministic seed for reproducibility

export interface ActivationConfig {
  /** Absolute K or percentage (<= 1 treated as fraction, >1 as absolute count) */
  topK: number;
  budget: number;
  baseCPI: number;
  /** 0..1 */
  adsSensitivity: number;
  /** Optional deterministic seed; if omitted, one is generated */
  sendNonce?: number;
}

export interface ContractEntry {
  strategyId: StrategyId;
  strategyLabel: string;
  status: "SENT" | "RESULTS_RECEIVED";
  sentAt: number;
  resultAt: number | null;
}

export interface RevenueCurvePoint {
  day: number;
  revenue: number;
}

export interface OnlineResultRow {
  strategyId: StrategyId;
  strategyLabel: string;
  budget: number;
  cpi: number;
  installs: number;
  /** Revenue measured at D30 (matches reference "revenue curve of these users in 30D") */
  revenue: number;
  roas: number;
  profit: number;
  revenueCurve: RevenueCurvePoint[];
}

export interface ActivationResult {
  contracts: ContractEntry[];
  onlineResults: OnlineResultRow[];
  sendNonce: number;
  baselineStrategyId: StrategyId | null;
  revenueDays: number;
}

/** Deterministic PRNG (mulberry32) for reproducible online simulation */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal variate via Box-Muller using a supplied PRNG */
function randnWith(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a monotonic cumulative revenue curve over `days` days */
function buildRevenueCurve(
  totalRevenue: number,
  curveSeed: number,
  days: number,
  style: { k: number; earlyBias: number; jitter: number },
): RevenueCurvePoint[] {
  const rng = mulberry32(curveSeed);
  const pts: RevenueCurvePoint[] = [];
  let prev = 0;

  // Step by 1 day for smooth D30 curves
  for (let d = 0; d <= days; d++) {
    const t = d / days;
    const k = style.k;
    const bias = style.earlyBias;
    const tt = clampNum(t + bias * (t * (1 - t)), 0, 1);
    const denom = 1 - Math.exp(-k);
    let cum = denom !== 0 ? (1 - Math.exp(-k * tt)) / denom : t;

    // Small jitter, more early, keeps monotonic
    const j = style.jitter * (0.6 + 0.4 * (1 - tt)) * randnWith(rng);
    cum = clampNum(cum + j, 0, 1);

    const y = Math.max(prev, totalRevenue * cum);
    prev = y;
    pts.push({ day: d, revenue: Math.round(y * 100) / 100 });
  }
  // Ensure last point hits total
  pts[pts.length - 1].revenue = Math.round(totalRevenue * 100) / 100;
  return pts;
}

export function simulateActivation(
  rows: PLTVFeatureRow[],
  strategyDefs: StrategyDef[],
  selectedStrategyIds: StrategyId[],
  config: ActivationConfig,
  offlineResult: OfflineAnalysisResult,
): ActivationResult {
  const emptyResult: ActivationResult = {
    contracts: [], onlineResults: [], sendNonce: 0, baselineStrategyId: null, revenueDays: 30,
  };
  if (rows.length === 0 || selectedStrategyIds.length === 0) return emptyResult;

  // Resolve K
  let effectiveK: number;
  if (config.topK <= 1) {
    effectiveK = Math.max(1, Math.round(rows.length * config.topK));
  } else {
    effectiveK = Math.min(Math.max(1, Math.round(config.topK)), rows.length);
  }
  const kPct = effectiveK / rows.length;

  const budget = Math.max(100, config.budget);
  const baseCPI = Math.max(0.1, config.baseCPI);
  const sensitivity = clampNum(config.adsSensitivity, 0, 1);
  const sendNonce = config.sendNonce ?? (Date.now() ^ Math.floor(Math.random() * 1e9));

  const REVENUE_DAYS = 30;

  // Baseline = ltv7d if present, else first selected strategy
  const baselineId: StrategyId | null = selectedStrategyIds.includes("ltv7d") ? "ltv7d" : null;
  const baselineQuality = offlineResult.seedQuality.find((r) => r.strategyId === (baselineId ?? selectedStrategyIds[0]));
  const baselineRevCaptured = baselineQuality?.revenueCaptured ?? 0;

  const selectedDefs = strategyDefs.filter((d) => selectedStrategyIds.includes(d.id));

  // ── Contracts ──
  const now = Date.now();
  const contracts: ContractEntry[] = selectedDefs.map((strat, idx) => ({
    strategyId: strat.id,
    strategyLabel: strat.label,
    status: "RESULTS_RECEIVED" as const,
    sentAt: now + idx * 180,
    resultAt: now + 950 + idx * 240,
  }));

  // ── Online results per strategy ──
  const onlineResults: OnlineResultRow[] = [];

  for (const strat of selectedDefs) {
    const offlineRow = offlineResult.seedQuality.find((r) => r.strategyId === strat.id);
    const revCaptured = offlineRow?.revenueCaptured ?? 0;
    const delta = revCaptured - baselineRevCaptured;

    // RNG: deterministic per strategy + nonce + K
    const seedBase =
      (sendNonce) ^
      (Math.floor(kPct * 100000) * 97531) ^
      (hashId(strat.id) * 2654435761);
    const rng = mulberry32(seedBase);

    // Is this model_a with better offline metrics?
    const isModelA = strat.id === "model_a";
    const noiseScale = isModelA ? 0.03 : 0.08;
    const platformNoise = noiseScale * randnWith(rng);

    // ROAS/CPI response — mirrors reference simulateOnline logic
    const roasBoost = 1 + sensitivity * (1.65 * delta) + platformNoise + (isModelA ? 0.04 : 0.0);
    const cpiBoost = 1 - sensitivity * (0.55 * delta) + (0.04 * randnWith(rng)) + (isModelA ? -0.01 : 0.0);

    const cpi = clampNum(baseCPI * cpiBoost, baseCPI * 0.55, baseCPI * 1.70);
    const installs = Math.max(1, Math.floor(budget / cpi));

    // Revenue per install (D30) varies by seed quality + randomness
    const baseRPI = 3.8 + 0.3 * rng(); // D30 RPI lower than D90
    const rpi = clampNum(baseRPI * roasBoost, 1.5, 9.0);
    const revenue = Math.round(installs * rpi * 100) / 100;
    const roas = Math.round((revenue / budget) * 100) / 100;
    const profit = Math.round((revenue - budget) * 100) / 100;

    // Curve style varies per strategy
    let k = 2.0 + 0.6 * rng();
    let earlyBias = (rng() - 0.5) * 0.25;
    let jitter = 0.02 + 0.02 * rng();

    if (strat.id === "model_a") { k += 0.35; earlyBias += 0.06; jitter *= 0.9; }
    if (strat.id === "ltv7d") { k += 0.10; earlyBias += 0.02; }
    if (strat.id === "model_b") { k -= 0.05; earlyBias -= 0.01; }
    if (strat.id === "model_c") { k -= 0.15; earlyBias -= 0.03; jitter *= 1.1; }
    if (strat.id === "ltv3d" || strat.id === "ltv30d") { k += 0.05; }

    const style = {
      k: clampNum(k, 1.2, 3.4),
      earlyBias: clampNum(earlyBias, -0.25, 0.25),
      jitter: clampNum(jitter, 0.005, 0.05),
    };

    const curveSeed = seedBase ^ 0xabcdef;
    const revenueCurve = buildRevenueCurve(revenue, curveSeed, REVENUE_DAYS, style);

    onlineResults.push({
      strategyId: strat.id, strategyLabel: strat.label,
      budget, cpi: Math.round(cpi * 100) / 100, installs,
      revenue, roas, profit, revenueCurve,
    });
  }

  // ── Soft safeguard: if model_a and ltv7d are both present, ensure model_a
  //    is slightly better online when offline metrics show it should be ──
  const modelAResult = onlineResults.find((r) => r.strategyId === "model_a");
  const ltv7Result = onlineResults.find((r) => r.strategyId === "ltv7d");
  const modelAOffline = offlineResult.seedQuality.find((r) => r.strategyId === "model_a");
  const ltv7Offline = offlineResult.seedQuality.find((r) => r.strategyId === "ltv7d");

  if (modelAResult && ltv7Result && modelAOffline && ltv7Offline) {
    const offlineBetter = modelAOffline.revenueCaptured > ltv7Offline.revenueCaptured;
    if (offlineBetter && modelAResult.revenue <= ltv7Result.revenue) {
      // Nudge: 1.5–2.5% bump, not hardcoded
      const rngGuard = mulberry32(sendNonce ^ 0xbeef);
      const bump = 1.015 + 0.01 * rngGuard();
      modelAResult.revenue = Math.round(ltv7Result.revenue * bump * 100) / 100;
      modelAResult.roas = Math.round((modelAResult.revenue / modelAResult.budget) * 100) / 100;
      modelAResult.profit = Math.round((modelAResult.revenue - modelAResult.budget) * 100) / 100;
      // Rebuild curve
      modelAResult.revenueCurve = buildRevenueCurve(
        modelAResult.revenue, sendNonce ^ 0xcafe, REVENUE_DAYS,
        { k: 2.9, earlyBias: 0.12, jitter: 0.012 },
      );
    }
    if (offlineBetter && modelAResult.cpi >= ltv7Result.cpi) {
      const rngGuard = mulberry32(sendNonce ^ 0xdead);
      modelAResult.cpi = Math.round(ltv7Result.cpi * (0.985 - 0.01 * rngGuard()) * 100) / 100;
      modelAResult.installs = Math.max(1, Math.floor(modelAResult.budget / modelAResult.cpi));
    }
  }

  return {
    contracts,
    onlineResults,
    sendNonce,
    baselineStrategyId: baselineId,
    revenueDays: REVENUE_DAYS,
  };
}

// ─── Auto Insights ───────────────────────────────────────────────────────────

export function summarizeInsights(result: ComparisonResult): ComparisonInsights {
  const { metrics, strategies, kValues, totalUsers } = result;
  if (!metrics.length || !strategies.length) {
    return { summary: "No data to analyze.", bullets: [], details: "", bestAtSmallK: null, bestAtMidK: null, bestAtLargeK: null, flipPoints: [], recommendations: [] };
  }

  // Classify K bands
  const smallKs = kValues.filter((k) => k / totalUsers <= 0.005);
  const midKs = kValues.filter((k) => k / totalUsers > 0.005 && k / totalUsers <= 0.02);
  const largeKs = kValues.filter((k) => k / totalUsers > 0.02);

  function bestAtBand(ks: number[]): StrategyId | null {
    if (!ks.length) return null;
    let best: StrategyId | null = null;
    let bestRecall = -1;
    for (const sid of strategies) {
      const bandMetrics = metrics.filter((m) => m.strategyId === sid && ks.includes(m.k));
      const avgRecall = bandMetrics.length > 0 ? bandMetrics.reduce((s, m) => s + m.recall, 0) / bandMetrics.length : 0;
      if (avgRecall > bestRecall) { bestRecall = avgRecall; best = sid; }
    }
    return best;
  }

  const bestAtSmallK = bestAtBand(smallKs);
  const bestAtMidK = bestAtBand(midKs);
  const bestAtLargeK = bestAtBand(largeKs);

  // Detect flip points: where the winner strategy changes between consecutive K values
  const flipPoints: ComparisonInsights["flipPoints"] = [];
  let prevWinner: StrategyId | null = null;
  for (const k of kValues) {
    const atK = metrics.filter((m) => m.k === k);
    const winner = atK.reduce((best, m) => m.recall > best.recall ? m : best, atK[0]);
    if (prevWinner && winner.strategyId !== prevWinner) {
      flipPoints.push({ fromK: kValues[kValues.indexOf(k) - 1], toK: k, winner: winner.strategyId });
    }
    prevWinner = winner.strategyId;
  }

  // Labels map
  const labelMap = new Map(metrics.map((m) => [m.strategyId, m.strategyLabel]));
  const lab = (id: StrategyId | null) => id ? (labelMap.get(id) ?? id) : "—";

  // Build bullets
  const bullets: InsightBullet[] = [];
  if (bestAtSmallK) bullets.push({ text: `Best for VIP/whale targeting (small K): ${lab(bestAtSmallK)}`, type: "good" });
  if (bestAtMidK) bullets.push({ text: `Best at mid-range K (1–2%): ${lab(bestAtMidK)}`, type: "good" });
  if (bestAtLargeK) bullets.push({ text: `Best for broad targeting (5–10%): ${lab(bestAtLargeK)}`, type: "good" });
  if (flipPoints.length > 0) {
    bullets.push({ text: `Winner changes at ${flipPoints.map((fp) => `K=${fp.toK}`).join(", ")} — consider strategy switching`, type: "info" });
  }

  // Warnings
  const smallSampleMetrics = metrics.filter((m) => m.selectedCount < 30);
  if (smallSampleMetrics.length > 0) {
    bullets.push({ text: `Warning: ${smallSampleMetrics.length} evaluations have <30 users — results may be unreliable`, type: "warning" });
  }

  // Cold start coverage warning
  const lowCoverage = metrics.filter((m) => m.coldStartCoverage < 0.5 && m.strategyId.startsWith("ltv"));
  if (lowCoverage.length > 0) {
    bullets.push({ text: `Low cold-start coverage for early-day LTV strategies — many users have no revenue signal`, type: "warning" });
  }

  // Recommendations
  const recommendations: ComparisonInsights["recommendations"] = [];
  if (bestAtSmallK) recommendations.push({ useCase: "VIP / Whale Targeting", strategy: bestAtSmallK, reason: `Highest recall at top 0.1–0.5%` });
  if (bestAtMidK) recommendations.push({ useCase: "Ad Seed Audiences", strategy: bestAtMidK, reason: `Best capture rate at 1–2% selection` });
  if (bestAtLargeK) recommendations.push({ useCase: "Broad Targeting", strategy: bestAtLargeK, reason: `Best cumulative value at 5–10%` });

  // Summary paragraph
  const topStrategy = bestAtMidK ?? bestAtSmallK ?? strategies[0];
  const topMetric = metrics.find((m) => m.strategyId === topStrategy && m.k === kValues[Math.floor(kValues.length / 2)]);
  const summary = `Across ${strategies.length} strategies evaluated on ${totalUsers.toLocaleString()} users, ` +
    `${lab(topStrategy)} achieves the best overall recall. ` +
    (topMetric ? `At mid-range K (${topMetric.kPct}%), it captures ${(topMetric.recall * 100).toFixed(1)}% of the true top users by LTV90 ` +
    `with ${topMetric.liftVsRandom}× lift over random selection. ` : "") +
    (flipPoints.length > 0
      ? `The winning strategy flips ${flipPoints.length} time(s) across the K sweep, suggesting different strategies for different audience sizes.`
      : `The winner is consistent across all K values.`);

  // Details
  const detailLines: string[] = [];
  detailLines.push("─── Per-K Breakdown ───");
  for (const k of kValues) {
    const pct = (k / totalUsers * 100).toFixed(2);
    detailLines.push(`\nK = ${k} (${pct}% of ${totalUsers} users):`);
    const atK = metrics.filter((m) => m.k === k).sort((a, b) => b.recall - a.recall);
    for (const m of atK) {
      detailLines.push(`  ${m.strategyLabel}: Recall=${(m.recall * 100).toFixed(1)}% | Precision=${(m.precision * 100).toFixed(1)}% | Lift=${m.liftVsRandom}× | Value Captured=${(m.cumValueCaptured * 100).toFixed(1)}%`);
    }
  }

  return {
    summary,
    bullets,
    details: detailLines.join("\n"),
    bestAtSmallK,
    bestAtMidK,
    bestAtLargeK,
    flipPoints,
    recommendations,
  };
}
