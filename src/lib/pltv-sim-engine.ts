// ─── pLTV Simulation Engine ─────────────────────────────────────────────────
// Provides data parsing, feature building, model training (GBT/LR/RF/Dummy),
// offline evaluation, online activation simulation, and economic impact logic.

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SimPlayerRow {
  game_user_id: string;
  install_id: string;
  install_time: string;
  campaign_id: string;
  adset_id: string;
  creative_id: string;
  channel: string;
  country: string;
  os: string;
  device_model: string;
  device_tier: string;
  consent_tracking: boolean;
  consent_marketing: boolean;
}

export interface SimEventRow {
  game_user_id: string;
  event_time: string;
  event_name: string;
  session_id: string;
  params: string;
}

export interface SimPaymentRow {
  game_user_id: string;
  txn_time: string;
  amount_usd: number;
  product_sku: string;
  payment_channel: string;
  is_refund: boolean;
}

export interface SimUaCostRow {
  campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
}

export interface SimLabelRow {
  game_user_id: string;
  install_date: string;
  ua_cost: number;
  ltv_d3: number;
  ltv_d7: number;
  ltv_d30: number;
  ltv_d90: number;
  is_payer_by_d3: number;
  is_payer_by_d7: number;
  is_payer_by_d30: number;
  is_payer_by_d90: number;
  profit_d90: number;
  late_monetizer_flag: number;
  false_early_payer_flag: number;
  active_days_w7d: number;
  sessions_cnt_w7d: number;
  max_level_w7d: number;
}

export interface FeatureTemplateDef {
  id: string;
  label: string;
  requiresWindow: boolean;
  description: string;
  category: "session" | "monetization" | "engagement" | "progression" | "ua";
  leakageRisk?: string;
}

export interface FeatureMatrixRow {
  user_id: string;
  install_time: string;
  install_date: string;
  target_ltv30: number;
  target_ltv90: number;
  [key: string]: string | number;
}

export interface FeatureBuildConfig {
  selectedTemplates: string[];
  selectedWindows: number[];
  includeLeakageFeature: boolean;
  useEvents: boolean;
  usePayments: boolean;
  usePlayers: boolean;
  useUaCost: boolean;
}

export interface CorrelationEntry {
  row: string;
  col: string;
  value: number;
}

export type SplitStrategy = "random" | "time";
export type SimModelType = "gbt" | "linear" | "rf" | "dummy";
export type SimTarget = "ltv30" | "ltv90";

export interface CalibrationBucket {
  bucket: string;
  predicted: number;
  actual: number;
  count: number;
}

export interface LiftPoint {
  topPercent: number;
  k: number;
  lift: number;
  precision: number;
  recall: number;
  valueCaptured: number;
}

export interface PredictionRow {
  user_id: string;
  install_time: string;
  predicted: number;
  actual: number;
}

export interface TrainedModelResult {
  run_id: string;
  modelType: SimModelType;
  modelLabel: string;
  target: SimTarget;
  features: string[];
  splitStrategy: SplitStrategy;
  leakageEnabled: boolean;
  mae: number;
  rmse: number;
  r2: number;
  spearmanCorr: number;
  calibrationError: number;
  trainSize: number;
  testSize: number;
  featureImportance: { feature: string; importance: number }[];
  shapValues: { feature: string; meanAbsShap: number; direction: "positive" | "negative" | "mixed" }[];
  trainingLoss: number[];
  testPredictions: PredictionRow[];
  allPredictions: PredictionRow[];
  calibration: CalibrationBucket[];
  liftCurve: LiftPoint[];
  timestamp: number;
}

export interface ActivationConfig {
  cpi: number;
  revenueMultiplier: number;
  conversionNoise: number;
  deliveryRate: number;
}

export interface ActivationRun {
  run_id: string;
  model_label: string;
  topK: number;
  topKPercent: number;
  users_sent: number;
  users_delivered: number;
  cost: number;
  revenue_90d: number;
  roi: number;
  profit: number;
  revenueCurve: { day: number; revenue: number }[];
}

export interface EconomicImpactRow {
  topKPercent: number;
  k: number;
  cost: number;
  revenue: number;
  profit: number;
  roas: number;
  incrementalRevenue: number;
  upliftVsBaseline: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Templates
// ═══════════════════════════════════════════════════════════════════════════════

export const FEATURE_TEMPLATES: FeatureTemplateDef[] = [
  { id: "session_count", label: "session_count", requiresWindow: true, description: "Number of sessions within window", category: "session" },
  { id: "active_days", label: "active_days", requiresWindow: true, description: "Distinct active days within window", category: "session" },
  { id: "payment_sum", label: "payment_sum", requiresWindow: true, description: "Total payment amount within window", category: "monetization" },
  { id: "payment_count", label: "payment_count", requiresWindow: true, description: "Number of payments within window", category: "monetization" },
  { id: "battle_win_rate", label: "battle_win_rate", requiresWindow: true, description: "PvP win ratio within window", category: "engagement" },
  { id: "quest_complete_count", label: "quest_complete_count", requiresWindow: true, description: "Quest completions within window", category: "progression" },
  { id: "dungeon_clear_count", label: "dungeon_clear_count", requiresWindow: true, description: "Dungeon clears within window", category: "progression" },
  { id: "chat_count", label: "chat_count", requiresWindow: true, description: "Chat messages sent within window", category: "engagement" },
  { id: "guild_activity_count", label: "guild_activity_count", requiresWindow: true, description: "Guild activities within window", category: "engagement" },
  { id: "last_login_gap", label: "last_login_gap", requiresWindow: false, description: "Days between D7 and last login", category: "session" },
  { id: "payer_flag", label: "payer_flag", requiresWindow: false, description: "Paid at least once by D7", category: "monetization" },
  { id: "first_purchase_hours", label: "first_purchase_hours", requiresWindow: false, description: "Hours from install to first purchase", category: "monetization" },
  { id: "max_level", label: "max_level", requiresWindow: false, description: "Max level reached by D7", category: "progression" },
  { id: "ua_cost", label: "ua_cost", requiresWindow: false, description: "UA acquisition cost for this user", category: "ua" },
  { id: "device_tier", label: "device_tier", requiresWindow: false, description: "Device tier (0=low, 1=mid, 2=high)", category: "ua" },
  { id: "os_flag", label: "os_flag", requiresWindow: false, description: "iOS=1, Android=0", category: "ua" },
  // Leakage features (dangerous)
  { id: "future_payment_d8_30", label: "future_payment_d8_30", requiresWindow: false, description: "⚠️ LEAKAGE: Payments from D8–D30", category: "monetization", leakageRisk: "Uses future data beyond observation window" },
  { id: "ltv_d30_raw", label: "ltv_d30_raw", requiresWindow: false, description: "⚠️ LEAKAGE: Raw LTV D30 from labels", category: "monetization", leakageRisk: "Directly includes target-correlated future info" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════════

interface Rng { next: () => number; }

function makeRng(seed: number): Rng {
  let s = seed;
  return {
    next: () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; },
  };
}

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pearsonCorr(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  const ma = mean(a), mb = mean(b);
  let cov = 0, sa2 = 0, sb2 = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; sa2 += da * da; sb2 += db * db;
  }
  const denom = Math.sqrt(sa2 * sb2);
  return denom === 0 ? 0 : cov / denom;
}

function rankArray(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array(values.length).fill(0);
  for (let i = 0; i < idx.length; i++) r[idx[i].i] = i + 1;
  return r;
}

function spearmanCorr(a: number[], b: number[]): number {
  return pearsonCorr(rankArray(a), rankArray(b));
}

function parseEventParams(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function daysBetween(ts1: string, ts2: string): number {
  const a = new Date(ts1).getTime(), b = new Date(ts2).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  return (a - b) / 86400000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Data Parsers
// ═══════════════════════════════════════════════════════════════════════════════

export function parsePlayers(rows: Record<string, string>[]): SimPlayerRow[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id ?? "",
    install_id: r.install_id ?? "",
    install_time: r.install_time ?? "",
    campaign_id: r.campaign_id ?? "unknown",
    adset_id: r.adset_id ?? "unknown",
    creative_id: r.creative_id ?? "unknown",
    channel: r.channel ?? "unknown",
    country: r.country ?? "unknown",
    os: r.os ?? "unknown",
    device_model: r.device_model ?? "",
    device_tier: r.device_tier ?? "mid",
    consent_tracking: String(r.consent_tracking).toLowerCase() === "true",
    consent_marketing: String(r.consent_marketing).toLowerCase() === "true",
  }));
}

