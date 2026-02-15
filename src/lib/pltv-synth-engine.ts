// ─── pLTV Synthetic Data Generator ──────────────────────────────────────────
// Browser-compatible engine that generates players, events, payments, ua-costs,
// and labels in-memory, matching the CSV schemas consumed by PLTVSimPipeline.
// Ported from scripts/generate-game-data.js with full configurability.

import type {
  SimPlayerRow,
  SimEventRow,
  SimPaymentRow,
  SimUaCostRow,
  SimLabelRow,
} from "./pltv-sim-engine";

// ═══════════════════════════════════════════════════════════════════════════════
// Config Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SynthPopulationConfig {
  totalUsers: number;
  installWindowDays: number;
  cohortSkew: "uniform" | "campaign";
  pctReturning: number;        // 0-1
  geoEnabled: boolean;
  deviceMixEnabled: boolean;
}

export interface SynthMonetizationConfig {
  payerRate: number;           // 0-1
  revenueDistribution: "uniform" | "lognormal" | "pareto" | "custom";
  whaleTop1Share: number;      // 0-1 e.g. 0.40 = top 1% gets 40% rev
  giniCoefficient: number;     // 0-1
  heavyTailIntensity: number;  // 1-5
  avgTxnPerPayer: number;
  purchaseDecay: number;       // 0-1 how fast purchase rate drops
  burstBehavior: boolean;
  priceTiers: number[];        // e.g. [0.99, 4.99, 9.99, 49.99, 99.99]
}

export interface SynthBehavioralConfig {
  sessionCountMean: number;
  levelProgressionSpeed: number; // 0-1
  engagementDecay: number;       // 0-1
  activityVolatility: number;    // 0-1
  engagePayCorrelation: "weak" | "medium" | "strong";
}

export interface SynthNoiseConfig {
  labelNoisePct: number;         // 0-1
  missingFeaturesPct: number;    // 0-1
  delayedRevenue: boolean;
  injectLeakage: boolean;
  payerRateShift: boolean;       // shift payer rate mid-period
  economyShift: boolean;         // change economy mid-cohort
}

export interface SynthSimulationConfig {
  maxEventsPerUser: number;
  seed: number;
}

export interface SynthConfig {
  population: SynthPopulationConfig;
  monetization: SynthMonetizationConfig;
  behavioral: SynthBehavioralConfig;
  noise: SynthNoiseConfig;
  simulation: SynthSimulationConfig;
}

export interface SynthPreviewStats {
  expectedTotalRevenue: number;
  expectedArpu: number;
  expectedArppu: number;
  expectedPayerPct: number;
  expectedGini: number;
  expectedTxnCount: number;
  estimatedFileSizeKB: number;
}

export interface SynthOutputStats {
  users: number;
  transactions: number;
  events: number;
  totalRevenue: number;
  payerRate: number;
  arpu: number;
  arppu: number;
  giniCoefficient: number;
  playersRows: number;
  eventsRows: number;
  paymentsRows: number;
  labelsRows: number;
  uaCostsRows: number;
  revenueDistribution: number[];   // histogram buckets (10 bins)
  txnPerPayerDistribution: number[]; // histogram buckets (10 bins)
  ltvDistribution: number[];        // histogram buckets (10 bins)
}

