// ─── Decision Lab Workbench: persistence, simulation, and pure helpers ────────
import type {
  WorkbenchStore, WorkbenchProblem, WorkbenchSegment, SegmentVersion,
  SegmentSnapshot, TimelineDayMetrics, DeliveryConfig, DeliveryDayMetrics,
  SegmentStatus,
} from "./decision-lab-types";

// ─── Deterministic hash (same as component) ──────────────────────────────────

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── localStorage persistence ────────────────────────────────────────────────

const STORE_KEY = "decisionLab_workbench";

const DEFAULT_PROBLEMS: WorkbenchProblem[] = [
  { problemId: "pltv_value", name: "pLTV Value Optimization", modelCategory: "value", createdAt: "2025-01-15T00:00:00Z" },
  { problemId: "churn_prevention", name: "Churn Prevention", modelCategory: "risk", createdAt: "2025-01-20T00:00:00Z" },
  { problemId: "offer_targeting", name: "Offer Targeting", modelCategory: "offer", createdAt: "2025-02-01T00:00:00Z" },
];

export function loadWorkbench(): WorkbenchStore {
  if (typeof window === "undefined") return { problems: DEFAULT_PROBLEMS, segments: [], activeSegmentId: null, activeProblemId: DEFAULT_PROBLEMS[0].problemId };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkbenchStore;
      // Ensure default problems exist
      if (!parsed.problems?.length) parsed.problems = DEFAULT_PROBLEMS;
      return parsed;
    }
  } catch { /* ignore */ }
  return { problems: DEFAULT_PROBLEMS, segments: [], activeSegmentId: null, activeProblemId: DEFAULT_PROBLEMS[0].problemId };
}

export function saveWorkbench(store: WorkbenchStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* quota exceeded — silently fail */ }
}

// ─── Segment CRUD helpers ────────────────────────────────────────────────────

let _segCounter = Date.now();

export function createSegment(problemId: string, existingNames: string[]): WorkbenchSegment {
  // Auto-name: "New Segment 1", "New Segment 2", etc.
  let idx = 1;
  while (existingNames.includes(`New Segment ${idx}`)) idx++;
  const now = new Date().toISOString();
  return {
    segmentId: `seg_${++_segCounter}`,
    problemId,
    name: `New Segment ${idx}`,
    description: "",
    status: "Draft" as SegmentStatus,
    createdAt: now,
    updatedAt: now,
    activeVersionId: null,
    versions: [],
  };
}

export function snapshotToVersion(
  segmentId: string,
  versionNumber: number,
  segmentName: string,
  snapshot: SegmentSnapshot,
  userCount: number,
  avgScore: number,
  note: string,
): SegmentVersion {
  const now = new Date().toISOString();
  return {
    id: `sv_${Date.now()}_${versionNumber}`,
    segmentId,
    version: versionNumber,
    name: segmentName,
    definition: {
      id: segmentId,
      name: segmentName,
      description: "",
      rules: snapshot.rules,
      models: snapshot.models,
      featureFilters: snapshot.featureFilters,
      createdAt: now,
      updatedAt: now,
      version: versionNumber,
      status: "draft",
      recommendedAction: snapshot.recommendedAction,
      compositionMode: snapshot.compositionMode,
      compositeSpec: snapshot.compositeSpec,
      policyBlocks: snapshot.policyBlocks,
    },
    userCount,
    avgScore,
    createdAt: now,
    note,
  };
}

// ─── Activation Timeline Simulation ──────────────────────────────────────────
// Pure function: given a list of user IDs, a day, and a seed, compute per-day metrics.
// Uses deterministic hashing so results are stable for the same inputs.

