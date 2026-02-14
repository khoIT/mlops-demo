"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Users, Database, Target, Brain, Zap, Play, Plus, Trash2, Copy, Download,
  ChevronRight, ChevronDown, ChevronUp, ArrowUpDown, Filter, Search, Save, Settings,
  AlertTriangle, CheckCircle2, BarChart3, Split, FileJson, History, Clock,
  Layers, RefreshCw, GitBranch, Eye, Pause, Square, X, Hash, Sigma,
  HelpCircle, Shield, Lightbulb, GripVertical, DollarSign, Sparkles,
} from "lucide-react";
import type { PLTVFeatureRow, PLTVScoredUser, PLTVModelResult, ModelCategory } from "@/lib/types";
import type {
  SegmentRule, ModelReference, SegmentDefinition, SegmentVersion,
  SegmentProfile, ActivationContract, Experiment, ExperimentResults,
  KpiDataPoint, LabTab, CohortMode, ExperimentStatus,
  CompositionMode, CompositeSpec, CompositeInput, PolicyBlock, NormalizeMethod,
  WorkbenchSegment, WorkbenchStore, SegmentSnapshot, SegmentStatus,
  TimelineConfig, TimelineStatus, TimelineDayMetrics,
  DeliveryConfig, DeliveryDayMetrics,
} from "@/lib/decision-lab-types";
import { AVAILABLE_RULE_FIELDS, LAB_TABS, KPI_OPTIONS, SCORE_FIELDS } from "@/lib/decision-lab-types";
import { PRIMITIVE_MODELS, generateDemoScoring, getDefaultCompositeSpec } from "@/lib/primitive-model-pack";
import {
  loadWorkbench, saveWorkbench, createSegment, snapshotToVersion,
  simulateTimeline, simulateDelivery, getDeliveryWarning,
} from "@/lib/decision-lab-workbench";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ModelRegistryEntry {
  id: number;
  name: string;
  modelTrack: "cold" | "warm";
  targetVar: string;
  mae: number;
  rmse: number;
  r2: number;
  topDecileLift: number;
  topDecileCapture: number;
  problemId: string | null;
  modelCategory: ModelCategory;
  result: PLTVModelResult;
  timestamp: number;
}

interface DecisionDataLabProps {
  modelRegistry: ModelRegistryEntry[];
  scoringResult: {
    modelName: string;
    datasetName: string;
    scoredUsers: PLTVScoredUser[];
    timestamp: number;
  } | null;
  featureRows: PLTVFeatureRow[];
  selectedProblemId: string | null;
  selectedModelCategory: ModelCategory;
}

// ─── Tooltip component ───────────────────────────────────────────────────────

const Tip = ({ text }: { text: string }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <HelpCircle size={11} className="text-zinc-500 hover:text-zinc-300 cursor-help inline" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} />
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-zinc-700 text-zinc-200 text-[11px] rounded-lg p-2 shadow-lg border border-zinc-600 leading-relaxed pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _ruleId = 0;
const nextRuleId = () => `rule_${++_ruleId}`;
let _blockId = 0;
const nextBlockId = () => `blk_${++_blockId}`;
let _compId = 0;
const nextCompId = () => `ci_${++_compId}`;