export function parseEvents(rows: Record<string, string>[]): SimEventRow[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id ?? "",
    event_time: r.event_time ?? "",
    event_name: r.event_name ?? "",
    session_id: r.session_id ?? "",
    params: r.params ?? "",
  }));
}

export function parsePayments(rows: Record<string, string>[]): SimPaymentRow[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id ?? "",
    txn_time: r.txn_time ?? "",
    amount_usd: Number(r.amount_usd) || 0,
    product_sku: r.product_sku ?? "",
    payment_channel: r.payment_channel ?? "",
    is_refund: String(r.is_refund).toLowerCase() === "true",
  }));
}

export function parseUaCosts(rows: Record<string, string>[]): SimUaCostRow[] {
  return rows.map((r) => ({
    campaign_id: r.campaign_id ?? "unknown",
    date: r.date ?? "",
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    installs: Number(r.installs) || 0,
  }));
}

export function parseLabels(rows: Record<string, string>[]): SimLabelRow[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id ?? "",
    install_date: r.install_date ?? "",
    ua_cost: Number(r.ua_cost) || 0,
    ltv_d3: Number(r.ltv_d3) || 0,
    ltv_d7: Number(r.ltv_d7) || 0,
    ltv_d30: Number(r.ltv_d30) || 0,
    ltv_d90: Number(r.ltv_d90) || 0,
    is_payer_by_d3: Number(r.is_payer_by_d3) || 0,
    is_payer_by_d7: Number(r.is_payer_by_d7) || 0,
    is_payer_by_d30: Number(r.is_payer_by_d30) || 0,
    is_payer_by_d90: Number(r.is_payer_by_d90) || 0,
    profit_d90: Number(r.profit_d90) || 0,
    late_monetizer_flag: Number(r.late_monetizer_flag) || 0,
    false_early_payer_flag: Number(r.false_early_payer_flag) || 0,
    active_days_w7d: Number(r.active_days_w7d) || 0,
    sessions_cnt_w7d: Number(r.sessions_cnt_w7d) || 0,
    max_level_w7d: Number(r.max_level_w7d) || 0,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregate Summaries (for Raw Log Explorer)
// ═══════════════════════════════════════════════════════════════════════════════

export interface TableSummary {
  rowCount: number;
  uniqueUsers: number;
  columns: string[];
  dateRange?: { min: string; max: string };
  topValues?: { column: string; values: { value: string; count: number }[] }[];
}

export function summarizePlayers(players: SimPlayerRow[]): TableSummary {
  const channels: Record<string, number> = {};
  const countries: Record<string, number> = {};
  for (const p of players) {
    channels[p.channel] = (channels[p.channel] || 0) + 1;
    countries[p.country] = (countries[p.country] || 0) + 1;
  }
  return {
    rowCount: players.length,
    uniqueUsers: new Set(players.map((p) => p.game_user_id)).size,
    columns: ["game_user_id", "install_time", "campaign_id", "channel", "country", "os", "device_tier"],
    dateRange: players.length ? { min: players.reduce((a, b) => a.install_time < b.install_time ? a : b).install_time, max: players.reduce((a, b) => a.install_time > b.install_time ? a : b).install_time } : undefined,
    topValues: [
      { column: "channel", values: Object.entries(channels).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count })) },
      { column: "country", values: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count })) },
    ],
  };
}

export function summarizePayments(payments: SimPaymentRow[]): TableSummary {
  const skus: Record<string, number> = {};
  for (const p of payments) skus[p.product_sku] = (skus[p.product_sku] || 0) + 1;
  const totalRevenue = payments.filter((p) => !p.is_refund).reduce((s, p) => s + p.amount_usd, 0);
  return {
    rowCount: payments.length,
    uniqueUsers: new Set(payments.map((p) => p.game_user_id)).size,
    columns: ["game_user_id", "txn_time", "amount_usd", "product_sku", "payment_channel", "is_refund"],
    topValues: [
      { column: "product_sku", values: Object.entries(skus).sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })) },
      { column: "total_revenue", values: [{ value: `$${totalRevenue.toFixed(2)}`, count: payments.filter((p) => !p.is_refund).length }] },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQL Preview Generator
// ═══════════════════════════════════════════════════════════════════════════════