export function simulateTimeline(
  userIds: string[],
  totalDays: number,
  holdoutFraction: number,
  holdoutSalt: string,
  baseLiftPct: number,
  budgetPerDay: number,
): TimelineDayMetrics[] {
  const intendedSize = userIds.length;
  const metrics: TimelineDayMetrics[] = [];
  let cumulativeBudget = 0;

  for (let day = 0; day <= totalDays; day++) {
    // Audience decay: each day some users become inactive, deterministic
    let activeCount = 0;
    for (const uid of userIds) {
      const h = hashStr(uid + "_day_" + day);
      // Daily attrition: ~2% per day compounding, but some re-enter
      const attritionThreshold = Math.min(980, 950 + day * 2); // slightly increasing attrition
      const reEntry = (h % 1000) < 15; // ~1.5% re-entry chance
      const active = (h % 1000) < attritionThreshold || reEntry;
      if (active) activeCount++;
    }

    // Budget: simple linear spend with slight noise from day hash
    const dayNoise = ((hashStr("budget_" + day) % 100) - 50) / 500; // ±0.1
    const daySpend = budgetPerDay * (1 + dayNoise);
    cumulativeBudget += day > 0 ? daySpend : 0;

    // KPI lift: ramps up over ~30% of duration then plateaus
    const rampFraction = Math.min(1, day / Math.max(1, totalDays * 0.3));
    const liftNoise = ((hashStr("lift_" + day) % 100) - 50) / 5000; // ±0.01
    const cumulativeKpiLift = day === 0 ? 0 : Math.max(0, (baseLiftPct + liftNoise) * rampFraction);

    metrics.push({
      day,
      intendedAudience: intendedSize,
      activeAudience: activeCount,
      budgetSpent: Math.round(cumulativeBudget * 100) / 100,
      cumulativeKpiLift: Math.round(cumulativeKpiLift * 100) / 100,
    });
  }

  return metrics;
}

// ─── Delivery / Exposure Simulation ──────────────────────────────────────────
// Per day: intended → eligible (after decay) → delivered (after latency + failures) → exposed

export function simulateDelivery(
  userIds: string[],
  totalDays: number,
  config: DeliveryConfig,
): DeliveryDayMetrics[] {
  const metrics: DeliveryDayMetrics[] = [];

  for (let day = 0; day <= totalDays; day++) {
    const intendedCount = userIds.length;

    // Eligible: same decay model as timeline
    let eligibleCount = 0;
    for (const uid of userIds) {
      const h = hashStr(uid + "_elig_" + day);
      const thresh = Math.min(980, 950 + day * 2);
      if ((h % 1000) < thresh) eligibleCount++;
    }

    // Delivered: apply latency (no delivery before latency days) + failure rate
    let deliveredCount = 0;
    if (day >= config.deliveryLatencyDays) {
      for (let u = 0; u < eligibleCount; u++) {
        const h = hashStr(userIds[u % userIds.length] + "_dlv_" + day);
        const failed = (h % 1000) < (config.failureRate * 1000);
        if (!failed) deliveredCount++;
      }
    }

    // Exposed: delivered * exposureRateTarget (deterministic rounding via hash)
    let exposedCount = 0;
    if (deliveredCount > 0) {
      const rawExposed = deliveredCount * config.exposureRateTarget;
      const floor = Math.floor(rawExposed);
      const remainder = rawExposed - floor;
      const roundUp = (hashStr("exp_round_" + day) % 1000) / 1000 < remainder;
      exposedCount = roundUp ? floor + 1 : floor;
    }

    metrics.push({ day, intendedCount, eligibleCount, deliveredCount, exposedCount });
  }

  return metrics;
}

// ─── Delivery warning helper ─────────────────────────────────────────────────

export function getDeliveryWarning(metrics: DeliveryDayMetrics[]): string | null {
  if (!metrics.length) return null;
  const last = metrics[metrics.length - 1];
  if (last.intendedCount === 0) return null;
  const ratio = last.exposedCount / last.intendedCount;
  if (ratio < 0.5) return `Critical: only ${(ratio * 100).toFixed(0)}% exposure rate — delivery severely degraded`;
  if (ratio < 0.7) return `Warning: ${(ratio * 100).toFixed(0)}% exposure rate — below 70% threshold`;
  return null;
}