const hashUserId = (userId: string, salt: string): number => {
  let h = 0;
  const s = userId + salt;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

const percentile = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

const fmt = (n: number, d = 2) => Number(n.toFixed(d));

const stddev = (arr: number[]): number => {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};

const evalRule = (row: Record<string, unknown>, rule: SegmentRule): boolean => {
  const val = row[rule.field];
  if (val === undefined || val === null) return false;
  const numVal = typeof val === "string" ? parseFloat(val) : Number(val);
  const ruleVal = typeof rule.value === "number" ? rule.value : Array.isArray(rule.value) ? rule.value : parseFloat(String(rule.value));

  switch (rule.operator) {
    case ">=": return numVal >= (ruleVal as number);
    case "<=": return numVal <= (ruleVal as number);
    case ">": return numVal > (ruleVal as number);
    case "<": return numVal < (ruleVal as number);
    case "==": return String(val) === String(rule.value);
    case "!=": return String(val) !== String(rule.value);
    case "between": {
      const [lo, hi] = ruleVal as number[];
      return numVal >= lo && numVal <= hi;
    }
    case "in": return Array.isArray(rule.value) ? rule.value.map(String).includes(String(val)) : false;
    case "not_in": return Array.isArray(rule.value) ? !rule.value.map(String).includes(String(val)) : true;
    default: return true;
  }
};

const evalRules = (row: Record<string, unknown>, rules: SegmentRule[]): boolean => {
  if (!rules.length) return true;
  let result = evalRule(row, rules[0]);
  for (let i = 1; i < rules.length; i++) {
    if (rules[i].conjunction === "OR") result = result || evalRule(row, rules[i]);
    else result = result && evalRule(row, rules[i]);
  }
  return result;
};

// Enrich scored user to flat row — deterministic (no Math.random)
const toFlatRow = (u: PLTVScoredUser): Record<string, unknown> => {
  const feat = u.features as unknown as Record<string, unknown>;
  // Use seeded noise via simple hash for churn_risk/uplift if not already in features
  let h = 0;
  for (let i = 0; i < u.game_user_id.length; i++) h = ((h << 5) - h + u.game_user_id.charCodeAt(i)) | 0;
  const noise = ((Math.abs(h) % 1000) / 10000) - 0.05;
  // Deterministic days_since_install spread 0–90 via user-id hash
  const daysSinceInstall = Math.abs(h) % 91;
  return {
    game_user_id: u.game_user_id,
    pltv_pred: Number(u.pltv_pred) || 0,
    pltv_decile: Number(u.pltv_decile) || 1,
    segment: u.segment,
    actual_ltv_d60: Number(u.actual_ltv_d60) || 0,
    days_since_install: daysSinceInstall,
    churn_risk: feat.churn_risk !== undefined ? Number(feat.churn_risk) : Math.max(0, Math.min(1, 1 - ((Number(u.pltv_pred) || 0) / 200) + noise)),
    uplift_score: feat.uplift_score !== undefined ? Number(feat.uplift_score) : Math.max(0, Math.min(1, ((Number(u.pltv_pred) || 0) / 150) * 0.6 + noise + 0.1)),
    purchase_prob_discount_10: feat.purchase_prob_discount_10 !== undefined ? Number(feat.purchase_prob_discount_10) : Math.max(0, Math.min(1, ((Number(feat.shop_views_w7d) || 0) / 10) * 0.4 + ((Number(feat.iap_offer_views_w7d) || 0) / 5) * 0.3 + noise * 0.5)),
    role_pvp_competitor_prob: feat.role_pvp_competitor_prob !== undefined ? Number(feat.role_pvp_competitor_prob) : Math.max(0, Math.min(1, ((Number(feat.pvp_matches_w7d) || 0) / 15) * 0.6 + noise * 0.3)),
    role_guild_leader_prob: feat.role_guild_leader_prob !== undefined ? Number(feat.role_guild_leader_prob) : Math.max(0, Math.min(1, ((Number(feat.guild_activity_events_w7d) || 0) / 8) * 0.4 + ((Number(feat.friends_added_w7d) || 0) / 6) * 0.3 + noise * 0.3)),
    role_cosmetic_buyer_prob: feat.role_cosmetic_buyer_prob !== undefined ? Number(feat.role_cosmetic_buyer_prob) : Math.max(0, Math.min(1, ((Number(feat.gacha_opens_w7d) || 0) / 10) * 0.4 + ((Number(feat.shop_views_w7d) || 0) / 12) * 0.35 + noise * 0.3)),
    ...feat,
  };
};

// ─── Composite score computation ─────────────────────────────────────────────

function computeCompositeScores(rows: Record<string, unknown>[], spec: CompositeSpec): number[] {
  if (!spec.inputs.length || !rows.length) return rows.map(() => 0);
  // Gather raw values per input
  const rawCols: number[][] = spec.inputs.map((inp) =>
    rows.map((r) => { const v = Number(r[inp.scoreField]); return isNaN(v) ? 0 : v; })
  );
  // Normalize each column
  const normCols: number[][] = rawCols.map((col, ci) => {
    const method = spec.inputs[ci].normalize;
    if (method === "none") return col;
    if (method === "minmax") {
      const mn = Math.min(...col), mx = Math.max(...col);
      const range = mx - mn || 1;
      return col.map((v) => (v - mn) / range);
    }
    if (method === "zscore") {
      const mean = col.reduce((s, v) => s + v, 0) / col.length;
      const sd = stddev(col) || 1;
      return col.map((v) => (v - mean) / sd);
    }
    // percentile rank
    const sorted = [...col].sort((a, b) => a - b);
    return col.map((v) => {
      const idx = sorted.findIndex((sv) => sv >= v);
      return idx >= 0 ? idx / (sorted.length - 1 || 1) : 0.5;
    });
  });
  // Weighted sum
  const totalWeight = spec.inputs.reduce((s, inp) => s + Math.abs(inp.weight), 0) || 1;
  return rows.map((_, ri) => {
    let sum = 0;
    for (let ci = 0; ci < spec.inputs.length; ci++) {
      sum += normCols[ci][ri] * spec.inputs[ci].weight;
    }
    const raw = sum / totalWeight;
    return spec.outputScale === "0_100" ? Math.round(raw * 10000) / 100 : Math.round(raw * 1000) / 1000;
  });
}

// ─── Policy evaluation ───────────────────────────────────────────────────────

function evaluatePolicy(row: Record<string, unknown>, blocks: PolicyBlock[]): { action: string; reason: string } {
  for (const block of blocks) {
    if (evalRules(row, block.conditions)) {
      return { action: block.action, reason: block.reason };
    }
  }
  return { action: "DEFAULT", reason: "no_match" };
}

// ─── Mock experiment data generator ───────────────────────────────────────────

const generateMockKpiTrend = (days: number, baseLift: number): KpiDataPoint[] => {
  const start = new Date();
  start.setDate(start.getDate() - days);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    // deterministic noise from day index
    const noise = (((i * 7 + 13) % 100) / 5000) - 0.01;
    const treatVal = 4.5 + ((i * 3 + 7) % 20) / 10;
    const holdVal = treatVal / (1 + baseLift + noise * (i / Math.max(days, 1)));
    return {
      day: i + 1,
      date: d.toISOString().slice(0, 10),
      treatmentValue: fmt(treatVal),
      holdoutValue: fmt(holdVal),
      cumulativeLift: fmt(Math.max(0, (baseLift + noise) * 100 * Math.min(1, i / (days * 0.3)))),
    };
  });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DecisionDataLab({
  modelRegistry,
  scoringResult: externalScoringResult,
  featureRows,
  selectedProblemId,
  selectedModelCategory,
}: DecisionDataLabProps) {
  // ─── Demo primitive model toggle ─────────────────────────────────────
  const [useDemoModels, setUseDemoModels] = useState(!externalScoringResult);

  const demoScoring = useMemo(() => {
    if (featureRows.length === 0) return null;
    return generateDemoScoring(featureRows, selectedModelCategory);
  }, [featureRows, selectedModelCategory]);

  const scoringResult = useDemoModels && !externalScoringResult ? demoScoring : externalScoringResult;

  // Auto-switch when external scoring arrives
  useEffect(() => {
    if (externalScoringResult) setUseDemoModels(false);
  }, [externalScoringResult]);

  // ─── Tab state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<LabTab>("definition");

  // ─── Segment definition state ────────────────────────────────────────
  const [segmentName, setSegmentName] = useState("New Segment");
  const [segmentDesc, setSegmentDesc] = useState("");
  const [rules, setRules] = useState<SegmentRule[]>([]);
  const [models, setModels] = useState<ModelReference[]>([]);
  const [featureFilters, setFeatureFilters] = useState<SegmentRule[]>([]);
  const [recommendedAction, setRecommendedAction] = useState("EXPORT_TO_META");
  const [actionMode, setActionMode] = useState<"single" | "policy">("single");

  // ─── Decision Logic state ────────────────────────────────────────────
  const [compositionMode, setCompositionMode] = useState<CompositionMode>("filter");
  const [compositeSpec, setCompositeSpec] = useState<CompositeSpec>(() => getDefaultCompositeSpec(selectedModelCategory));
  const [policyBlocks, setPolicyBlocks] = useState<PolicyBlock[]>([]);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetTotal, setBudgetTotal] = useState(10000);
  const [budgetCostField, setBudgetCostField] = useState("revenue_d7");

  // ─── Data lab state ──────────────────────────────────────────────────
  const [dlSearch, setDlSearch] = useState("");
  const [dlSort, setDlSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "pltv_pred", dir: "desc" });
  const [dlPage, setDlPage] = useState(0);
  const [dlSampleMode, setDlSampleMode] = useState<"all" | "top" | "random" | "stratified">("all");
  const [dlVisibleCols, setDlVisibleCols] = useState<string[]>([
    "game_user_id", "pltv_pred", "pltv_decile", "churn_risk", "composite_score",
    "revenue_d7", "sessions_cnt_w7d", "active_days_w7d", "max_level_w7d", "channel",
  ]);
  const DL_PAGE_SIZE = 25;

  // ─── Versioning state ────────────────────────────────────────────────
  const [versions, setVersions] = useState<SegmentVersion[]>([]);
  const [versionNote, setVersionNote] = useState("");

  // ─── A/B holdout state ───────────────────────────────────────────────
  const [holdoutEnabled, setHoldoutEnabled] = useState(false);
  const [holdoutFraction, setHoldoutFraction] = useState(0.1);
  const [holdoutSalt, setHoldoutSalt] = useState("exp_salt_001");
  const [cohortMode, setCohortMode] = useState<CohortMode>("ROLLING");
  const [exportMode, setExportMode] = useState<"treatment_only" | "both">("treatment_only");

  // ─── Experiment monitoring state ─────────────────────────────────────
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);
  const [experimentResults, setExperimentResults] = useState<ExperimentResults | null>(null);
  const [primaryKpi, setPrimaryKpi] = useState("Revenue per User");
  const [guardrailKpis, setGuardrailKpis] = useState<string[]>(["Retention D7", "Session Frequency"]);
  const [monitorTimeWindow, setMonitorTimeWindow] = useState(14);
  const [monitorTipDismissed, setMonitorTipDismissed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("decisionLab_monitoring_tip_dismissed") === "1";
    return false;
  });
  const [tourDismissed, setTourDismissed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("decisionLab_tour_dismissed") === "1";
    return false;
  });

  // ─── Impact simulation state ─────────────────────────────────────────
  const [baselineSnapshot, setBaselineSnapshot] = useState<{ size: number; avgScore: number; avgRev: number } | null>(null);

  // ─── Workbench state ────────────────────────────────────────────────
  const [wbStore, setWbStore] = useState<WorkbenchStore>(() => loadWorkbench());
  const wbSegments = useMemo(() => wbStore.segments.filter((s) => s.problemId === (wbStore.activeProblemId ?? selectedProblemId ?? "pltv_value")), [wbStore, selectedProblemId]);
  const activeWbSegment = useMemo(() => wbStore.segments.find((s) => s.segmentId === wbStore.activeSegmentId) ?? null, [wbStore]);

  // Persist workbench to localStorage on change
  useEffect(() => { saveWorkbench(wbStore); }, [wbStore]);

  // ─── Activation Timeline state ──────────────────────────────────────
  const [timeline, setTimeline] = useState<TimelineConfig>({ durationDays: 14, status: "idle", currentDay: 0 });
  const [timelineMetrics, setTimelineMetrics] = useState<TimelineDayMetrics[]>([]);

  // ─── Delivery / Exposure state ──────────────────────────────────────
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>({ exposureRateTarget: 0.85, deliveryLatencyDays: 0, failureRate: 0.02 });
  const [deliveryMetrics, setDeliveryMetrics] = useState<DeliveryDayMetrics[]>([]);

  // ═══════════════════════════════════════════════════════════════════════
  // COMPUTED DATA
  // ═══════════════════════════════════════════════════════════════════════

  // Flat rows from scoring result
  const allRows = useMemo<Record<string, unknown>[]>(() => {
    if (!scoringResult) return [];
    return scoringResult.scoredUsers.map(toFlatRow);
  }, [scoringResult]);

  // Compute composite score + policy action on all rows
  const enrichedRows = useMemo(() => {
    if (!allRows.length) return allRows;
    let rows = allRows;
    // Composite score
    if (compositionMode === "composite" && compositeSpec.inputs.length > 0) {
      const scores = computeCompositeScores(rows, compositeSpec);
      rows = rows.map((r, i) => ({
        ...r,
        composite_score: scores[i],
        decision_action: scores[i] >= 50 ? "TARGET" : "SUPPRESS",
        reason_code: scores[i] >= 50 ? "composite_above_threshold" : "composite_below_threshold",
      }));
    } else if (compositionMode === "policy" && policyBlocks.length > 0) {
      // Policy evaluation
      rows = rows.map((r) => {
        const { action, reason } = evaluatePolicy(r, policyBlocks);
        return { ...r, decision_action: action, reason_code: reason };
      });
    } else {
      // Filter mode — default action based on score
      rows = rows.map((r) => {
        const score = Number(r.pltv_pred) || 0;
        return {
          ...r,
          composite_score: score,
          decision_action: score > 0 ? "INCLUDE" : "EXCLUDE",
          reason_code: score > 0 ? "score_positive" : "no_score",
        };
      });
    }
    return rows;
  }, [allRows, compositionMode, compositeSpec, policyBlocks]);

  // Apply segment rules + feature filters to get matching rows
  const filteredRows = useMemo(() => {
    let rows = enrichedRows;
    if (rules.length) rows = rows.filter((r) => evalRules(r, rules));
    if (featureFilters.length) rows = rows.filter((r) => evalRules(r, featureFilters));
    // Apply model thresholds (filter mode)
    if (compositionMode === "filter") {
      for (const m of models) {
        if (m.threshold !== undefined && m.thresholdOperator) {
          const fakeRule: SegmentRule = { id: "model_" + m.modelId, field: m.scoreField, operator: m.thresholdOperator, value: m.threshold, conjunction: "AND" };
          rows = rows.filter((r) => evalRule(r, fakeRule));
        }
      }
    }
    // Budget constraint
    if (budgetEnabled && compositionMode === "composite" && budgetTotal > 0) {
      const sorted = [...rows].sort((a, b) => Number(b.composite_score ?? 0) - Number(a.composite_score ?? 0));
      let cum = 0;
      const selected: typeof rows = [];
      for (const r of sorted) {
        const cost = Number(r[budgetCostField]) || 1;
        if (cum + cost > budgetTotal) break;
        cum += cost;
        selected.push(r);
      }
      rows = selected;
    }
    return rows;
  }, [enrichedRows, rules, featureFilters, models, compositionMode, budgetEnabled, budgetTotal, budgetCostField]);

  // Segment profile — FIXED: robust binning for empty/single-value distributions
  const profile = useMemo<SegmentProfile>(() => {
    const rawScores = filteredRows.map((r) => Number(r.pltv_pred));
    const scores = rawScores.filter((v) => !isNaN(v) && isFinite(v));
    const sorted = [...scores].sort((a, b) => a - b);

    // Build bins with robust handling
    const bins: { bin: string; count: number }[] = [];
    if (scores.length > 0) {
      const minVal = sorted[0];
      const maxVal = sorted[sorted.length - 1];
      const range = maxVal - minVal;
      const numBins = Math.min(12, Math.max(1, scores.length));
      const binSize = range > 0 ? Math.max(1, Math.ceil(range / numBins)) : 10;
      const binStart = range > 0 ? Math.floor(minVal / binSize) * binSize : Math.floor(minVal) - 5;
      const binMap: Record<string, number> = {};
      for (const s of scores) {
        const bk = range > 0 ? Math.floor(s / binSize) * binSize : binStart;
        const label = `$${bk}-${bk + binSize}`;
        binMap[label] = (binMap[label] || 0) + 1;
      }
      for (const [bin, count] of Object.entries(binMap)) {
        bins.push({ bin, count });
      }
      bins.sort((a, b) => parseInt(a.bin.replace("$", "")) - parseInt(b.bin.replace("$", "")));
    }

    const featureDists: SegmentProfile["featureDistributions"] = {};
    for (const f of ["revenue_d7", "sessions_cnt_w7d", "active_days_w7d", "max_level_w7d"]) {
      const vals = filteredRows.map((r) => Number(r[f])).filter((v) => !isNaN(v) && isFinite(v));
      if (!vals.length) continue;
      featureDists[f] = {
        mean: fmt(vals.reduce((s, v) => s + v, 0) / vals.length),
        median: fmt(percentile(vals, 50)),
        min: fmt(Math.min(...vals)),
        max: fmt(Math.max(...vals)),
        std: fmt(stddev(vals)),
      };
    }

    return {
      segmentSize: filteredRows.length,
      scorePercentiles: { p50: fmt(percentile(scores, 50)), p80: fmt(percentile(scores, 80)), p90: fmt(percentile(scores, 90)), p99: fmt(percentile(scores, 99)) },
      avgScore: fmt(scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0),
      medianScore: fmt(percentile(scores, 50)),
      scoreDistribution: bins,
      featureDistributions: featureDists,
      dataFreshness: scoringResult ? new Date(scoringResult.timestamp).toISOString().slice(0, 16) : "N/A",
      suggestedCuts: [
        { label: "Top 10%", threshold: percentile(scores, 90), count: Math.round(scores.length * 0.1) },
        { label: "Top 20%", threshold: percentile(scores, 80), count: Math.round(scores.length * 0.2) },
        { label: "Top 30%", threshold: percentile(scores, 70), count: Math.round(scores.length * 0.3) },
        { label: "Above Median", threshold: percentile(scores, 50), count: Math.round(scores.length * 0.5) },
      ],
    };
  }, [filteredRows, scoringResult]);

  // Composite preview stats
  const compositeStats = useMemo(() => {
    if (compositionMode !== "composite") return null;
    const vals = filteredRows.map((r) => Number(r.composite_score) || 0);
    if (!vals.length) return null;
    return { mean: fmt(vals.reduce((s, v) => s + v, 0) / vals.length), p50: fmt(percentile(vals, 50)), p90: fmt(percentile(vals, 90)) };
  }, [filteredRows, compositionMode]);

  // Policy action counts
  const policyActionCounts = useMemo(() => {
    if (compositionMode !== "policy") return {};
    const counts: Record<string, number> = {};
    for (const r of enrichedRows) {
      const a = String(r.decision_action || "DEFAULT");
      counts[a] = (counts[a] || 0) + 1;
    }
    return counts;
  }, [enrichedRows, compositionMode]);

  // Data Lab: sorted + paged rows
  const dataLabRows = useMemo(() => {
    let rows = [...filteredRows];
    if (dlSearch) {
      const q = dlSearch.toLowerCase();
      rows = rows.filter((r) => String(r.game_user_id).toLowerCase().includes(q));
    }
    if (dlSampleMode === "top") rows = rows.sort((a, b) => Number(b.pltv_pred) - Number(a.pltv_pred)).slice(0, 100);
    else if (dlSampleMode === "random") {
      // Deterministic shuffle using user_id hash
      rows = rows.sort((a, b) => hashUserId(String(a.game_user_id), "shuf") - hashUserId(String(b.game_user_id), "shuf")).slice(0, 100);
    } else if (dlSampleMode === "stratified") {
      const byDecile: Record<number, typeof rows> = {};
      for (const r of rows) { const d = Number(r.pltv_decile) || 1; (byDecile[d] ??= []).push(r); }
      rows = Object.values(byDecile).flatMap((grp) => grp.slice(0, Math.max(5, Math.floor(100 / 10))));
    }
    rows.sort((a, b) => {
      const aVal = a[dlSort.col], bVal = b[dlSort.col];
      const aNum = Number(aVal), bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return dlSort.dir === "asc" ? aNum - bNum : bNum - aNum;
      return dlSort.dir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return rows;
  }, [filteredRows, dlSearch, dlSort, dlSampleMode]);

  // A/B assignment
  const abAssignment = useMemo(() => {
    if (!holdoutEnabled) return { treatment: filteredRows, holdout: [] as typeof filteredRows };
    const treatment: typeof filteredRows = [];
    const holdout: typeof filteredRows = [];
    for (const r of filteredRows) {
      const h = hashUserId(String(r.game_user_id), holdoutSalt);
      if ((h % 1000) / 1000 < holdoutFraction) holdout.push(r);
      else treatment.push(r);
    }
    return { treatment, holdout };
  }, [filteredRows, holdoutEnabled, holdoutFraction, holdoutSalt]);

  // Impact delta vs baseline
  const impactDelta = useMemo(() => {
    if (!baselineSnapshot) return null;
    const scores = filteredRows.map((r) => Number(r.pltv_pred) || 0);
    const avgScore = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    const revs = filteredRows.map((r) => Number(r.actual_ltv_d60) || 0);
    const avgRev = revs.length ? revs.reduce((s, v) => s + v, 0) / revs.length : 0;
    return {
      sizeDelta: filteredRows.length - baselineSnapshot.size,
      scoreDelta: fmt(avgScore - baselineSnapshot.avgScore),
      revDelta: fmt(avgRev - baselineSnapshot.avgRev),
      currentSize: filteredRows.length,
      currentAvgScore: fmt(avgScore),
      currentAvgRev: fmt(avgRev),
    };
  }, [filteredRows, baselineSnapshot]);

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════

  const addRule = useCallback((target: "rules" | "featureFilters") => {
    const newRule: SegmentRule = { id: nextRuleId(), field: "pltv_decile", operator: ">=", value: 8, conjunction: "AND" };
    if (target === "rules") setRules((prev) => [...prev, newRule]);
    else setFeatureFilters((prev) => [...prev, newRule]);
  }, []);

  const updateRule = useCallback((target: "rules" | "featureFilters", id: string, patch: Partial<SegmentRule>) => {
    const setter = target === "rules" ? setRules : setFeatureFilters;
    setter((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const removeRule = useCallback((target: "rules" | "featureFilters", id: string) => {
    const setter = target === "rules" ? setRules : setFeatureFilters;
    setter((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addModel = useCallback(() => {
    if (!modelRegistry.length) return;
    const m = modelRegistry[0];
    setModels((prev) => [...prev, { modelId: m.id, modelName: m.name, version: `v${m.id}`, scoreField: "pltv_pred", threshold: undefined, thresholdOperator: undefined }]);
  }, [modelRegistry]);

  const addCompositeInput = useCallback(() => {
    setCompositeSpec((prev) => ({
      ...prev,
      inputs: [...prev.inputs, { id: nextCompId(), scoreField: "churn_risk", weight: 0.5, normalize: "minmax" }],
    }));
  }, []);

  const addPolicyBlock = useCallback(() => {
    setPolicyBlocks((prev) => [...prev, {
      id: nextBlockId(),
      conditions: [{ id: nextRuleId(), field: "pltv_decile", operator: ">=", value: 9, conjunction: "AND" }],
      action: "VIP_ONBOARD",
      reason: "high_value",
    }]);
  }, []);

  const saveVersion = useCallback(() => {
    const def: SegmentDefinition = {
      id: `seg_${Date.now()}`, name: segmentName, description: segmentDesc, rules, models, featureFilters,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: versions.length + 1,
      status: "draft", recommendedAction, compositionMode, compositeSpec, policyBlocks,
    };
    const sv: SegmentVersion = {
      id: `sv_${Date.now()}`, segmentId: def.id, version: def.version, name: segmentName, definition: def,
      parentVersionId: versions.length ? versions[0].id : undefined, userCount: filteredRows.length,
      avgScore: profile.avgScore, createdAt: new Date().toISOString(), note: versionNote || "Saved segment",
    };
    setVersions((prev) => [sv, ...prev]);
    setVersionNote("");
  }, [segmentName, segmentDesc, rules, models, featureFilters, versions, filteredRows, profile, versionNote, recommendedAction, compositionMode, compositeSpec, policyBlocks]);

  const saveBaseline = useCallback(() => {
    const scores = filteredRows.map((r) => Number(r.pltv_pred) || 0);
    const revs = filteredRows.map((r) => Number(r.actual_ltv_d60) || 0);
    setBaselineSnapshot({
      size: filteredRows.length,
      avgScore: scores.length ? fmt(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
      avgRev: revs.length ? fmt(revs.reduce((s, v) => s + v, 0) / revs.length) : 0,
    });
  }, [filteredRows]);

  const startExperiment = useCallback(() => {
    const expId = `exp_${Date.now()}`;
    const exp: Experiment = {
      experimentId: expId, segmentId: `seg_${segmentName.replace(/\s+/g, "_")}`, segmentName,
      startTime: new Date().toISOString(), holdoutFraction, assignmentKey: "game_user_id",
      salt: holdoutSalt, cohortMode, primaryKpi, guardrailKpis, status: "RUNNING",
      treatmentSize: abAssignment.treatment.length, holdoutSize: abAssignment.holdout.length,
    };
    setExperiments((prev) => [exp, ...prev]);
    setActiveExperimentId(expId);
    const trend = generateMockKpiTrend(monitorTimeWindow, 0.08 + ((Date.now() % 100) / 1000));
    setExperimentResults({
      experimentId: expId,
      primaryKpiLift: fmt(trend[trend.length - 1]?.cumulativeLift ?? 8),
      primaryKpiConfidence: fmt(85 + ((Date.now() % 120) / 10)),
      kpiTrend: trend,
      diagnostics: { sampleRatioMismatch: false, srmPValue: fmt(0.45 + ((Date.now() % 40) / 100)), exposureIntegrity: fmt(97 + ((Date.now() % 30) / 10)), dataFreshness: new Date().toISOString().slice(0, 16), segmentDrift: fmt(((Date.now() % 50) / 1000)) },
    });
  }, [segmentName, holdoutFraction, holdoutSalt, cohortMode, primaryKpi, guardrailKpis, monitorTimeWindow, abAssignment]);

  const generateActivationContract = useCallback((): ActivationContract => ({
    contractId: `ac_${Date.now()}`,
    decisionId: selectedProblemId ?? "general",
    segmentId: `seg_${segmentName.replace(/\s+/g, "_")}`,
    segmentVersion: versions.length + 1,
    audienceSize: holdoutEnabled ? abAssignment.treatment.length : filteredRows.length,
    recommendedAction,
    actionRouting: compositionMode === "policy" ? "per_user" : "single",
    decisionPolicy: compositionMode === "policy" ? { mode: "policy", blocks: policyBlocks } : undefined,
    metadata: {
      modelVersions: models.map((m) => m.version),
      featureSetVersions: ["fs_v1"],
      ruleLogicHuman: rules.map((r) => `${r.field} ${r.operator} ${r.value}`).join(` ${rules[1]?.conjunction ?? "AND"} `),
      ruleLogicJson: rules,
      createdBy: "analyst",
      createdAt: new Date().toISOString(),
      refreshSchedule: "daily",
      consentFlags: { tracking: true, marketing: true },
    },
    experiment: holdoutEnabled ? { holdoutEnabled: true, holdoutFraction, assignmentKey: "game_user_id", experimentId: activeExperimentId ?? `exp_${Date.now()}`, salt: holdoutSalt } : undefined,
  }), [selectedProblemId, segmentName, versions, holdoutEnabled, abAssignment, filteredRows, recommendedAction, models, rules, holdoutFraction, activeExperimentId, holdoutSalt, compositionMode, policyBlocks]);

  const dismissTour = useCallback(() => { setTourDismissed(true); if (typeof window !== "undefined") localStorage.setItem("decisionLab_tour_dismissed", "1"); }, []);
  const dismissMonitorTip = useCallback(() => { setMonitorTipDismissed(true); if (typeof window !== "undefined") localStorage.setItem("decisionLab_monitoring_tip_dismissed", "1"); }, []);

  // ─── Workbench actions ──────────────────────────────────────────────

  const wbSetProblem = useCallback((problemId: string) => {
    setWbStore((prev) => ({ ...prev, activeProblemId: problemId, activeSegmentId: null }));
  }, []);

  const wbCreateSegment = useCallback(() => {
    const pid = wbStore.activeProblemId ?? selectedProblemId ?? "pltv_value";
    const names = wbStore.segments.filter((s) => s.problemId === pid).map((s) => s.name);
    const seg = createSegment(pid, names);
    setWbStore((prev) => ({ ...prev, segments: [...prev.segments, seg], activeSegmentId: seg.segmentId }));
    setSegmentName(seg.name);
    setRules([]);
    setFeatureFilters([]);
    setModels([]);
    setCompositionMode("filter");
    setPolicyBlocks([]);
    setVersions([]);
  }, [wbStore, selectedProblemId]);

  const wbSelectSegment = useCallback((segmentId: string) => {
    setWbStore((prev) => ({ ...prev, activeSegmentId: segmentId }));
    const seg = wbStore.segments.find((s) => s.segmentId === segmentId);
    if (seg) {
      setSegmentName(seg.name);
      setVersions(seg.versions);
      // Restore from active version if exists
      const activeVer = seg.versions.find((v) => v.id === seg.activeVersionId) ?? seg.versions[0];
      if (activeVer?.definition) {
        setRules([...activeVer.definition.rules]);
        setFeatureFilters([...activeVer.definition.featureFilters]);
        setModels([...activeVer.definition.models]);
        setRecommendedAction(activeVer.definition.recommendedAction);
        if (activeVer.definition.compositionMode) setCompositionMode(activeVer.definition.compositionMode);
        if (activeVer.definition.compositeSpec) setCompositeSpec(activeVer.definition.compositeSpec);
        if (activeVer.definition.policyBlocks) setPolicyBlocks(activeVer.definition.policyBlocks);
      }
    }
  }, [wbStore]);

  const wbUpdateSegmentStatus = useCallback((segmentId: string, status: SegmentStatus) => {
    setWbStore((prev) => ({
      ...prev,
      segments: prev.segments.map((s) => s.segmentId === segmentId ? { ...s, status, updatedAt: new Date().toISOString() } : s),
    }));
  }, []);

  const wbDeleteSegment = useCallback((segmentId: string) => {
    setWbStore((prev) => ({
      ...prev,
      segments: prev.segments.filter((s) => s.segmentId !== segmentId),
      activeSegmentId: prev.activeSegmentId === segmentId ? null : prev.activeSegmentId,
    }));
  }, []);

  // Override saveVersion to also persist to workbench segment
  const saveVersionToWorkbench = useCallback(() => {
    const snapshot: SegmentSnapshot = { rules, featureFilters, models, compositionMode, compositeSpec, policyBlocks, recommendedAction, holdoutEnabled, holdoutFraction, holdoutSalt, cohortMode };
    const vNum = versions.length + 1;
    const sv = snapshotToVersion(wbStore.activeSegmentId ?? "unsaved", vNum, segmentName, snapshot, filteredRows.length, profile.avgScore, versionNote || "Saved segment");
    setVersions((prev) => [sv, ...prev]);
    setVersionNote("");
    // Persist to workbench store
    if (wbStore.activeSegmentId) {
      setWbStore((prev) => ({
        ...prev,
        segments: prev.segments.map((s) => s.segmentId === wbStore.activeSegmentId ? {
          ...s, name: segmentName, updatedAt: new Date().toISOString(), activeVersionId: sv.id,
          versions: [sv, ...s.versions],
        } : s),
      }));
    }
  }, [segmentName, rules, featureFilters, models, versions, filteredRows, profile, versionNote, recommendedAction, compositionMode, compositeSpec, policyBlocks, holdoutEnabled, holdoutFraction, holdoutSalt, cohortMode, wbStore.activeSegmentId]);

  // ─── Timeline actions ───────────────────────────────────────────────

  const runTimeline = useCallback(() => {
    const userIds = (holdoutEnabled ? abAssignment.treatment : filteredRows).map((r) => String(r.game_user_id));
    const metrics = simulateTimeline(userIds, timeline.durationDays, holdoutFraction, holdoutSalt, 8, 500);
    setTimelineMetrics(metrics);
    const dlvMetrics = simulateDelivery(userIds, timeline.durationDays, deliveryConfig);
    setDeliveryMetrics(dlvMetrics);
    setTimeline((prev) => ({ ...prev, status: "running", currentDay: prev.durationDays }));
  }, [filteredRows, abAssignment, holdoutEnabled, holdoutFraction, holdoutSalt, timeline.durationDays, deliveryConfig]);

  const resetTimeline = useCallback(() => {
    setTimeline({ durationDays: timeline.durationDays, status: "idle", currentDay: 0 });
    setTimelineMetrics([]);
    setDeliveryMetrics([]);
  }, [timeline.durationDays]);

  const setTimelineDay = useCallback((day: number) => {
    setTimeline((prev) => ({ ...prev, currentDay: Math.max(0, Math.min(day, prev.durationDays)) }));
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED SUB-COMPONENTS
  // ═══════════════════════════════════════════════════════════════════════

  const RuleRow = ({ rule, target }: { rule: SegmentRule; target: "rules" | "featureFilters" }) => (
    <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
      {rules.indexOf(rule) > 0 || featureFilters.indexOf(rule) > 0 ? (
        <select value={rule.conjunction} onChange={(e) => updateRule(target, rule.id, { conjunction: e.target.value as "AND" | "OR" })}
          className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-[11px] text-amber-400 font-bold w-14">
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        </select>
      ) : <span className="text-[11px] text-zinc-500 w-14 text-center">WHERE</span>}
      <select value={rule.field} onChange={(e) => updateRule(target, rule.id, { field: e.target.value })}
        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-zinc-200 flex-1">
        {AVAILABLE_RULE_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select value={rule.operator} onChange={(e) => updateRule(target, rule.id, { operator: e.target.value as SegmentRule["operator"] })}
        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-emerald-400 font-mono w-16">
        {[">=", "<=", ">", "<", "==", "!="].map((op) => <option key={op} value={op}>{op}</option>)}
      </select>
      <input type="text" value={String(rule.value)} onChange={(e) => {
        const v = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
        updateRule(target, rule.id, { value: v });
      }}
        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono w-24 focus:outline-none focus:border-emerald-500" />
      <button onClick={() => removeRule(target, rule.id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // NO DATA GUARD — now shows demo toggle instead of blocking
  // ═══════════════════════════════════════════════════════════════════════

  if (!scoringResult && featureRows.length === 0) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 text-center">
        <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
        <div className="text-base font-semibold text-amber-300 mb-1">No Data Available</div>
        <div className="text-sm text-zinc-400">Generate data in Step 1 or load feature rows first. The Decision Lab requires data to operate.</div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Current day metrics for timeline display ─────────────────────
  const currentDayMetrics = timelineMetrics[timeline.currentDay] ?? null;
  const currentDayDelivery = deliveryMetrics[timeline.currentDay] ?? null;
  const deliveryWarning = getDeliveryWarning(deliveryMetrics);

  return (
    <div className="flex gap-3">
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LEFT: Workbench Sidebar                                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="w-56 shrink-0 space-y-2">
        {/* Problem Picker */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
          <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Target size={10} className="text-emerald-400" />Problem</h4>
          <select
            value={wbStore.activeProblemId ?? selectedProblemId ?? "pltv_value"}
            onChange={(e) => wbSetProblem(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-emerald-500">
            {wbStore.problems.map((p) => (
              <option key={p.problemId} value={p.problemId}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Segment List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Layers size={10} className="text-cyan-400" />Segments</h4>
            <button onClick={wbCreateSegment} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-emerald-400 bg-emerald-500/10 rounded hover:bg-emerald-500/20"><Plus size={9} />New</button>
          </div>
          <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
            {wbSegments.length === 0 && (
              <div className="text-[11px] text-zinc-600 py-2 text-center">No segments yet</div>
            )}
            {wbSegments.map((seg) => (
              <button key={seg.segmentId} onClick={() => wbSelectSegment(seg.segmentId)}
                className={`w-full text-left rounded-lg p-2 border transition-all text-[11px] group ${
                  wbStore.activeSegmentId === seg.segmentId
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-zinc-800/30 border-zinc-700 hover:border-zinc-600"
                }`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold truncate ${wbStore.activeSegmentId === seg.segmentId ? "text-emerald-400" : "text-zinc-300"}`}>{seg.name}</span>
                  <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                    seg.status === "Live" ? "bg-green-500/20 text-green-400" :
                    seg.status === "Archived" ? "bg-zinc-700 text-zinc-500" :
                    "bg-amber-500/10 text-amber-400"
                  }`}>{seg.status}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5 text-[10px] text-zinc-500">
                  <span>{seg.versions.length} version{seg.versions.length !== 1 ? "s" : ""}</span>
                  <span>{new Date(seg.updatedAt).toLocaleDateString()}</span>
                </div>
                {/* Actions on hover */}
                {wbStore.activeSegmentId === seg.segmentId && (
                  <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-zinc-700/50">
                    {seg.status === "Draft" && (
                      <span onClick={(e) => { e.stopPropagation(); wbUpdateSegmentStatus(seg.segmentId, "Live"); }}
                        className="cursor-pointer px-1.5 py-0.5 rounded text-[9px] bg-green-500/10 text-green-400 hover:bg-green-500/20">Go Live</span>
                    )}
                    {seg.status === "Live" && (
                      <span onClick={(e) => { e.stopPropagation(); wbUpdateSegmentStatus(seg.segmentId, "Archived"); }}
                        className="cursor-pointer px-1.5 py-0.5 rounded text-[9px] bg-zinc-700 text-zinc-400 hover:bg-zinc-600">Archive</span>
                    )}
                    <span onClick={(e) => { e.stopPropagation(); wbDeleteSegment(seg.segmentId); }}
                      className="cursor-pointer px-1.5 py-0.5 rounded text-[9px] text-red-400 hover:bg-red-500/10 ml-auto"><Trash2 size={9} className="inline" /></span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RIGHT: Main Content                                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 space-y-3">
      {/* ─── Header bar ─── */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center"><Layers size={16} className="text-emerald-400" /></div>
          <div>
            <input type="text" value={segmentName} onChange={(e) => setSegmentName(e.target.value)}
              className="bg-transparent text-base font-bold text-zinc-200 focus:outline-none border-b border-transparent hover:border-zinc-600 focus:border-emerald-500 w-60" />
            <div className="text-[11px] text-zinc-500">
              {filteredRows.length} / {allRows.length} users matched · v{versions.length + 1}
              {selectedProblemId && <> · <span className="text-emerald-400">{selectedProblemId}</span></>}
              {useDemoModels && !externalScoringResult && <span className="ml-1 text-amber-400">(Demo Models)</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Demo/Real toggle */}
          {(externalScoringResult || demoScoring) && (
            <button onClick={() => setUseDemoModels((p) => !p)}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border ${useDemoModels ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
              <Sparkles size={10} />{useDemoModels ? "Demo Models" : "Real Scoring"}
            </button>
          )}
          <input type="text" placeholder="Version note..." value={versionNote} onChange={(e) => setVersionNote(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[12px] text-zinc-200 placeholder-zinc-600 w-48 focus:outline-none focus:border-emerald-500" />
          <button onClick={saveVersionToWorkbench} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-[12px] font-semibold rounded-lg hover:bg-emerald-500">
            <Save size={12} /> Save v{versions.length + 1}
          </button>
        </div>
      </div>

      {/* ─── Getting Started checklist (shows on all tabs) ─── */}
      {!tourDismissed && (
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
          <Lightbulb size={16} className="text-emerald-400 shrink-0" />
          <div className="flex-1 flex items-center gap-4 text-[12px]">
            {[
              { done: rules.length > 0 || featureFilters.length > 0, label: "1. Define Segment", tab: "definition" as LabTab },
              { done: compositionMode !== "filter" || models.length > 0 || compositeSpec.inputs.length > 1 || policyBlocks.length > 0, label: "2. Decision Logic", tab: "definition" as LabTab },
              { done: holdoutEnabled, label: "3. Enable Holdout", tab: "activation" as LabTab },
              { done: experiments.length > 0, label: "4. Run Experiment", tab: "monitoring" as LabTab },
            ].map((s) => (
              <button key={s.label} onClick={() => setActiveTab(s.tab)} className={`flex items-center gap-1 hover:opacity-80 transition-opacity ${s.done ? "text-emerald-400" : "text-zinc-500"}`}>
                {s.done ? <CheckCircle2 size={11} /> : <span className="w-[11px] h-[11px] rounded-full border border-zinc-600 inline-block" />} {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-600">{[rules.length > 0 || featureFilters.length > 0, compositionMode !== "filter" || models.length > 0 || compositeSpec.inputs.length > 1 || policyBlocks.length > 0, holdoutEnabled, experiments.length > 0].filter(Boolean).length}/4</span>
            <button onClick={dismissTour} className="text-zinc-500 hover:text-zinc-300"><X size={12} /></button>
          </div>
        </div>
      )}

      {/* ─── Tab bar ─── */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
        {LAB_TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
              activeTab === tab.id ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}>
            {tab.id === "definition" && <Target size={12} />}
            {tab.id === "datalab" && <Database size={12} />}
            {tab.id === "profile" && <BarChart3 size={12} />}
            {tab.id === "activation" && <FileJson size={12} />}
            {tab.id === "monitoring" && <Split size={12} />}
            {tab.label}
            {tab.id === "definition" && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{rules.length + featureFilters.length}</span>}
            {tab.id === "datalab" && <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{filteredRows.length}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Definition                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "definition" && (
        <div className="grid grid-cols-12 gap-3">
          {/* Left: Rules + Decision Logic */}
          <div className="col-span-5 space-y-3">
            {/* 1. Segment Rules */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Filter size={12} className="text-emerald-400" />Segment Rules <Tip text="Filter users by score, decile, or any feature. Rules combine with AND/OR logic." /></h4>
                <button onClick={() => addRule("rules")} className="flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20"><Plus size={10} />Add Rule</button>
              </div>
              {rules.length === 0 && <div className="text-[12px] text-zinc-500 py-2">No rules — all scored users included. Click &quot;Add Rule&quot; to filter.</div>}
              {rules.map((r) => <RuleRow key={r.id} rule={r} target="rules" />)}
            </div>

            {/* Feature Store Filters */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Layers size={12} className="text-cyan-400" />Feature Store Filters <Tip text="Additional filters on raw feature values. Narrows segment independently from score rules." /></h4>
                <button onClick={() => addRule("featureFilters")} className="flex items-center gap-1 px-2 py-1 text-[11px] text-cyan-400 bg-cyan-500/10 rounded-lg hover:bg-cyan-500/20"><Plus size={10} />Add Filter</button>
              </div>
              {featureFilters.length === 0 && <div className="text-[12px] text-zinc-500 py-2">No feature filters.</div>}
              {featureFilters.map((r) => <RuleRow key={r.id} rule={r} target="featureFilters" />)}
            </div>

            {/* 2. Decision Logic */}
            <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Brain size={12} className="text-purple-400" />Decision Logic <Tip text="Choose how to combine model outputs. Filter = threshold gates. Composite = weighted blend producing a unified score. Policy = if/else decision tree assigning actions per user." /></h4>
              {/* Mode selector */}
              <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                {(["filter", "composite", "policy"] as const).map((m) => (
                  <button key={m} onClick={() => setCompositionMode(m)}
                    className={`flex-1 px-2 py-1.5 rounded text-[12px] font-medium transition-all ${compositionMode === m ? "bg-purple-600/20 text-purple-400 border border-purple-500/30" : "text-zinc-500 hover:text-zinc-300"}`}>
                    {m === "filter" ? "Filter" : m === "composite" ? "Composite" : "Policy"}
                  </button>
                ))}
              </div>

              {/* Filter mode */}
              {compositionMode === "filter" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-zinc-400">Score threshold filters</span>
                    <button onClick={addModel} className="flex items-center gap-1 px-2 py-1 text-[11px] text-purple-400 bg-purple-500/10 rounded-lg hover:bg-purple-500/20"><Plus size={10} />Add</button>
                  </div>
                  {models.length === 0 && <div className="text-[12px] text-zinc-500">No threshold filters.</div>}
                  {models.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
                      <select value={m.scoreField} onChange={(e) => setModels((prev) => prev.map((mm, i) => i === idx ? { ...mm, scoreField: e.target.value } : mm))}
                        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-emerald-400 flex-1">
                        {SCORE_FIELDS.map((sf) => <option key={sf.value} value={sf.value}>{sf.label}</option>)}
                      </select>
                      <select value={m.thresholdOperator ?? ""} onChange={(e) => setModels((prev) => prev.map((mm, i) => i === idx ? { ...mm, thresholdOperator: (e.target.value || undefined) as typeof m.thresholdOperator } : mm))}
                        className="bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-[12px] text-amber-400 w-14 font-mono">
                        <option value="">—</option><option value=">=">≥</option><option value="<=">≤</option><option value=">">{">"}</option><option value="<">{"<"}</option>
                      </select>
                      <input type="number" value={m.threshold ?? ""} onChange={(e) => setModels((prev) => prev.map((mm, i) => i === idx ? { ...mm, threshold: e.target.value ? Number(e.target.value) : undefined } : mm))}
                        placeholder="val" className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono w-20 focus:outline-none focus:border-emerald-500" />
                      <button onClick={() => setModels((prev) => prev.filter((_, i) => i !== idx))} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Composite mode */}
              {compositionMode === "composite" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-zinc-400">Weighted formula → <code className="text-purple-400">composite_score</code></span>
                    <div className="flex items-center gap-1">
                      <select value={compositeSpec.outputScale} onChange={(e) => setCompositeSpec((prev) => ({ ...prev, outputScale: e.target.value as "0_1" | "0_100" }))}
                        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[11px] text-zinc-300 w-20">
                        <option value="0_100">0–100</option><option value="0_1">0–1</option>
                      </select>
                      <button onClick={addCompositeInput} className="flex items-center gap-1 px-2 py-1 text-[11px] text-purple-400 bg-purple-500/10 rounded-lg hover:bg-purple-500/20"><Plus size={10} />Add</button>
                    </div>
                  </div>
                  {compositeSpec.inputs.map((inp, idx) => (
                    <div key={inp.id} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
                      <select value={inp.scoreField} onChange={(e) => setCompositeSpec((prev) => ({ ...prev, inputs: prev.inputs.map((ci, i) => i === idx ? { ...ci, scoreField: e.target.value } : ci) }))}
                        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-zinc-200 flex-1">
                        {SCORE_FIELDS.map((sf) => <option key={sf.value} value={sf.value}>{sf.label}</option>)}
                      </select>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-zinc-500">w:</span>
                        <input type="number" step="0.1" value={inp.weight} onChange={(e) => setCompositeSpec((prev) => ({ ...prev, inputs: prev.inputs.map((ci, i) => i === idx ? { ...ci, weight: Number(e.target.value) } : ci) }))}
                          className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-[12px] text-amber-400 font-mono w-14 focus:outline-none focus:border-emerald-500" />
                      </div>
                      <select value={inp.normalize} onChange={(e) => setCompositeSpec((prev) => ({ ...prev, inputs: prev.inputs.map((ci, i) => i === idx ? { ...ci, normalize: e.target.value as NormalizeMethod } : ci) }))}
                        className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-[11px] text-zinc-300 w-24">
                        <option value="none">None</option><option value="minmax">Min-Max</option><option value="zscore">Z-Score</option><option value="percentile">Percentile</option>
                      </select>
                      <button onClick={() => setCompositeSpec((prev) => ({ ...prev, inputs: prev.inputs.filter((_, i) => i !== idx) }))} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  {compositeStats && (
                    <div className="flex gap-3 text-[11px] bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
                      <span className="text-zinc-500">Preview:</span>
                      <span className="text-zinc-300">Mean <strong className="text-purple-400">{compositeStats.mean}</strong></span>
                      <span className="text-zinc-300">P50 <strong className="text-purple-400">{compositeStats.p50}</strong></span>
                      <span className="text-zinc-300">P90 <strong className="text-purple-400">{compositeStats.p90}</strong></span>
                    </div>
                  )}
                  {/* Budget constraint */}
                  <div className="border-t border-zinc-700 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1"><DollarSign size={10} />Budget Constraint <Tip text="Select top users by composite_score until budget is exhausted." /></span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${budgetEnabled ? "bg-emerald-600" : "bg-zinc-700"}`} onClick={() => setBudgetEnabled(!budgetEnabled)}>
                        <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${budgetEnabled ? "left-[17px]" : "left-0.5"}`} />
                      </div>
                    </div>
                    {budgetEnabled && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <input type="number" value={budgetTotal} onChange={(e) => setBudgetTotal(Number(e.target.value))}
                          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono w-24 focus:outline-none focus:border-emerald-500" />
                        <span className="text-[11px] text-zinc-500">using</span>
                        <select value={budgetCostField} onChange={(e) => setBudgetCostField(e.target.value)}
                          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-[11px] text-zinc-300">
                          <option value="revenue_d7">Revenue D7</option><option value="1">$1/user (flat)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Policy mode */}
              {compositionMode === "policy" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-zinc-400">If/Else blocks → per-user <code className="text-purple-400">decision_action</code></span>
                    <button onClick={addPolicyBlock} className="flex items-center gap-1 px-2 py-1 text-[11px] text-purple-400 bg-purple-500/10 rounded-lg hover:bg-purple-500/20"><Plus size={10} />Add Block</button>
                  </div>
                  {policyBlocks.map((block, bi) => (
                    <div key={block.id} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-400">{bi === 0 ? "IF" : "ELSE IF"}</span>
                        <button onClick={() => setPolicyBlocks((prev) => prev.filter((_, i) => i !== bi))} className="text-zinc-500 hover:text-red-400"><Trash2 size={11} /></button>
                      </div>
                      {block.conditions.map((cond) => (
                        <div key={cond.id} className="flex items-center gap-1.5 text-[11px]">
                          <select value={cond.field} onChange={(e) => setPolicyBlocks((prev) => prev.map((b, i) => i === bi ? { ...b, conditions: b.conditions.map((c) => c.id === cond.id ? { ...c, field: e.target.value } : c) } : b))}
                            className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-zinc-200 flex-1">
                            {AVAILABLE_RULE_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                          <select value={cond.operator} onChange={(e) => setPolicyBlocks((prev) => prev.map((b, i) => i === bi ? { ...b, conditions: b.conditions.map((c) => c.id === cond.id ? { ...c, operator: e.target.value as SegmentRule["operator"] } : c) } : b))}
                            className="bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-emerald-400 font-mono w-12">
                            {[">=", "<=", ">", "<", "==", "!="].map((op) => <option key={op} value={op}>{op}</option>)}
                          </select>
                          <input type="text" value={String(cond.value)} onChange={(e) => {
                            const v = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
                            setPolicyBlocks((prev) => prev.map((b, i) => i === bi ? { ...b, conditions: b.conditions.map((c) => c.id === cond.id ? { ...c, value: v } : c) } : b));
                          }} className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-zinc-200 font-mono w-16 focus:outline-none focus:border-emerald-500" />
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500">→ Action:</span>
                        <input type="text" value={block.action} onChange={(e) => setPolicyBlocks((prev) => prev.map((b, i) => i === bi ? { ...b, action: e.target.value } : b))}
                          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-[11px] text-cyan-400 flex-1 focus:outline-none focus:border-emerald-500" />
                        <span className="text-[10px] text-zinc-500">Reason:</span>
                        <input type="text" value={block.reason} onChange={(e) => setPolicyBlocks((prev) => prev.map((b, i) => i === bi ? { ...b, reason: e.target.value } : b))}
                          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-[11px] text-zinc-300 w-28 focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                  ))}
                  <div className="text-[11px] text-zinc-600 italic">ELSE → action = DEFAULT, reason = no_match</div>
                  {Object.keys(policyActionCounts).length > 0 && (
                    <div className="flex gap-2 flex-wrap text-[11px]">
                      {Object.entries(policyActionCounts).map(([a, c]) => (
                        <span key={a} className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300"><strong className="text-cyan-400">{a}</strong>: {c}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Action & Activation */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Zap size={12} className="text-amber-400" />Action & Activation</h4>
              {compositionMode === "policy" ? (
                <div className="text-[12px] text-zinc-400">Action routing: <strong className="text-purple-400">per-user</strong> (from policy blocks above)</div>
              ) : (
                <select value={recommendedAction} onChange={(e) => setRecommendedAction(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:border-emerald-500">
                  <option value="EXPORT_TO_META">Export to Meta (Lookalike / VBO)</option>
                  <option value="EXPORT_TO_GOOGLE">Export to Google Ads</option>
                  <option value="EXPORT_TO_TIKTOK">Export to TikTok</option>
                  <option value="SEND_PUSH">Send Push Notification (CleverTap)</option>
                  <option value="SHOW_OFFER">Show In-App Offer</option>
                  <option value="VIP_ONBOARD">VIP Onboarding Flow</option>
                  <option value="CHURN_INTERVENTION">Churn Intervention Package</option>
                  <option value="CUSTOM">Custom Action</option>
                </select>
              )}
              <input type="text" placeholder="Description (e.g. 'Top 30% pLTV for Meta VBO campaign')" value={segmentDesc} onChange={(e) => setSegmentDesc(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[12px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500" />
              {/* Quick holdout toggle */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-500 flex items-center gap-1"><Split size={10} />A/B Holdout <Tip text="Enable a holdout group to measure incremental impact. Configure details in the Activation tab." /></span>
                <div className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${holdoutEnabled ? "bg-emerald-600" : "bg-zinc-700"}`} onClick={() => setHoldoutEnabled(!holdoutEnabled)}>
                  <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${holdoutEnabled ? "left-[17px]" : "left-0.5"}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Live preview + Impact */}
          <div className="col-span-7 space-y-3">
            {/* Segment Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><Users size={12} className="text-emerald-400" />Segment Preview</h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{profile.segmentSize.toLocaleString()}</div>
                  <div className="text-[11px] text-zinc-500">Users Matched</div>
                  <div className="text-[10px] text-zinc-600">{allRows.length > 0 ? fmt(profile.segmentSize / allRows.length * 100) : 0}% of total</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-center">
                  <div className="text-2xl font-bold text-blue-400">${profile.avgScore}</div>
                  <div className="text-[11px] text-zinc-500">Avg Score</div>
                  <div className="text-[10px] text-zinc-600">Median: ${profile.medianScore}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-center">
                  <div className="text-2xl font-bold text-purple-400">${profile.scorePercentiles.p90}</div>
                  <div className="text-[11px] text-zinc-500">P90 Score</div>
                  <div className="text-[10px] text-zinc-600">P99: ${profile.scorePercentiles.p99}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-center">
                  <div className="text-2xl font-bold text-amber-400">{compositionMode === "filter" ? models.length : compositionMode === "composite" ? compositeSpec.inputs.length : policyBlocks.length}</div>
                  <div className="text-[11px] text-zinc-500">{compositionMode === "policy" ? "Policy Blocks" : compositionMode === "composite" ? "Composite Inputs" : "Score Filters"}</div>
                  <div className="text-[10px] text-zinc-600">{rules.length + featureFilters.length} rules</div>
                </div>
              </div>
            </div>

            {/* Score distribution mini chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-zinc-300 mb-2">Score Distribution</h4>
              {profile.scoreDistribution.length > 0 ? (
                <div className="flex items-end gap-1" style={{ height: 96 }}>
                  {profile.scoreDistribution.map((b, i) => {
                    const maxCount = Math.max(...profile.scoreDistribution.map((d) => d.count), 1);
                    const barH = Math.max(2, (b.count / maxCount) * 80);
                    return (
                      <div key={i} className="flex-1 group relative flex flex-col justify-end items-center" style={{ height: 96 }}>
                        <div className="w-full bg-emerald-500/60 rounded-t transition-all hover:bg-emerald-400/80" style={{ height: barH }} />
                        <div className="text-[8px] text-zinc-600 mt-0.5 truncate w-full text-center leading-none" style={{ height: 14 }}>{b.bin}</div>
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-zinc-700 text-zinc-200 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">{b.count} users</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[12px] text-zinc-500 text-center py-4">{filteredRows.length > 0 ? `${filteredRows.length} users but no numeric pltv_pred found` : "No data to display"}</div>
              )}
            </div>

            {/* Suggested cuts */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-zinc-300 mb-2">Suggested Cuts</h4>
              <div className="grid grid-cols-4 gap-2">
                {profile.suggestedCuts.map((cut) => (
                  <button key={cut.label} onClick={() => { setRules([{ id: nextRuleId(), field: "pltv_pred", operator: ">=", value: fmt(cut.threshold), conjunction: "AND" }]); }}
                    className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2 text-left hover:border-emerald-500/30 transition-all">
                    <div className="text-[12px] font-semibold text-zinc-200">{cut.label}</div>
                    <div className="text-[11px] text-zinc-500">≥ ${fmt(cut.threshold)} · {cut.count} users</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Impact Simulation */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><BarChart3 size={12} className="text-purple-400" />Impact Simulation</h4>
                <button onClick={saveBaseline} className="flex items-center gap-1 px-2 py-1 text-[11px] text-purple-400 bg-purple-500/10 rounded-lg hover:bg-purple-500/20">
                  <Save size={10} />{baselineSnapshot ? "Update" : "Save"} Baseline
                </button>
              </div>
              {baselineSnapshot && impactDelta ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Size Δ", val: impactDelta.sizeDelta, sub: `${baselineSnapshot.size} → ${impactDelta.currentSize}`, prefix: "" },
                    { label: "Avg Score Δ", val: impactDelta.scoreDelta, sub: `$${baselineSnapshot.avgScore} → $${impactDelta.currentAvgScore}`, prefix: "$" },
                    { label: "Avg Revenue Δ", val: impactDelta.revDelta, sub: `$${baselineSnapshot.avgRev} → $${impactDelta.currentAvgRev}`, prefix: "$" },
                  ].map((d) => (
                    <div key={d.label} className="bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
                      <div className="text-[11px] text-zinc-500">{d.label}</div>
                      <div className={`text-base font-bold font-mono ${d.val > 0 ? "text-green-400" : d.val < 0 ? "text-red-400" : "text-zinc-400"}`}>{d.val > 0 ? "+" : ""}{d.prefix}{d.val}</div>
                      <div className="text-[10px] text-zinc-600">{d.sub}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-[12px] text-zinc-500 py-2">Click &quot;Save Baseline&quot; to snapshot, then adjust rules to see deltas.</div>}
            </div>

            {/* Version lineage */}
            {versions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><GitBranch size={12} className="text-amber-400" />Segment History ({versions.length})</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-700 text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold font-mono">v{v.version}</span>
                        <span className="text-zinc-300">{v.name}</span>
                        <span className="text-zinc-500">— {v.note}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                        <span>{v.userCount} users</span>
                        <span>${v.avgScore} avg</span>
                        <button onClick={() => {
                          setRules([...v.definition.rules]); setFeatureFilters([...v.definition.featureFilters]); setModels([...v.definition.models]); setSegmentName(v.name); setRecommendedAction(v.definition.recommendedAction);
                          if (v.definition.compositionMode) setCompositionMode(v.definition.compositionMode);
                          if (v.definition.compositeSpec) setCompositeSpec(v.definition.compositeSpec);
                          if (v.definition.policyBlocks) setPolicyBlocks(v.definition.policyBlocks);
                        }} className="text-cyan-400 hover:text-cyan-300"><RefreshCw size={10} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Data Lab                                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "datalab" && (
        <div className="space-y-3">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search user_id..." value={dlSearch} onChange={(e) => { setDlSearch(e.target.value); setDlPage(0); }}
                className="w-full pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-[12px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              {(["all", "top", "random", "stratified"] as const).map((mode) => (
                <button key={mode} onClick={() => { setDlSampleMode(mode); setDlPage(0); }}
                  className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-all ${dlSampleMode === mode ? "bg-emerald-600/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                  {mode === "all" ? "All" : mode === "top" ? "Top Score" : mode === "random" ? "Random" : "Stratified"}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-zinc-500 ml-auto">
              {dataLabRows.length} rows · Page {dlPage + 1}/{Math.max(1, Math.ceil(dataLabRows.length / DL_PAGE_SIZE))}
            </div>
          </div>

          {/* Column visibility toggle */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-zinc-500 mr-1">Columns:</span>
            {AVAILABLE_RULE_FIELDS.map((f) => (
              <button key={f.value} onClick={() => setDlVisibleCols((prev) =>
                prev.includes(f.value) ? prev.filter((c) => c !== f.value) : [...prev, f.value]
              )}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all ${dlVisibleCols.includes(f.value) ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/30">
                    <th className="px-3 py-2 text-left text-zinc-500 font-medium">#</th>
                    {["game_user_id", ...dlVisibleCols.filter((c) => c !== "game_user_id")].map((col) => (
                      <th key={col} className="px-3 py-2 text-left text-zinc-500 font-medium cursor-pointer hover:text-zinc-300 select-none"
                        onClick={() => setDlSort((prev) => ({ col, dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc" }))}>
                        <span className="flex items-center gap-1">
                          {AVAILABLE_RULE_FIELDS.find((f) => f.value === col)?.label ?? col}
                          {dlSort.col === col && <ArrowUpDown size={10} className="text-emerald-400" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {dataLabRows.slice(dlPage * DL_PAGE_SIZE, (dlPage + 1) * DL_PAGE_SIZE).map((row, i) => (
                    <tr key={String(row.game_user_id)} className="hover:bg-zinc-800/30">
                      <td className="px-3 py-1.5 text-zinc-600 font-mono">{dlPage * DL_PAGE_SIZE + i + 1}</td>
                      {["game_user_id", ...dlVisibleCols.filter((c) => c !== "game_user_id")].map((col) => {
                        const val = row[col];
                        const isNumeric = typeof val === "number";
                        return (
                          <td key={col} className={`px-3 py-1.5 font-mono ${isNumeric ? "text-right" : "text-left"} ${
                            col === "pltv_pred" || col === "composite_score" ? "text-emerald-400 font-semibold" :
                            col === "churn_risk" ? "text-amber-400" :
                            col === "decision_action" ? "text-cyan-400 font-semibold" :
                            col === "reason_code" ? "text-purple-400" :
                            col === "game_user_id" ? "text-cyan-400" : "text-zinc-300"
                          }`}>
                            {isNumeric ? fmt(val as number) : String(val ?? "")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-800/20">
              <button onClick={() => setDlPage((p) => Math.max(0, p - 1))} disabled={dlPage === 0}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 disabled:text-zinc-600">← Prev</button>
              <span className="text-[11px] text-zinc-500">
                Showing {dlPage * DL_PAGE_SIZE + 1}–{Math.min((dlPage + 1) * DL_PAGE_SIZE, dataLabRows.length)} of {dataLabRows.length}
              </span>
              <button onClick={() => setDlPage((p) => Math.min(Math.ceil(dataLabRows.length / DL_PAGE_SIZE) - 1, p + 1))} disabled={(dlPage + 1) * DL_PAGE_SIZE >= dataLabRows.length}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 disabled:text-zinc-600">Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Profile                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-12 gap-3">
          {/* Left: Stats */}
          <div className="col-span-5 space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Sigma size={12} className="text-emerald-400" />Segment Statistics</h4>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
                  <div className="text-zinc-500">Segment Size</div>
                  <div className="text-lg font-bold text-emerald-400">{profile.segmentSize.toLocaleString()}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 border border-zinc-700">
                  <div className="text-zinc-500">Data Freshness</div>
                  <div className="text-sm font-semibold text-zinc-300">{profile.dataFreshness}</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Score Percentiles</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.entries(profile.scorePercentiles) as [string, number][]).map(([k, v]) => (
                    <div key={k} className="bg-zinc-800/50 rounded-lg p-2 border border-zinc-700 text-center">
                      <div className="text-[10px] text-zinc-500 uppercase">{k}</div>
                      <div className="text-sm font-bold text-blue-400 font-mono">${v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Feature distributions */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Hash size={12} className="text-cyan-400" />Feature Distributions</h4>
              {Object.entries(profile.featureDistributions).map(([feat, dist]) => (
                <div key={feat} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 space-y-1">
                  <div className="text-[12px] font-semibold text-zinc-200">{AVAILABLE_RULE_FIELDS.find((f) => f.value === feat)?.label ?? feat}</div>
                  <div className="grid grid-cols-5 gap-1 text-[10px]">
                    <div><span className="text-zinc-500">Mean</span><div className="text-zinc-300 font-mono">{dist.mean}</div></div>
                    <div><span className="text-zinc-500">Median</span><div className="text-zinc-300 font-mono">{dist.median}</div></div>
                    <div><span className="text-zinc-500">Min</span><div className="text-zinc-300 font-mono">{dist.min}</div></div>
                    <div><span className="text-zinc-500">Max</span><div className="text-zinc-300 font-mono">{dist.max}</div></div>
                    <div><span className="text-zinc-500">Std</span><div className="text-zinc-300 font-mono">{dist.std}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Distribution chart + suggested cuts */}
          <div className="col-span-7 space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-zinc-300 mb-3">Score Distribution Histogram</h4>
              {profile.scoreDistribution.length > 0 ? (
                <div className="flex items-end gap-1" style={{ height: 176 }}>
                  {profile.scoreDistribution.map((b, i) => {
                    const maxCount = Math.max(...profile.scoreDistribution.map((d) => d.count), 1);
                    const barH = Math.max(3, (b.count / maxCount) * 150);
                    return (
                      <div key={i} className="flex-1 group relative flex flex-col justify-end items-center" style={{ height: 176 }}>
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-zinc-700 text-zinc-200 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          {b.bin}: {b.count} users
                        </div>
                        <div className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t transition-all hover:from-emerald-500 hover:to-emerald-300" style={{ height: barH }} />
                        <div className="text-[8px] text-zinc-600 mt-1 -rotate-45 origin-left whitespace-nowrap" style={{ height: 20 }}>{b.bin}</div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="text-[12px] text-zinc-500 text-center py-8">{filteredRows.length > 0 ? "Users found but no numeric scores to bin" : "Add rules or score users to see distribution"}</div>}
            </div>

            {/* Decile breakdown */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-zinc-300 mb-2">Decile Breakdown</h4>
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-zinc-800">
                  <th className="px-2 py-1.5 text-left text-zinc-500">Decile</th>
                  <th className="px-2 py-1.5 text-right text-zinc-500">Users</th>
                  <th className="px-2 py-1.5 text-right text-zinc-500">Avg Score</th>
                  <th className="px-2 py-1.5 text-right text-zinc-500">Avg Actual</th>
                  <th className="px-2 py-1.5 text-right text-zinc-500">% of Segment</th>
                  <th className="px-2 py-1.5 text-left text-zinc-500">Bar</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => {
                    const users = filteredRows.filter((r) => Number(r.pltv_decile) === d);
                    const avgScore = users.length ? fmt(users.reduce((s, u) => s + Number(u.pltv_pred), 0) / users.length) : 0;
                    const avgActual = users.length ? fmt(users.reduce((s, u) => s + Number(u.actual_ltv_d60), 0) / users.length) : 0;
                    const pct = filteredRows.length > 0 ? fmt(users.length / filteredRows.length * 100) : 0;
                    return (
                      <tr key={d} className="hover:bg-zinc-800/30">
                        <td className="px-2 py-1.5 font-mono font-bold text-zinc-200">D{d}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{users.length}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-blue-400">${avgScore}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-emerald-400">${avgActual}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-400">{pct}%</td>
                        <td className="px-2 py-1.5"><div className="h-2 rounded-full bg-emerald-500/40" style={{ width: `${Math.min(100, pct * 2)}%` }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Activation Contract                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "activation" && (
        <div className="grid grid-cols-12 gap-3">
          {/* Left: Config */}
          <div className="col-span-5 space-y-3">
            {/* A/B Holdout */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Split size={12} className="text-blue-400" />A/B Holdout</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[11px] text-zinc-400">{holdoutEnabled ? "Enabled" : "Disabled"}</span>
                  <div className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${holdoutEnabled ? "bg-emerald-600" : "bg-zinc-700"}`} onClick={() => setHoldoutEnabled(!holdoutEnabled)}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${holdoutEnabled ? "left-[18px]" : "left-0.5"}`} />
                  </div>
                </label>
              </div>

              {holdoutEnabled && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[12px]"><span className="text-zinc-400">Holdout Fraction</span><span className="text-emerald-400 font-mono">{(holdoutFraction * 100).toFixed(0)}%</span></div>
                    <input type="range" min={0.05} max={0.5} step={0.05} value={holdoutFraction} onChange={(e) => setHoldoutFraction(Number(e.target.value))} className="w-full accent-emerald-500 h-1.5" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                      <div className="text-emerald-400 font-semibold">Treatment</div>
                      <div className="text-lg font-bold text-emerald-300">{abAssignment.treatment.length}</div>
                      <div className="text-[10px] text-zinc-500">{((1 - holdoutFraction) * 100).toFixed(0)}%</div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
                      <div className="text-blue-400 font-semibold">Holdout</div>
                      <div className="text-lg font-bold text-blue-300">{abAssignment.holdout.length}</div>
                      <div className="text-[10px] text-zinc-500">{(holdoutFraction * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500 mb-1 block">Salt</label>
                      <input type="text" value={holdoutSalt} onChange={(e) => setHoldoutSalt(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-200 font-mono focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500 mb-1 block">Cohort Mode</label>
                      <select value={cohortMode} onChange={(e) => setCohortMode(e.target.value as CohortMode)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-emerald-500">
                        <option value="ROLLING">Rolling</option>
                        <option value="FROZEN">Frozen</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 mb-1 block">Export Mode</label>
                    <select value={exportMode} onChange={(e) => setExportMode(e.target.value as typeof exportMode)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-emerald-500">
                      <option value="treatment_only">Treatment Only</option>
                      <option value="both">Both Groups</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Human-readable summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Eye size={12} className="text-amber-400" />Summary</h4>
              <div className="text-[12px] text-zinc-300 space-y-1 leading-relaxed">
                <p>Segment <strong className="text-emerald-400">{segmentName}</strong> targets <strong>{filteredRows.length}</strong> users.</p>
                {rules.length > 0 && <p>Rules: {rules.map((r) => `${r.field} ${r.operator} ${r.value}`).join(` ${rules[1]?.conjunction ?? "AND"} `)}</p>}
                <p>Decision Logic: <strong className="text-purple-400">{compositionMode}</strong>
                  {compositionMode === "filter" && models.length > 0 && <> ({models.length} threshold{models.length > 1 ? "s" : ""})</>}
                  {compositionMode === "composite" && <> ({compositeSpec.inputs.length} input{compositeSpec.inputs.length > 1 ? "s" : ""}, scale {compositeSpec.outputScale})</>}
                  {compositionMode === "policy" && <> ({policyBlocks.length} block{policyBlocks.length > 1 ? "s" : ""})</>}
                </p>
                <p>Action: <strong className="text-cyan-400">{compositionMode === "policy" ? "per-user (policy)" : recommendedAction}</strong></p>
                {holdoutEnabled && <p>Holdout: <strong className="text-blue-400">{(holdoutFraction * 100).toFixed(0)}%</strong> ({cohortMode} cohort, salt: <code className="text-zinc-400">{holdoutSalt}</code>)</p>}
                {useDemoModels && <p className="text-amber-400">⚡ Using primitive demo models</p>}
              </div>
            </div>
          </div>

          {/* Right: JSON preview */}
          <div className="col-span-7 space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><FileJson size={12} className="text-cyan-400" />Activation Contract JSON</h4>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigator.clipboard.writeText(JSON.stringify(generateActivationContract(), null, 2))}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-cyan-400 bg-cyan-500/10 rounded-lg hover:bg-cyan-500/20"><Copy size={10} />Copy</button>
                  <button onClick={() => {
                    const blob = new Blob([JSON.stringify(generateActivationContract(), null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `activation_contract_${segmentName.replace(/\s+/g, "_")}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20"><Download size={10} />Download</button>
                </div>
              </div>
              <pre className="bg-zinc-800 rounded-lg p-4 text-[11px] text-zinc-300 font-mono border border-zinc-700 overflow-auto max-h-[500px] whitespace-pre">
                {JSON.stringify(generateActivationContract(), null, 2)}
              </pre>
            </div>

            {/* Per-user row format */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-zinc-300 mb-2">Per-User Row Format (sample)</h4>
              <pre className="bg-zinc-800 rounded-lg p-4 text-[11px] text-zinc-300 font-mono border border-zinc-700 overflow-auto whitespace-pre">
{JSON.stringify({
  user_id: filteredRows[0] ? String(filteredRows[0].game_user_id) : "player_042",
  pltv_pred: filteredRows[0] ? fmt(Number(filteredRows[0].pltv_pred)) : 127.50,
  pltv_decile: filteredRows[0] ? Number(filteredRows[0].pltv_decile) : 9,
  composite_score: compositionMode === "composite" && filteredRows[0] ? (filteredRows[0] as Record<string, unknown>).composite_score ?? null : null,
  decision_action: compositionMode === "policy" && filteredRows[0] ? (filteredRows[0] as Record<string, unknown>).decision_action ?? null : null,
  reason_code: compositionMode === "policy" && filteredRows[0] ? (filteredRows[0] as Record<string, unknown>).reason_code ?? null : null,
  segment: segmentName,
  action: compositionMode === "policy" ? "per_user" : recommendedAction,
  composition_mode: compositionMode,
  decision_version: `dv_${versions.length + 1}`,
  ab_group: holdoutEnabled ? "treatment" : "all",
  demo_mode: useDemoModels,
}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB: Monitoring (A/B)                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === "monitoring" && (
        <div className="space-y-3">
          {/* Monitor tip overlay */}
          {!monitorTipDismissed && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-start gap-3">
              <HelpCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-[12px] text-zinc-300 leading-relaxed">
                <strong className="text-blue-400">How A/B Monitoring Works:</strong> Enable a holdout in the Activation tab, then start an experiment here. The holdout group receives no treatment. KPI lift is measured as the difference between treatment and holdout groups over your chosen time window. A confidence ≥ 95% indicates statistical significance.
              </div>
              <button onClick={dismissMonitorTip} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X size={12} /></button>
            </div>
          )}

          {/* Experiment Setup */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Split size={12} className="text-blue-400" />Experiment Setup</h4>
              {!holdoutEnabled && (
                <div className="text-[11px] text-amber-400 flex items-center gap-1"><AlertTriangle size={10} />Enable holdout in Activation tab first</div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Primary KPI</label>
                <select value={primaryKpi} onChange={(e) => setPrimaryKpi(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-emerald-500">
                  {KPI_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Guardrail KPIs</label>
                <div className="flex flex-wrap gap-1">
                  {KPI_OPTIONS.filter((k) => k !== primaryKpi).slice(0, 4).map((k) => (
                    <button key={k} onClick={() => setGuardrailKpis((prev) => prev.includes(k) ? prev.filter((g) => g !== k) : [...prev, k])}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${guardrailKpis.includes(k) ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 mb-1 block">Time Window (days)</label>
                <input type="number" min={7} max={90} value={monitorTimeWindow} onChange={(e) => setMonitorTimeWindow(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-200 font-mono focus:outline-none focus:border-emerald-500" />
              </div>
            </div>

            <button onClick={startExperiment} disabled={!holdoutEnabled}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600">
              <Play size={12} /> {experiments.length ? "Start New Experiment" : "Start Experiment"}
            </button>
          </div>

          {/* Results — only if experiment is running */}
          {experimentResults && (
            <>
              {/* KPI Scoreboard */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><BarChart3 size={12} className="text-emerald-400" />KPI Scoreboard</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-zinc-500 mb-1">{primaryKpi}</div>
                    <div className="text-2xl font-bold text-emerald-400">+{experimentResults.primaryKpiLift}%</div>
                    <div className="text-[11px] text-zinc-400">Lift (Treatment vs Holdout)</div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-zinc-500 mb-1">Confidence</div>
                    <div className={`text-2xl font-bold ${experimentResults.primaryKpiConfidence >= 95 ? "text-green-400" : experimentResults.primaryKpiConfidence >= 80 ? "text-amber-400" : "text-red-400"}`}>
                      {experimentResults.primaryKpiConfidence}%
                    </div>
                    <div className="text-[11px] text-zinc-400">{experimentResults.primaryKpiConfidence >= 95 ? "Statistically Significant" : "Needs more data"}</div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-zinc-500 mb-1">Sample Size</div>
                    <div className="text-lg font-bold text-purple-400">{abAssignment.treatment.length + abAssignment.holdout.length}</div>
                    <div className="text-[11px] text-zinc-400">{abAssignment.treatment.length} T / {abAssignment.holdout.length} H</div>
                  </div>
                </div>
              </div>

              {/* Trend Chart (text-based since no recharts in this file) */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-3">Cumulative Lift Over Time</h4>
                <div className="flex items-end gap-0.5" style={{ height: 128 }}>
                  {experimentResults.kpiTrend.map((dp, i) => {
                    const maxLift = Math.max(...experimentResults.kpiTrend.map((d) => d.cumulativeLift), 1);
                    const barH = Math.max(2, (dp.cumulativeLift / maxLift) * 120);
                    return (
                      <div key={i} className="flex-1 group relative flex flex-col justify-end items-center" style={{ height: 128 }}>
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-zinc-700 text-zinc-200 text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          Day {dp.day}: +{dp.cumulativeLift}% lift
                        </div>
                        <div className="w-full bg-gradient-to-t from-blue-600 to-emerald-400 rounded-t" style={{ height: barH }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>Day 1</span><span>Day {monitorTimeWindow}</span>
                </div>
              </div>

              {/* Diagnostics */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><Settings size={12} className="text-amber-400" />Diagnostics</h4>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "SRM Check", value: experimentResults.diagnostics.sampleRatioMismatch ? "FAIL" : "PASS", ok: !experimentResults.diagnostics.sampleRatioMismatch },
                    { label: "SRM p-value", value: experimentResults.diagnostics.srmPValue.toString(), ok: experimentResults.diagnostics.srmPValue > 0.05 },
                    { label: "Exposure Integrity", value: `${experimentResults.diagnostics.exposureIntegrity}%`, ok: experimentResults.diagnostics.exposureIntegrity > 95 },
                    { label: "Data Freshness", value: experimentResults.diagnostics.dataFreshness.slice(0, 10), ok: true },
                    { label: "Segment Drift", value: `${(experimentResults.diagnostics.segmentDrift * 100).toFixed(1)}%`, ok: experimentResults.diagnostics.segmentDrift < 0.05 },
                  ].map((d) => (
                    <div key={d.label} className={`rounded-lg p-2 border text-center ${d.ok ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                      <div className="text-[10px] text-zinc-500">{d.label}</div>
                      <div className={`text-sm font-bold font-mono ${d.ok ? "text-green-400" : "text-red-400"}`}>{d.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const seed = Date.now() % 10000;
                  const trend = generateMockKpiTrend(monitorTimeWindow, 0.08 + (seed % 100) / 1000);
                  setExperimentResults((prev) => prev ? { ...prev, kpiTrend: trend, primaryKpiLift: fmt(trend[trend.length - 1]?.cumulativeLift ?? 8), primaryKpiConfidence: fmt(Math.min(99, (prev.primaryKpiConfidence ?? 80) + (seed % 50) / 10)) } : prev);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20"><RefreshCw size={10} />Refresh Results</button>
                <button onClick={() => setExperiments((prev) => prev.map((e) => e.experimentId === activeExperimentId ? { ...e, status: "PAUSED" as ExperimentStatus } : e))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20"><Pause size={10} />Pause</button>
                <button onClick={() => {
                  setExperiments((prev) => prev.map((e) => e.experimentId === activeExperimentId ? { ...e, status: "ENDED" as ExperimentStatus } : e));
                  setActiveExperimentId(null);
                  setExperimentResults(null);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20"><Square size={10} />End Experiment</button>
                <button onClick={() => {
                  const rows = (exportMode === "both" ? filteredRows : abAssignment.treatment);
                  const csv = ["user_id,ab_group,pltv_pred,pltv_decile"].concat(
                    rows.map((r) => `${r.game_user_id},${holdoutEnabled && abAssignment.holdout.some((h) => h.game_user_id === r.game_user_id) ? "holdout" : "treatment"},${fmt(Number(r.pltv_pred))},${r.pltv_decile}`)
                  ).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "experiment_assignments.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 ml-auto"><Download size={10} />Export Assignments</button>
              </div>
            </>
          )}

          {/* Experiment history */}
          {experiments.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><History size={12} className="text-amber-400" />Experiment Log</h4>
              {experiments.map((exp) => (
                <div key={exp.experimentId} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2 border border-zinc-700 text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      exp.status === "RUNNING" ? "bg-green-500/20 text-green-400" :
                      exp.status === "PAUSED" ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-400"
                    }`}>{exp.status}</span>
                    <span className="text-zinc-300 font-mono">{exp.experimentId.slice(0, 12)}</span>
                    <span className="text-zinc-500">{exp.segmentName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span>{exp.treatmentSize}T / {exp.holdoutSize}H</span>
                    <span>{exp.primaryKpi}</span>
                    <span>{exp.cohortMode}</span>
                    <span>{new Date(exp.startTime).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!experimentResults && experiments.length === 0 && (
            <div className="space-y-3">
              {/* Quick-start guide */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Lightbulb size={14} className="text-amber-400" />How to Demo the Decision Data Lab</h4>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-1.5">
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5"><Target size={12} />1. Define a Segment</div>
                    <p className="text-zinc-400 leading-relaxed">Go to <strong className="text-zinc-300">Definition</strong> tab. Use &quot;Suggested Cuts&quot; (right side) to quick-select Top 20% users, or add custom rules like <code className="text-emerald-400">pltv_pred ≥ 50</code>. Watch the segment preview update live.</p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-1.5">
                    <div className="text-purple-400 font-bold flex items-center gap-1.5"><Brain size={12} />2. Choose Decision Logic</div>
                    <p className="text-zinc-400 leading-relaxed">In the <strong className="text-zinc-300">Decision Logic</strong> panel, try all 3 modes:
                      <strong className="text-zinc-300"> Filter</strong> = threshold gates,
                      <strong className="text-zinc-300"> Composite</strong> = weighted multi-score blend (adjust weights, see live stats),
                      <strong className="text-zinc-300"> Policy</strong> = if/else rules assigning per-user actions.</p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-1.5">
                    <div className="text-cyan-400 font-bold flex items-center gap-1.5"><Database size={12} />3. Inspect in Data Lab</div>
                    <p className="text-zinc-400 leading-relaxed">Switch to <strong className="text-zinc-300">Data Lab</strong> tab. See every user row with their scores, composite_score, and decision_action. Toggle columns, sort, search, and try different sample modes (Top Score, Stratified).</p>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-1.5">
                    <div className="text-blue-400 font-bold flex items-center gap-1.5"><FileJson size={12} />4. Export &amp; Monitor</div>
                    <p className="text-zinc-400 leading-relaxed">In <strong className="text-zinc-300">Activation</strong>, enable a 10% holdout and download the contract JSON. Then come back here to <strong className="text-zinc-300">Monitoring</strong> — pick a KPI, start an experiment, and watch the lift chart + diagnostics populate.</p>
                  </div>
                </div>
              </div>

              {/* Scenario walkthrough */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Sparkles size={14} className="text-purple-400" />Example Scenario: &quot;VIP Retention Campaign&quot;</h4>
                <div className="text-[12px] text-zinc-400 leading-relaxed space-y-2">
                  <p><strong className="text-zinc-300">Objective:</strong> Identify high-value users at churn risk and send them a personalized retention offer.</p>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 space-y-1">
                    <div className="text-[11px] font-mono text-zinc-500">Try this step by step:</div>
                    <p><span className="text-emerald-400">①</span> <strong>Definition</strong> → Add rule <code className="text-emerald-400">pltv_pred ≥ 80</code> + feature filter <code className="text-cyan-400">active_days_w7d &lt;= 3</code></p>
                    <p><span className="text-purple-400">②</span> <strong>Decision Logic</strong> → Switch to <strong>Policy</strong> mode → Add block: IF <code>churn_risk ≥ 0.7</code> → Action: <code className="text-cyan-400">SEND_RETENTION_OFFER</code></p>
                    <p><span className="text-blue-400">③</span> <strong>Activation</strong> → Enable 10% holdout → Download contract JSON</p>
                    <p><span className="text-amber-400">④</span> <strong>Monitoring</strong> → Select &quot;Revenue per User&quot; as primary KPI → Start Experiment → Click Refresh to simulate results</p>
                  </div>
                  <p className="text-zinc-500 italic">This demonstrates the full loop: segment → decide → activate → measure. The holdout group receives no offer, letting you measure true incremental impact.</p>
                </div>
              </div>

              {/* Quick action */}
              <div className="flex items-center gap-3">
                <button onClick={() => { setHoldoutEnabled(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[12px] font-semibold rounded-lg hover:bg-blue-600/30">
                  <Split size={12} />Enable Holdout &amp; Get Started
                </button>
                <span className="text-[11px] text-zinc-500">This enables a 10% holdout so you can start an experiment right away.</span>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
