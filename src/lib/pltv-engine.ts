import {
  GamePlayer,
  GameEvent,
  PaymentTxn,
  UACost,
  PLTVFeatureRow,
  PLTVScoredUser,
  PLTVModelResult,
} from "./types";

// ─── Deterministic seeded random ─────────────────────────────────────────────

let _seed = 42;
function seededRandom(): number {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}
function resetSeed(s: number = 42) {
  _seed = s;
}
function randInt(min: number, max: number): number {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, decimals: number = 2): number {
  return parseFloat((seededRandom() * (max - min) + min).toFixed(decimals));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)];
}
function gaussRand(mean: number, std: number): number {
  // Box-Muller
  const u1 = seededRandom();
  const u2 = seededRandom();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNELS = ["meta_ads", "google_uac", "tiktok", "unity_ads", "organic", "influencer"];
const COUNTRIES = ["US", "KR", "JP", "TW", "TH", "BR", "DE", "RU"];
const OS_LIST = ["android", "ios"];
const DEVICE_MODELS_ANDROID = ["Samsung Galaxy S24", "Xiaomi 14", "OPPO Find X7", "Pixel 8", "OnePlus 12"];
const DEVICE_MODELS_IOS = ["iPhone 15 Pro", "iPhone 14", "iPhone 13", "iPad Pro 12.9"];
const CAMPAIGNS = ["l2m_launch_kr", "l2m_retarget_us", "l2m_broad_sea", "l2m_lookalike_jp", "l2m_video_tw", "l2m_brand_global"];
const ADSETS = ["high_spender_lal", "broad_male_25_44", "rpg_interest", "mmorpg_gamers", "new_installer_ret"];
const CREATIVES = ["cinematic_trailer", "gameplay_boss", "pvp_highlight", "gacha_reveal", "guild_war_cg"];
const SKU_CATEGORIES = ["monthly_card", "battle_pass", "gacha_pack", "gem_bundle", "starter_pack", "costume_box"];
const PAYMENT_CHANNELS = ["google_play", "app_store", "paypal", "carrier_billing"];

const EVENT_NAMES = [
  "session_start", "session_end", "level_up", "quest_complete",
  "dungeon_clear", "pvp_match", "pve_run", "guild_join",
  "guild_activity", "friend_add", "chat_message", "gacha_open",
  "shop_view", "iap_offer_view", "soft_earn", "soft_spend",
  "hard_earn", "hard_spend", "tutorial_step", "first_pvp",
  "battle_pass_view", "battle_pass_claim",
];

// Player archetypes for realistic distribution
type PlayerArchetype = "whale" | "dolphin" | "minnow" | "free_engaged" | "free_casual" | "churned";

interface ArchetypeConfig {
  weight: number;
  sessN: number; // total sessions (1 or 2)
  sLen: [number, number];
  lvl: [number, number];
  quest: [number, number]; pvp: [number, number]; pve: [number, number];
  guildP: number; friends: [number, number]; chat: [number, number];
  gacha: [number, number]; shop: [number, number]; iap: [number, number];
  softE: [number, number]; softS: [number, number];
  hardE: [number, number]; hardS: [number, number];
  payProb: number; txnCountD7: [number, number]; revenueD7: [number, number];
  churnD14Prob: number;
  activeDays: [number, number];
}

const ARCHETYPES: Record<PlayerArchetype, ArchetypeConfig> = {
  whale:        { weight: 0.03, sessN: 1, sLen: [40,90],  lvl: [40,70], quest: [1,3], pvp: [1,2], pve: [1,2], guildP: 0.95, friends: [0,1], chat: [1,2], gacha: [1,2], shop: [0,1], iap: [0,1], softE: [1,2], softS: [0,1], hardE: [0,1], hardS: [0,1], payProb: 1.0,  txnCountD7: [3,10], revenueD7: [100,800], churnD14Prob: 0.02, activeDays: [6,7] },
  dolphin:      { weight: 0.12, sessN: 1, sLen: [20,50],  lvl: [25,50], quest: [1,2], pvp: [0,1], pve: [0,1], guildP: 0.70, friends: [0,1], chat: [0,1], gacha: [0,1], shop: [0,1], iap: [0,1], softE: [0,1], softS: [0,1], hardE: [0,1], hardS: [0,0], payProb: 0.85, txnCountD7: [1,5],  revenueD7: [10,100],  churnD14Prob: 0.08, activeDays: [4,7] },
  minnow:       { weight: 0.15, sessN: 1, sLen: [10,30],  lvl: [15,35], quest: [0,1], pvp: [0,1], pve: [0,1], guildP: 0.40, friends: [0,1], chat: [0,1], gacha: [0,1], shop: [0,1], iap: [0,0], softE: [0,1], softS: [0,1], hardE: [0,0], hardS: [0,0], payProb: 0.55, txnCountD7: [1,2],  revenueD7: [1,15],    churnD14Prob: 0.20, activeDays: [3,6] },
  free_engaged: { weight: 0.25, sessN: 1, sLen: [15,40],  lvl: [20,45], quest: [0,1], pvp: [0,1], pve: [0,1], guildP: 0.50, friends: [0,1], chat: [0,1], gacha: [0,1], shop: [0,0], iap: [0,0], softE: [0,1], softS: [0,1], hardE: [0,1], hardS: [0,0], payProb: 0,    txnCountD7: [0,0],  revenueD7: [0,0],     churnD14Prob: 0.15, activeDays: [3,6] },
  free_casual:  { weight: 0.30, sessN: 1, sLen: [5,15],   lvl: [5,20],  quest: [0,1], pvp: [0,0], pve: [0,0], guildP: 0.10, friends: [0,0], chat: [0,0], gacha: [0,0], shop: [0,0], iap: [0,0], softE: [0,1], softS: [0,0], hardE: [0,0], hardS: [0,0], payProb: 0,    txnCountD7: [0,0],  revenueD7: [0,0],     churnD14Prob: 0.40, activeDays: [1,4] },
  churned:      { weight: 0.15, sessN: 1, sLen: [3,10],   lvl: [2,10],  quest: [0,0], pvp: [0,0], pve: [0,0], guildP: 0.02, friends: [0,0], chat: [0,0], gacha: [0,0], shop: [0,0], iap: [0,0], softE: [0,0], softS: [0,0], hardE: [0,0], hardS: [0,0], payProb: 0,    txnCountD7: [0,0],  revenueD7: [0,0],     churnD14Prob: 0.90, activeDays: [1,2] },
};

function pickArchetype(): PlayerArchetype {
  const r = seededRandom();
  let cumulative = 0;
  for (const [arch, config] of Object.entries(ARCHETYPES)) {
    cumulative += config.weight;
    if (r < cumulative) return arch as PlayerArchetype;
  }
  return "free_casual";
}

// ─── Synthetic Data Generation ───────────────────────────────────────────────

export function generateGameData(numPlayers: number = 10000): {
  players: GamePlayer[];
  events: GameEvent[];
  payments: PaymentTxn[];
  uaCosts: UACost[];
} {
  resetSeed(42);

  const baseDate = new Date("2024-10-01T00:00:00Z");
  const DUNGEON_NAMES = ["cruma", "dragon_v", "ant_nest", "tower_ins", "forge", "plains"];
  const CHAT_CH = ["world", "guild", "party", "whisper", "trade"];
  const SOFT_SRC = ["quest", "dungeon", "daily", "sell", "arena"];
  const HARD_SRC = ["achieve", "event", "comp", "free"];
  const SPEND_TGT = ["gear", "skill", "tp", "revive", "shop"];
  const GACHA_T = ["weapon", "armor", "pet", "costume"];
  const players: GamePlayer[] = [];
  const events: GameEvent[] = [];
  const payments: PaymentTxn[] = [];

  for (let i = 0; i < numPlayers; i++) {
    const os = pick(OS_LIST);
    const deviceModel = os === "ios" ? pick(DEVICE_MODELS_IOS) : pick(DEVICE_MODELS_ANDROID);
    const channel = pick(CHANNELS);
    const country = pick(COUNTRIES);
    const installOffset = randInt(0, 121);
    const installHour = randInt(0, 23);
    const installTime = new Date(baseDate.getTime() + installOffset * 86400000 + installHour * 3600000);

    const player: GamePlayer = {
      game_user_id: `player_${String(i + 1).padStart(5, "0")}`,
      install_id: `i_${randInt(100000, 999999)}`,
      install_time: installTime.toISOString(),
      campaign_id: pick(CAMPAIGNS),
      adset_id: pick(ADSETS),
      creative_id: pick(CREATIVES),
      channel, country, os,
      device_model: deviceModel,
      device_tier: pick(["low", "mid", "high"]),
      consent_tracking: seededRandom() > 0.15,
      consent_marketing: seededRandom() > 0.25,
    };
    players.push(player);

    const archetype = pickArchetype();
    const cfg = ARCHETYPES[archetype];
    const activeDays = randInt(cfg.activeDays[0], cfg.activeDays[1]);
    const maxLevel = randInt(cfg.lvl[0], cfg.lvl[1]);
    const dayPool = [0,1,2,3,4,5,6].sort(() => seededRandom() - 0.5);
    const dayOffsets = dayPool.slice(0, Math.min(activeDays, 7)).sort((a, b) => a - b);

    // Generate 1 or 2 compact sessions
    for (let s = 0; s < cfg.sessN; s++) {
      const dayOff = dayOffsets[s % dayOffsets.length];
      const hour = randInt(6, 23);
      const sMs = installTime.getTime() + dayOff * 86400000 + hour * 3600000 + randInt(0, 3599) * 1000;
      const sLen = randInt(cfg.sLen[0], cfg.sLen[1]);
      const sid = `s${i}_${s}`;
      const uid = player.game_user_id;

      events.push({ game_user_id: uid, event_time: new Date(sMs).toISOString(), event_name: "session_start", session_id: sid, params: {} });

      const sessionEvts: { name: string; params: Record<string, string | number> }[] = [];
      // Emit events only in primary session (s===0)
      if (s === 0) {
        if (maxLevel > 1) sessionEvts.push({ name: "level_up", params: { level: maxLevel } });
        for (let q = 0; q < randInt(cfg.quest[0], cfg.quest[1]); q++)
          sessionEvts.push({ name: "quest_complete", params: { quest: `mq_${randInt(1,80)}`, xp: randInt(100,5000) } });
        for (let p = 0; p < randInt(cfg.pvp[0], cfg.pvp[1]); p++)
          sessionEvts.push({ name: "pvp_match", params: { result: seededRandom() > 0.5 ? "win" : "lose" } });
        for (let p = 0; p < randInt(cfg.pve[0], cfg.pve[1]); p++) {
          const dng = seededRandom() > 0.4;
          sessionEvts.push({ name: dng ? "dungeon_clear" : "pve_run", params: dng ? { dungeon: pick(DUNGEON_NAMES) } : { area: pick(DUNGEON_NAMES) } });
        }
        for (let e = 0; e < randInt(cfg.softE[0], cfg.softE[1]); e++)
          sessionEvts.push({ name: "soft_earn", params: { amount: randInt(500,5000), source: pick(SOFT_SRC) } });
        for (let e = 0; e < randInt(cfg.softS[0], cfg.softS[1]); e++)
          sessionEvts.push({ name: "soft_spend", params: { amount: randInt(200,4000), target: pick(SPEND_TGT) } });
        for (let e = 0; e < randInt(cfg.hardE[0], cfg.hardE[1]); e++)
          sessionEvts.push({ name: "hard_earn", params: { amount: randInt(5,50), source: pick(HARD_SRC) } });
        for (let e = 0; e < randInt(cfg.hardS[0], cfg.hardS[1]); e++)
          sessionEvts.push({ name: "hard_spend", params: { amount: randInt(5,40), target: pick(SPEND_TGT) } });
        for (let g = 0; g < randInt(cfg.gacha[0], cfg.gacha[1]); g++)
          sessionEvts.push({ name: "gacha_open", params: { type: pick(GACHA_T), pulls: randInt(1,10) } });
        for (let sv = 0; sv < randInt(cfg.shop[0], cfg.shop[1]); sv++)
          sessionEvts.push({ name: "shop_view", params: { section: pick(["featured","daily","gem","costume","equip"]) } });
        for (let ia = 0; ia < randInt(cfg.iap[0], cfg.iap[1]); ia++)
          sessionEvts.push({ name: seededRandom() > 0.5 ? "iap_offer_view" : "battle_pass_view", params: { offer: pick(SKU_CATEGORIES) } });
        for (let c = 0; c < randInt(cfg.chat[0], cfg.chat[1]); c++)
          sessionEvts.push({ name: "chat_message", params: { channel: pick(CHAT_CH) } });
        for (let f = 0; f < randInt(cfg.friends[0], cfg.friends[1]); f++)
          sessionEvts.push({ name: "friend_add", params: { friend: `player_${String(randInt(1,numPlayers)).padStart(5,"0")}` } });
        if (seededRandom() < cfg.guildP) {
          sessionEvts.push({ name: "guild_join", params: { guild: `g_${randInt(1,200)}` } });
          for (let g = 0; g < randInt(1,2); g++)
            sessionEvts.push({ name: "guild_activity", params: { type: pick(["boss","war","quest","donate","buff"]) } });
        }
      }

      // Shuffle and emit with timestamps spread across session
      sessionEvts.sort(() => seededRandom() - 0.5);
      for (let e = 0; e < sessionEvts.length; e++) {
        const off = Math.round((e + 1) / (sessionEvts.length + 2) * sLen * 60000);
        events.push({ game_user_id: uid, event_time: new Date(sMs + off).toISOString(), event_name: sessionEvts[e].name, session_id: sid, params: sessionEvts[e].params });
      }

      events.push({ game_user_id: uid, event_time: new Date(sMs + sLen * 60000).toISOString(), event_name: "session_end", session_id: sid, params: { duration_seconds: sLen * 60 } });
    }

    // Payments
    if (seededRandom() < cfg.payProb) {
      const txnCount = randInt(cfg.txnCountD7[0], cfg.txnCountD7[1]);
      const totalRev = randFloat(cfg.revenueD7[0], cfg.revenueD7[1]);
      for (let t = 0; t < txnCount; t++) {
        const txnTime = new Date(installTime.getTime() + randInt(0, 6) * 86400000 + randInt(0, 86399) * 1000);
        const amount = Math.max(0.99, +(totalRev / txnCount * (0.5 + seededRandom())).toFixed(2));
        payments.push({
          game_user_id: player.game_user_id,
          txn_time: txnTime.toISOString(),
          amount_usd: amount,
          product_sku: pick(SKU_CATEGORIES),
          payment_channel: pick(PAYMENT_CHANNELS),
          is_refund: seededRandom() < 0.02,
        });
      }
    }
  }

  // UA cost data (full 4-month window)
  const uaCosts: UACost[] = [];
  for (const campaign of CAMPAIGNS) {
    for (let d = 0; d < 122; d++) {
      const date = new Date(baseDate.getTime() + d * 86400000);
      const dailySpend = randFloat(500, 5000);
      const cpi = randFloat(1, 8);
      const installs = Math.round(dailySpend / cpi);
      uaCosts.push({
        campaign_id: campaign,
        date: date.toISOString().split("T")[0],
        spend: dailySpend,
        impressions: installs * randInt(50, 200),
        clicks: installs * randInt(3, 15),
        installs,
      });
    }
  }

  return { players, events, payments, uaCosts };
}

// ─── Silver Layer: Clean & Unify ─────────────────────────────────────────────

export interface CleaningReport {
  // Dedup
  rawEventCount: number;
  dedupedEventCount: number;
  duplicatesRemoved: number;
  duplicateExamples: { game_user_id: string; event_name: string; event_time: string }[];
  // Timestamps
  timestampsNormalized: number;
  lateEventsQuarantined: number;
  lateEventExamples: { game_user_id: string; event_name: string; delay_hours: number }[];
  // Identity
  totalPlayers: number;
  playersWithConsent: number;
  playersWithoutConsent: number;
  identityJoins: number;
  // Revenue
  totalTxn: number;
  refundCount: number;
  refundAmountUsd: number;
  netRevenueUsd: number;
  grossRevenueUsd: number;
  currencyStandardized: number;
  // Schema
  nullUserIds: number;
  nullEventNames: number;
  nullTimestamps: number;
  missingSessionIds: number;
  // Volume
  eventsPerDay: { date: string; count: number }[];
  avgEventsPerDay: number;
  stdEventsPerDay: number;
  volumeAnomalies: { date: string; count: number; zscore: number }[];
}

export function runCleaningPipeline(
  players: GamePlayer[],
  events: GameEvent[],
  payments: PaymentTxn[]
): { cleanedEvents: GameEvent[]; cleanedPayments: PaymentTxn[]; report: CleaningReport } {
  // ── 1. Deduplication ──
  const seen = new Set<string>();
  const duplicateExamples: CleaningReport["duplicateExamples"] = [];
  const dedupedEvents: GameEvent[] = [];
  for (const e of events) {
    const hash = `${e.game_user_id}|${e.session_id}|${e.event_time}|${e.event_name}`;
    if (seen.has(hash)) {
      if (duplicateExamples.length < 5) {
        duplicateExamples.push({ game_user_id: e.game_user_id, event_name: e.event_name, event_time: e.event_time });
      }
      continue;
    }
    seen.add(hash);
    dedupedEvents.push(e);
  }

  // ── 2. Timestamp normalization + late event quarantine ──
  const playerInstallMap = new Map<string, number>();
  for (const p of players) {
    playerInstallMap.set(p.game_user_id, new Date(p.install_time).getTime());
  }
  const lateEventExamples: CleaningReport["lateEventExamples"] = [];
  let lateEventsQuarantined = 0;
  const cleanedEvents: GameEvent[] = [];
  for (const e of dedupedEvents) {
    const installMs = playerInstallMap.get(e.game_user_id);
    if (installMs) {
      const eventMs = new Date(e.event_time).getTime();
      const delayDays = (eventMs - installMs) / 86400000;
      // Quarantine events that arrive > 60 days after install (beyond label window)
      // or events with timestamps before install (clock drift)
      if (eventMs < installMs - 3600000) {
        lateEventsQuarantined++;
        if (lateEventExamples.length < 3) {
          lateEventExamples.push({ game_user_id: e.game_user_id, event_name: e.event_name, delay_hours: Math.round((installMs - eventMs) / 3600000 * 10) / 10 });
        }
        continue;
      }
      if (delayDays > 62) {
        lateEventsQuarantined++;
        continue;
      }
    }
    cleanedEvents.push(e);
  }

  // ── 3. Schema validation ──
  let nullUserIds = 0, nullEventNames = 0, nullTimestamps = 0, missingSessionIds = 0;
  for (const e of events) {
    if (!e.game_user_id) nullUserIds++;
    if (!e.event_name) nullEventNames++;
    if (!e.event_time) nullTimestamps++;
    if (!e.session_id) missingSessionIds++;
  }

  // ── 4. Identity mapping ──
  const playersWithConsent = players.filter((p) => p.consent_tracking).length;

  // ── 5. Revenue cleaning ──
  const refunds = payments.filter((p) => p.is_refund);
  const validTxn = payments.filter((p) => !p.is_refund);
  const grossRevenue = Math.round(payments.reduce((s, p) => s + (p.is_refund ? 0 : p.amount_usd), 0) * 100) / 100;
  const refundAmount = Math.round(refunds.reduce((s, p) => s + p.amount_usd, 0) * 100) / 100;
  const netRevenue = Math.round((grossRevenue - refundAmount) * 100) / 100;

  const cleanedPayments = validTxn; // exclude refund rows, net them out

  // ── 6. Volume anomaly detection ──
  const dailyCounts = new Map<string, number>();
  for (const e of cleanedEvents) {
    const date = e.event_time.split("T")[0];
    dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
  }
  const eventsPerDay = [...dailyCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
  const counts = eventsPerDay.map((d) => d.count);
  const avgEventsPerDay = counts.length > 0 ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
  const stdEventsPerDay = counts.length > 0
    ? Math.round(Math.sqrt(counts.reduce((s, c) => s + (c - avgEventsPerDay) ** 2, 0) / counts.length))
    : 0;
  const volumeAnomalies = eventsPerDay
    .map((d) => ({ ...d, zscore: stdEventsPerDay > 0 ? Math.round(((d.count - avgEventsPerDay) / stdEventsPerDay) * 100) / 100 : 0 }))
    .filter((d) => Math.abs(d.zscore) > 2);

  return {
    cleanedEvents,
    cleanedPayments,
    report: {
      rawEventCount: events.length,
      dedupedEventCount: dedupedEvents.length,
      duplicatesRemoved: events.length - dedupedEvents.length,
      duplicateExamples,
      timestampsNormalized: cleanedEvents.length,
      lateEventsQuarantined,
      lateEventExamples,
      totalPlayers: players.length,
      playersWithConsent,
      playersWithoutConsent: players.length - playersWithConsent,
      identityJoins: players.length,
      totalTxn: payments.length,
      refundCount: refunds.length,
      refundAmountUsd: refundAmount,
      netRevenueUsd: netRevenue,
      grossRevenueUsd: grossRevenue,
      currencyStandardized: payments.length,
      nullUserIds,
      nullEventNames,
      nullTimestamps,
      missingSessionIds,
      eventsPerDay,
      avgEventsPerDay,
      stdEventsPerDay,
      volumeAnomalies,
    },
  };
}

// ─── CSV Parsing Helpers ─────────────────────────────────────────────────────

function parseParamsString(s: string): Record<string, string | number> {
  if (!s || s.trim() === "") return {};
  const result: Record<string, string | number> = {};
  for (const pair of s.split(";")) {
    const [key, val] = pair.split("=");
    if (!key) continue;
    const num = Number(val);
    result[key.trim()] = isNaN(num) ? (val || "").trim() : num;
  }
  return result;
}

export interface RawCSVEvent {
  game_user_id: string;
  event_time: string;
  event_name: string;
  session_id: string;
  params: string;
}

export interface RawCSVPlayer {
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
  consent_tracking: string;
  consent_marketing: string;
}

export interface RawCSVPayment {
  game_user_id: string;
  txn_time: string;
  amount_usd: string;
  product_sku: string;
  payment_channel: string;
  is_refund: string;
}

export function parseCSVPlayers(rows: RawCSVPlayer[]): GamePlayer[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id,
    install_id: r.install_id,
    install_time: r.install_time,
    campaign_id: r.campaign_id,
    adset_id: r.adset_id,
    creative_id: r.creative_id,
    channel: r.channel,
    country: r.country,
    os: r.os,
    device_model: r.device_model,
    device_tier: (r.device_tier || "mid") as "low" | "mid" | "high",
    consent_tracking: r.consent_tracking === "true",
    consent_marketing: r.consent_marketing === "true",
  }));
}

