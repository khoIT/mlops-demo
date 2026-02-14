// ─── Decision Data Lab Types ──────────────────────────────────────────────────

export type RuleOperator = ">=" | "<=" | ">" | "<" | "==" | "!=" | "between" | "in" | "not_in";
export type ConjunctionType = "AND" | "OR";

export interface SegmentRule {
  id: string;
  field: string;
  operator: RuleOperator;
  value: number | string | number[];
  conjunction: ConjunctionType;
}

export interface ModelReference {
  modelId: number;
  modelName: string;
  version: string;
  scoreField: string;
  threshold?: number;
  thresholdOperator?: ">=" | "<=" | ">" | "<";
}

// ─── Decision Logic: Composite Score ──────────────────────────────────────────

export type NormalizeMethod = "none" | "minmax" | "zscore" | "percentile";
export type CompositionMode = "filter" | "composite" | "policy";

export interface CompositeInput {
  id: string;
  scoreField: string;
  weight: number;
  normalize: NormalizeMethod;
}

export interface CompositeSpec {
  inputs: CompositeInput[];
  outputScale: "0_1" | "0_100";
}

// ─── Decision Logic: Policy Blocks ────────────────────────────────────────────

export interface PolicyBlock {
  id: string;
  conditions: SegmentRule[];
  action: string;
  reason: string;
}

// ─── Segment & Version ────────────────────────────────────────────────────────

export interface SegmentDefinition {
  id: string;
  name: string;
  description: string;
  rules: SegmentRule[];
  models: ModelReference[];
  featureFilters: SegmentRule[];
  createdAt: string;
  updatedAt: string;
  version: number;
  parentId?: string;
  status: "draft" | "active" | "archived";
  recommendedAction: string;
  compositionMode?: CompositionMode;
  compositeSpec?: CompositeSpec;
  policyBlocks?: PolicyBlock[];
}

export interface SegmentVersion {
  id: string;
  segmentId: string;
  version: number;
  name: string;
  definition: SegmentDefinition;
  parentVersionId?: string;
  userCount: number;
  avgScore: number;
  createdAt: string;
  note: string;
}

export interface SegmentProfile {
  segmentSize: number;
  scorePercentiles: { p50: number; p80: number; p90: number; p99: number };
  avgScore: number;
  medianScore: number;
  scoreDistribution: { bin: string; count: number }[];
  featureDistributions: Record<string, { mean: number; median: number; min: number; max: number; std: number }>;
  dataFreshness: string;
  suggestedCuts: { label: string; threshold: number; count: number }[];
}

export interface ActivationContract {
  contractId: string;
  decisionId: string;
  segmentId: string;
  segmentVersion: number;
  audienceSize: number;
  recommendedAction: string;
  actionRouting?: "single" | "per_user";
  decisionPolicy?: { mode: CompositionMode; blocks?: PolicyBlock[] };
  metadata: {
    modelVersions: string[];
    featureSetVersions: string[];
    ruleLogicHuman: string;
    ruleLogicJson: SegmentRule[];
    createdBy: string;
    createdAt: string;
    refreshSchedule: string;
    consentFlags: Record<string, boolean>;
  };
  experiment?: {
    holdoutEnabled: boolean;
    holdoutFraction: number;
    assignmentKey: string;
    experimentId: string;
    salt: string;
  };
}

export type CohortMode = "FROZEN" | "ROLLING";
export type ExperimentStatus = "RUNNING" | "PAUSED" | "ENDED";

export interface Experiment {
  experimentId: string;
  segmentId: string;
  segmentName: string;
  startTime: string;
  holdoutFraction: number;
  assignmentKey: string;
  salt: string;
  cohortMode: CohortMode;
  primaryKpi: string;
  guardrailKpis: string[];
  status: ExperimentStatus;
  treatmentSize: number;
  holdoutSize: number;
}

export interface KpiDataPoint {
  day: number;
  date: string;
  treatmentValue: number;
  holdoutValue: number;
  cumulativeLift: number;
}

export interface ExperimentResults {
  experimentId: string;
  primaryKpiLift: number;
  primaryKpiConfidence: number;
  kpiTrend: KpiDataPoint[];
  diagnostics: {
    sampleRatioMismatch: boolean;
    srmPValue: number;
    exposureIntegrity: number;
    dataFreshness: string;
    segmentDrift: number;
  };
}