export function generateSqlPreview(config: FeatureBuildConfig): string {
  const lines: string[] = ["SELECT", "  p.game_user_id,"];
  const joins: string[] = [];
  const windows = [...config.selectedWindows].sort((a, b) => a - b);

  for (const tmpl of config.selectedTemplates) {
    const def = FEATURE_TEMPLATES.find((t) => t.id === tmpl);
    if (!def) continue;

    if (def.requiresWindow) {
      for (const d of windows) {
        if (tmpl === "session_count") {
          lines.push(`  COUNT(DISTINCT CASE WHEN e.event_name='session_start' AND DATEDIFF(e.event_time, p.install_time) <= ${d} THEN e.session_id END) AS session_count_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        } else if (tmpl === "active_days") {
          lines.push(`  COUNT(DISTINCT CASE WHEN DATEDIFF(e.event_time, p.install_time) <= ${d} THEN DATE(e.event_time) END) AS active_days_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        } else if (tmpl === "payment_sum") {
          lines.push(`  SUM(CASE WHEN pay.is_refund=false AND DATEDIFF(pay.txn_time, p.install_time) <= ${d} THEN pay.amount_usd ELSE 0 END) AS payment_sum_${d}d,`);
          if (!joins.includes("payments")) joins.push("payments");
        } else if (tmpl === "payment_count") {
          lines.push(`  COUNT(CASE WHEN pay.is_refund=false AND DATEDIFF(pay.txn_time, p.install_time) <= ${d} THEN 1 END) AS payment_count_${d}d,`);
          if (!joins.includes("payments")) joins.push("payments");
        } else if (tmpl === "battle_win_rate") {
          lines.push(`  AVG(CASE WHEN e.event_name='pvp_match' AND DATEDIFF(e.event_time, p.install_time) <= ${d} AND e.params LIKE '%win%' THEN 1.0 ELSE 0.0 END) AS battle_win_rate_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        } else if (tmpl === "quest_complete_count") {
          lines.push(`  COUNT(CASE WHEN e.event_name='quest_complete' AND DATEDIFF(e.event_time, p.install_time) <= ${d} THEN 1 END) AS quest_complete_count_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        } else if (tmpl === "dungeon_clear_count") {
          lines.push(`  COUNT(CASE WHEN e.event_name='dungeon_clear' AND DATEDIFF(e.event_time, p.install_time) <= ${d} THEN 1 END) AS dungeon_clear_count_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        } else if (tmpl === "chat_count") {
          lines.push(`  COUNT(CASE WHEN e.event_name='chat_message' AND DATEDIFF(e.event_time, p.install_time) <= ${d} THEN 1 END) AS chat_count_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        } else if (tmpl === "guild_activity_count") {
          lines.push(`  COUNT(CASE WHEN e.event_name='guild_activity' AND DATEDIFF(e.event_time, p.install_time) <= ${d} THEN 1 END) AS guild_activity_count_${d}d,`);
          if (!joins.includes("events")) joins.push("events");
        }
      }
    } else {
      if (tmpl === "last_login_gap") lines.push("  DATEDIFF(DATE_ADD(p.install_time, INTERVAL 7 DAY), MAX(e.event_time)) AS last_login_gap,");
      else if (tmpl === "payer_flag") lines.push("  CASE WHEN l.is_payer_by_d7 = 1 THEN 1 ELSE 0 END AS payer_flag,");
      else if (tmpl === "first_purchase_hours") lines.push("  l.first_purchase_time_hours AS first_purchase_hours,");
      else if (tmpl === "max_level") lines.push("  l.max_level_w7d AS max_level,");
      else if (tmpl === "ua_cost") lines.push("  l.ua_cost,");
      else if (tmpl === "device_tier") lines.push("  CASE p.device_tier WHEN 'high' THEN 2 WHEN 'mid' THEN 1 ELSE 0 END AS device_tier_num,");
      else if (tmpl === "os_flag") lines.push("  CASE p.os WHEN 'ios' THEN 1 ELSE 0 END AS os_flag,");
      else if (tmpl === "future_payment_d8_30") lines.push("  -- ⚠️ LEAKAGE\n  SUM(CASE WHEN pay.is_refund=false AND DATEDIFF(pay.txn_time, p.install_time) BETWEEN 8 AND 30 THEN pay.amount_usd ELSE 0 END) AS future_payment_d8_30,");
      else if (tmpl === "ltv_d30_raw") lines.push("  -- ⚠️ LEAKAGE\n  l.ltv_d30 AS ltv_d30_raw,");
    }
  }

  lines.push("  l.ltv_d30 AS target_ltv30,");
  lines.push("  l.ltv_d90 AS target_ltv90");
  lines.push("FROM players p");
  lines.push("JOIN labels l ON p.game_user_id = l.game_user_id");
  if (joins.includes("events")) lines.push("LEFT JOIN game_events e ON p.game_user_id = e.game_user_id");
  if (joins.includes("payments")) lines.push("LEFT JOIN payments pay ON p.game_user_id = pay.game_user_id");
  lines.push("GROUP BY p.game_user_id");
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Builder
// ═══════════════════════════════════════════════════════════════════════════════

export function buildFeatureMatrix(
  players: SimPlayerRow[],
  events: SimEventRow[],
  payments: SimPaymentRow[],
  labels: SimLabelRow[],
  config: FeatureBuildConfig,
): FeatureMatrixRow[] {
  const labelsByUser = new Map(labels.map((l) => [l.game_user_id, l]));
  const playerByUser = new Map(players.map((p) => [p.game_user_id, p]));

  // Index events and payments by user
  const eventByUser = new Map<string, SimEventRow[]>();
  if (config.useEvents) {
    for (const ev of events) {
      if (!eventByUser.has(ev.game_user_id)) eventByUser.set(ev.game_user_id, []);
      eventByUser.get(ev.game_user_id)!.push(ev);
    }
  }

  const payByUser = new Map<string, SimPaymentRow[]>();
  if (config.usePayments) {
    for (const p of payments) {
      if (!payByUser.has(p.game_user_id)) payByUser.set(p.game_user_id, []);
      payByUser.get(p.game_user_id)!.push(p);
    }
  }

  const include = (id: string) => config.selectedTemplates.includes(id);
  const windows = [...config.selectedWindows].sort((a, b) => a - b);

  const matrix: FeatureMatrixRow[] = [];
  for (const [userId, label] of labelsByUser) {
    const player = playerByUser.get(userId);
    if (!player) continue;
    const installTs = player.install_time;

    const row: FeatureMatrixRow = {
      user_id: userId,
      install_time: installTs,
      install_date: label.install_date,
      target_ltv30: label.ltv_d30 || 0,
      target_ltv90: label.ltv_d90 || 0,
    };

    const userEvents = eventByUser.get(userId) || [];
    const userPays = payByUser.get(userId) || [];

    for (const d of windows) {
      const wEvents = userEvents.filter((e) => {
        const dd = daysBetween(e.event_time, installTs);
        return dd >= 0 && dd <= d;
      });
      const wPays = userPays.filter((p) => {
        const dd = daysBetween(p.txn_time, installTs);
        return !p.is_refund && dd >= 0 && dd <= d;
      });

      if (include("session_count")) row[`session_count_${d}d`] = new Set(wEvents.filter((e) => e.event_name === "session_start").map((e) => e.session_id)).size;
      if (include("active_days")) row[`active_days_${d}d`] = new Set(wEvents.map((e) => e.event_time.split("T")[0])).size;
      if (include("payment_sum")) row[`payment_sum_${d}d`] = Math.round(wPays.reduce((s, p) => s + p.amount_usd, 0) * 100) / 100;
      if (include("payment_count")) row[`payment_count_${d}d`] = wPays.length;
      if (include("battle_win_rate")) {
        const battles = wEvents.filter((e) => e.event_name === "pvp_match");
        const wins = battles.filter((e) => parseEventParams(e.params).result === "win").length;
        row[`battle_win_rate_${d}d`] = battles.length > 0 ? Math.round((wins / battles.length) * 1000) / 1000 : 0;
      }
      if (include("quest_complete_count")) row[`quest_complete_count_${d}d`] = wEvents.filter((e) => e.event_name === "quest_complete").length;
      if (include("dungeon_clear_count")) row[`dungeon_clear_count_${d}d`] = wEvents.filter((e) => e.event_name === "dungeon_clear").length;
      if (include("chat_count")) row[`chat_count_${d}d`] = wEvents.filter((e) => e.event_name === "chat_message").length;
      if (include("guild_activity_count")) row[`guild_activity_count_${d}d`] = wEvents.filter((e) => e.event_name === "guild_activity").length;
    }

    // Non-windowed features from labels
    if (include("last_login_gap")) {
      const d7Events = userEvents.filter((e) => { const dd = daysBetween(e.event_time, installTs); return dd >= 0 && dd <= 7; });
      if (d7Events.length > 0) {
        let maxDay = 0;
        for (const e of d7Events) { const dd = daysBetween(e.event_time, installTs); if (dd > maxDay) maxDay = dd; }
        row.last_login_gap = Math.max(0, +(7 - maxDay).toFixed(2));
      } else {
        row.last_login_gap = 7;
      }
    }
    if (include("payer_flag")) row.payer_flag = label.is_payer_by_d7;
    if (include("first_purchase_hours")) {
      // Only look at d7 purchases (no leakage from future payments)
      const d7Pays = userPays.filter((p) => { const dd = daysBetween(p.txn_time, installTs); return !p.is_refund && dd >= 0 && dd <= 7; });
      const firstPay = d7Pays.sort((a, b) => new Date(a.txn_time).getTime() - new Date(b.txn_time).getTime())[0];
      row.first_purchase_hours = firstPay ? Math.max(0, +(daysBetween(firstPay.txn_time, installTs) * 24).toFixed(1)) : -1;
    }
    if (include("max_level")) row.max_level = label.max_level_w7d;
    if (include("ua_cost")) row.ua_cost = label.ua_cost;
    if (include("device_tier")) row.device_tier_num = player.device_tier === "high" ? 2 : player.device_tier === "mid" ? 1 : 0;
    if (include("os_flag")) row.os_flag = player.os === "ios" ? 1 : 0;

    // Leakage features
    if (include("future_payment_d8_30") || config.includeLeakageFeature) {
      const futurePay = userPays.filter((p) => { const dd = daysBetween(p.txn_time, installTs); return !p.is_refund && dd > 7 && dd <= 30; });
      row.future_payment_d8_30 = Math.round(futurePay.reduce((s, p) => s + p.amount_usd, 0) * 100) / 100;
    }
    if (include("ltv_d30_raw")) row.ltv_d30_raw = label.ltv_d30;

    matrix.push(row);
  }

  return matrix;
}

export function getNumericFeatureColumns(rows: FeatureMatrixRow[]): string[] {
  if (!rows.length) return [];
  const skip = new Set(["user_id", "install_time", "install_date", "target_ltv30", "target_ltv90"]);
  return Object.keys(rows[0]).filter((k) => !skip.has(k) && typeof rows[0][k] === "number");
}

export function computeCorrelationMatrix(rows: FeatureMatrixRow[], columns: string[]): { columns: string[]; data: number[][] } {
  const vectors = columns.map((c) => rows.map((r) => Number(r[c] || 0)));
  const data = columns.map((_, i) => columns.map((_, j) => Math.round(pearsonCorr(vectors[i], vectors[j]) * 1000) / 1000));
  return { columns, data };
}

export function computeDistribution(rows: FeatureMatrixRow[], column: string, buckets = 20): { label: string; count: number }[] {
  const vals = rows.map((r) => Number(r[column] || 0)).filter(Number.isFinite);
  if (!vals.length) return [];
  const min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) return [{ label: String(min), count: vals.length }];
  const step = (max - min) / buckets;
  const bins = new Array(buckets).fill(0);
  for (const v of vals) {
    const idx = Math.min(Math.floor((v - min) / step), buckets - 1);
    bins[idx]++;
  }
  return bins.map((count, i) => ({ label: `${(min + i * step).toFixed(1)}`, count }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Model Training
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeNode {
  leaf: boolean;
  value: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function candidateThresholds(values: number[], maxBins = 16): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= 2) return sorted.slice(0, -1);
  const bins = Math.min(maxBins, sorted.length - 1);
  const out: number[] = [];
  for (let i = 1; i <= bins; i++) out.push(sorted[Math.floor((i / (bins + 1)) * sorted.length)]);
  return [...new Set(out)];
}

function buildTreeNode(X: number[][], y: number[], indices: number[], depth: number, maxDepth: number, minLeaf: number, featureGain: number[], rng: Rng, colSubset?: number[]): TreeNode {
  const ys = indices.map((i) => y[i]);
  const nodeValue = mean(ys);
  if (depth >= maxDepth || indices.length < minLeaf * 2) return { leaf: true, value: nodeValue };

  const parentSse = indices.reduce((a, i) => a + (y[i] - nodeValue) ** 2, 0);
  // Minimum gain threshold: require at least 0.5% of parent SSE to split
  // Prevents overfitting on noise features (e.g. ua_cost) with skewed LTV data
  const minGain = parentSse * 0.005;
  let bestGain = minGain, bestF = -1, bestThr = 0, bestL: number[] = [], bestR: number[] = [];

  // Use column subset if provided, otherwise all features
  const featureIndices = colSubset ?? Array.from({ length: X[0].length }, (_, i) => i);

  for (const f of featureIndices) {
    for (const thr of candidateThresholds(indices.map((i) => X[i][f]))) {
      const left: number[] = [], right: number[] = [];
      for (const idx of indices) { if (X[idx][f] <= thr) left.push(idx); else right.push(idx); }
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const lm = mean(left.map((i) => y[i])), rm = mean(right.map((i) => y[i]));
      const gain = parentSse - left.reduce((a, i) => a + (y[i] - lm) ** 2, 0) - right.reduce((a, i) => a + (y[i] - rm) ** 2, 0);
      if (gain > bestGain) { bestGain = gain; bestF = f; bestThr = thr; bestL = left; bestR = right; }
    }
  }

  if (bestF < 0) return { leaf: true, value: nodeValue };
  featureGain[bestF] += bestGain;
  return {
    leaf: false, value: nodeValue, featureIndex: bestF, threshold: bestThr,
    left: buildTreeNode(X, y, bestL, depth + 1, maxDepth, minLeaf, featureGain, rng, colSubset),
    right: buildTreeNode(X, y, bestR, depth + 1, maxDepth, minLeaf, featureGain, rng, colSubset),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  if (node.leaf || node.featureIndex === undefined || !node.left || !node.right) return node.value;
  return x[node.featureIndex!] <= node.threshold! ? predictTree(node.left, x) : predictTree(node.right, x);
}

function trainGBT(X: number[][], y: number[], nTrees: number, lr: number, maxDepth: number, rng: Rng, featureGain: number[]): { trees: TreeNode[]; losses: number[] } {
  const residuals = [...y];
  const predictions = new Array(y.length).fill(0);
  const trees: TreeNode[] = [];
  const losses: number[] = [];
  const n = X.length;
  const nFeatures = X[0].length;
  // Column subsampling: sqrt(n) features per tree (standard GBT regularization)
  const colSubsetSize = Math.max(2, Math.ceil(Math.sqrt(nFeatures)));

  for (let t = 0; t < nTrees; t++) {
    // Bagging
    const bagSize = Math.floor(n * 0.8);
    const bagIdx: number[] = [];
    for (let i = 0; i < bagSize; i++) bagIdx.push(Math.floor(rng.next() * n));

    // Random column subset per tree
    const allCols = Array.from({ length: nFeatures }, (_, i) => i);
    for (let i = allCols.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [allCols[i], allCols[j]] = [allCols[j], allCols[i]]; }
    const colSubset = allCols.slice(0, colSubsetSize);

    const tree = buildTreeNode(X, residuals, bagIdx, 0, maxDepth, 10, featureGain, rng, colSubset);
    // Scale leaf values by learning rate
    const scale = (node: TreeNode) => { node.value *= lr; if (!node.leaf) { if (node.left) scale(node.left); if (node.right) scale(node.right); } };
    scale(tree);
    trees.push(tree);

    // Update residuals and track cumulative predictions vs actual target
    for (let i = 0; i < n; i++) {
      const treePred = predictTree(tree, X[i]);
      residuals[i] -= treePred;
      predictions[i] += treePred;
    }
    const mse = predictions.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / n;
    losses.push(Math.round(mse * 10000) / 10000);
  }
  return { trees, losses };
}

function predictGBT(trees: TreeNode[], x: number[], useLog: boolean): number {
  let pred = 0;
  for (const tree of trees) pred += predictTree(tree, x);
  return useLog ? Math.expm1(Math.max(pred, 0)) : Math.max(pred, 0);
}

function trainLinearRegression(X: number[][], y: number[]): { weights: number[]; bias: number; epochLosses: number[] } {
  // Gradient descent linear regression with real per-epoch MSE tracking
  const nFeatures = X[0].length;
  const weights = new Array(nFeatures).fill(0);
  let bias = 0;
  const n = X.length;
  const epochLosses: number[] = [];

  // Feature-wise std for adaptive learning rate
  const featureStd = new Array(nFeatures).fill(0);
  for (let f = 0; f < nFeatures; f++) {
    const m = X.reduce((s, row) => s + row[f], 0) / n;
    featureStd[f] = Math.sqrt(X.reduce((s, row) => s + (row[f] - m) ** 2, 0) / n) || 1;
  }
  const lr = 0.01;

  for (let epoch = 0; epoch < 200; epoch++) {
    const dw = new Array(nFeatures).fill(0);
    let db = 0;
    let epochMse = 0;
    for (let i = 0; i < n; i++) {
      let pred = bias;
      for (let f = 0; f < nFeatures; f++) pred += weights[f] * (X[i][f] / featureStd[f]);
      const err = pred - y[i];
      epochMse += err * err;
      for (let f = 0; f < nFeatures; f++) dw[f] += err * (X[i][f] / featureStd[f]);
      db += err;
    }
    for (let f = 0; f < nFeatures; f++) weights[f] -= lr * dw[f] / n;
    bias -= lr * db / n;
    if (epoch % 2 === 0) epochLosses.push(Math.round((epochMse / n) * 10000) / 10000);
  }
  // Convert weights back to original feature scale
  for (let f = 0; f < nFeatures; f++) weights[f] /= featureStd[f];
  return { weights, bias, epochLosses };
}

export function trainModel(
  matrix: FeatureMatrixRow[],
  featureCols: string[],
  target: SimTarget,
  modelType: SimModelType,
  splitStrategy: SplitStrategy,
  leakageEnabled: boolean,
  seed = 42,
): TrainedModelResult {
  const rng = makeRng(seed);
  const targetCol = target === "ltv30" ? "target_ltv30" : "target_ltv90";
  const useLog = modelType !== "dummy";

  // Split
  const sorted = [...matrix];
  if (splitStrategy === "time") {
    sorted.sort((a, b) => new Date(a.install_time).getTime() - new Date(b.install_time).getTime());
  } else {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }
  const splitIdx = Math.floor(sorted.length * 0.75);
  const trainRows = sorted.slice(0, splitIdx);
  const testRows = sorted.slice(splitIdx);

  // Build X, y
  const buildXy = (rows: FeatureMatrixRow[]) => {
    const X = rows.map((r) => featureCols.map((f) => Number(r[f] || 0)));
    const y = rows.map((r) => {
      const raw = Number(r[targetCol] || 0);
      return useLog ? Math.log1p(raw) : raw;
    });
    return { X, y };
  };

  const { X: trainX, y: trainY } = buildXy(trainRows);
  const { X: testX } = buildXy(testRows);
  const testActual = testRows.map((r) => Number(r[targetCol] || 0));

  const featureGain = new Array(featureCols.length).fill(0);
  let predictFn: (x: number[]) => number;
  let trainingLoss: number[] = [];

  const modelLabels: Record<SimModelType, string> = {
    gbt: "Gradient Boosted Trees",
    linear: "Linear Regression",
    rf: "Random Forest",
    dummy: "Dummy Baseline (LTV7)",
  };

  if (modelType === "gbt") {
    const { trees, losses } = trainGBT(trainX, trainY, 80, 0.08, 4, rng, featureGain);
    trainingLoss = losses;
    predictFn = (x) => predictGBT(trees, x, useLog);
  } else if (modelType === "rf") {
    // Random Forest = multiple independent trees, averaged
    const nTrees = 50;
    const allTrees: TreeNode[] = [];
    // Track cumulative sum of per-tree predictions for efficient averaging
    const cumPreds = new Array(trainX.length).fill(0);
    for (let t = 0; t < nTrees; t++) {
      const bagIdx: number[] = [];
      for (let i = 0; i < trainX.length; i++) bagIdx.push(Math.floor(rng.next() * trainX.length));
      const tree = buildTreeNode(trainX, trainY, bagIdx, 0, 5, 5, featureGain, rng);
      allTrees.push(tree);
      // Accumulate predictions and compute MSE of the running ensemble average
      for (let i = 0; i < trainX.length; i++) cumPreds[i] += predictTree(tree, trainX[i]);
      const nT = t + 1;
      const mse = cumPreds.reduce((s, cp, i) => s + ((cp / nT) - trainY[i]) ** 2, 0) / trainX.length;
      trainingLoss.push(Math.round(mse * 10000) / 10000);
    }
    predictFn = (x) => {
      const avg = allTrees.reduce((s, tree) => s + predictTree(tree, x), 0) / allTrees.length;
      return useLog ? Math.expm1(Math.max(avg, 0)) : Math.max(avg, 0);
    };
  } else if (modelType === "linear") {
    const { weights, bias, epochLosses } = trainLinearRegression(trainX, trainY);
    for (let f = 0; f < featureCols.length; f++) featureGain[f] = Math.abs(weights[f]);
    predictFn = (x) => {
      let pred = bias;
      for (let f = 0; f < x.length; f++) pred += weights[f] * x[f];
      return useLog ? Math.expm1(Math.max(pred, 0)) : Math.max(pred, 0);
    };
    trainingLoss = epochLosses;
  } else {
    // Dummy baseline: predict LTV7 * multiplier
    const ltvD7Idx = featureCols.indexOf("payment_sum_7d");
    const payerIdx = featureCols.indexOf("payer_flag");
    predictFn = (x) => {
      const ltv7 = ltvD7Idx >= 0 ? x[ltvD7Idx] : 0;
      const isPayer = payerIdx >= 0 ? x[payerIdx] : 0;
      return ltv7 * 3.5 + (isPayer > 0 ? 5 : 0);
    };
    if (ltvD7Idx >= 0) featureGain[ltvD7Idx] = 1;
    if (payerIdx >= 0) featureGain[payerIdx] = 0.5;
    trainingLoss = [5, 5, 5]; // flat
  }

  // Generate predictions
  const testPreds = testX.map((x) => predictFn(x));
  const allPreds = sorted.map((r) => predictFn(featureCols.map((f) => Number(r[f] || 0))));

  // Metrics
  const maeVal = Math.round(testPreds.reduce((s, p, i) => s + Math.abs(p - testActual[i]), 0) / testPreds.length * 100) / 100;
  const mseVal = testPreds.reduce((s, p, i) => s + (p - testActual[i]) ** 2, 0) / testPreds.length;
  const rmseVal = Math.round(Math.sqrt(mseVal) * 100) / 100;
  const actualMean = mean(testActual);
  const ssTot = testActual.reduce((s, a) => s + (a - actualMean) ** 2, 0);
  const ssRes = testPreds.reduce((s, p, i) => s + (p - testActual[i]) ** 2, 0);
  const r2Val = Math.round((1 - ssRes / (ssTot || 1)) * 1000) / 1000;
  const spearmanVal = Math.round(spearmanCorr(testPreds, testActual) * 1000) / 1000;

  // Calibration
  const calibration: CalibrationBucket[] = [];
  const nBuckets = 10;
  const sortedByPred = testPreds.map((p, i) => ({ p, a: testActual[i] })).sort((a, b) => a.p - b.p);
  const bucketSize = Math.ceil(sortedByPred.length / nBuckets);
  let calibError = 0;
  for (let b = 0; b < nBuckets; b++) {
    const slice = sortedByPred.slice(b * bucketSize, (b + 1) * bucketSize);
    if (!slice.length) continue;
    const avgP = mean(slice.map((s) => s.p));
    const avgA = mean(slice.map((s) => s.a));
    calibError += Math.abs(avgP - avgA);
    calibration.push({ bucket: `D${b + 1}`, predicted: Math.round(avgP * 100) / 100, actual: Math.round(avgA * 100) / 100, count: slice.length });
  }
  calibError = Math.round((calibError / nBuckets) * 100) / 100;

  // Lift curve
  const liftCurve: LiftPoint[] = [];
  const allTestSorted = testPreds.map((p, i) => ({ p, a: testActual[i] })).sort((a, b) => b.p - a.p);
  const totalActual = allTestSorted.reduce((s, x) => s + x.a, 0);
  const p90 = allTestSorted.map((x) => x.a).sort((a, b) => b - a)[Math.floor(allTestSorted.length * 0.1)] || 0;
  const topTrue = allTestSorted.filter((x) => x.a >= p90).length;

  for (const pct of [1, 2, 5, 10, 15, 20, 30, 50, 75, 100]) {
    const k = Math.max(1, Math.floor(allTestSorted.length * pct / 100));
    const topSlice = allTestSorted.slice(0, k);
    const topValue = topSlice.reduce((s, x) => s + x.a, 0);
    const topTrueInSlice = topSlice.filter((x) => x.a >= p90).length;
    const randomExpected = totalActual * (k / allTestSorted.length);
    liftCurve.push({
      topPercent: pct,
      k,
      lift: randomExpected > 0 ? Math.round((topValue / randomExpected) * 100) / 100 : 1,
      precision: topTrue > 0 ? Math.round((topTrueInSlice / k) * 1000) / 1000 : 0,
      recall: topTrue > 0 ? Math.round((topTrueInSlice / topTrue) * 1000) / 1000 : 0,
      valueCaptured: totalActual > 0 ? Math.round((topValue / totalActual) * 1000) / 1000 : 0,
    });
  }

  // Feature importance
  const totalGain = featureGain.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const featureImportance = featureCols
    .map((f, i) => ({ feature: f, importance: Math.round((Math.abs(featureGain[i]) / totalGain) * 1000) / 1000 }))
    .sort((a, b) => b.importance - a.importance);

  // SHAP-like approximation
  const shapValues = featureImportance.slice(0, 10).map((fi) => {
    const fIdx = featureCols.indexOf(fi.feature);
    const fVals = testRows.map((r) => Number(r[fi.feature] || 0));
    const corrWithTarget = pearsonCorr(fVals, testActual);
    return {
      feature: fi.feature,
      meanAbsShap: Math.round(fi.importance * 100) / 100,
      direction: (corrWithTarget > 0.1 ? "positive" : corrWithTarget < -0.1 ? "negative" : "mixed") as "positive" | "negative" | "mixed",
    };
  });

  // Build prediction rows
  const testPredictions: PredictionRow[] = testRows.map((r, i) => ({
    user_id: r.user_id,
    install_time: r.install_time,
    predicted: Math.round(testPreds[i] * 100) / 100,
    actual: testActual[i],
  }));

  const allPredictions: PredictionRow[] = sorted.map((r, i) => ({
    user_id: r.user_id,
    install_time: r.install_time,
    predicted: Math.round(allPreds[i] * 100) / 100,
    actual: Number(r[targetCol] || 0),
  }));

  return {
    run_id: `sim_${Date.now()}_${Math.floor(rng.next() * 1000)}`,
    modelType,
    modelLabel: modelLabels[modelType],
    target,
    features: featureCols,
    splitStrategy,
    leakageEnabled,
    mae: maeVal,
    rmse: rmseVal,
    r2: r2Val,
    spearmanCorr: spearmanVal,
    calibrationError: calibError,
    trainSize: trainRows.length,
    testSize: testRows.length,
    featureImportance,
    shapValues,
    trainingLoss,
    testPredictions,
    allPredictions,
    calibration,
    liftCurve,
    timestamp: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Evaluation Helpers (for Step 4 comparison panel)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvalProtocol {
  target: SimTarget;
  splitStrategy: SplitStrategy;
  featureSetHash: string;
  datasetSize: number;
  leakageEnabled: boolean;
  trainSize: number;
  testSize: number;
}

export function extractProtocol(model: TrainedModelResult): EvalProtocol {
  const featureSetHash = model.features.slice().sort().join("|");
  return {
    target: model.target,
    splitStrategy: model.splitStrategy,
    featureSetHash,
    datasetSize: model.trainSize + model.testSize,
    leakageEnabled: model.leakageEnabled,
    trainSize: model.trainSize,
    testSize: model.testSize,
  };
}

export function protocolsMatch(a: EvalProtocol, b: EvalProtocol): { match: boolean; differences: string[] } {
  const diffs: string[] = [];
  if (a.target !== b.target) diffs.push(`target: ${a.target} vs ${b.target}`);
  if (a.splitStrategy !== b.splitStrategy) diffs.push(`split: ${a.splitStrategy} vs ${b.splitStrategy}`);
  if (a.featureSetHash !== b.featureSetHash) diffs.push("different feature set");
  if (a.datasetSize !== b.datasetSize) diffs.push(`dataset size: ${a.datasetSize} vs ${b.datasetSize}`);
  if (a.leakageEnabled !== b.leakageEnabled) diffs.push("leakage mismatch");
  return { match: diffs.length === 0, differences: diffs };
}

export function computeAULC(liftCurve: LiftPoint[]): number {
  if (liftCurve.length < 2) return 0;
  let area = 0;
  for (let i = 1; i < liftCurve.length; i++) {
    const dx = (liftCurve[i].topPercent - liftCurve[i - 1].topPercent) / 100;
    const avgLift = (liftCurve[i].lift + liftCurve[i - 1].lift) / 2;
    area += dx * avgLift;
  }
  return Math.round(area * 1000) / 1000;
}

export function computeCoverage(matrix: FeatureMatrixRow[], features: string[]): number {
  if (!matrix.length || !features.length) return 0;
  let covered = 0;
  for (const row of matrix) {
    const allPresent = features.every((f) => {
      const v = row[f];
      return v !== undefined && v !== null && Number.isFinite(Number(v));
    });
    if (allPresent) covered++;
  }
  return Math.round((covered / matrix.length) * 1000) / 1000;
}

export function computeOverpredictionRate(predictions: PredictionRow[], thresholdPct = 50): number {
  if (!predictions.length) return 0;
  const overPred = predictions.filter((p) => p.actual > 0 && (p.predicted - p.actual) / p.actual > thresholdPct / 100).length;
  return Math.round((overPred / predictions.length) * 1000) / 1000;
}

export function estimateInferenceCost(model: TrainedModelResult): number {
  const base: Record<SimModelType, number> = { dummy: 0.01, linear: 0.05, rf: 1.2, gbt: 0.8 };
  return Math.round((base[model.modelType] + model.features.length * 0.02) * 100) / 100;
}

export function generateBaselineModel(
  matrix: FeatureMatrixRow[],
  baselineType: "ltv3d" | "ltv7d",
  target: SimTarget,
  splitStrategy: SplitStrategy,
  seed = 42,
): TrainedModelResult {
  const rng = makeRng(seed);
  const targetCol = target === "ltv30" ? "target_ltv30" : "target_ltv90";
  const featureCol = baselineType === "ltv3d" ? "payment_sum_3d" : "payment_sum_7d";
  const multiplier = baselineType === "ltv3d" ? (target === "ltv30" ? 5.0 : 12.0) : (target === "ltv30" ? 2.5 : 6.0);

  const sorted = [...matrix];
  if (splitStrategy === "time") {
    sorted.sort((a, b) => new Date(a.install_time).getTime() - new Date(b.install_time).getTime());
  } else {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }
  const splitIdx = Math.floor(sorted.length * 0.75);
  const testRows = sorted.slice(splitIdx);
  const testActual = testRows.map((r) => Number(r[targetCol] || 0));
  const testPreds = testRows.map((r) => Math.max(0, Number(r[featureCol] || 0) * multiplier));

  const maeVal = Math.round(testPreds.reduce((s, p, i) => s + Math.abs(p - testActual[i]), 0) / testPreds.length * 100) / 100;
  const mseVal = testPreds.reduce((s, p, i) => s + (p - testActual[i]) ** 2, 0) / testPreds.length;
  const rmseVal = Math.round(Math.sqrt(mseVal) * 100) / 100;
  const actualMean = mean(testActual);
  const ssTot = testActual.reduce((s, a) => s + (a - actualMean) ** 2, 0);
  const ssRes = testPreds.reduce((s, p, i) => s + (p - testActual[i]) ** 2, 0);
  const r2Val = Math.round((1 - ssRes / (ssTot || 1)) * 1000) / 1000;
  const spearmanVal = Math.round(spearmanCorr(testPreds, testActual) * 1000) / 1000;

  const calibration: CalibrationBucket[] = [];
  const sortedByPred = testPreds.map((p, i) => ({ p, a: testActual[i] })).sort((a, b) => a.p - b.p);
  const bucketSize = Math.ceil(sortedByPred.length / 10);
  let calibError = 0;
  for (let b = 0; b < 10; b++) {
    const slice = sortedByPred.slice(b * bucketSize, (b + 1) * bucketSize);
    if (!slice.length) continue;
    const avgP = mean(slice.map((s) => s.p));
    const avgA = mean(slice.map((s) => s.a));
    calibError += Math.abs(avgP - avgA);
    calibration.push({ bucket: `D${b + 1}`, predicted: Math.round(avgP * 100) / 100, actual: Math.round(avgA * 100) / 100, count: slice.length });
  }
  calibError = Math.round((calibError / 10) * 100) / 100;

  const liftCurve: LiftPoint[] = [];
  const allTestSorted = testPreds.map((p, i) => ({ p, a: testActual[i] })).sort((a, b) => b.p - a.p);
  const totalActual = allTestSorted.reduce((s, x) => s + x.a, 0);
  const p90 = allTestSorted.map((x) => x.a).sort((a, b) => b - a)[Math.floor(allTestSorted.length * 0.1)] || 0;
  const topTrue = allTestSorted.filter((x) => x.a >= p90).length;
  for (const pct of [1, 2, 5, 10, 15, 20, 30, 50, 75, 100]) {
    const k = Math.max(1, Math.floor(allTestSorted.length * pct / 100));
    const topSlice = allTestSorted.slice(0, k);
    const topValue = topSlice.reduce((s, x) => s + x.a, 0);
    const topTrueInSlice = topSlice.filter((x) => x.a >= p90).length;
    const randomExpected = totalActual * (k / allTestSorted.length);
    liftCurve.push({
      topPercent: pct, k,
      lift: randomExpected > 0 ? Math.round((topValue / randomExpected) * 100) / 100 : 1,
      precision: topTrue > 0 ? Math.round((topTrueInSlice / k) * 1000) / 1000 : 0,
      recall: topTrue > 0 ? Math.round((topTrueInSlice / topTrue) * 1000) / 1000 : 0,
      valueCaptured: totalActual > 0 ? Math.round((topValue / totalActual) * 1000) / 1000 : 0,
    });
  }

  const featureImportance = [{ feature: featureCol, importance: 1.0 }];
  const testPredictions: PredictionRow[] = testRows.map((r, i) => ({
    user_id: r.user_id, install_time: r.install_time,
    predicted: Math.round(testPreds[i] * 100) / 100, actual: testActual[i],
  }));
  const allPredictions: PredictionRow[] = sorted.map((r) => ({
    user_id: r.user_id, install_time: r.install_time,
    predicted: Math.round(Math.max(0, Number(r[featureCol] || 0) * multiplier) * 100) / 100,
    actual: Number(r[targetCol] || 0),
  }));

  return {
    run_id: `baseline_${baselineType}_${Date.now()}`,
    modelType: "dummy",
    modelLabel: `Baseline (${baselineType.toUpperCase()})`,
    target, features: [featureCol], splitStrategy, leakageEnabled: false,
    mae: maeVal, rmse: rmseVal, r2: r2Val, spearmanCorr: spearmanVal,
    calibrationError: calibError,
    trainSize: splitIdx, testSize: testRows.length,
    featureImportance, shapValues: [],
    trainingLoss: [mseVal],
    testPredictions, allPredictions, calibration, liftCurve,
    timestamp: Date.now(),
  };
}

export interface DecisionRecommendation {
  modelIdx: number;
  badge: string;
  reason: string;
}

export function generateRecommendations(models: TrainedModelResult[], topKPct: number): DecisionRecommendation[] {
  if (!models.length) return [];
  const recs: DecisionRecommendation[] = [];

  // Best for Top-K targeting (highest lift@K)
  let bestLiftIdx = 0, bestLiftVal = -Infinity;
  // Best calibrated (lowest calibration error)
  let bestCalibIdx = 0, bestCalibVal = Infinity;
  // Best balanced (composite of spearman + lift + calibration)
  let bestBalIdx = 0, bestBalVal = -Infinity;
  // Best ranking (highest spearman)
  let bestRankIdx = 0, bestRankVal = -Infinity;

  models.forEach((m, i) => {
    const liftPoint = m.liftCurve.reduce((best, p) => Math.abs(p.topPercent - topKPct) < Math.abs(best.topPercent - topKPct) ? p : best, m.liftCurve[0]);
    const liftAtK = liftPoint?.lift ?? 0;
    if (liftAtK > bestLiftVal) { bestLiftVal = liftAtK; bestLiftIdx = i; }
    if (m.calibrationError < bestCalibVal) { bestCalibVal = m.calibrationError; bestCalibIdx = i; }
    if (m.spearmanCorr > bestRankVal) { bestRankVal = m.spearmanCorr; bestRankIdx = i; }
    const composite = m.spearmanCorr * 0.4 + (liftAtK / 10) * 0.3 + (1 / (1 + m.calibrationError)) * 0.3;
    if (composite > bestBalVal) { bestBalVal = composite; bestBalIdx = i; }
  });

  recs.push({ modelIdx: bestLiftIdx, badge: `Best for Top-${topKPct}% Targeting`, reason: `Highest lift at ${topKPct}% (${bestLiftVal}×). Concentrates value in the top slice.` });
  if (bestCalibIdx !== bestLiftIdx) {
    recs.push({ modelIdx: bestCalibIdx, badge: "Best Calibrated for Bidding", reason: `Lowest calibration error ($${bestCalibVal}). Predictions closely match actuals — safe for bid optimization.` });
  }
  if (bestBalIdx !== bestLiftIdx && bestBalIdx !== bestCalibIdx) {
    recs.push({ modelIdx: bestBalIdx, badge: `Best Balanced at K=${topKPct}%`, reason: `Strongest composite of ranking (Spearman), lift, and calibration.` });
  }
  if (bestRankIdx !== bestLiftIdx && bestRankIdx !== bestCalibIdx && bestRankIdx !== bestBalIdx) {
    recs.push({ modelIdx: bestRankIdx, badge: "Best Ranker (Spearman)", reason: `Highest Spearman correlation (${bestRankVal}). Best at ordering users by true value.` });
  }

  return recs;
}

export function computeFeatureImportanceDelta(
  modelA: TrainedModelResult,
  modelB: TrainedModelResult,
): { feature: string; impA: number; impB: number; delta: number }[] {
  const allFeatures = new Set([...modelA.featureImportance.map((f) => f.feature), ...modelB.featureImportance.map((f) => f.feature)]);
  const result: { feature: string; impA: number; impB: number; delta: number }[] = [];
  for (const f of allFeatures) {
    const impA = modelA.featureImportance.find((fi) => fi.feature === f)?.importance ?? 0;
    const impB = modelB.featureImportance.find((fi) => fi.feature === f)?.importance ?? 0;
    result.push({ feature: f, impA, impB, delta: Math.round((impB - impA) * 1000) / 1000 });
  }
  return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function computeLiftDelta(
  modelA: TrainedModelResult,
  modelB: TrainedModelResult,
): { topPercent: number; liftA: number; liftB: number; delta: number; valueA: number; valueB: number }[] {
  return modelA.liftCurve.map((pa) => {
    const pb = modelB.liftCurve.find((p) => p.topPercent === pa.topPercent);
    return {
      topPercent: pa.topPercent,
      liftA: pa.lift,
      liftB: pb?.lift ?? 0,
      delta: Math.round(((pb?.lift ?? 0) - pa.lift) * 100) / 100,
      valueA: pa.valueCaptured,
      valueB: pb?.valueCaptured ?? 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Online Activation Simulator
// ═══════════════════════════════════════════════════════════════════════════════

export function simulateActivation(
  model: TrainedModelResult,
  topKPercent: number,
  config: ActivationConfig,
  seed = 42,
): ActivationRun {
  const rng = makeRng(seed);
  const sorted = [...model.allPredictions].sort((a, b) => b.predicted - a.predicted);
  const k = Math.max(1, Math.floor(sorted.length * topKPercent / 100));
  const topK = sorted.slice(0, k);

  const delivered = Math.floor(k * config.deliveryRate);
  const cost = delivered * config.cpi;

  // Revenue: actual LTV * multiplier + noise
  let revenue = 0;
  const revenueCurve: { day: number; revenue: number }[] = [];
  let cumRevenue = 0;

  for (let day = 0; day <= 90; day++) {
    let dayRevenue = 0;
    const fraction = day <= 7 ? 0.015 : day <= 30 ? 0.018 : day <= 60 ? 0.008 : 0.004;
    for (let i = 0; i < delivered; i++) {
      const baseRev = topK[i % topK.length].actual * fraction * config.revenueMultiplier;
      const noise = 1 + (rng.next() - 0.5) * 2 * config.conversionNoise;
      dayRevenue += Math.max(0, baseRev * noise);
    }
    cumRevenue += dayRevenue;
    if (day % 5 === 0 || day === 90) revenueCurve.push({ day, revenue: Math.round(cumRevenue * 100) / 100 });
  }
  revenue = Math.round(cumRevenue * 100) / 100;

  return {
    run_id: `act_${Date.now()}_${Math.floor(rng.next() * 1000)}`,
    model_label: model.modelLabel,
    topK: k,
    topKPercent,
    users_sent: k,
    users_delivered: delivered,
    cost: Math.round(cost * 100) / 100,
    revenue_90d: revenue,
    roi: cost > 0 ? Math.round(((revenue - cost) / cost) * 100) / 100 : 0,
    profit: Math.round((revenue - cost) * 100) / 100,
    revenueCurve,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Economic Impact
// ═══════════════════════════════════════════════════════════════════════════════

export function computeEconomicImpact(
  model: TrainedModelResult,
  config: ActivationConfig,
  seed = 42,
): EconomicImpactRow[] {
  const rng = makeRng(seed);
  const sorted = [...model.allPredictions].sort((a, b) => b.predicted - a.predicted);
  const n = sorted.length;
  if (!n) return [];

  // Baseline: random selection at 10%
  const baselineK = Math.max(1, Math.floor(n * 0.1));
  const baselineRevenue = sorted.slice(0, baselineK).reduce((s, r) => s + r.actual, 0) * config.revenueMultiplier;

  const rows: EconomicImpactRow[] = [];
  for (const pct of [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100]) {
    const k = Math.max(1, Math.floor(n * pct / 100));
    const topSlice = sorted.slice(0, k);
    const delivered = Math.floor(k * config.deliveryRate);
    const cost = delivered * config.cpi;

    let revenue = 0;
    for (const u of topSlice.slice(0, delivered)) {
      const noise = 1 + (rng.next() - 0.5) * 2 * config.conversionNoise;
      revenue += Math.max(0, u.actual * config.revenueMultiplier * noise);
    }
    revenue = Math.round(revenue * 100) / 100;

    rows.push({
      topKPercent: pct,
      k,
      cost: Math.round(cost * 100) / 100,
      revenue,
      profit: Math.round((revenue - cost) * 100) / 100,
      roas: cost > 0 ? Math.round((revenue / cost) * 100) / 100 : 0,
      incrementalRevenue: Math.round((revenue - (baselineRevenue * (k / baselineK))) * 100) / 100,
      upliftVsBaseline: baselineRevenue > 0 ? Math.round(((revenue / (baselineRevenue * (k / baselineK))) - 1) * 1000) / 1000 : 0,
    });
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Uplift Model Simulation
// ═══════════════════════════════════════════════════════════════════════════════

export interface UpliftResult {
  treatmentSize: number;
  controlSize: number;
  treatmentAvgLTV: number;
  controlAvgLTV: number;
  ate: number;
  cateByDecile: { decile: number; cate: number; treatmentLTV: number; controlLTV: number }[];
  upliftCurve: { topPercent: number; cumulativeUplift: number }[];
}

export function simulateUplift(
  model: TrainedModelResult,
  treatmentFraction: number,
  seed = 42,
): UpliftResult {
  const rng = makeRng(seed);
  const sorted = [...model.allPredictions].sort((a, b) => b.predicted - a.predicted);
  const n = sorted.length;

  // Assign treatment/control
  const treatment: typeof sorted = [];
  const control: typeof sorted = [];
  for (const u of sorted) {
    if (rng.next() < treatmentFraction) treatment.push(u);
    else control.push(u);
  }

  // Treatment effect: higher-predicted users get more uplift
  const treatmentEffect = (pred: number) => {
    const base = 1 + (rng.next() - 0.3) * 0.6;
    const boost = pred > 10 ? 1.2 : pred > 5 ? 1.1 : 1.0;
    return base * boost;
  };

  const treatmentLTVs = treatment.map((u) => u.actual * treatmentEffect(u.predicted));
  const controlLTVs = control.map((u) => u.actual);

  const treatmentAvgLTV = Math.round(mean(treatmentLTVs) * 100) / 100;
  const controlAvgLTV = Math.round(mean(controlLTVs) * 100) / 100;
  const ate = Math.round((treatmentAvgLTV - controlAvgLTV) * 100) / 100;

  // CATE by decile
  const decileSize = Math.ceil(treatment.length / 10);
  const cateByDecile = [];
  for (let d = 0; d < 10; d++) {
    const tSlice = treatmentLTVs.slice(d * decileSize, (d + 1) * decileSize);
    const cSliceStart = Math.floor(d * control.length / 10);
    const cSliceEnd = Math.floor((d + 1) * control.length / 10);
    const cSlice = controlLTVs.slice(cSliceStart, cSliceEnd);
    const tAvg = mean(tSlice);
    const cAvg = mean(cSlice);
    cateByDecile.push({ decile: d + 1, cate: Math.round((tAvg - cAvg) * 100) / 100, treatmentLTV: Math.round(tAvg * 100) / 100, controlLTV: Math.round(cAvg * 100) / 100 });
  }

  // Uplift curve
  const upliftCurve = [];
  for (const pct of [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    const k = Math.max(1, Math.floor(treatment.length * pct / 100));
    const tSlice = treatmentLTVs.slice(0, k);
    const cK = Math.max(1, Math.floor(control.length * pct / 100));
    const cSlice = controlLTVs.slice(0, cK);
    const uplift = mean(tSlice) - mean(cSlice);
    upliftCurve.push({ topPercent: pct, cumulativeUplift: Math.round(uplift * 100) / 100 });
  }

  return { treatmentSize: treatment.length, controlSize: control.length, treatmentAvgLTV, controlAvgLTV, ate, cateByDecile, upliftCurve };
}