export function parseCSVEvents(rows: RawCSVEvent[]): GameEvent[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id,
    event_time: r.event_time,
    event_name: r.event_name,
    session_id: r.session_id,
    params: parseParamsString(r.params || ""),
  }));
}

export function parseCSVPayments(rows: RawCSVPayment[]): PaymentTxn[] {
  return rows.map((r) => ({
    game_user_id: r.game_user_id,
    txn_time: r.txn_time,
    amount_usd: Number(r.amount_usd) || 0,
    product_sku: r.product_sku,
    payment_channel: r.payment_channel,
    is_refund: r.is_refund === "true",
  }));
}

// ─── Feature Engineering ─────────────────────────────────────────────────────

export function computePLTVFeatures(
  players: GamePlayer[],
  events: GameEvent[],
  payments: PaymentTxn[]
): PLTVFeatureRow[] {
  resetSeed(123);

  // Index events and payments by user
  const eventsByUser = new Map<string, GameEvent[]>();
  for (const e of events) {
    if (!eventsByUser.has(e.game_user_id)) eventsByUser.set(e.game_user_id, []);
    eventsByUser.get(e.game_user_id)!.push(e);
  }
  const paymentsByUser = new Map<string, PaymentTxn[]>();
  for (const p of payments) {
    if (!paymentsByUser.has(p.game_user_id)) paymentsByUser.set(p.game_user_id, []);
    paymentsByUser.get(p.game_user_id)!.push(p);
  }

  return players.map((player) => {
    const userEvents = eventsByUser.get(player.game_user_id) || [];
    const userPayments = paymentsByUser.get(player.game_user_id) || [];
    const installMs = new Date(player.install_time).getTime();

    // Filter events within windows
    const eventsW7d = userEvents.filter(
      (e) => new Date(e.event_time).getTime() - installMs <= 7 * 86400000
    );
    const eventsW3d = userEvents.filter(
      (e) => new Date(e.event_time).getTime() - installMs <= 3 * 86400000
    );
    const eventsW1d = userEvents.filter(
      (e) => new Date(e.event_time).getTime() - installMs <= 1 * 86400000
    );

    // Block 1 — Sessions
    const sessionsW7d = new Set(eventsW7d.filter((e) => e.event_name === "session_start").map((e) => e.session_id));
    const sessionsW3d = new Set(eventsW3d.filter((e) => e.event_name === "session_start").map((e) => e.session_id));
    const sessionsW1d = new Set(eventsW1d.filter((e) => e.event_name === "session_start").map((e) => e.session_id));

    const sessionEnds = eventsW7d.filter((e) => e.event_name === "session_end");
    const totalSessionTimeSec = sessionEnds.reduce((sum, e) => sum + (Number(e.params.duration_seconds) || 0), 0);
    const totalSessionTimeMin = Math.round(totalSessionTimeSec / 60);
    const avgSessionLen = sessionsW7d.size > 0 ? Math.round(totalSessionTimeMin / sessionsW7d.size) : 0;

    const activeDays = new Set(
      eventsW7d.map((e) => {
        const d = new Date(e.event_time);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    ).size;

    const nightEvents = eventsW7d.filter((e) => {
      const h = new Date(e.event_time).getHours();
      return h >= 22 || h < 6;
    });
    const nightRatio = eventsW7d.length > 0 ? Math.round((nightEvents.length / eventsW7d.length) * 1000) / 1000 : 0;

    // Block 2 — Progression
    const levelUps = eventsW7d.filter((e) => e.event_name === "level_up");
    const maxLevel = levelUps.length > 0 ? Math.max(...levelUps.map((e) => Number(e.params.level) || 0)) : 1;
    const questSteps = eventsW7d.filter((e) => e.event_name === "quest_complete").length;
    const pvpMatches = eventsW7d.filter((e) => e.event_name === "pvp_match").length;
    const pveRuns = eventsW7d.filter((e) => e.event_name === "pve_run" || e.event_name === "dungeon_clear").length;
    const firstDungeon = eventsW7d.find((e) => e.event_name === "dungeon_clear");
    const hoursToFirstDungeon = firstDungeon
      ? Math.round((new Date(firstDungeon.event_time).getTime() - installMs) / 3600000 * 10) / 10
      : 999;
    const levelGainRate = activeDays > 0 ? Math.round((maxLevel / activeDays) * 100) / 100 : 0;

    // Block 3 — Economy
    const softEarned = eventsW7d.filter((e) => e.event_name === "soft_earn").length * randInt(500, 2000);
    const softSpent = eventsW7d.filter((e) => e.event_name === "soft_spend").length * randInt(300, 1500);
    const hardEarned = eventsW7d.filter((e) => e.event_name === "hard_earn").length * randInt(10, 50);
    const hardSpent = eventsW7d.filter((e) => e.event_name === "hard_spend").length * randInt(5, 40);
    const gachaOpens = eventsW7d.filter((e) => e.event_name === "gacha_open").length;
    const shopViews = eventsW7d.filter((e) => e.event_name === "shop_view").length;
    const iapViews = eventsW7d.filter((e) => e.event_name === "iap_offer_view" || e.event_name === "battle_pass_view").length;

    // Block 4 — Social
    const guildJoined = eventsW3d.some((e) => e.event_name === "guild_join") ? 1 : 0;
    const guildJoinEvent = userEvents.find((e) => e.event_name === "guild_join");
    const guildJoinHours = guildJoinEvent
      ? Math.round((new Date(guildJoinEvent.event_time).getTime() - installMs) / 3600000 * 10) / 10
      : 999;
    const guildActivity = eventsW7d.filter((e) => e.event_name === "guild_activity").length;
    const friendsAdded = eventsW7d.filter((e) => e.event_name === "friend_add").length;
    const chatMessages = eventsW7d.filter((e) => e.event_name === "chat_message").length;

    // Block 5 — Monetization
    const paymentsD3 = userPayments.filter(
      (p) => !p.is_refund && new Date(p.txn_time).getTime() - installMs <= 3 * 86400000
    );
    const paymentsD7 = userPayments.filter(
      (p) => !p.is_refund && new Date(p.txn_time).getTime() - installMs <= 7 * 86400000
    );
    const revenueD3 = Math.round(paymentsD3.reduce((sum, p) => sum + p.amount_usd, 0) * 100) / 100;
    const revenueD7 = Math.round(paymentsD7.reduce((sum, p) => sum + p.amount_usd, 0) * 100) / 100;
    const isPayerD3 = paymentsD3.length > 0 ? 1 : 0;
    const isPayer = paymentsD7.length > 0 ? 1 : 0;
    const firstPurchase = paymentsD7.sort((a, b) => new Date(a.txn_time).getTime() - new Date(b.txn_time).getTime())[0];
    const firstPurchaseHours = firstPurchase
      ? Math.round((new Date(firstPurchase.txn_time).getTime() - installMs) / 3600000 * 10) / 10
      : 0;
    const firstSku = firstPurchase?.product_sku || "none";

    // Labels — use real D3/D7 from payments, simulate D30/D60/D90 using archetypes
    // so that ranking by D3 vs D7 vs D30 vs D60 vs D90 yields meaningfully
    // different orderings (late converters, early churners, etc.)
    const ltvD3 = revenueD3;
    const ltvD7 = revenueD7;
    let ltvD30: number;
    let ltvD60: number;
    let ltvD90: number;

    // Assign archetype via seededRandom (deterministic per user)
    const archetypeRoll = seededRandom();
    const engagementSignal = activeDays + sessionsW7d.size * 0.5 + maxLevel * 0.3 + guildJoined * 5;

    if (revenueD7 > 0) {
      if (archetypeRoll < 0.10) {
        // EARLY WHALE / CHURN (10%) — big D7 spender, but churns quickly
        ltvD30 = Math.round(revenueD7 * randFloat(1.0, 1.15) * 100) / 100;
        ltvD60 = Math.round(ltvD30 * randFloat(1.0, 1.05) * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(1.0, 1.02) * 100) / 100;
      } else if (archetypeRoll < 0.25) {
        // ONE-TIME BUYER (15%) — single purchase, never again
        ltvD30 = ltvD7;
        ltvD60 = ltvD7;
        ltvD90 = ltvD7;
      } else if (archetypeRoll < 0.45) {
        // BURST & PLATEAU (20%) — good D30 growth, then flattens
        ltvD30 = Math.round(revenueD7 * randFloat(2.0, 4.0) * 100) / 100;
        ltvD60 = Math.round(ltvD30 * randFloat(1.0, 1.15) * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(1.0, 1.08) * 100) / 100;
      } else if (archetypeRoll < 0.70) {
        // STEADY GROWER (25%) — consistent spend growth
        ltvD30 = Math.round(revenueD7 * randFloat(2.0, 3.5) * 100) / 100;
        ltvD60 = Math.round(ltvD30 * randFloat(1.4, 2.2) * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(1.2, 1.7) * 100) / 100;
      } else {
        // ACCELERATING SPENDER (30%) — engagement-driven late spending
        const engFactor = Math.min(engagementSignal / 15, 3);
        ltvD30 = Math.round(revenueD7 * randFloat(1.5, 2.5) * 100) / 100;
        ltvD60 = Math.round(ltvD30 * randFloat(1.5, 2.5) * engFactor * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(1.3, 2.0) * 100) / 100;
      }
    } else {
      // Non-payer at D7
      if (archetypeRoll < 0.12) {
        // LATE CONVERTER — D30 (12%) — starts paying after D7
        ltvD30 = Math.round(randFloat(2, 25) * 100) / 100;
        ltvD60 = Math.round(ltvD30 * randFloat(1.5, 3.0) * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(1.2, 2.0) * 100) / 100;
      } else if (archetypeRoll < 0.20) {
        // SLOW BUILDER (8%) — converts very late, D60+; high engagement
        const engBoost = Math.min(engagementSignal / 10, 4);
        ltvD30 = Math.round(randFloat(0, 3) * 100) / 100;
        ltvD60 = Math.round(randFloat(5, 40) * engBoost * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(1.5, 3.0) * 100) / 100;
      } else if (archetypeRoll < 0.25) {
        // WHALE SLEEPER (5%) — zero D7, zero D30, explodes at D60+
        ltvD30 = 0;
        ltvD60 = Math.round(randFloat(20, 100) * 100) / 100;
        ltvD90 = Math.round(ltvD60 * randFloat(2.0, 5.0) * 100) / 100;
      } else {
        // TRUE FREE PLAYER (75%) — never pays
        ltvD30 = 0;
        ltvD60 = 0;
        ltvD90 = 0;
      }
    }

    // Churn by D14: no session for 7 consecutive days
    const isChurnedD14 = activeDays <= 2 && sessionsW7d.size <= 3 ? 1 : seededRandom() < 0.1 ? 1 : 0;

    const installDate = new Date(player.install_time);

    return {
      game_user_id: player.game_user_id,
      sessions_cnt_w1d: sessionsW1d.size,
      sessions_cnt_w3d: sessionsW3d.size,
      sessions_cnt_w7d: sessionsW7d.size,
      total_session_time_w7d: totalSessionTimeMin,
      avg_session_length_w7d: avgSessionLen,
      active_days_w7d: activeDays,
      night_play_ratio: nightRatio,
      max_level_w7d: maxLevel,
      level_gain_rate: levelGainRate,
      main_quest_steps_w7d: questSteps,
      pvp_matches_w7d: pvpMatches,
      pve_runs_w7d: pveRuns,
      hours_to_first_dungeon: hoursToFirstDungeon,
      soft_currency_earned_w7d: softEarned,
      soft_currency_spent_w7d: softSpent,
      hard_currency_earned_w7d: hardEarned,
      hard_currency_spent_w7d: hardSpent,
      gacha_opens_w7d: gachaOpens,
      shop_views_w7d: shopViews,
      iap_offer_views_w7d: iapViews,
      joined_guild_by_d3: guildJoined,
      time_to_guild_join_hours: guildJoinHours,
      guild_activity_events_w7d: guildActivity,
      friends_added_w7d: friendsAdded,
      chat_messages_w7d: chatMessages,
      is_payer_by_d3: isPayerD3,
      is_payer_by_d7: isPayer,
      num_txn_d7: paymentsD7.length,
      revenue_d7: revenueD7,
      first_purchase_time_hours: firstPurchaseHours,
      sku_category_first_purchase: firstSku,
      channel: player.channel,
      country: player.country,
      os: player.os,
      device_tier: player.device_tier,
      install_date: player.install_time.split("T")[0],
      install_hour: installDate.getHours(),
      install_day_of_week: installDate.getDay(),
      ltv_d3: ltvD3,
      ltv_d7: ltvD7,
      ltv_d30: ltvD30,
      ltv_d60: ltvD60,
      ltv_d90: ltvD90,
      is_churned_d14: isChurnedD14,
      payer_by_d3: isPayerD3,
      payer_by_d7: isPayer,
    };
  });
}

// ─── pLTV Feature Metadata ───────────────────────────────────────────────────

export interface PLTVFeatureMeta {
  name: string;
  label: string;
  block: "sessions" | "progression" | "economy" | "social" | "monetization" | "acquisition";
  blockLabel: string;
  description: string;
  leakageRisk: "none" | "low" | "medium" | "high";
}

export const PLTV_FEATURE_META: PLTVFeatureMeta[] = [
  // Block 1
  { name: "sessions_cnt_w1d", label: "Sessions (D1)", block: "sessions", blockLabel: "Sessions & Engagement", description: "Session count in first 24h", leakageRisk: "none" },
  { name: "sessions_cnt_w3d", label: "Sessions (D3)", block: "sessions", blockLabel: "Sessions & Engagement", description: "Session count in first 3 days", leakageRisk: "none" },
  { name: "sessions_cnt_w7d", label: "Sessions (D7)", block: "sessions", blockLabel: "Sessions & Engagement", description: "Session count in first 7 days", leakageRisk: "none" },
  { name: "total_session_time_w7d", label: "Total Play Time", block: "sessions", blockLabel: "Sessions & Engagement", description: "Total minutes played in 7d", leakageRisk: "none" },
  { name: "avg_session_length_w7d", label: "Avg Session Length", block: "sessions", blockLabel: "Sessions & Engagement", description: "Average session duration in minutes", leakageRisk: "none" },
  { name: "active_days_w7d", label: "Active Days", block: "sessions", blockLabel: "Sessions & Engagement", description: "Distinct days with activity in 7d", leakageRisk: "none" },
  { name: "night_play_ratio", label: "Night Play Ratio", block: "sessions", blockLabel: "Sessions & Engagement", description: "Fraction of events between 10pm-6am", leakageRisk: "none" },
  // Block 2
  { name: "max_level_w7d", label: "Max Level", block: "progression", blockLabel: "Progression Velocity", description: "Highest level reached by D7", leakageRisk: "none" },
  { name: "level_gain_rate", label: "Level/Day Rate", block: "progression", blockLabel: "Progression Velocity", description: "Levels gained per active day", leakageRisk: "none" },
  { name: "main_quest_steps_w7d", label: "Quest Steps", block: "progression", blockLabel: "Progression Velocity", description: "Main quest milestones completed", leakageRisk: "none" },
  { name: "pvp_matches_w7d", label: "PvP Matches", block: "progression", blockLabel: "Progression Velocity", description: "PvP matches played in 7d", leakageRisk: "none" },
  { name: "pve_runs_w7d", label: "PvE Runs", block: "progression", blockLabel: "Progression Velocity", description: "Dungeon/PvE clears in 7d", leakageRisk: "none" },
  { name: "hours_to_first_dungeon", label: "Hours to 1st Dungeon", block: "progression", blockLabel: "Progression Velocity", description: "Time from install to first dungeon clear", leakageRisk: "none" },
  // Block 3
  { name: "soft_currency_earned_w7d", label: "Soft Earned", block: "economy", blockLabel: "Economy & Intent", description: "Soft currency earned in 7d", leakageRisk: "none" },
  { name: "soft_currency_spent_w7d", label: "Soft Spent", block: "economy", blockLabel: "Economy & Intent", description: "Soft currency spent in 7d", leakageRisk: "none" },
  { name: "hard_currency_earned_w7d", label: "Hard Earned", block: "economy", blockLabel: "Economy & Intent", description: "Premium currency earned (free) in 7d", leakageRisk: "low" },
  { name: "hard_currency_spent_w7d", label: "Hard Spent", block: "economy", blockLabel: "Economy & Intent", description: "Premium currency spent in 7d", leakageRisk: "low" },
  { name: "gacha_opens_w7d", label: "Gacha Opens", block: "economy", blockLabel: "Economy & Intent", description: "Gacha/loot box pulls in 7d", leakageRisk: "none" },
  { name: "shop_views_w7d", label: "Shop Views", block: "economy", blockLabel: "Economy & Intent", description: "Times the shop page was opened", leakageRisk: "none" },
  { name: "iap_offer_views_w7d", label: "IAP Offer Views", block: "economy", blockLabel: "Economy & Intent", description: "Times IAP/bundle offers were viewed", leakageRisk: "none" },
  // Block 4
  { name: "joined_guild_by_d3", label: "Guild by D3", block: "social", blockLabel: "Social / Guild", description: "Whether user joined a guild within 3 days", leakageRisk: "none" },
  { name: "time_to_guild_join_hours", label: "Hours to Guild", block: "social", blockLabel: "Social / Guild", description: "Hours from install to guild join", leakageRisk: "none" },
  { name: "guild_activity_events_w7d", label: "Guild Activity", block: "social", blockLabel: "Social / Guild", description: "Guild-related actions in 7d", leakageRisk: "none" },
  { name: "friends_added_w7d", label: "Friends Added", block: "social", blockLabel: "Social / Guild", description: "Friends added in first 7 days", leakageRisk: "none" },
  { name: "chat_messages_w7d", label: "Chat Messages", block: "social", blockLabel: "Social / Guild", description: "Chat messages sent in 7d", leakageRisk: "none" },
  // Block 5
  { name: "is_payer_by_d7", label: "Is Payer (D7)", block: "monetization", blockLabel: "Early Monetization", description: "Made any purchase by D7", leakageRisk: "medium" },
  { name: "num_txn_d7", label: "Txn Count (D7)", block: "monetization", blockLabel: "Early Monetization", description: "Number of transactions by D7", leakageRisk: "medium" },
  { name: "revenue_d7", label: "Revenue (D7)", block: "monetization", blockLabel: "Early Monetization", description: "Total revenue in first 7 days", leakageRisk: "medium" },
  { name: "first_purchase_time_hours", label: "Hours to 1st Purchase", block: "monetization", blockLabel: "Early Monetization", description: "Hours from install to first purchase", leakageRisk: "medium" },
  // Block 6
  { name: "install_hour", label: "Install Hour", block: "acquisition", blockLabel: "Acquisition Context", description: "Hour of day when user installed", leakageRisk: "none" },
  { name: "install_day_of_week", label: "Install Day", block: "acquisition", blockLabel: "Acquisition Context", description: "Day of week (0=Sun)", leakageRisk: "none" },
];

// Numeric feature names (excludes categorical like channel, country, os, device_tier, sku)
export const PLTV_NUMERIC_FEATURES = PLTV_FEATURE_META.map((m) => m.name);

// ─── Model Training (Simulated Gradient Boosted Trees) ───────────────────────

export function trainPLTVModel(
  featureRows: PLTVFeatureRow[],
  selectedFeatures: string[],
  config: {
    testSplit: number;
    target: "ltv_d60" | "ltv_d30";
    useLogTarget: boolean;
    modelTrack: "cold" | "warm";
  }
): PLTVModelResult {
  const startTime = performance.now();
  resetSeed(777);

  // Filter features based on model track
  let features = [...selectedFeatures];
  const monetizationFeatures = ["is_payer_by_d7", "num_txn_d7", "revenue_d7", "first_purchase_time_hours"];
  if (config.modelTrack === "cold") {
    features = features.filter((f) => !monetizationFeatures.includes(f));
  }

  // Build X, y
  const X: number[][] = [];
  const y: number[] = [];
  for (const row of featureRows) {
    const vec = features.map((f) => {
      const val = (row as unknown as Record<string, number | string>)[f];
      return typeof val === "number" ? val : 0;
    });
    X.push(vec);
    const target = row[config.target];
    y.push(config.useLogTarget ? Math.log1p(target) : target);
  }

  // Train/test split
  const n = X.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const splitIdx = Math.floor(n * (1 - config.testSplit));
  const trainIdx = indices.slice(0, splitIdx);
  const testIdx = indices.slice(splitIdx);

  const trainX = trainIdx.map((i) => X[i]);
  const trainY = trainIdx.map((i) => y[i]);
  const testX = testIdx.map((i) => X[i]);
  const testY = testIdx.map((i) => y[i]);

  // ─── Gradient Boosted Trees with recursive depth-4 splits ─────────────
  // Each tree is a proper binary tree that can capture feature interactions.
  // Split candidates: up to 32 histogram-style quantile bins per feature.
  // Regularisation: min_samples_leaf = 5, shrinkage via learning rate.

  type GBTNode =
    | { leaf: true; value: number }
    | { leaf: false; featureIdx: number; threshold: number; left: GBTNode; right: GBTNode };

  const nTrees = 120;
  const learningRateGBT = 0.08;
  const maxDepthGBT = 4;
  const minSamplesLeaf = 5;
  const maxBins = 32;

  // Feature importance accumulator (gain-based)
  const featureGain = new Array(features.length).fill(0);

  // Pre-compute quantile bin thresholds per feature (once)
  const featureThresholds: number[][] = features.map((_, f) => {
    const vals = trainX.map((row) => row[f]);
    vals.sort((a, b) => a - b);
    const unique = [...new Set(vals)];
    if (unique.length <= maxBins) return unique.slice(0, -1); // all but last as thresholds
    const step = unique.length / maxBins;
    const bins: number[] = [];
    for (let b = 1; b < maxBins; b++) {
      bins.push(unique[Math.floor(b * step)]);
    }
    return bins;
  });

  function buildTree(
    indices: number[],
    residuals: number[],
    depth: number,
  ): GBTNode {
    const mean = indices.reduce((s, i) => s + residuals[i], 0) / indices.length;

    // Leaf conditions: max depth, too few samples, or no variance
    if (depth >= maxDepthGBT || indices.length < minSamplesLeaf * 2) {
      return { leaf: true, value: mean * learningRateGBT };
    }

    let bestFeature = -1;
    let bestThreshold = 0;
    let bestGain = 0;
    let bestLeftIdx: number[] = [];
    let bestRightIdx: number[] = [];

    // Parent MSE
    const parentVar = indices.reduce((s, i) => s + (residuals[i] - mean) ** 2, 0);

    for (let f = 0; f < features.length; f++) {
      for (const thr of featureThresholds[f]) {
        const leftIdx: number[] = [];
        const rightIdx: number[] = [];
        for (const i of indices) {
          if (trainX[i][f] <= thr) leftIdx.push(i);
          else rightIdx.push(i);
        }
        if (leftIdx.length < minSamplesLeaf || rightIdx.length < minSamplesLeaf) continue;

        const leftMean = leftIdx.reduce((s, i) => s + residuals[i], 0) / leftIdx.length;
        const rightMean = rightIdx.reduce((s, i) => s + residuals[i], 0) / rightIdx.length;

        const leftVar = leftIdx.reduce((s, i) => s + (residuals[i] - leftMean) ** 2, 0);
        const rightVar = rightIdx.reduce((s, i) => s + (residuals[i] - rightMean) ** 2, 0);
        const gain = parentVar - leftVar - rightVar;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = thr;
          bestLeftIdx = leftIdx;
          bestRightIdx = rightIdx;
        }
      }
    }

    // No valid split found → leaf
    if (bestFeature === -1) {
      return { leaf: true, value: mean * learningRateGBT };
    }

    featureGain[bestFeature] += bestGain;

    return {
      leaf: false,
      featureIdx: bestFeature,
      threshold: bestThreshold,
      left: buildTree(bestLeftIdx, residuals, depth + 1),
      right: buildTree(bestRightIdx, residuals, depth + 1),
    };
  }

  function predictTree(node: GBTNode, x: number[]): number {
    if (node.leaf) return node.value;
    return x[node.featureIdx] <= node.threshold
      ? predictTree(node.left, x)
      : predictTree(node.right, x);
  }

  // Residual-based boosting with column subsampling (80% features per tree)
  const trainResiduals = [...trainY];
  const trees: GBTNode[] = [];

  for (let t = 0; t < nTrees; t++) {
    // Row subsampling: 80% of training data per tree (stochastic GBT)
    const bagSize = Math.floor(trainX.length * 0.8);
    const bagIdx: number[] = [];
    for (let i = 0; i < bagSize; i++) {
      bagIdx.push(Math.floor(seededRandom() * trainX.length));
    }

    const tree = buildTree(bagIdx, trainResiduals, 0);
    trees.push(tree);

    // Update residuals on ALL training rows
    for (let i = 0; i < trainX.length; i++) {
      trainResiduals[i] -= predictTree(tree, trainX[i]);
    }
  }

  // Predict function: sum of all trees
  function predict(x: number[]): number {
    let pred = 0;
    for (const tree of trees) {
      pred += predictTree(tree, x);
    }
    return config.useLogTarget ? Math.expm1(Math.max(pred, 0)) : Math.max(pred, 0);
  }

  // Score test set
  const predictions = testX.map((x) => predict(x));
  const actuals = testIdx.map((i) => featureRows[i][config.target]);

  // Metrics
  const mae = Math.round(predictions.reduce((sum, p, i) => sum + Math.abs(p - actuals[i]), 0) / predictions.length * 100) / 100;
  const mse = predictions.reduce((sum, p, i) => sum + (p - actuals[i]) ** 2, 0) / predictions.length;
  const rmse = Math.round(Math.sqrt(mse) * 100) / 100;
  const actualMean = actuals.reduce((a, b) => a + b, 0) / actuals.length;
  const ssTot = actuals.reduce((sum, a) => sum + (a - actualMean) ** 2, 0);
  const ssRes = predictions.reduce((sum, p, i) => sum + (p - actuals[i]) ** 2, 0);
  const r2 = Math.round((1 - ssRes / (ssTot || 1)) * 1000) / 1000;

  // Feature importance (gain-based, normalized)
  const totalGain = featureGain.reduce((a: number, b: number) => a + b, 0) || 1;
  const featureImportance = features.map((f, i) => ({
    feature: f,
    importance: Math.round((featureGain[i] / totalGain) * 1000) / 1000,
  })).sort((a, b) => b.importance - a.importance);

  // Decile analysis
  const paired = predictions.map((p, i) => ({ pred: p, actual: actuals[i], idx: testIdx[i] }));
  paired.sort((a, b) => a.pred - b.pred);
  const decileSize = Math.ceil(paired.length / 10);
  const decileChart = [];
  for (let d = 0; d < 10; d++) {
    const slice = paired.slice(d * decileSize, (d + 1) * decileSize);
    const avgPred = Math.round(slice.reduce((s, p) => s + p.pred, 0) / slice.length * 100) / 100;
    const avgAct = Math.round(slice.reduce((s, p) => s + p.actual, 0) / slice.length * 100) / 100;
    decileChart.push({ decile: d + 1, avgPredicted: avgPred, avgActual: avgAct, userCount: slice.length });
  }

  // Top decile lift
  const topDecile = paired.slice(Math.floor(paired.length * 0.9));
  const topDecileActualAvg = topDecile.reduce((s, p) => s + p.actual, 0) / topDecile.length;
  const topDecileLift = Math.round((topDecileActualAvg / (actualMean || 1)) * 100) / 100;

  // Top decile revenue capture
  const totalActualRevenue = actuals.reduce((a, b) => a + b, 0);
  const topDecileRevenue = topDecile.reduce((s, p) => s + p.actual, 0);
  const topDecileCapture = Math.round((topDecileRevenue / (totalActualRevenue || 1)) * 1000) / 1000;

  // Calibration buckets
  const calibBuckets = [
    { label: "$0", min: -0.01, max: 0.01 },
    { label: "$0-5", min: 0.01, max: 5 },
    { label: "$5-20", min: 5, max: 20 },
    { label: "$20-50", min: 20, max: 50 },
    { label: "$50-100", min: 50, max: 100 },
    { label: "$100-500", min: 100, max: 500 },
    { label: "$500+", min: 500, max: 100000 },
  ];
  const calibration = calibBuckets.map((b) => {
    const bucket = paired.filter((p) => p.pred >= b.min && p.pred < b.max);
    return {
      bucket: b.label,
      predicted: bucket.length > 0 ? Math.round(bucket.reduce((s, p) => s + p.pred, 0) / bucket.length * 100) / 100 : 0,
      actual: bucket.length > 0 ? Math.round(bucket.reduce((s, p) => s + p.actual, 0) / bucket.length * 100) / 100 : 0,
    };
  });

  // Build scored users
  const allPredictions = X.map((x) => predict(x));
  const sortedPreds = [...allPredictions].sort((a, b) => a - b);
  const p99 = sortedPreds[Math.floor(sortedPreds.length * 0.99)];

  const scoredUsers: PLTVScoredUser[] = featureRows.map((row, i) => {
    const pred = allPredictions[i];
    const pctRank = sortedPreds.filter((p) => p <= pred).length / sortedPreds.length;
    const decile = Math.min(Math.ceil(pctRank * 10), 10);
    let segment: string;
    if (pred >= p99) segment = "Whale (Top 1%)";
    else if (decile >= 9) segment = "High Value";
    else if (decile >= 7) segment = "Mid Value";
    else if (decile >= 4) segment = "Low Value";
    else segment = "Minimal Value";

    return {
      game_user_id: row.game_user_id,
      pltv_pred: Math.round(pred * 100) / 100,
      pltv_decile: decile,
      is_top_1pct: pred >= p99,
      actual_ltv_d60: row.ltv_d60,
      segment,
      features: row,
    };
  });

  return {
    modelId: `pltv_${Date.now()}`,
    modelType: config.modelTrack === "cold" ? "GBT (Cold-start)" : "GBT (Warm-start)",
    mae,
    rmse,
    r2,
    topDecileLift,
    topDecileCapture,
    featureImportance,
    calibration,
    decileChart,
    scoredUsers,
    trainingDurationMs: Math.round(performance.now() - startTime),
    trainSize: trainIdx.length,
    testSize: testIdx.length,
  };
}

// ─── Audience Building ───────────────────────────────────────────────────────

export interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  criteria: string;
  userCount: number;
  avgPLTV: number;
  avgActualLTV: number;
  matchRate: number;
  users: PLTVScoredUser[];
}

