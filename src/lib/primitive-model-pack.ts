// ─── Primitive Model Pack ─────────────────────────────────────────────────────
// Deterministic heuristic scoring functions that operate on PLTVFeatureRow fields.
// These allow Decision Lab to work out-of-the-box without training/scoring steps.

import type { PLTVFeatureRow, PLTVScoredUser, ModelCategory } from "@/lib/types";

// ─── Seeded random for deterministic per-user noise ──────────────────────────

function seededRand(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  h = ((h >>> 0) % 10000) / 10000;
  return h;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

// ─── Scoring functions per model family ──────────────────────────────────────

function scoreValue(r: PLTVFeatureRow): Record<string, number> {
  const noise = seededRand(r.game_user_id + "val") * 0.08 - 0.04;
  const base =
    (r.revenue_d7 || 0) * 3.2 +
    (r.num_txn_d7 || 0) * 8 +
    (r.sessions_cnt_w7d || 0) * 1.5 +
    (r.max_level_w7d || 0) * 0.8 +
    (r.active_days_w7d || 0) * 2.5 +
    (r.shop_views_w7d || 0) * 0.6 +
    (r.gacha_opens_w7d || 0) * 1.2 +
    (r.is_payer_by_d7 || 0) * 25;
  const pltv = Math.max(0, base * (1 + noise));
  return { pltv_pred: Math.round(pltv * 100) / 100 };
}

function scoreRisk(r: PLTVFeatureRow): Record<string, number> {
  const noise = seededRand(r.game_user_id + "risk") * 0.06 - 0.03;
  const engagement =
    ((r.sessions_cnt_w7d || 0) / 20) * 0.25 +
    ((r.active_days_w7d || 0) / 7) * 0.3 +
    ((r.max_level_w7d || 0) / 50) * 0.15 +
    ((r.friends_added_w7d || 0) / 10) * 0.1 +
    ((r.pvp_matches_w7d || 0) / 15) * 0.1 +
    (r.is_payer_by_d7 || 0) * 0.1;
  const churn = clamp(1 - engagement + noise);
  return { churn_risk: Math.round(churn * 1000) / 1000 };
}

function scoreOffer(r: PLTVFeatureRow): Record<string, number> {
  const noise = seededRand(r.game_user_id + "offer") * 0.08 - 0.04;
  const shopInterest = ((r.shop_views_w7d || 0) / 20) * 0.3 +
    ((r.iap_offer_views_w7d || 0) / 10) * 0.25 +
    ((r.gacha_opens_w7d || 0) / 15) * 0.2 +
    (1 - (r.is_payer_by_d7 || 0)) * 0.15 +
    ((r.sessions_cnt_w7d || 0) / 20) * 0.1;
  const uplift = clamp(shopInterest + noise);
  const purchaseProb = clamp(uplift * 0.7 + (r.is_payer_by_d7 || 0) * 0.2 + noise * 0.5);
  return {
    uplift_score: Math.round(uplift * 1000) / 1000,
    purchase_prob_discount_10: Math.round(purchaseProb * 1000) / 1000,
  };
}

function scoreIntent(r: PLTVFeatureRow): Record<string, number> {
  const noise = seededRand(r.game_user_id + "intent") * 0.06 - 0.03;
  const pvpProb = clamp(((r.pvp_matches_w7d || 0) / 20) * 0.6 + ((r.max_level_w7d || 0) / 50) * 0.2 + noise);
  const guildProb = clamp(((r.joined_guild_by_d3 || 0)) * 0.3 + ((r.guild_activity_events_w7d || 0) / 10) * 0.3 + ((r.friends_added_w7d || 0) / 10) * 0.2 + ((r.chat_messages_w7d || 0) / 20) * 0.2 + noise);
  const cosmeticProb = clamp(((r.shop_views_w7d || 0) / 15) * 0.4 + ((r.gacha_opens_w7d || 0) / 10) * 0.35 + ((r.hard_currency_spent_w7d || 0) / 500) * 0.25 + noise);
  return {
    role_pvp_competitor_prob: Math.round(pvpProb * 1000) / 1000,
    role_guild_leader_prob: Math.round(guildProb * 1000) / 1000,
    role_cosmetic_buyer_prob: Math.round(cosmeticProb * 1000) / 1000,
  };
}

// ─── Primitive Model Registry ────────────────────────────────────────────────

export interface PrimitiveModel {
  id: number;
  name: string;
  family: ModelCategory;
  description: string;
  primaryScoreField: string;
  scoreFn: (r: PLTVFeatureRow) => Record<string, number>;
}

export const PRIMITIVE_MODELS: PrimitiveModel[] = [
  {
    id: -1,
    name: "Value Heuristic v1",
    family: "value",
    description: "Predicts pLTV from early monetization + engagement signals",
    primaryScoreField: "pltv_pred",
    scoreFn: scoreValue,
  },
  {
    id: -2,
    name: "Churn Risk Heuristic v1",
    family: "risk",
    description: "Estimates 14-day churn probability from engagement decay",
    primaryScoreField: "churn_risk",
    scoreFn: scoreRisk,
  },
  {
    id: -3,
    name: "Offer Sensitivity Heuristic v1",
    family: "responsiveness",
    description: "Predicts purchase uplift and discount sensitivity",
    primaryScoreField: "uplift_score",
    scoreFn: scoreOffer,
  },
  {
    id: -4,
    name: "Intent / Role Classifier v1",
    family: "intent",
    description: "Classifies player archetype probabilities (PvP, guild, cosmetic)",
    primaryScoreField: "role_pvp_competitor_prob",
    scoreFn: scoreIntent,
  },
];

// ─── Generate demo scoring result from featureRows ───────────────────────────

function assignDeciles(users: { score: number; idx: number }[]): number[] {
  const sorted = [...users].sort((a, b) => a.score - b.score);
  const deciles = new Array<number>(users.length);
  for (let i = 0; i < sorted.length; i++) {
    deciles[sorted[i].idx] = Math.min(10, Math.floor((i / sorted.length) * 10) + 1);
  }
  return deciles;
}

export function generateDemoScoring(
  featureRows: PLTVFeatureRow[],
  category: ModelCategory,
): {
  modelName: string;
  datasetName: string;
  scoredUsers: PLTVScoredUser[];
  timestamp: number;
} {
  const models = PRIMITIVE_MODELS.filter((m) => m.family === category);
  if (!models.length) {
    // fallback to value
    return generateDemoScoring(featureRows, "value");
  }

  const primaryModel = models[0];
  const allScores = featureRows.map((r, idx) => {
    const scores: Record<string, number> = {};
    for (const m of PRIMITIVE_MODELS) {
      Object.assign(scores, m.scoreFn(r));
    }
    return { row: r, scores, idx };
  });

  // Compute pltv_pred from value model if not the primary
  const pltv = allScores.map((s) => s.scores.pltv_pred ?? 0);
  const primaryScores = allScores.map((s) => s.scores[primaryModel.primaryScoreField] ?? 0);

  // Use primary score for decile assignment
  const deciles = assignDeciles(primaryScores.map((score, idx) => ({ score, idx })));

  const scoredUsers: PLTVScoredUser[] = allScores.map((s, i) => ({
    game_user_id: s.row.game_user_id,
    pltv_pred: s.scores.pltv_pred ?? pltv[i],
    pltv_decile: deciles[i],
    is_top_1pct: deciles[i] === 10 && primaryScores[i] >= (primaryScores.sort((a, b) => b - a)[Math.floor(primaryScores.length * 0.01)] ?? Infinity),
    actual_ltv_d60: s.row.ltv_d60 ?? s.scores.pltv_pred ?? 0,
    segment: deciles[i] >= 9 ? "High" : deciles[i] >= 5 ? "Mid" : "Low",
    features: { ...s.row, ...s.scores } as unknown as PLTVFeatureRow,
  }));

  return {
    modelName: `${primaryModel.name} — Demo`,
    datasetName: "Feature Store (Demo)",
    scoredUsers,
    timestamp: Date.now(),
  };
}

// ─── Default composite specs per category ────────────────────────────────────

export function getDefaultCompositeSpec(category: ModelCategory): {
  inputs: { id: string; scoreField: string; weight: number; normalize: "none" | "minmax" | "zscore" | "percentile" }[];
  outputScale: "0_1" | "0_100";
} {
  switch (category) {
    case "value":
      return { inputs: [{ id: "c1", scoreField: "pltv_pred", weight: 1, normalize: "minmax" }], outputScale: "0_100" };
    case "risk":
      return {
        inputs: [
          { id: "c1", scoreField: "pltv_pred", weight: 0.7, normalize: "minmax" },
          { id: "c2", scoreField: "churn_risk", weight: 0.3, normalize: "minmax" },
        ],
        outputScale: "0_100",
      };
    case "responsiveness":
      return { inputs: [{ id: "c1", scoreField: "uplift_score", weight: 1, normalize: "minmax" }], outputScale: "0_100" };
    case "intent":
      return { inputs: [{ id: "c1", scoreField: "role_pvp_competitor_prob", weight: 1, normalize: "none" }], outputScale: "0_1" };
    default:
      return { inputs: [{ id: "c1", scoreField: "pltv_pred", weight: 1, normalize: "minmax" }], outputScale: "0_100" };
  }
}
