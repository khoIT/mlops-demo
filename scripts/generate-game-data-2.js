const fs = require("fs");
const path = require("path");

// ─── Seeded random ───────────────────────────────────────────────────────────
let _seed = 42;
function rand() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max) { return rand() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

function randNormal() {
  const u1 = Math.max(1e-12, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function clamp(x, a=0, b=1) { return Math.max(a, Math.min(b, x)); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function ts(ms) { return new Date(ms).toISOString().replace(".000Z", "Z"); }

// ─── Constants ───────────────────────────────────────────────────────────────
const CHANNELS = ["meta_ads", "google_uac", "tiktok", "unity_ads", "organic", "influencer"];
const COUNTRIES = ["US", "KR", "JP", "TW", "TH", "BR", "DE", "RU"];
const OS_LIST = ["android", "ios"];
const DEVICES_ANDROID = ["Samsung Galaxy S24", "Xiaomi 14", "OPPO Find X7", "Pixel 8", "OnePlus 12"];
const DEVICES_IOS = ["iPhone 15 Pro", "iPhone 14", "iPhone 13", "iPad Pro 12.9"];
const CAMPAIGNS = ["l2m_launch_kr", "l2m_retarget_us", "l2m_broad_sea", "l2m_lookalike_jp", "l2m_video_tw", "l2m_brand_global"];
const ADSETS = ["high_spender_lal", "broad_male_25_44", "rpg_interest", "mmorpg_gamers", "new_installer_ret"];
const CREATIVES = ["cinematic_trailer", "gameplay_boss", "pvp_highlight", "gacha_reveal", "guild_war_cg"];

const SKU_CATEGORIES = ["monthly_card", "battle_pass", "gacha_pack", "gem_bundle", "starter_pack", "costume_box"];
const PAYMENT_CHANNELS = ["google_play", "app_store", "paypal", "carrier_billing"];
const SOFT_SOURCES = ["quest", "dungeon", "daily", "sell", "arena"];
const HARD_SOURCES = ["achieve", "event", "comp", "free"];
const SPEND_TARGETS = ["gear", "skill", "tp", "revive", "shop"];
const GACHA_TYPES = ["weapon", "armor", "pet", "costume"];
const DUNGEON_NAMES = ["cruma", "dragon_v", "ant_nest", "tower_ins", "forge", "plains"];
const CHAT_CH = ["world", "guild", "party", "whisper", "trade"];

const MOB_NAMES = ["orc", "skeleton", "goblin", "dragonling", "bandit", "golem", "wraith"];
const SKILLS = ["slash", "fireball", "pierce", "heal", "stun", "whirlwind", "shield_bash"];
const ITEMS = ["hp_potion", "mp_potion", "scroll_tp", "rare_gem", "craft_mat", "enhance_stone"];
const FILLER_EVENTS = [
  () => ["combat_hit", `mob=${pick(MOB_NAMES)};skill=${pick(SKILLS)};dmg=${randInt(20, 500)}`],
  () => ["mob_kill", `mob=${pick(MOB_NAMES)};xp=${randInt(50, 5000)}`],
  () => ["item_loot", `item=${pick(ITEMS)};qty=${randInt(1, 5)}`],
  () => ["skill_cast", `skill=${pick(SKILLS)};mp=${randInt(1, 40)}`],
  () => ["move_zone", `zone=${pick(DUNGEON_NAMES)};dist=${randInt(10, 800)}`],
];

// SKU price ladder
const SKU_PRICE_LADDER = {
  starter_pack:  [0.99, 1.99, 2.99, 4.99],
  monthly_card:  [4.99, 9.99],
  battle_pass:   [9.99, 19.99],
  costume_box:   [4.99, 9.99, 19.99],
  gem_bundle:    [4.99, 9.99, 19.99, 49.99, 99.99],
  gacha_pack:    [0.99, 4.99, 9.99, 19.99, 49.99],
};

function refundProbability(productSku, paymentChannel) {
  let p = 0.008;
  if (paymentChannel === "paypal") p += 0.01;
  if (paymentChannel === "carrier_billing") p += 0.015;
  if (productSku === "gacha_pack") p += 0.01;
  if (productSku === "gem_bundle") p += 0.005;
  return clamp(p, 0, 0.08);
}

const ARCHETYPES = {
  whale:        { w: 0.03, lvl: [40,70], guildP: 0.95, retention: { base: 0.95, decay: 0.02, weekendBoost: 1.20 }, priors: { spend: 1.7, engage: 1.2 } },
  dolphin:      { w: 0.12, lvl: [25,50], guildP: 0.70, retention: { base: 0.80, decay: 0.05, weekendBoost: 1.15 }, priors: { spend: 0.9, engage: 0.8 } },
  minnow:       { w: 0.15, lvl: [15,35], guildP: 0.40, retention: { base: 0.65, decay: 0.08, weekendBoost: 1.10 }, priors: { spend: 0.3, engage: 0.5 } },
  free_engaged: { w: 0.25, lvl: [20,45], guildP: 0.50, retention: { base: 0.70, decay: 0.06, weekendBoost: 1.20 }, priors: { spend: -0.6, engage: 0.9 } },
  free_casual:  { w: 0.30, lvl: [5,20],  guildP: 0.10, retention: { base: 0.45, decay: 0.12, weekendBoost: 1.05 }, priors: { spend: -1.2, engage: -0.2 } },
  churned:      { w: 0.15, lvl: [2,10],  guildP: 0.02, retention: { base: 0.20, decay: 0.25, weekendBoost: 1.00 }, priors: { spend: -1.5, engage: -1.0 } },
};
function pickArchetype() {
  const r = rand();
  let cum = 0;
  for (const [, cfg] of Object.entries(ARCHETYPES)) {
    cum += cfg.w;
    if (r < cum) return cfg;
  }
  return ARCHETYPES.free_casual;
}

// ─── Calendar effects ────────────────────────────────────────────────────────
const BASE_DATE = new Date("2024-10-01T00:00:00Z");
const INSTALL_WINDOW_DAYS = 122;

const EVENT_WEEK_START = new Date("2024-11-15T00:00:00Z").getTime();
const EVENT_WEEK_END   = EVENT_WEEK_START + 7 * 86400000;
const PATCH_DAY        = new Date("2024-12-05T00:00:00Z").getTime();

function isWeekend(date) { const d = date.getDay(); return d === 0 || d === 6; }
function calendarMultiplier(dayMs) {
  let m = 1.0;
  if (dayMs >= EVENT_WEEK_START && dayMs < EVENT_WEEK_END) m *= 1.25;
  if (Math.abs(dayMs - PATCH_DAY) < 12 * 3600000) m *= 1.15;
  return m;
}
function dailyActiveProbability(dayIndex, baseParams, userJitter, inactivityStreak) {
  const dayMs = BASE_DATE.getTime() + dayIndex * 86400000;
  const date = new Date(dayMs);

  const base = clamp(baseParams.base + userJitter.base, 0.05, 0.99);
  const decay = clamp(baseParams.decay + userJitter.decay, 0.005, 0.35);
  const weekendBoost = clamp(baseParams.weekendBoost + userJitter.weekendBoost, 1.0, 1.4);

  const weekendFactor = isWeekend(date) ? weekendBoost : 1.0;
  const cal = calendarMultiplier(dayMs);
  const hazard = inactivityStreak >= 2 ? (1 / (1 + 0.35 * (inactivityStreak - 1))) : 1.0;

  const p = base * Math.pow(1 - decay, dayIndex) * weekendFactor * cal * hazard;
  return clamp(p, 0.01, 1.0);
}

// Couplings
function channelSpendShift(channel) {
  if (channel === "influencer") return 0.25;
  if (channel === "meta_ads") return 0.15;
  if (channel === "google_uac") return -0.05;
  return 0.05;
}
function countryArppuShift(country) {
  if (country === "KR") return 0.35;
  if (country === "JP") return 0.25;
  if (country === "US") return 0.15;
  if (country === "BR") return -0.10;
  if (country === "TH") return -0.05;
  return 0.0;
}
function deviceTierShift(tier) {
  if (tier === "high") return 0.20;
  if (tier === "mid") return 0.05;
  return -0.10;
}

function generateLatents(archetypePriors, channel, country, deviceTier) {
  const engage = archetypePriors.engage + randNormal() * 0.35;
  const spend  = archetypePriors.spend  + randNormal() * 0.45
    + channelSpendShift(channel) + countryArppuShift(country) + deviceTierShift(deviceTier);

  const engagement = clamp(sigmoid(engage));
  const spender = clamp(sigmoid(spend));
  return { engagement, spender };
}
function latentsToPropensities(latents) {
  const { engagement, spender } = latents;
  const grind   = clamp(0.55 * engagement + 0.10 * spender + randNormal() * 0.08);
  const pay     = clamp(0.25 * engagement + 0.75 * spender + randNormal() * 0.06);
  const social  = clamp(0.55 * engagement + 0.15 * spender + randNormal() * 0.10);
  const compete = clamp(0.50 * engagement + randNormal() * 0.10);
  return { pay, social, grind, compete };
}

function pickSkuByContext({ early, milestone, spender, channel }) {
  if (channel === "influencer" && rand() < 0.35) return "costume_box";
  if (early && rand() < 0.55) return "starter_pack";
  if (milestone === "level20" && rand() < 0.6) return "battle_pass";
  if (milestone === "dungeon" && rand() < 0.55) return "gacha_pack";
  if (spender > 0.75 && rand() < 0.6) return "gem_bundle";
  if (rand() < 0.25) return "monthly_card";
  if (rand() < 0.35) return "gacha_pack";
  return "gem_bundle";
}
function sampleTxnAmount(productSku, spender, country) {
  const ladder = SKU_PRICE_LADDER[productSku] || [4.99, 9.99];
  const base = pick(ladder);
  const mult = 1 + (spender - 0.5) * 0.35 + countryArppuShift(country) * 0.15;
  const noisy = base * mult * (1 + randNormal() * 0.06);
  return Math.max(0.99, +noisy.toFixed(2));
}

// Purch timing: early + milestone + long tail
function purchaseSchedule(installMs, n, milestones, lateMonetizer, falseEarlyPayer) {
  let tsList = [];

  const earlyN = Math.floor(n * 0.55);
  const restN = n - earlyN;

  for (let i = 0; i < earlyN; i++) {
    tsList.push(installMs + randInt(0, 48) * 3600000 + randInt(0, 3599) * 1000);
  }

  const milestoneSlots = [];
  if (milestones.firstDungeonMs) milestoneSlots.push({ t: milestones.firstDungeonMs, k: "dungeon" });
  if (milestones.level20Ms)      milestoneSlots.push({ t: milestones.level20Ms, k: "level20" });
  if (milestones.firstGuildMs)   milestoneSlots.push({ t: milestones.firstGuildMs, k: "guild" });

  const milestoneN = Math.min(restN, milestoneSlots.length > 0 ? Math.floor(restN * 0.6) : 0);
  for (let i = 0; i < milestoneN; i++) {
    const m = pick(milestoneSlots);
    tsList.push(m.t + randInt(0, 6) * 3600000 + randInt(0, 3600) * 1000);
  }

  const tailN = restN - milestoneN;
  for (let i = 0; i < tailN; i++) {
    tsList.push(installMs + randInt(8, 90) * 86400000 + randInt(0, 86399) * 1000);
  }

  tsList.sort((a, b) => a - b);

  if (lateMonetizer) {
    // force no D7 revenue: shift <=D6 txns to 14..60
    tsList = tsList.map((t) => {
      const d = Math.floor((t - installMs) / 86400000);
      if (d <= 6) return installMs + randInt(14, 60) * 86400000 + randInt(0, 86399) * 1000;
      return t;
    }).sort((a, b) => a - b);
  }

  if (falseEarlyPayer) {
    tsList = tsList.map((t, idx) => {
      if (idx < Math.ceil(tsList.length * 0.8)) return installMs + randInt(0, 48) * 3600000 + randInt(0, 3599) * 1000;
      return installMs + randInt(3, 10) * 86400000 + randInt(0, 86399) * 1000;
    }).sort((a, b) => a - b);
  }

  return tsList;
}

// Pipeline mess
const MESS = { dupRate: 0.008, dropRate: 0.004, oooRate: 0.015 };

// ─── Generate ────────────────────────────────────────────────────────────────
const NUM_PLAYERS = 2000;
const TARGET_EVENTS = 1_00_000;

const LATE_MONETIZER_RATE = 0.08;
const FALSE_EARLY_PAYER_RATE = 0.05;

const outDir = path.join(__dirname, "..", "public");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Stream events
const eventsPath = path.join(outDir, "game-events.csv");
const eventsStream = fs.createWriteStream(eventsPath, { encoding: "utf8" });
eventsStream.write("game_user_id,event_time,event_name,session_id,params\n");

let eventCount = 0;
function maybeWriteEvent(line) {
  if (eventCount >= TARGET_EVENTS) return false; // cap only events

  if (rand() < MESS.dropRate) return true; // pretend written

  eventsStream.write(line + "\n");
  eventCount++;

  if (rand() < MESS.dupRate && eventCount < TARGET_EVENTS) {
    eventsStream.write(line + "\n");
    eventCount++;
  }
  return eventCount < TARGET_EVENTS;
}

// Tables in memory
const playersRows = [];
const paymentsRows = [];
const uaCostRows = [];
const labelsRows = [];

// For labels: store installs + behavior summaries
const userMeta = new Map(); // userId -> {installMs, installDate, campaignId, consentTracking, ...}
const userW7 = new Map();   // userId -> {activeDaysW7, sessionsW7, maxLevelW7}
const payAgg = new Map();   // userId -> {ltv7, ltv30, ltv90, payer7, payer30, payer90}

console.log(`Generating ${NUM_PLAYERS} players with ~${TARGET_EVENTS.toLocaleString()} events...`);

for (let i = 0; i < NUM_PLAYERS; i++) {
  // ✅ FIX: do NOT break outer loop when events cap reached
  const os = pick(OS_LIST);
  const device = os === "ios" ? pick(DEVICES_IOS) : pick(DEVICES_ANDROID);
  const channel = pick(CHANNELS);
  const country = pick(COUNTRIES);
  const installOffset = randInt(0, INSTALL_WINDOW_DAYS - 1);
  const installHour = randInt(0, 23);
  const installMs = BASE_DATE.getTime() + installOffset * 86400000 + installHour * 3600000;
  const installDate = ts(installMs).split("T")[0];

  const userId = `player_${String(i + 1).padStart(5, "0")}`;
  const deviceTier = pick(["low", "mid", "high"]);

  const consentTracking = rand() > 0.15;
  const consentMarketing = rand() > 0.25;

  const campaignId = consentTracking ? pick(CAMPAIGNS) : "unknown";
  const adsetId = consentTracking ? pick(ADSETS) : "unknown";
  const creativeId = consentTracking ? pick(CREATIVES) : "unknown";

  playersRows.push([
    userId,
    `i_${randInt(100000, 999999)}`,
    ts(installMs),
    campaignId,
    adsetId,
    creativeId,
    channel, country, os, device, deviceTier,
    consentTracking ? "true" : "false",
    consentMarketing ? "true" : "false",
  ]);

  userMeta.set(userId, { installMs, installDate, campaignId, consentTracking, channel, country, os, deviceTier });

  const arche = pickArchetype();
  const retentionJitter = {
    base: (rand() - 0.5) * 0.10,
    decay: (rand() - 0.5) * 0.02,
    weekendBoost: (rand() - 0.5) * 0.10,
  };

  const latents = generateLatents(arche.priors, channel, country, deviceTier);
  const props = latentsToPropensities(latents);

  // Activity D0..D30
  const activeDays = [];
  let inactivityStreak = 0;
  for (let day = 0; day <= 30; day++) {
    const pAct = dailyActiveProbability(day, arche.retention, retentionJitter, inactivityStreak);
    const isActive = rand() < pAct;
    if (isActive) { activeDays.push(day); inactivityStreak = 0; }
    else inactivityStreak++;
  }

  // Sessions per active day
  const sessions = [];
  for (const dayOff of activeDays) {
    const baseSess = 1 + Math.floor(latents.engagement * 2.2); // 1..3
    const nSess = clamp(baseSess + (rand() < 0.15 ? 1 : 0), 1, 4);
    for (let s = 0; s < nSess; s++) sessions.push(dayOff);
  }

  // W7 summaries for labels
  const activeDaysW7 = activeDays.filter(d => d <= 6).length;
  const sessionsW7 = sessions.filter(d => d <= 6).length;
  const maxLevel = randInt(arche.lvl[0], arche.lvl[1]);
  userW7.set(userId, { activeDaysW7, sessionsW7, maxLevelW7: maxLevel });

  // Milestones for purchase triggers (if events generated before cap; else null)
  let firstDungeonMs = null;
  let level20Ms = null;
  let firstGuildMs = null;

  // Event generation with budget; if cap reached, we skip emitting but still continue user generation
  if (eventCount < TARGET_EVENTS) {
    const remainingPlayers = Math.max(1, NUM_PLAYERS - i);
    const remainingEvents = Math.max(0, TARGET_EVENTS - eventCount);
    const userBudget = Math.max(250, Math.floor(remainingEvents / remainingPlayers));
    let userEvents = 0;

    for (let s = 0; s < sessions.length; s++) {
      if (eventCount >= TARGET_EVENTS) break;
      if (userEvents >= userBudget) break;

      const dayOff = sessions[s];
      const hour = randInt(6, 23);
      const sMs = installMs + dayOff * 86400000 + hour * 3600000 + randInt(0, 3599) * 1000;
      const sid = `s${i}_${s}`;

      const sLenMin = Math.round(6 + 80 * latents.engagement);
      const sLen = randInt(Math.max(4, sLenMin - 10), sLenMin + 15);

      if (!maybeWriteEvent(`${userId},${ts(sMs)},session_start,${sid},`)) break;
      userEvents++;

      const evts = [];
      const semanticIntensity = 0.15 + 0.55 * latents.engagement;

      if (dayOff <= 2 && rand() < 0.08) {
        const lvl = Math.min(maxLevel, randInt(2, maxLevel));
        evts.push(["level_up", `level=${lvl}`]);
        if (!level20Ms && lvl >= 20) level20Ms = sMs + randInt(60, 1200) * 1000;
      }

      const questN = Math.floor(semanticIntensity * props.grind * randInt(0, 3));
      for (let q = 0; q < questN; q++)
        evts.push(["quest_complete", `quest=mq_${randInt(1,80)};xp=${randInt(100,5000)}`]);

      const pveN = Math.floor(semanticIntensity * props.grind * randInt(0, 2));
      for (let p = 0; p < pveN; p++) {
        const isDungeon = rand() < 0.55;
        evts.push([isDungeon ? "dungeon_clear" : "pve_run", isDungeon ? `dungeon=${pick(DUNGEON_NAMES)}` : `area=${pick(DUNGEON_NAMES)}`]);
        if (isDungeon && !firstDungeonMs) firstDungeonMs = sMs + randInt(60, 900) * 1000;
      }

      const softEarnN = Math.floor(semanticIntensity * props.grind * randInt(0, 2));
      for (let e = 0; e < softEarnN; e++)
        evts.push(["soft_earn", `amount=${randInt(500,5000)};source=${pick(SOFT_SOURCES)}`]);

      const softSpendN = Math.floor(semanticIntensity * props.grind * randInt(0, 2));
      for (let e = 0; e < softSpendN; e++)
        evts.push(["soft_spend", `amount=${randInt(200,4000)};target=${pick(SPEND_TARGETS)}`]);

      const pvpN = Math.floor(semanticIntensity * props.compete * randInt(0, 2));
      for (let p = 0; p < pvpN; p++)
        evts.push(["pvp_match", `result=${rand() < 0.52 ? "win" : "lose"}`]);

      if (rand() < arche.guildP * (0.6 + 0.8 * props.social) && dayOff <= 7) {
        evts.push(["guild_join", `guild=g_${randInt(1,200)}`]);
        if (!firstGuildMs) firstGuildMs = sMs + randInt(60, 900) * 1000;
        const gaN = Math.floor(semanticIntensity * props.social * randInt(1, 3));
        for (let g = 0; g < gaN; g++)
          evts.push(["guild_activity", `type=${pick(["boss","war","quest","donate","buff"])}`]);
      }

      const chatN = Math.floor(semanticIntensity * props.social * randInt(0, 3));
      for (let c = 0; c < chatN; c++)
        evts.push(["chat_message", `channel=${pick(CHAT_CH)}`]);

      const friendN = Math.floor(semanticIntensity * props.social * randInt(0, 2));
      for (let f = 0; f < friendN; f++)
        evts.push(["friend_add", `friend=player_${String(randInt(1,NUM_PLAYERS)).padStart(5,"0")}`]);

      if (consentMarketing) {
        const gachaOpenN = Math.floor(semanticIntensity * props.pay * randInt(0, 2));
        for (let g = 0; g < gachaOpenN; g++)
          evts.push(["gacha_open", `type=${pick(GACHA_TYPES)};pulls=${randInt(1,10)}`]);

        const shopViewN = Math.floor(semanticIntensity * props.pay * randInt(0, 3));
        for (let sv = 0; sv < shopViewN; sv++)
          evts.push(["shop_view", `section=${pick(["featured","daily","gem","costume","equip"])}`]);
      }

      const desiredEventsThisSession = Math.max(18, Math.floor(35 + 220 * latents.engagement));
      const fillerN = Math.max(0, desiredEventsThisSession - evts.length);
      for (let k = 0; k < fillerN; k++) {
        if (latents.engagement < 0.25 && k > 30) break;
        const [en, params] = pick(FILLER_EVENTS)();
        evts.push([en, params]);
      }

      evts.sort(() => rand() - 0.5);
      if (rand() < MESS.oooRate && evts.length > 6) {
        for (let t = 0; t < 3; t++) {
          const idx = randInt(1, evts.length - 2);
          const tmp = evts[idx];
          evts[idx] = evts[idx - 1];
          evts[idx - 1] = tmp;
        }
      }

      for (let e = 0; e < evts.length; e++) {
        if (eventCount >= TARGET_EVENTS) break;
        if (userEvents >= userBudget) break;
        const offMs = Math.round((e + 1) / (evts.length + 2) * sLen * 60000);
        const line = `${userId},${ts(sMs + offMs)},${evts[e][0]},${sid},${evts[e][1]}`;
        if (!maybeWriteEvent(line)) break;
        userEvents++;
      }

      if (eventCount >= TARGET_EVENTS) break;
      if (userEvents < userBudget) {
        if (!maybeWriteEvent(`${userId},${ts(sMs + sLen * 60000)},session_end,${sid},duration_seconds=${sLen * 60}`)) break;
        userEvents++;
      }
    }
  }

  // ── Payments (and accumulate label aggregates) ─────────────────────────────
  const lateMonetizer = rand() < LATE_MONETIZER_RATE && latents.engagement > 0.35 && latents.spender > 0.35;
  const falseEarlyPayer = rand() < FALSE_EARLY_PAYER_RATE && latents.spender > 0.45;

  let payProb = clamp(0.02 + 0.85 * latents.spender + 0.15 * latents.engagement);
  if (lateMonetizer) payProb *= 0.75;
  if (!consentTracking) payProb *= 0.95;

  const willPay = rand() < payProb;
  const baseTxn = Math.max(0, Math.round(1 + 6 * latents.spender + 2 * latents.engagement + randNormal()));
  const txnCount = clamp(baseTxn, 0, 18);

  const milestones = { firstDungeonMs, level20Ms, firstGuildMs };
  if (willPay && txnCount > 0) {
    const times = purchaseSchedule(installMs, txnCount, milestones, lateMonetizer, falseEarlyPayer);

    let l7 = 0, l30 = 0, l60 = 0, l90 = 0;
    let txn7 = 0;
    let firstPurchaseHours = null;
    for (let t = 0; t < times.length; t++) {
      const txMs = times[t];
      const days = Math.floor((txMs - installMs) / 86400000);

      const milestone =
        (level20Ms && Math.abs(txMs - level20Ms) < 48 * 3600000) ? "level20" :
        (firstDungeonMs && Math.abs(txMs - firstDungeonMs) < 48 * 3600000) ? "dungeon" :
        (firstGuildMs && Math.abs(txMs - firstGuildMs) < 48 * 3600000) ? "guild" : null;

      const productSku = pickSkuByContext({ early: days <= 2, milestone, spender: latents.spender, channel });
      const paymentChannel = pick(PAYMENT_CHANNELS);
      const amount = sampleTxnAmount(productSku, latents.spender, country);
      const isRefund = rand() < refundProbability(productSku, paymentChannel);
      const net = isRefund ? 0 : amount;

      paymentsRows.push([ userId, ts(txMs), amount, productSku, paymentChannel, isRefund ? "true" : "false" ]);

      if (net > 0 && firstPurchaseHours === null) firstPurchaseHours = Math.round(((txMs - installMs) / 3600000) * 100) / 100;
      if (days <= 6) { l7 += net; if (net > 0) txn7 += 1; }
      if (days <= 30) l30 += net;
      if (days <= 60) l60 += net;
      if (days <= 90) l90 += net;
    }

    payAgg.set(userId, {
      ltv7: +l7.toFixed(2),
      ltv30: +l30.toFixed(2),
      ltv60: +l60.toFixed(2),
      ltv90: +l90.toFixed(2),
      payer7: l7 > 0 ? 1 : 0,
      payer30: l30 > 0 ? 1 : 0,
      payer60: l60 > 0 ? 1 : 0,
      payer90: l90 > 0 ? 1 : 0,
      num_txn_d7: txn7,
      first_purchase_time_hours: firstPurchaseHours === null ? 0 : firstPurchaseHours,
      lateMonetizer: lateMonetizer ? 1 : 0,
      falseEarlyPayer: falseEarlyPayer ? 1 : 0,
    });
  } else {
    payAgg.set(userId, {
      ltv7: 0, ltv30: 0, ltv60: 0, ltv90: 0,
      payer7: 0, payer30: 0, payer60: 0, payer90: 0,
      num_txn_d7: 0,
      first_purchase_time_hours: 0,
      lateMonetizer: lateMonetizer ? 1 : 0,
      falseEarlyPayer: falseEarlyPayer ? 1 : 0,
    });
  }
}

eventsStream.end();

// ─── UA Costs ───────────────────────────────────────────────────────────────
for (const campaign of CAMPAIGNS) {
  for (let d = 0; d < INSTALL_WINDOW_DAYS; d++) {
    const date = new Date(BASE_DATE.getTime() + d * 86400000);
    let dailySpend = randFloat(800, 7000);
    let cpi = randFloat(1.2, 10);

    if (campaign.includes("launch_kr")) { dailySpend *= 1.25; cpi *= 1.15; }
    if (campaign.includes("retarget"))  { dailySpend *= 0.85; cpi *= 1.05; }
    if (campaign.includes("brand"))     { dailySpend *= 1.10; cpi *= 1.25; }

    dailySpend = +dailySpend.toFixed(2);
    cpi = Math.max(0.6, +cpi.toFixed(2));
    const installs = Math.max(0, Math.round(dailySpend / cpi));

    uaCostRows.push([campaign, date.toISOString().split("T")[0], dailySpend, installs * randInt(40, 220), installs * randInt(2, 18), installs]);
  }
}

// Build CPI lookup for labels: campaign+date -> spend/installs
const cpiLookup = new Map();
for (const r of uaCostRows) {
  const [campaign, date, spend, , , installs] = r;
  const cpi = installs > 0 ? (Number(spend) / Number(installs)) : 0;
  cpiLookup.set(`${campaign}|${date}`, cpi);
}

// ─── Labels ────────────────────────────────────────────────────────────────
for (const [userId, meta] of userMeta.entries()) {
  const agg = payAgg.get(userId) || { ltv7:0, ltv30:0, ltv90:0, payer7:0, payer30:0, payer90:0, lateMonetizer:0, falseEarlyPayer:0 };
  const w7 = userW7.get(userId) || { activeDaysW7:0, sessionsW7:0, maxLevelW7:0 };

  const uaCost = meta.consentTracking && meta.campaignId !== "unknown"
    ? (cpiLookup.get(`${meta.campaignId}|${meta.installDate}`) || 0)
    : 0;

  const profitD90 = +(agg.ltv90 - uaCost).toFixed(2);

  labelsRows.push([
    userId,
    meta.installDate,
    +uaCost.toFixed(2),
    agg.ltv7, agg.ltv30, agg.ltv60, agg.ltv90,
    agg.payer7, agg.payer30, agg.payer60, agg.payer90,
    agg.num_txn_d7, agg.first_purchase_time_hours,
    profitD90,
    agg.lateMonetizer,
    agg.falseEarlyPayer,
    w7.activeDaysW7,
    w7.sessionsW7,
    w7.maxLevelW7,
  ]);
}


// ─── pLTV model scoring export (GBT simulation; deterministic) ───────────────
// This mirrors the trainPLTVModel() logic in pltv-engine.ts (simplified to JS),
// so pLTV evaluation pages can load real scores instead of synthesizing.

function trainPLTVModelJS(featureRows, selectedFeatures, config) {
  // Separate seed so scoring is deterministic and independent from generation
  let _mseed = 777;
  function mrand() { _mseed = (_mseed * 16807) % 2147483647; return (_mseed - 1) / 2147483646; }
  function mreset(s = 777) { _mseed = s; }

  const start = Date.now();
  mreset(777);

  // Filter monetization features for cold-start track
  let features = [...selectedFeatures];
  const monetizationFeatures = ["is_payer_by_d7", "num_txn_d7", "revenue_d7", "first_purchase_time_hours"];
  if (config.modelTrack === "cold") {
    features = features.filter((f) => !monetizationFeatures.includes(f));
  }

  // Build X, y
  const X = [];
  const y = [];
  for (const row of featureRows) {
    X.push(features.map((f) => (typeof row[f] === "number" ? row[f] : 0)));
    const target = row[config.target];
    y.push(config.useLogTarget ? Math.log1p(target) : target);
  }

  // Train/test split (shuffle indices)
  const n = X.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(mrand() * (i + 1));
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
  const splitIdx = Math.floor(n * (1 - config.testSplit));
  const trainIdx = indices.slice(0, splitIdx);
  const testIdx = indices.slice(splitIdx);

  const trainX = trainIdx.map((i) => X[i]);
  const trainY = trainIdx.map((i) => y[i]);
  const testX = testIdx.map((i) => X[i]);
  const testY = testIdx.map((i) => y[i]);

  // ─── Gradient Boosted Trees ──────────────────────────────────────────
  const nTrees = 120;
  const learningRate = 0.08;
  const maxDepth = 4;
  const minSamplesLeaf = 5;
  const maxBins = 32;

  const featureGain = new Array(features.length).fill(0);

  // Quantile-style thresholds per feature (histogram bins)
  const featureThresholds = features.map((_, f) => {
    const vals = trainX.map((row) => row[f]).slice().sort((a, b) => a - b);
    const unique = Array.from(new Set(vals));
    if (unique.length <= maxBins) return unique.slice(0, -1);
    const step = unique.length / maxBins;
    const bins = [];
    for (let b = 1; b < maxBins; b++) bins.push(unique[Math.floor(b * step)]);
    return bins;
  });

  function buildTree(idxList, residuals, depth) {
    const mean = idxList.reduce((s, i) => s + residuals[i], 0) / idxList.length;

    if (depth >= maxDepth || idxList.length < minSamplesLeaf * 2) {
      return { leaf: true, value: mean * learningRate };
    }

    let bestFeature = -1, bestThreshold = 0, bestGain = 0;
    let bestLeft = null, bestRight = null;

    const parentVar = idxList.reduce((s, i) => {
      const d = residuals[i] - mean;
      return s + d * d;
    }, 0);

    for (let f = 0; f < features.length; f++) {
      const thrs = featureThresholds[f];
      for (let k = 0; k < thrs.length; k++) {
        const thr = thrs[k];
        const left = [];
        const right = [];
        for (let ii = 0; ii < idxList.length; ii++) {
          const i = idxList[ii];
          if (trainX[i][f] <= thr) left.push(i);
          else right.push(i);
        }
        if (left.length < minSamplesLeaf || right.length < minSamplesLeaf) continue;

        const leftMean = left.reduce((s, i) => s + residuals[i], 0) / left.length;
        const rightMean = right.reduce((s, i) => s + residuals[i], 0) / right.length;

        const leftVar = left.reduce((s, i) => { const d = residuals[i] - leftMean; return s + d * d; }, 0);
        const rightVar = right.reduce((s, i) => { const d = residuals[i] - rightMean; return s + d * d; }, 0);

        const gain = parentVar - leftVar - rightVar;
        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = thr;
          bestLeft = left;
          bestRight = right;
        }
      }
    }

    if (bestFeature === -1) {
      return { leaf: true, value: mean * learningRate };
    }

    featureGain[bestFeature] += bestGain;

    return {
      leaf: false,
      featureIdx: bestFeature,
      threshold: bestThreshold,
      left: buildTree(bestLeft, residuals, depth + 1),
      right: buildTree(bestRight, residuals, depth + 1),
    };
  }

  function predictTree(node, x) {
    if (node.leaf) return node.value;
    return x[node.featureIdx] <= node.threshold ? predictTree(node.left, x) : predictTree(node.right, x);
  }

  // Boosting on residuals
  const residuals = trainY.slice();
  const trees = [];

  for (let t = 0; t < nTrees; t++) {
    const bagSize = Math.floor(trainX.length * 0.8);
    const bagIdx = [];
    for (let i = 0; i < bagSize; i++) bagIdx.push(Math.floor(mrand() * trainX.length));

    const tree = buildTree(bagIdx, residuals, 0);
    trees.push(tree);

    // Update residuals on ALL training rows
    for (let i = 0; i < trainX.length; i++) {
      residuals[i] -= predictTree(tree, trainX[i]);
    }
  }

  function predict(x) {
    let pred = 0;
    for (const tree of trees) pred += predictTree(tree, x);
    if (config.useLogTarget) return Math.expm1(Math.max(pred, 0));
    return Math.max(pred, 0);
  }

  // Test metrics
  const predictions = testX.map((x) => predict(x));
  const actuals = testIdx.map((i) => featureRows[i][config.target]);

  const mae = Math.round((predictions.reduce((s, p, i) => s + Math.abs(p - actuals[i]), 0) / (predictions.length || 1)) * 100) / 100;
  const mse = predictions.reduce((s, p, i) => s + (p - actuals[i]) ** 2, 0) / (predictions.length || 1);
  const rmse = Math.round(Math.sqrt(mse) * 100) / 100;
  const actualMean = actuals.reduce((a, b) => a + b, 0) / (actuals.length || 1);
  const ssTot = actuals.reduce((s, a) => s + (a - actualMean) ** 2, 0);
  const ssRes = predictions.reduce((s, p, i) => s + (p - actuals[i]) ** 2, 0);
  const r2 = Math.round((1 - ssRes / (ssTot || 1)) * 1000) / 1000;

  // All-user predictions for export
  const allPreds = X.map((x) => predict(x));
  const sorted = allPreds.slice().sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;

  const scored = featureRows.map((row, i) => {
    const pred = Math.round(allPreds[i] * 100) / 100;
    // percentile rank (O(n^2) avoided via binary search)
    const lo = (() => {
      let l = 0, r = sorted.length - 1, ans = sorted.length - 1;
      while (l <= r) {
        const mid = (l + r) >> 1;
        if (sorted[mid] >= allPreds[i]) { ans = mid; r = mid - 1; } else l = mid + 1;
      }
      return ans;
    })();
    const pctRank = (lo + 1) / (sorted.length || 1);
    const decile = Math.min(Math.ceil(pctRank * 10), 10);

    let segment = "Minimal Value";
    if (allPreds[i] >= p99) segment = "Whale (Top 1%)";
    else if (decile >= 9) segment = "High Value";
    else if (decile >= 7) segment = "Mid Value";
    else if (decile >= 4) segment = "Low Value";

    return {
      game_user_id: row.game_user_id,
      pltv_pred: pred,
      pltv_decile: decile,
      is_top_1pct: allPreds[i] >= p99 ? 1 : 0,
      segment,
    };
  });

  return {
    modelId: `pltv_${Date.now()}`,
    modelType: config.modelTrack === "cold" ? "GBT (Cold-start)" : "GBT (Warm-start)",
    mae, rmse, r2,
    trainSize: trainIdx.length,
    testSize: testIdx.length,
    trainingDurationMs: Date.now() - start,
    scoredUsers: scored,
  };
}

// Build feature rows for scoring (aligned to Decision Lab columns)
const FEATURE_ROWS = [];
for (const [userId, meta] of userMeta.entries()) {
  const w7 = userW7.get(userId) || { activeDaysW7: 0, sessionsW7: 0, maxLevelW7: 1 };
  const agg = payAgg.get(userId) || { ltv7: 0, ltv30: 0, ltv60: 0, ltv90: 0, payer7: 0, payer30: 0, payer60: 0, payer90: 0, num_txn_d7: 0, first_purchase_time_hours: 0 };

  // UA cost: install CPI from campaign+date lookup (0 if unattributed)
  const key = `${meta.campaignId}|${meta.installDate}`;
  const uaCost = cpiLookup.has(key) ? cpiLookup.get(key) : 0;

  const deviceTierNum = meta.deviceTier === "high" ? 2 : (meta.deviceTier === "mid" ? 1 : 0);
  const osNum = meta.os === "ios" ? 1 : 0;

  FEATURE_ROWS.push({
    game_user_id: userId,
    // numeric features
    days_since_install: 7,
    sessions_cnt_w7d: w7.sessionsW7,
    active_days_w7d: w7.activeDaysW7,
    max_level_w7d: w7.maxLevelW7,
    revenue_d7: agg.ltv7,
    is_payer_by_d7: agg.payer7,
    num_txn_d7: agg.num_txn_d7,
    first_purchase_time_hours: agg.first_purchase_time_hours,
    ua_cost: uaCost,
    device_tier_num: deviceTierNum,
    os_num: osNum,
    // targets
    ltv_d30: agg.ltv30,
    ltv_d60: agg.ltv60,
    ltv_d90: agg.ltv90,
  });
}

// Train one canonical model and export its scores
const DEFAULT_FEATURES = [
  "sessions_cnt_w7d",
  "active_days_w7d",
  "max_level_w7d",
  "revenue_d7",
  "is_payer_by_d7",
  "num_txn_d7",
  "first_purchase_time_hours",
  "ua_cost",
  "device_tier_num",
  "os_num",
];

const pltvModel = trainPLTVModelJS(FEATURE_ROWS, DEFAULT_FEATURES, {
  testSplit: 0.25,
  target: "ltv_d60",
  useLogTarget: true,
  modelTrack: "warm",
});

// CSV rows
const pltvScoresRows = pltvModel.scoredUsers.map((u) => ([
  u.game_user_id,
  u.pltv_pred,
  u.pltv_decile,
  u.is_top_1pct,
  u.segment,
  pltvModel.modelId,
  pltvModel.modelType,
  pltvModel.trainSize,
  pltvModel.testSize,
  pltvModel.mae,
  pltvModel.rmse,
  pltvModel.r2,
]));

// ─── Write CSVs ─────────────────────────────────────────────────────────────
function writeFile(filePath, header, rows) {
  const content = header + "\n" + rows.map((r) => r.join(",")).join("\n");
  fs.writeFileSync(filePath, content);
}

writeFile(
  path.join(outDir, "game-players.csv"),
  "game_user_id,install_id,install_time,campaign_id,adset_id,creative_id,channel,country,os,device_model,device_tier,consent_tracking,consent_marketing",
  playersRows
);

writeFile(
  path.join(outDir, "game-payments.csv"),
  "game_user_id,txn_time,amount_usd,product_sku,payment_channel,is_refund",
  paymentsRows
);

writeFile(
  path.join(outDir, "game-ua-costs.csv"),
  "campaign_id,date,spend,impressions,clicks,installs",
  uaCostRows
);

writeFile(
  path.join(outDir, "game-labels.csv"),
  "game_user_id,install_date,ua_cost,ltv_d7,ltv_d30,ltv_d60,ltv_d90,is_payer_by_d7,is_payer_by_d30,is_payer_by_d60,is_payer_by_d90,num_txn_d7,first_purchase_time_hours,profit_d90,late_monetizer_flag,false_early_payer_flag,active_days_w7d,sessions_cnt_w7d,max_level_w7d",
  labelsRows
);

writeFile(
  path.join(outDir, "game-pltv-scores.csv"),
  "game_user_id,pltv_pred,pltv_decile,is_top_1pct,segment,model_id,model_type,train_size,test_size,mae,rmse,r2",
  pltvScoresRows
);

console.log(`\nOutputs:`);
console.log(`  game-players.csv:  ${playersRows.length} rows`);
console.log(`  game-events.csv:   ${eventCount.toLocaleString()} rows (streamed; capped at ${TARGET_EVENTS.toLocaleString()})`);
console.log(`  game-payments.csv: ${paymentsRows.length} rows`);
console.log(`  game-ua-costs.csv: ${uaCostRows.length} rows`);
console.log(`  game-labels.csv:   ${labelsRows.length} rows`);
console.log(`  game-pltv-scores.csv: ${pltvScoresRows.length} rows`);
console.log("Done!");