export interface ScoredUserRow {
  game_user_id: string;
  pltv_pred: number;
  pltv_decile: number;
  churn_risk?: number;
  uplift_score?: number;
  segment: string;
  ab_group: "treatment" | "holdout";
  [key: string]: string | number | boolean | undefined;
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
export type LabTab = "definition" | "datalab" | "profile" | "activation" | "monitoring";

export const LAB_TABS: { id: LabTab; label: string }[] = [
  { id: "definition", label: "Definition" },
  { id: "datalab", label: "Data Lab" },
  { id: "profile", label: "Profile" },
  { id: "activation", label: "Activation Contract" },
  { id: "monitoring", label: "Monitoring (A/B)" },
];

// ─── Available features for rule builder ──────────────────────────────────────
export const AVAILABLE_RULE_FIELDS = [
  { value: "pltv_pred", label: "pLTV Score", type: "numeric" as const },
  { value: "pltv_decile", label: "pLTV Decile", type: "numeric" as const },
  { value: "churn_risk", label: "Churn Risk", type: "numeric" as const },
  { value: "uplift_score", label: "Uplift Score", type: "numeric" as const },
  { value: "composite_score", label: "Composite Score", type: "numeric" as const },
  { value: "decision_action", label: "Decision Action", type: "categorical" as const },
  { value: "reason_code", label: "Reason Code", type: "categorical" as const },
  { value: "days_since_install", label: "Days Since Install", type: "numeric" as const },
  { value: "sessions_cnt_w7d", label: "Sessions (7d)", type: "numeric" as const },
  { value: "revenue_d7", label: "Revenue D7", type: "numeric" as const },
  { value: "is_payer_by_d7", label: "Is Payer D7", type: "numeric" as const },
  { value: "max_level_w7d", label: "Max Level (7d)", type: "numeric" as const },
  { value: "active_days_w7d", label: "Active Days (7d)", type: "numeric" as const },
  { value: "gacha_opens_w7d", label: "Gacha Opens (7d)", type: "numeric" as const },
  { value: "shop_views_w7d", label: "Shop Views (7d)", type: "numeric" as const },
  { value: "pvp_matches_w7d", label: "PvP Matches (7d)", type: "numeric" as const },
  { value: "friends_added_w7d", label: "Friends Added (7d)", type: "numeric" as const },
  { value: "purchase_prob_discount_10", label: "Purchase Prob (10% off)", type: "numeric" as const },
  { value: "role_guild_leader_prob", label: "Guild Leader Prob", type: "numeric" as const },
  { value: "role_pvp_competitor_prob", label: "PvP Competitor Prob", type: "numeric" as const },
  { value: "role_cosmetic_buyer_prob", label: "Cosmetic Buyer Prob", type: "numeric" as const },
  { value: "channel", label: "Channel", type: "categorical" as const },
  { value: "country", label: "Country", type: "categorical" as const },
  { value: "os", label: "OS", type: "categorical" as const },
  { value: "device_tier", label: "Device Tier", type: "categorical" as const },
];

// ─── Score fields available for composite builder ─────────────────────────────
export const SCORE_FIELDS = [
  { value: "pltv_pred", label: "pLTV Score" },
  { value: "churn_risk", label: "Churn Risk" },
  { value: "uplift_score", label: "Uplift Score" },
  { value: "purchase_prob_discount_10", label: "Purchase Prob (10% off)" },
  { value: "role_guild_leader_prob", label: "Guild Leader Prob" },
  { value: "role_pvp_competitor_prob", label: "PvP Competitor Prob" },
  { value: "role_cosmetic_buyer_prob", label: "Cosmetic Buyer Prob" },
];

export const KPI_OPTIONS = [
  "Revenue per User",
  "ROAS D7",
  "ROAS D30",
  "Payer Conversion Rate",
  "ARPPU",
  "Retention D1",
  "Retention D7",
  "Session Frequency",
];

// ─── Workbench: Problem → Segment → Version hierarchy ────────────────────────

export interface WorkbenchProblem {
  problemId: string;
  name: string;
  modelCategory: string;
  createdAt: string;
}

export type SegmentStatus = "Draft" | "Live" | "Archived";

export interface WorkbenchSegment {
  segmentId: string;
  problemId: string;
  name: string;
  description: string;
  status: SegmentStatus;
  createdAt: string;
  updatedAt: string;
  activeVersionId: string | null;
  versions: SegmentVersion[];
}

/** Snapshot of all user-editable segment state at a given point */
export interface SegmentSnapshot {
  rules: SegmentRule[];
  featureFilters: SegmentRule[];
  models: ModelReference[];
  compositionMode: CompositionMode;
  compositeSpec: CompositeSpec;
  policyBlocks: PolicyBlock[];
  recommendedAction: string;
  holdoutEnabled: boolean;
  holdoutFraction: number;
  holdoutSalt: string;
  cohortMode: CohortMode;
}

// ─── Activation Timeline ─────────────────────────────────────────────────────

export type TimelineStatus = "idle" | "running" | "paused" | "done";

export interface TimelineConfig {
  durationDays: number;
  status: TimelineStatus;
  currentDay: number;
}

/** Per-day metrics computed by the timeline simulation */
export interface TimelineDayMetrics {
  day: number;
  intendedAudience: number;
  activeAudience: number;
  budgetSpent: number;
  cumulativeKpiLift: number;
}

// ─── Delivery / Exposure ─────────────────────────────────────────────────────

export interface DeliveryConfig {
  exposureRateTarget: number;   // 0–1, default 0.85
  deliveryLatencyDays: number;  // 0–2, default 0
  failureRate: number;          // 0–0.1, default 0.02
}

/** Per-day delivery funnel */
export interface DeliveryDayMetrics {
  day: number;
  intendedCount: number;
  eligibleCount: number;
  deliveredCount: number;
  exposedCount: number;
}

// ─── Full workbench store (for localStorage persistence) ─────────────────────

export interface WorkbenchStore {
  problems: WorkbenchProblem[];
  segments: WorkbenchSegment[];
  activeSegmentId: string | null;
  activeProblemId: string | null;
}