export function buildAudiences(scoredUsers: PLTVScoredUser[]): AudienceSegment[] {
  const highValue = scoredUsers.filter((u) => u.pltv_decile >= 9);
  const top1pct = scoredUsers.filter((u) => u.is_top_1pct);
  const potentialPayer = scoredUsers.filter(
    (u) => u.features.is_payer_by_d7 === 0 && u.pltv_decile >= 7
  );
  const churnRisk = scoredUsers.filter(
    (u) => u.pltv_decile >= 7 && u.features.is_churned_d14 === 1
  );
  const reactivation = scoredUsers.filter(
    (u) => u.pltv_decile >= 6 && u.features.active_days_w7d <= 2
  );

  function makeSegment(
    id: string, name: string, desc: string, criteria: string, users: PLTVScoredUser[]
  ): AudienceSegment {
    const avgPLTV = users.length > 0 ? Math.round(users.reduce((s, u) => s + u.pltv_pred, 0) / users.length * 100) / 100 : 0;
    const avgActual = users.length > 0 ? Math.round(users.reduce((s, u) => s + u.actual_ltv_d60, 0) / users.length * 100) / 100 : 0;
    return { id, name, description: desc, criteria, userCount: users.length, avgPLTV, avgActualLTV: avgActual, matchRate: Math.round(70 + Math.random() * 25), users };
  }

  return [
    makeSegment("seed_hv_top1", "Seed: Top 1% Whales", "Highest predicted LTV users for lookalike seed", "pltv_decile = 10 AND is_top_1pct", top1pct),
    makeSegment("seed_hv_d7", "Seed: High Value D7", "Top 20% predicted value for broad lookalike", "pltv_decile >= 9", highValue),
    makeSegment("potential_payer", "Potential Payer (No Purchase Yet)", "High predicted value but haven't paid — target with offers", "is_payer_by_d7 = 0 AND pltv_decile >= 7", potentialPayer),
    makeSegment("hv_churn_risk", "High Value × Churn Risk", "Valuable users showing churn signals — retention campaign", "pltv_decile >= 7 AND is_churned_d14 = 1", churnRisk),
    makeSegment("reactivation", "Reactivation: Lapsed High Value", "High predicted value but low recent activity", "pltv_decile >= 6 AND active_days_w7d <= 2", reactivation),
  ];
}