export interface SynthResult {
  players: SimPlayerRow[];
  events: SimEventRow[];
  payments: SimPaymentRow[];
  uaCosts: SimUaCostRow[];
  labels: SimLabelRow[];
  stats: SynthOutputStats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Presets
// ═══════════════════════════════════════════════════════════════════════════════

export const SYNTH_PRESETS: Record<string, { label: string; description: string; config: SynthConfig }> = {
  balanced: {
    label: "Balanced",
    description: "Standard mobile game economy with moderate whale concentration",
    config: {
      population: { totalUsers: 2000, installWindowDays: 90, cohortSkew: "campaign", pctReturning: 0.15, geoEnabled: true, deviceMixEnabled: true },
      monetization: { payerRate: 0.08, revenueDistribution: "lognormal", whaleTop1Share: 0.35, giniCoefficient: 0.75, heavyTailIntensity: 2, avgTxnPerPayer: 5, purchaseDecay: 0.06, burstBehavior: false, priceTiers: [0.99, 4.99, 9.99, 19.99, 49.99, 99.99] },
      behavioral: { sessionCountMean: 12, levelProgressionSpeed: 0.5, engagementDecay: 0.08, activityVolatility: 0.3, engagePayCorrelation: "medium" },
      noise: { labelNoisePct: 0, missingFeaturesPct: 0, delayedRevenue: false, injectLeakage: false, payerRateShift: false, economyShift: false },
      simulation: { maxEventsPerUser: 150, seed: 42 },
    },
  },
  hyperCasual: {
    label: "Hyper Casual Low Monetization",
    description: "High volume, low payer rate, very small transactions",
    config: {
      population: { totalUsers: 5000, installWindowDays: 60, cohortSkew: "uniform", pctReturning: 0.05, geoEnabled: true, deviceMixEnabled: false },
      monetization: { payerRate: 0.02, revenueDistribution: "uniform", whaleTop1Share: 0.15, giniCoefficient: 0.45, heavyTailIntensity: 1, avgTxnPerPayer: 2, purchaseDecay: 0.15, burstBehavior: false, priceTiers: [0.99, 1.99, 2.99, 4.99] },
      behavioral: { sessionCountMean: 6, levelProgressionSpeed: 0.8, engagementDecay: 0.20, activityVolatility: 0.5, engagePayCorrelation: "weak" },
      noise: { labelNoisePct: 0, missingFeaturesPct: 0.02, delayedRevenue: false, injectLeakage: false, payerRateShift: false, economyShift: false },
      simulation: { maxEventsPerUser: 80, seed: 42 },
    },
  },
  whaleMMO: {
    label: "Whale Heavy MMO",
    description: "Deep spenders dominate revenue — extreme Pareto distribution",
    config: {
      population: { totalUsers: 2000, installWindowDays: 120, cohortSkew: "campaign", pctReturning: 0.25, geoEnabled: true, deviceMixEnabled: true },
      monetization: { payerRate: 0.06, revenueDistribution: "pareto", whaleTop1Share: 0.55, giniCoefficient: 0.90, heavyTailIntensity: 4, avgTxnPerPayer: 10, purchaseDecay: 0.03, burstBehavior: true, priceTiers: [4.99, 9.99, 19.99, 49.99, 99.99] },
      behavioral: { sessionCountMean: 20, levelProgressionSpeed: 0.3, engagementDecay: 0.04, activityVolatility: 0.2, engagePayCorrelation: "strong" },
      noise: { labelNoisePct: 0, missingFeaturesPct: 0, delayedRevenue: false, injectLeakage: false, payerRateShift: false, economyShift: false },
      simulation: { maxEventsPerUser: 200, seed: 42 },
    },
  },
  midcore: {
    label: "Mobile Midcore Realistic",
    description: "Realistic midcore RPG with campaign-driven cohorts and moderate whales",
    config: {
      population: { totalUsers: 2000, installWindowDays: 122, cohortSkew: "campaign", pctReturning: 0.20, geoEnabled: true, deviceMixEnabled: true },
      monetization: { payerRate: 0.07, revenueDistribution: "lognormal", whaleTop1Share: 0.40, giniCoefficient: 0.82, heavyTailIntensity: 3, avgTxnPerPayer: 6, purchaseDecay: 0.05, burstBehavior: true, priceTiers: [0.99, 4.99, 9.99, 19.99, 49.99, 99.99] },
      behavioral: { sessionCountMean: 15, levelProgressionSpeed: 0.4, engagementDecay: 0.06, activityVolatility: 0.25, engagePayCorrelation: "strong" },
      noise: { labelNoisePct: 0.02, missingFeaturesPct: 0.01, delayedRevenue: true, injectLeakage: false, payerRateShift: false, economyShift: false },
      simulation: { maxEventsPerUser: 180, seed: 42 },
    },
  },
};

export function getDefaultConfig(): SynthConfig {
  return JSON.parse(JSON.stringify(SYNTH_PRESETS.balanced.config));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Seeded RNG
// ═══════════════════════════════════════════════════════════════════════════════

class SeededRNG {
  private s: number;
  constructor(seed: number) { this.s = seed % 2147483647 || 1; }
  next(): number { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  int(min: number, max: number): number { return Math.floor(this.next() * (max - min + 1)) + min; }
  float(min: number, max: number): number { return this.next() * (max - min) + min; }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  normal(): number {
    const u1 = Math.max(1e-12, this.next());
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  pareto(alpha: number, xm = 1): number {
    return xm / Math.pow(1 - this.next(), 1 / alpha);
  }
  lognormal(mu: number, sigma: number): number {
    return Math.exp(mu + sigma * this.normal());
  }
}

function clamp(x: number, a = 0, b = 1): number { return Math.max(a, Math.min(b, x)); }
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }
function ts(ms: number): string { return new Date(ms).toISOString().replace(".000Z", "Z"); }

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const CHANNELS = ["meta_ads", "google_uac", "tiktok", "unity_ads", "organic", "influencer"];
const COUNTRIES = ["US", "KR", "JP", "TW", "TH", "BR", "DE", "RU"];
const OS_LIST: ("android" | "ios")[] = ["android", "ios"];
const DEVICES_ANDROID = ["Samsung Galaxy S24", "Xiaomi 14", "OPPO Find X7", "Pixel 8", "OnePlus 12"];
const DEVICES_IOS = ["iPhone 15 Pro", "iPhone 14", "iPhone 13", "iPad Pro 12.9"];
const CAMPAIGNS = ["l2m_launch_kr", "l2m_retarget_us", "l2m_broad_sea", "l2m_lookalike_jp", "l2m_video_tw", "l2m_brand_global"];
const ADSETS = ["high_spender_lal", "broad_male_25_44", "rpg_interest", "mmorpg_gamers", "new_installer_ret"];
const CREATIVES = ["cinematic_trailer", "gameplay_boss", "pvp_highlight", "gacha_reveal", "guild_war_cg"];
const SKU_CATEGORIES = ["monthly_card", "battle_pass", "gacha_pack", "gem_bundle", "starter_pack", "costume_box"];
const PAYMENT_CHANNELS = ["google_play", "app_store", "paypal", "carrier_billing"];
const EVENT_NAMES = ["session_start", "session_end", "quest_complete", "dungeon_clear", "pvp_match",
  "combat_hit", "mob_kill", "item_loot", "soft_earn", "soft_spend", "chat_message",
  "guild_join", "guild_activity", "gacha_open", "shop_view", "level_up", "friend_add"];

// ═══════════════════════════════════════════════════════════════════════════════
// Preview (fast estimation without full generation)
// ═══════════════════════════════════════════════════════════════════════════════

export function computePreview(cfg: SynthConfig): SynthPreviewStats {
  const { population: pop, monetization: mon, behavioral: beh } = cfg;
  const N = pop.totalUsers;
  const payerCount = Math.round(N * mon.payerRate);
  const nonPayerCount = N - payerCount;

  // Expected ARPPU based on distribution
  let expectedArppu: number;
  const avgPrice = mon.priceTiers.reduce((a, b) => a + b, 0) / (mon.priceTiers.length || 1);
  if (mon.revenueDistribution === "pareto") {
    expectedArppu = avgPrice * mon.avgTxnPerPayer * (1 + mon.heavyTailIntensity * 0.5);
  } else if (mon.revenueDistribution === "lognormal") {
    expectedArppu = avgPrice * mon.avgTxnPerPayer * (1 + mon.giniCoefficient * 0.3);
  } else {
    expectedArppu = avgPrice * mon.avgTxnPerPayer;
  }

  const totalRevenue = payerCount * expectedArppu;
  const arpu = N > 0 ? totalRevenue / N : 0;
  const txnCount = Math.round(payerCount * mon.avgTxnPerPayer);

  // Rough file size estimate: ~200 bytes/player + ~80 bytes/event + ~60 bytes/payment
  const estEvents = N * beh.sessionCountMean * cfg.simulation.maxEventsPerUser * 0.15;
  const estSizeKB = Math.round((N * 200 + estEvents * 80 + txnCount * 60) / 1024);

  return {
    expectedTotalRevenue: Math.round(totalRevenue),
    expectedArpu: Math.round(arpu * 100) / 100,
    expectedArppu: Math.round(expectedArppu * 100) / 100,
    expectedPayerPct: Math.round(mon.payerRate * 10000) / 100,
    expectedGini: mon.giniCoefficient,
    expectedTxnCount: txnCount,
    estimatedFileSizeKB: Math.max(100, estSizeKB),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Full Generation
// ═══════════════════════════════════════════════════════════════════════════════

export function generateSyntheticData(cfg: SynthConfig): SynthResult {
  const rng = new SeededRNG(cfg.simulation.seed);
  const { population: pop, monetization: mon, behavioral: beh, noise } = cfg;

  const BASE_DATE = new Date("2024-10-01T00:00:00Z");
  const baseMs = BASE_DATE.getTime();
  const DAY = 86400000;
  const HOUR = 3600000;

  const correlationStrength = beh.engagePayCorrelation === "strong" ? 0.75
    : beh.engagePayCorrelation === "medium" ? 0.45 : 0.15;

  // Archetype weights adjusted by config
  const archetypes = [
    { name: "whale",        w: 0.03 * (1 + mon.heavyTailIntensity * 0.1), lvl: [40, 70], retBase: 0.95, retDecay: 0.02, spendPrior: 1.7, engagePrior: 1.2 },
    { name: "dolphin",      w: 0.12, lvl: [25, 50], retBase: 0.80, retDecay: 0.05, spendPrior: 0.9, engagePrior: 0.8 },
    { name: "minnow",       w: 0.15, lvl: [15, 35], retBase: 0.65, retDecay: 0.08, spendPrior: 0.3, engagePrior: 0.5 },
    { name: "free_engaged",  w: 0.25, lvl: [20, 45], retBase: 0.70, retDecay: 0.06, spendPrior: -0.6, engagePrior: 0.9 },
    { name: "free_casual",   w: 0.30, lvl: [5, 20],  retBase: 0.45, retDecay: 0.12, spendPrior: -1.2, engagePrior: -0.2 },
    { name: "churned",       w: 0.15, lvl: [2, 10],  retBase: 0.20, retDecay: 0.25, spendPrior: -1.5, engagePrior: -1.0 },
  ];
  // Normalize weights
  const totalW = archetypes.reduce((s, a) => s + a.w, 0);
  archetypes.forEach(a => a.w /= totalW);

  // Pre-compute expected mean payLatent for calibration
  const engageWeightGlobal = 0.15 + correlationStrength * 0.45;
  const spendWeightGlobal = 1 - engageWeightGlobal;
  let expectedPayLatent = 0;
  for (const a of archetypes) {
    const expSpendL = a.spendPrior + correlationStrength * a.engagePrior * 1.2;
    expectedPayLatent += a.w * (spendWeightGlobal * expSpendL + engageWeightGlobal * a.engagePrior);
  }

  function pickArchetype() {
    const r = rng.next();
    let cum = 0;
    for (const a of archetypes) { cum += a.w; if (r < cum) return a; }
    return archetypes[4]; // free_casual
  }

  // Channel/country/device shifts
  function channelSpendShift(ch: string): number {
    if (ch === "influencer") return 0.25; if (ch === "meta_ads") return 0.15;
    if (ch === "google_uac") return -0.05; return 0.05;
  }
  function countryArppuShift(co: string): number {
    if (co === "KR") return 0.35; if (co === "JP") return 0.25; if (co === "US") return 0.15;
    if (co === "BR") return -0.10; if (co === "TH") return -0.05; return 0;
  }
  function deviceShift(tier: string): number {
    if (tier === "high") return 0.20; if (tier === "mid") return 0.05; return -0.10;
  }

  // Sample revenue amount based on distribution
  function sampleRevenue(spenderLatent: number, country: string): number {
    const tier = rng.pick(mon.priceTiers);
    const mult = 1 + (spenderLatent - 0.5) * 0.35 + countryArppuShift(country) * 0.15;

    if (mon.revenueDistribution === "pareto") {
      const alpha = Math.max(1.1, 5 - mon.heavyTailIntensity);
      return Math.max(0.99, +(tier * mult * rng.pareto(alpha, 0.8) * 0.5).toFixed(2));
    } else if (mon.revenueDistribution === "lognormal") {
      const sigma = 0.3 + mon.giniCoefficient * 0.5;
      return Math.max(0.99, +(tier * mult * rng.lognormal(0, sigma)).toFixed(2));
    } else {
      return Math.max(0.99, +(tier * mult * (1 + rng.normal() * 0.06)).toFixed(2));
    }
  }

  // ── Output buffers ──
  const playersOut: SimPlayerRow[] = [];
  const eventsOut: SimEventRow[] = [];
  const paymentsOut: SimPaymentRow[] = [];
  const labelsOut: SimLabelRow[] = [];
  const userRevenues: number[] = []; // for stats

  // Mid-period shift flags
  const midPeriodDay = Math.floor(pop.installWindowDays / 2);

  for (let i = 0; i < pop.totalUsers; i++) {
    const userId = `player_${String(i + 1).padStart(5, "0")}`;

    // Install timing
    let installOffset: number;
    if (pop.cohortSkew === "campaign") {
      // Cluster installs around campaign launches
      const cluster = rng.int(0, 3);
      const clusterCenter = Math.floor(pop.installWindowDays * (cluster + 0.5) / 4);
      installOffset = clamp(Math.round(clusterCenter + rng.normal() * 10), 0, pop.installWindowDays - 1);
    } else {
      installOffset = rng.int(0, pop.installWindowDays - 1);
    }
    const installHour = rng.int(0, 23);
    const installMs = baseMs + installOffset * DAY + installHour * HOUR;
    const installDate = ts(installMs).split("T")[0];

    // Cohort aging: older cohorts accumulate more days of behavior
    const daysAvailable = Math.min(90, pop.installWindowDays - installOffset);

    const os = rng.pick(OS_LIST);
    const device = os === "ios" ? rng.pick(DEVICES_IOS) : rng.pick(DEVICES_ANDROID);
    const channel = rng.pick(CHANNELS);
    const country = pop.geoEnabled ? rng.pick(COUNTRIES) : "US";
    const deviceTier = pop.deviceMixEnabled ? rng.pick(["low", "mid", "high"] as const) : "mid";
    const consentTracking = rng.next() > 0.15;
    const consentMarketing = rng.next() > 0.25;
    const campaignId = consentTracking ? rng.pick(CAMPAIGNS) : "unknown";
    const adsetId = consentTracking ? rng.pick(ADSETS) : "unknown";
    const creativeId = consentTracking ? rng.pick(CREATIVES) : "unknown";

    playersOut.push({
      game_user_id: userId,
      install_id: `i_${rng.int(100000, 999999)}`,
      install_time: ts(installMs),
      campaign_id: campaignId,
      adset_id: adsetId,
      creative_id: creativeId,
      channel, country, os, device_model: device, device_tier: deviceTier,
      consent_tracking: consentTracking,
      consent_marketing: consentMarketing,
    });

    // Latent variables
    const arche = pickArchetype();
    const engageLatent = arche.engagePrior + rng.normal() * 0.35;
    // Feed engagement INTO spend latent via correlationStrength
    // When correlation is strong, engaged users are much more likely to pay
    const spendLatent = arche.spendPrior + rng.normal() * 0.45
      + channelSpendShift(channel) + countryArppuShift(country) + deviceShift(deviceTier)
      + correlationStrength * engageLatent * 1.2;
    const engagement = clamp(sigmoid(engageLatent));
    const spender = clamp(sigmoid(spendLatent));

    // Retention-driven active days — engagement directly affects retention
    // Engaged users: lower decay → stay active longer → more active_days_w7d, smaller last_login_gap
    // Disengaged users: higher decay → churn fast → fewer active days, larger gap
    const activeDays: number[] = [];
    let streak = 0;
    const engageRetBoost = (engagement - 0.5) * correlationStrength * 0.7; // ±0.26 for strong
    const retDecay = clamp(arche.retDecay + beh.engagementDecay * 0.5 - engageRetBoost, 0.01, 0.5);
    const retBase = clamp(arche.retBase + engageRetBoost * 0.5, 0.1, 0.98);
    for (let day = 0; day <= Math.min(30, daysAvailable); day++) {
      const base = clamp(retBase + rng.float(-0.05, 0.05), 0.05, 0.99);
      const hazard = streak >= 2 ? 1 / (1 + 0.35 * (streak - 1)) : 1;
      const volatilityJitter = beh.activityVolatility * rng.normal() * 0.1;
      const p = clamp(base * Math.pow(1 - retDecay, day) * hazard + volatilityJitter, 0.01, 1);
      if (rng.next() < p) { activeDays.push(day); streak = 0; } else { streak++; }
    }

    // Sessions per active day
    // Wider engagement spread: engaged users get 2-4x more sessions than disengaged
    const sessionsPerDay = Math.max(1, Math.round((beh.sessionCountMean / 7) * (0.3 + 1.4 * engagement)));
    const maxLevel = rng.int(arche.lvl[0], arche.lvl[1]);
    const maxLevelW7 = Math.min(maxLevel, Math.round(maxLevel * beh.levelProgressionSpeed));

    // W7 summaries
    const activeDaysW7 = activeDays.filter(d => d <= 6).length;
    let sessionsW7 = 0;

    // Generate events — session_start/end are NEVER capped (needed for feature computation)
    // Only semantic events count toward the cap to prevent event stream truncation
    let semanticEventCount = 0;
    const maxSemanticEvents = cfg.simulation.maxEventsPerUser;
    for (const dayOff of activeDays) {
      const nSess = Math.min(6, Math.max(1, sessionsPerDay + (rng.next() < 0.15 ? 1 : 0)));
      for (let s = 0; s < nSess; s++) {
        const hour = rng.int(6, 23);
        const sMs = installMs + dayOff * DAY + hour * HOUR + rng.int(0, 3599) * 1000;
        const sid = `s${i}_${s}_d${dayOff}`;
        if (dayOff <= 6) sessionsW7++;

        // session_start (always emitted)
        eventsOut.push({ game_user_id: userId, event_time: ts(sMs), event_name: "session_start", session_id: sid, params: "" });

        // semantic events (capped)
        const intensity = 0.15 + 0.55 * engagement;
        const evtsPerSession = Math.max(2, Math.floor(3 + 10 * engagement));
        for (let e = 0; e < evtsPerSession && semanticEventCount < maxSemanticEvents; e++) {
          const offMs = Math.round((e + 1) / (evtsPerSession + 2) * 30 * 60000);
          const eventName = rng.pick(EVENT_NAMES.slice(2)); // skip session_start/end
          let params = "";
          if (eventName === "quest_complete") params = `quest=mq_${rng.int(1, 80)};xp=${rng.int(100, 5000)}`;
          else if (eventName === "pvp_match") params = `result=${rng.next() < 0.52 ? "win" : "lose"}`;
          else if (eventName === "level_up") params = `level=${Math.min(maxLevel, rng.int(2, maxLevel))}`;
          else if (eventName === "dungeon_clear") params = `dungeon=d_${rng.int(1, 6)}`;
          else if (eventName === "combat_hit") params = `dmg=${rng.int(20, 500)}`;
          else if (eventName === "mob_kill") params = `xp=${rng.int(50, 5000)}`;
          else if (eventName === "soft_earn") params = `amount=${rng.int(500, 5000)}`;
          else if (eventName === "soft_spend") params = `amount=${rng.int(200, 4000)}`;
          else if (eventName === "chat_message") params = `channel=${rng.pick(["world", "guild", "party"])}`;
          else if (eventName === "gacha_open") params = `type=${rng.pick(["weapon", "armor", "pet"])}`;

          if (rng.next() < intensity) {
            eventsOut.push({ game_user_id: userId, event_time: ts(sMs + offMs), event_name: eventName, session_id: sid, params });
            semanticEventCount++;
          }
        }

        // session_end (always emitted)
        eventsOut.push({ game_user_id: userId, event_time: ts(sMs + 30 * 60000), event_name: "session_end", session_id: sid, params: `duration_seconds=${rng.int(300, 3600)}` });
      }
    }

    // ── Payments ──
    // Apply mid-period payer rate shift if enabled
    let effectivePayerRate = mon.payerRate;
    if (noise.payerRateShift && installOffset >= midPeriodDay) {
      effectivePayerRate *= 0.6; // 40% drop in late cohorts
    }
    // Economy shift: change whale concentration mid-period
    let effectiveHeavyTail = mon.heavyTailIntensity;
    if (noise.economyShift && installOffset >= midPeriodDay) {
      effectiveHeavyTail = Math.max(1, effectiveHeavyTail - 1.5);
    }

    // Proper logistic pay model: calibrated to target payer rate
    // Combined latent score: higher = more likely to pay
    const engageWeight = 0.15 + correlationStrength * 0.45; // weak=0.22, medium=0.36, strong=0.49
    const spendWeight = 1 - engageWeight;
    const payLatent = spendWeight * spendLatent + engageWeight * engageLatent;
    // Logistic calibration: center by subtracting expected mean so avg output ≈ payerRate
    const payIntercept = Math.log(effectivePayerRate / (1 - effectivePayerRate));
    const centeredLatent = payLatent - expectedPayLatent;
    let payProb = 1 / (1 + Math.exp(-(payIntercept + 0.8 * centeredLatent)));
    const willPay = rng.next() < payProb;

    let ltv3 = 0, ltv7 = 0, ltv30 = 0, ltv90 = 0;
    let txnCount = 0;

    if (willPay) {
      const baseTxn = Math.max(1, Math.round(mon.avgTxnPerPayer * spender + rng.normal()));
      txnCount = Math.min(baseTxn, 25);

      // Late monetizer: engaged payers whose ALL purchases land after d7
      // This forces the model to use behavioral features (session_count, last_login_gap)
      // to identify these users since payment_sum_7d = 0 for them
      // Tiered: "mid" late (d8-14, ~30%) and "deep" late (d15+, ~70%) to prevent d14 window recapture
      const lateMonProb = correlationStrength * 0.7 * (0.4 + engagement); // strong+engaged → up to ~73%
      const isLateMonetizer = rng.next() < lateMonProb;
      const isDeepLate = isLateMonetizer && rng.next() < 0.85; // 85% of late monetizers pay after d14

      // Burst behavior: early spike
      const burstFraction = mon.burstBehavior ? 0.6 : 0.3;

      for (let t = 0; t < txnCount; t++) {
        let txnDayOffset: number;
        if (isDeepLate) {
          // Purchases shifted to d15+ — invisible to both d7 and d14 windows
          txnDayOffset = rng.int(15, Math.min(daysAvailable, 60));
        } else if (isLateMonetizer) {
          // Mid-late: purchases in d8-14 — invisible to d7 but visible to d14
          txnDayOffset = rng.int(8, 14);
        } else if (t < txnCount * burstFraction) {
          txnDayOffset = rng.int(0, 3); // early burst
        } else {
          const decay = mon.purchaseDecay;
          // Engaged users spread purchases later; disengaged users front-load
          // This creates the signal: high sessions → late monetizer → session features predict LTV
          const engageSpread = Math.round(engagement * correlationStrength * 30);
          const latestDay = Math.max(5, Math.round(90 * (1 - decay)) + engageSpread);
          txnDayOffset = Math.min(daysAvailable, rng.int(4, latestDay));
        }
        const txnMs = installMs + txnDayOffset * DAY + rng.int(0, 86399) * 1000;

        // Delayed revenue reporting noise
        let reportedMs = txnMs;
        if (noise.delayedRevenue && rng.next() < 0.15) {
          reportedMs += rng.int(1, 7) * DAY;
        }

        const productSku = rng.pick(SKU_CATEGORIES);
        const paymentChannel = rng.pick(PAYMENT_CHANNELS);
        const amount = sampleRevenue(spender, country);
        const isRefund = rng.next() < 0.01;
        const net = isRefund ? 0 : amount;

        paymentsOut.push({
          game_user_id: userId,
          txn_time: ts(reportedMs),
          amount_usd: amount,
          product_sku: productSku,
          payment_channel: paymentChannel,
          is_refund: isRefund,
        });

        const days = Math.floor((txnMs - installMs) / DAY);
        if (days <= 2) ltv3 += net;
        if (days <= 6) ltv7 += net;
        if (days <= 29) ltv30 += net;
        if (days <= 89) ltv90 += net;
      }
    }

    // Label noise injection
    if (noise.labelNoisePct > 0 && rng.next() < noise.labelNoisePct) {
      const noiseMult = 1 + rng.normal() * 0.5;
      ltv7 = Math.max(0, +(ltv7 * noiseMult).toFixed(2));
      ltv30 = Math.max(0, +(ltv30 * noiseMult).toFixed(2));
      ltv90 = Math.max(0, +(ltv90 * noiseMult).toFixed(2));
    }

    ltv3 = +ltv3.toFixed(2);
    ltv7 = +ltv7.toFixed(2);
    ltv30 = +ltv30.toFixed(2);
    ltv90 = +ltv90.toFixed(2);

    const uaCost = consentTracking ? +rng.float(1.5, 8).toFixed(2) : 0;
    const profitD90 = +(ltv90 - uaCost).toFixed(2);

    const lateMonetizer = willPay && ltv7 === 0 && ltv30 > 0 ? 1 : 0;
    const falseEarlyPayer = willPay && ltv3 > ltv90 * 0.8 && ltv90 > 0 ? 1 : 0;

    // Missing features noise
    const missingMask = noise.missingFeaturesPct > 0 && rng.next() < noise.missingFeaturesPct;

    labelsOut.push({
      game_user_id: userId,
      install_date: installDate,
      ua_cost: uaCost,
      ltv_d3: ltv3,
      ltv_d7: missingMask ? 0 : ltv7,
      ltv_d30: ltv30,
      ltv_d90: ltv90,
      is_payer_by_d3: ltv3 > 0 ? 1 : 0,
      is_payer_by_d7: missingMask ? 0 : (ltv7 > 0 ? 1 : 0),
      is_payer_by_d30: ltv30 > 0 ? 1 : 0,
      is_payer_by_d90: ltv90 > 0 ? 1 : 0,
      profit_d90: profitD90,
      late_monetizer_flag: lateMonetizer,
      false_early_payer_flag: falseEarlyPayer,
      active_days_w7d: missingMask ? 0 : activeDaysW7,
      sessions_cnt_w7d: missingMask ? 0 : sessionsW7,
      max_level_w7d: missingMask ? 0 : maxLevelW7,
    });

    // Leakage injection: add future LTV into d7 labels (danger!)
    if (noise.injectLeakage && rng.next() < 0.3) {
      const last = labelsOut[labelsOut.length - 1];
      last.ltv_d7 = +(last.ltv_d7 + ltv30 * 0.5).toFixed(2);
    }

    userRevenues.push(ltv90);
  }

  // ── UA Costs ──
  const uaCostsOut: SimUaCostRow[] = [];
  for (const campaign of CAMPAIGNS) {
    for (let d = 0; d < pop.installWindowDays; d++) {
      const date = new Date(baseMs + d * DAY);
      let dailySpend = rng.float(800, 7000);
      let cpi = rng.float(1.2, 10);
      if (campaign.includes("launch_kr")) { dailySpend *= 1.25; cpi *= 1.15; }
      if (campaign.includes("retarget")) { dailySpend *= 0.85; cpi *= 1.05; }
      dailySpend = +dailySpend.toFixed(2);
      cpi = Math.max(0.6, +cpi.toFixed(2));
      const installs = Math.max(0, Math.round(dailySpend / cpi));
      uaCostsOut.push({
        campaign_id: campaign,
        date: date.toISOString().split("T")[0],
        spend: dailySpend,
        impressions: installs * rng.int(40, 220),
        clicks: installs * rng.int(2, 18),
        installs,
      });
    }
  }

  // ── Compute stats ──
  const totalRevenue = userRevenues.reduce((s, v) => s + v, 0);
  const payers = userRevenues.filter(v => v > 0);
  const payerRate = payers.length / (pop.totalUsers || 1);
  const arpu = totalRevenue / (pop.totalUsers || 1);
  const arppu = payers.length > 0 ? totalRevenue / payers.length : 0;

  // Gini coefficient
  const sorted = [...userRevenues].sort((a, b) => a - b);
  const n = sorted.length;
  let giniNum = 0;
  for (let i = 0; i < n; i++) giniNum += (2 * (i + 1) - n - 1) * sorted[i];
  const gini = n > 0 && totalRevenue > 0 ? giniNum / (n * totalRevenue) : 0;

  // Histograms (10 bins)
  function histogram(arr: number[], bins = 10): number[] {
    if (!arr.length) return new Array(bins).fill(0);
    const max = Math.max(...arr);
    const min = Math.min(...arr);
    const range = max - min || 1;
    const out = new Array(bins).fill(0);
    for (const v of arr) {
      const idx = Math.min(bins - 1, Math.floor((v - min) / range * bins));
      out[idx]++;
    }
    return out;
  }

  const payerRevs = userRevenues.filter(v => v > 0);
  const txnsPerPayer: number[] = [];
  const payerPayments = new Map<string, number>();
  for (const p of paymentsOut) {
    if (!p.is_refund) payerPayments.set(p.game_user_id, (payerPayments.get(p.game_user_id) || 0) + 1);
  }
  for (const c of payerPayments.values()) txnsPerPayer.push(c);

  return {
    players: playersOut,
    events: eventsOut,
    payments: paymentsOut,
    uaCosts: uaCostsOut,
    labels: labelsOut,
    stats: {
      users: pop.totalUsers,
      transactions: paymentsOut.length,
      events: eventsOut.length,
      totalRevenue: Math.round(totalRevenue),
      payerRate: Math.round(payerRate * 10000) / 100,
      arpu: Math.round(arpu * 100) / 100,
      arppu: Math.round(arppu * 100) / 100,
      giniCoefficient: Math.round(gini * 100) / 100,
      playersRows: playersOut.length,
      eventsRows: eventsOut.length,
      paymentsRows: paymentsOut.length,
      labelsRows: labelsOut.length,
      uaCostsRows: uaCostsOut.length,
      revenueDistribution: histogram(payerRevs),
      txnPerPayerDistribution: histogram(txnsPerPayer),
      ltvDistribution: histogram(userRevenues),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV Serialization
// ═══════════════════════════════════════════════════════════════════════════════

function csvLine(values: (string | number | boolean)[]): string {
  return values.map(v => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

export function serializePlayersCsv(rows: SimPlayerRow[]): string {
  const header = "game_user_id,install_id,install_time,campaign_id,adset_id,creative_id,channel,country,os,device_model,device_tier,consent_tracking,consent_marketing";
  const lines = rows.map(r => csvLine([r.game_user_id, r.install_id, r.install_time, r.campaign_id, r.adset_id, r.creative_id, r.channel, r.country, r.os, r.device_model, r.device_tier, r.consent_tracking, r.consent_marketing]));
  return [header, ...lines].join("\n");
}

export function serializeEventsCsv(rows: SimEventRow[]): string {
  const header = "game_user_id,event_time,event_name,session_id,params";
  const lines = rows.map(r => csvLine([r.game_user_id, r.event_time, r.event_name, r.session_id, r.params]));
  return [header, ...lines].join("\n");
}

export function serializePaymentsCsv(rows: SimPaymentRow[]): string {
  const header = "game_user_id,txn_time,amount_usd,product_sku,payment_channel,is_refund";
  const lines = rows.map(r => csvLine([r.game_user_id, r.txn_time, r.amount_usd, r.product_sku, r.payment_channel, r.is_refund]));
  return [header, ...lines].join("\n");
}

export function serializeUaCostsCsv(rows: SimUaCostRow[]): string {
  const header = "campaign_id,date,spend,impressions,clicks,installs";
  const lines = rows.map(r => csvLine([r.campaign_id, r.date, r.spend, r.impressions, r.clicks, r.installs]));
  return [header, ...lines].join("\n");
}

export function serializeLabelsCsv(rows: SimLabelRow[]): string {
  const header = "game_user_id,install_date,ua_cost,ltv_d3,ltv_d7,ltv_d30,ltv_d90,is_payer_by_d3,is_payer_by_d7,is_payer_by_d30,is_payer_by_d90,profit_d90,late_monetizer_flag,false_early_payer_flag,active_days_w7d,sessions_cnt_w7d,max_level_w7d";
  const lines = rows.map(r => csvLine([r.game_user_id, r.install_date, r.ua_cost, r.ltv_d3, r.ltv_d7, r.ltv_d30, r.ltv_d90, r.is_payer_by_d3, r.is_payer_by_d7, r.is_payer_by_d30, r.is_payer_by_d90, r.profit_d90, r.late_monetizer_flag, r.false_early_payer_flag, r.active_days_w7d, r.sessions_cnt_w7d, r.max_level_w7d]));
  return [header, ...lines].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Compute stats from parsed CSV data (for verifying written files)
// ═══════════════════════════════════════════════════════════════════════════════

function histogramFromArray(arr: number[], bins = 10): number[] {
  if (!arr.length) return new Array(bins).fill(0);
  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const range = max - min || 1;
  const out = new Array(bins).fill(0);
  for (const v of arr) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / range * bins));
    out[idx]++;
  }
  return out;
}

export function computeStatsFromData(
  players: SimPlayerRow[],
  events: SimEventRow[],
  payments: SimPaymentRow[],
  uaCosts: SimUaCostRow[],
  labels: SimLabelRow[],
): SynthOutputStats {
  const N = players.length;

  // Revenue per user from labels
  const userRevenues = labels.map(l => l.ltv_d90);
  const totalRevenue = userRevenues.reduce((s, v) => s + v, 0);
  const payers = userRevenues.filter(v => v > 0);
  const payerRate = N > 0 ? payers.length / N : 0;
  const arpu = N > 0 ? totalRevenue / N : 0;
  const arppu = payers.length > 0 ? totalRevenue / payers.length : 0;

  // Gini
  const sorted = [...userRevenues].sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < sorted.length; i++) giniNum += (2 * (i + 1) - sorted.length - 1) * sorted[i];
  const gini = sorted.length > 0 && totalRevenue > 0 ? giniNum / (sorted.length * totalRevenue) : 0;

  // Txns per payer
  const payerTxns = new Map<string, number>();
  for (const p of payments) {
    if (!p.is_refund) payerTxns.set(p.game_user_id, (payerTxns.get(p.game_user_id) || 0) + 1);
  }
  const txnsPerPayer = [...payerTxns.values()];
  const payerRevs = userRevenues.filter(v => v > 0);

  return {
    users: N,
    transactions: payments.length,
    events: events.length,
    totalRevenue: Math.round(totalRevenue),
    payerRate: Math.round(payerRate * 10000) / 100,
    arpu: Math.round(arpu * 100) / 100,
    arppu: Math.round(arppu * 100) / 100,
    giniCoefficient: Math.round(gini * 100) / 100,
    playersRows: players.length,
    eventsRows: events.length,
    paymentsRows: payments.length,
    labelsRows: labels.length,
    uaCostsRows: uaCosts.length,
    revenueDistribution: histogramFromArray(payerRevs),
    txnPerPayerDistribution: histogramFromArray(txnsPerPayer),
    ltvDistribution: histogramFromArray(userRevenues),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Correlation Report (JSON export)
// ═══════════════════════════════════════════════════════════════════════════════

export interface FeatureCorrelationEntry {
  feature: string;
  corr_ltv_d30: number;
  corr_ltv_d90: number;
  mean_payer: number;
  mean_nonpayer: number;
  separation_ratio: number;
}

export interface CorrelationReport {
  generated_at: string;
  synth_config: SynthConfig | null;
  dataset_rows: number;
  payer_count: number;
  payer_rate_pct: number;
  target_corr_ltv7_vs_ltv30: number;
  features: FeatureCorrelationEntry[];
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  const denom = Math.sqrt(vx * vy);
  return denom > 0 ? cov / denom : 0;
}

export function computeCorrelationReport(
  featureMatrix: Record<string, number>[],
  config?: SynthConfig | null,
): CorrelationReport {
  if (!featureMatrix.length) {
    return { generated_at: new Date().toISOString(), synth_config: config ?? null, dataset_rows: 0, payer_count: 0, payer_rate_pct: 0, target_corr_ltv7_vs_ltv30: 0, features: [] };
  }

  const N = featureMatrix.length;
  const ltv30 = featureMatrix.map(r => r.target_ltv30 ?? 0);
  const ltv90 = featureMatrix.map(r => r.target_ltv90 ?? 0);

  // Payer/nonpayer split based on ltv_d30 > 0
  const payerIdx = ltv30.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);
  const nonPayerIdx = ltv30.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0);

  // All numeric feature columns (exclude targets and game_user_id)
  const allKeys = Object.keys(featureMatrix[0]);
  const featureKeys = allKeys.filter(k =>
    !k.startsWith("target_") && k !== "game_user_id" && typeof featureMatrix[0][k] === "number"
  );

  // ltv_d7 proxy: payment_sum_7d if available, else try ltv_d7
  const ltv7proxy = featureMatrix.map(r => r.payment_sum_7d ?? 0);
  const corrLtv7vsLtv30 = pearson(ltv7proxy, ltv30);

  const features: FeatureCorrelationEntry[] = featureKeys.map(k => {
    const vals = featureMatrix.map(r => (r[k] as number) ?? 0);
    const corrD30 = pearson(vals, ltv30);
    const corrD90 = pearson(vals, ltv90);
    const meanPayer = payerIdx.length > 0
      ? payerIdx.reduce((s, i) => s + (featureMatrix[i][k] as number ?? 0), 0) / payerIdx.length : 0;
    const meanNonPayer = nonPayerIdx.length > 0
      ? nonPayerIdx.reduce((s, i) => s + (featureMatrix[i][k] as number ?? 0), 0) / nonPayerIdx.length : 0;
    const sep = meanNonPayer !== 0 ? meanPayer / meanNonPayer : meanPayer > 0 ? Infinity : 1;

    return {
      feature: k,
      corr_ltv_d30: Math.round(corrD30 * 10000) / 10000,
      corr_ltv_d90: Math.round(corrD90 * 10000) / 10000,
      mean_payer: Math.round(meanPayer * 100) / 100,
      mean_nonpayer: Math.round(meanNonPayer * 100) / 100,
      separation_ratio: Math.round(sep * 100) / 100,
    };
  });

  // Sort by absolute correlation to ltv_d30 descending
  features.sort((a, b) => Math.abs(b.corr_ltv_d30) - Math.abs(a.corr_ltv_d30));

  return {
    generated_at: new Date().toISOString(),
    synth_config: config ?? null,
    dataset_rows: N,
    payer_count: payerIdx.length,
    payer_rate_pct: Math.round(payerIdx.length / N * 10000) / 100,
    target_corr_ltv7_vs_ltv30: Math.round(corrLtv7vsLtv30 * 10000) / 10000,
    features,
  };
}