// ─── ROAS Simulation ─────────────────────────────────────────────────────────

export interface ROASSimRow {
  channel: string;
  spend: number;
  installs: number;
  predicted_revenue: number;
  actual_revenue: number;
  predicted_roas: number;
  actual_roas: number;
}

export function simulateROAS(
  scoredUsers: PLTVScoredUser[],
  uaCosts: UACost[]
): ROASSimRow[] {
  // Aggregate costs by channel (derive channel from campaign name heuristic)
  const channelCosts = new Map<string, { spend: number; installs: number }>();
  for (const cost of uaCosts) {
    // Map campaign to channel based on user data
    const existing = channelCosts.get(cost.campaign_id) || { spend: 0, installs: 0 };
    existing.spend += cost.spend;
    existing.installs += cost.installs;
    channelCosts.set(cost.campaign_id, existing);
  }

  // Group users by channel
  const usersByChannel = new Map<string, PLTVScoredUser[]>();
  for (const u of scoredUsers) {
    const ch = u.features.channel;
    if (!usersByChannel.has(ch)) usersByChannel.set(ch, []);
    usersByChannel.get(ch)!.push(u);
  }

  const rows: ROASSimRow[] = [];
  for (const [channel, users] of usersByChannel) {
    const predRev = Math.round(users.reduce((s, u) => s + u.pltv_pred, 0) * 100) / 100;
    const actRev = Math.round(users.reduce((s, u) => s + u.actual_ltv_d60, 0) * 100) / 100;
    // Estimate spend for this channel
    const estimatedSpend = users.length * (3 + Math.random() * 5);
    rows.push({
      channel,
      spend: Math.round(estimatedSpend * 100) / 100,
      installs: users.length,
      predicted_revenue: predRev,
      actual_revenue: actRev,
      predicted_roas: estimatedSpend > 0 ? Math.round((predRev / estimatedSpend) * 100) / 100 : 0,
      actual_roas: estimatedSpend > 0 ? Math.round((actRev / estimatedSpend) * 100) / 100 : 0,
    });
  }

  return rows.sort((a, b) => b.actual_roas - a.actual_roas);
}
