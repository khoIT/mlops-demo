// Generate synthetic Lineage 2-style MMORPG raw data CSVs
// Run: node scripts/generate-game-data.js

const fs = require("fs");
const path = require("path");

// ─── Seeded random ───────────────────────────────────────────────────────────
let _seed = 42;
function rand() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max) { return +(rand() * (max - min) + min).toFixed(2); }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

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
const SOFT_SOURCES = ["quest_reward", "dungeon_loot", "daily_login", "sell_item", "arena_reward"];
const HARD_SOURCES = ["achievement", "event_reward", "compensation", "daily_free"];
const SPEND_TARGETS = ["gear_enhance", "skill_upgrade", "teleport", "revive", "npc_shop"];
const GACHA_TYPES = ["weapon_gacha", "armor_gacha", "pet_gacha", "costume_gacha"];
const DUNGEON_NAMES = ["cruma_tower", "dragon_valley", "ant_nest", "tower_of_insolence", "forge_of_gods", "plains_of_glory"];
const QUEST_IDS = Array.from({ length: 80 }, (_, i) => `main_quest_${i + 1}`);
const TUTORIAL_STEPS = ["move", "attack", "equip", "skill", "quest_accept", "inventory", "shop_intro", "party_intro", "guild_intro", "dungeon_intro"];
const CHAT_CHANNELS_LIST = ["world", "guild", "party", "whisper", "trade"];

// Archetypes
const ARCHETYPES = {
  whale:        { w: 0.03, sess: [5,8], sLen: [30,120], lvl: [50,75], quest: [40,80], pvp: [15,40], pve: [30,80], guildP: 0.95, guildH: [2,24], friends: [5,20], chat: [30,150], gacha: [15,60], shop: [20,50], iap: [15,40], payP: 1.0, txn: [5,20], rev: [100,800], softE: [40,100], softS: [30,80], hardE: [10,30], hardS: [8,25], churnP: 0.02, actDays: [7,7] },
  dolphin:      { w: 0.12, sess: [3,5], sLen: [20,60],  lvl: [30,55], quest: [25,55], pvp: [5,20],  pve: [15,40], guildP: 0.75, guildH: [12,72], friends: [2,10], chat: [10,60],  gacha: [5,20],  shop: [10,30], iap: [8,20],  payP: 0.85, txn: [2,8],  rev: [10,100],  softE: [20,60],  softS: [15,50], hardE: [5,15],  hardS: [3,12],  churnP: 0.08, actDays: [5,7] },
  minnow:       { w: 0.15, sess: [2,3], sLen: [10,40],  lvl: [20,40], quest: [15,35], pvp: [2,10],  pve: [5,20],  guildP: 0.5,  guildH: [24,120],friends: [1,5],  chat: [3,20],   gacha: [2,8],   shop: [5,15],  iap: [3,10],  payP: 0.6,  txn: [1,3],  rev: [1,15],    softE: [10,35],  softS: [8,25],  hardE: [2,8],   hardS: [1,6],   churnP: 0.2,  actDays: [4,7] },
  free_engaged: { w: 0.25, sess: [2,5], sLen: [15,50],  lvl: [25,50], quest: [20,50], pvp: [5,25],  pve: [10,35], guildP: 0.6,  guildH: [24,96], friends: [2,8],  chat: [5,40],   gacha: [1,5],   shop: [3,12],  iap: [1,5],   payP: 0,    txn: [0,0],  rev: [0,0],     softE: [15,50],  softS: [10,40], hardE: [3,10],  hardS: [2,8],   churnP: 0.15, actDays: [4,7] },
  free_casual:  { w: 0.30, sess: [1,2], sLen: [5,20],   lvl: [8,25],  quest: [5,20],  pvp: [0,5],   pve: [2,10],  guildP: 0.2,  guildH: [48,168],friends: [0,3],  chat: [0,10],   gacha: [0,3],   shop: [0,5],   iap: [0,2],   payP: 0,    txn: [0,0],  rev: [0,0],     softE: [5,20],   softS: [3,15],  hardE: [0,5],   hardS: [0,3],   churnP: 0.4,  actDays: [2,5] },
  churned:      { w: 0.15, sess: [1,2], sLen: [3,15],   lvl: [3,15],  quest: [2,10],  pvp: [0,2],   pve: [0,5],   guildP: 0.05, guildH: [100,200],friends:[0,1], chat: [0,3],    gacha: [0,1],   shop: [0,2],   iap: [0,1],   payP: 0,    txn: [0,0],  rev: [0,0],     softE: [2,8],    softS: [1,5],   hardE: [0,2],   hardS: [0,1],   churnP: 0.95, actDays: [1,3] },
};

function pickArchetype() {
  const r = rand();
  let cum = 0;
  for (const [name, cfg] of Object.entries(ARCHETYPES)) {
    cum += cfg.w;
    if (r < cum) return name;
  }
  return "free_casual";
}

// ─── Generate ────────────────────────────────────────────────────────────────

const NUM_PLAYERS = 2000;
const BASE_DATE = new Date("2024-10-01T00:00:00Z");
const INSTALL_WINDOW_DAYS = 122; // Oct 1 → Jan 30 (4 months)

const playersRows = [];
const eventsRows = [];
const paymentsRows = [];

console.log(`Generating data for ${NUM_PLAYERS} players...`);

for (let i = 0; i < NUM_PLAYERS; i++) {
  const os = pick(OS_LIST);
  const device = os === "ios" ? pick(DEVICES_IOS) : pick(DEVICES_ANDROID);
  const channel = pick(CHANNELS);
  const country = pick(COUNTRIES);
  const installOffset = randInt(0, INSTALL_WINDOW_DAYS - 1);
  const installHour = randInt(0, 23);
  const installMs = BASE_DATE.getTime() + installOffset * 86400000 + installHour * 3600000;
  const installTime = new Date(installMs);
  const userId = `player_${String(i + 1).padStart(4, "0")}`;
  const tier = pick(["low", "mid", "high"]);

  playersRows.push([
    userId,
    `inst_${randInt(100000, 999999)}`,
    installTime.toISOString(),
    pick(CAMPAIGNS),
    pick(ADSETS),
    pick(CREATIVES),
    channel,
    country,
    os,
    device,
    tier,
    rand() > 0.15 ? "true" : "false",
    rand() > 0.25 ? "true" : "false",
  ]);

  const arch = pickArchetype();
  const cfg = ARCHETYPES[arch];
  const activeDays = randInt(cfg.actDays[0], cfg.actDays[1]);

  // Track current level for progression
  let currentLevel = 1;
  const targetMaxLevel = randInt(cfg.lvl[0], cfg.lvl[1]);

  // Determine active day offsets
  const dayOffsets = [];
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const shuffled = allDays.sort(() => rand() - 0.5);
  for (let d = 0; d < Math.min(activeDays, 7); d++) dayOffsets.push(shuffled[d]);
  dayOffsets.sort((a, b) => a - b);

  // Determine event counts
  const totalSessions = randInt(cfg.sess[0] * activeDays, cfg.sess[1] * activeDays);
  const totalQuests = randInt(cfg.quest[0], cfg.quest[1]);
  const totalPvp = randInt(cfg.pvp[0], cfg.pvp[1]);
  const totalPve = randInt(cfg.pve[0], cfg.pve[1]);
  const totalGacha = randInt(cfg.gacha[0], cfg.gacha[1]);
  const totalShop = randInt(cfg.shop[0], cfg.shop[1]);
  const totalIap = randInt(cfg.iap[0], cfg.iap[1]);
  const totalChat = randInt(cfg.chat[0], cfg.chat[1]);
  const totalFriends = randInt(cfg.friends[0], cfg.friends[1]);
  const totalSoftE = randInt(cfg.softE[0], cfg.softE[1]);
  const totalSoftS = randInt(cfg.softS[0], cfg.softS[1]);
  const totalHardE = randInt(cfg.hardE[0], cfg.hardE[1]);
  const totalHardS = randInt(cfg.hardS[0], cfg.hardS[1]);

  // Guild join
  const joinedGuild = rand() < cfg.guildP;
  const guildJoinHours = joinedGuild ? randInt(cfg.guildH[0], cfg.guildH[1]) : null;
  let guildJoinEmitted = false;
  const guildActivityCount = joinedGuild ? randInt(2, 20) : 0;

  // Tutorial (first day only)
  const tutorialStepsCount = randInt(5, TUTORIAL_STEPS.length);
  let tutorialEmitted = false;

  // Distribute events across sessions
  let questsLeft = totalQuests;
  let pvpLeft = totalPvp;
  let pveLeft = totalPve;
  let gachaLeft = totalGacha;
  let shopLeft = totalShop;
  let iapLeft = totalIap;
  let chatLeft = totalChat;
  let friendsLeft = totalFriends;
  let softELeft = totalSoftE;
  let softSLeft = totalSoftS;
  let hardELeft = totalHardE;
  let hardSLeft = totalHardS;
  let guildActLeft = guildActivityCount;

  // Level-up events to distribute
  const levelUpsNeeded = Math.max(0, targetMaxLevel - 1);
  let levelUpsLeft = levelUpsNeeded;

  for (let s = 0; s < totalSessions; s++) {
    const dayIdx = s % dayOffsets.length;
    const dayOffset = dayOffsets[dayIdx];
    const hour = randInt(6, 23);
    const sessionStartMs = installMs + dayOffset * 86400000 + hour * 3600000 + randInt(0, 3599) * 1000;
    const sessionLen = randInt(cfg.sLen[0], cfg.sLen[1]);
    const sessionId = `sess_${i}_${s}`;
    const isLastSession = s === totalSessions - 1;

    // Session start
    eventsRows.push([userId, new Date(sessionStartMs).toISOString(), "session_start", sessionId, ""]);

    // Tutorial on first session
    if (!tutorialEmitted && s === 0) {
      for (let t = 0; t < tutorialStepsCount; t++) {
        const tMs = sessionStartMs + (t + 1) * 30000;
        eventsRows.push([userId, new Date(tMs).toISOString(), "tutorial_step", sessionId, `step=${TUTORIAL_STEPS[t]}`]);
      }
      tutorialEmitted = true;
    }

    // First PvP event
    if (s === Math.min(3, totalSessions - 1) && totalPvp > 0) {
      const fpMs = sessionStartMs + randInt(5, sessionLen) * 60000;
      eventsRows.push([userId, new Date(fpMs).toISOString(), "first_pvp", sessionId, ""]);
    }

    // Guild join
    if (joinedGuild && !guildJoinEmitted) {
      const hoursSinceInstall = (sessionStartMs - installMs) / 3600000;
      if (hoursSinceInstall >= guildJoinHours) {
        const gjMs = sessionStartMs + randInt(2, 10) * 60000;
        eventsRows.push([userId, new Date(gjMs).toISOString(), "guild_join", sessionId, `guild=guild_${randInt(1, 200)}`]);
        guildJoinEmitted = true;
      }
    }

    // Distribute remaining events proportionally into this session
    const fraction = 1 / Math.max(totalSessions - s, 1);
    const emit = (count) => Math.min(count, isLastSession ? count : Math.max(1, Math.round(count * fraction * (1 + rand() * 0.5))));

    // In-session events
    const sessionEvents = [];

    // Level ups
    const luCount = emit(levelUpsLeft);
    for (let l = 0; l < luCount; l++) {
      currentLevel = Math.min(currentLevel + 1, targetMaxLevel);
      sessionEvents.push(["level_up", `level=${currentLevel}`]);
      levelUpsLeft--;
    }

    // Quests
    const qCount = emit(questsLeft);
    for (let q = 0; q < qCount; q++) {
      sessionEvents.push(["quest_complete", `quest=${pick(QUEST_IDS)};xp=${randInt(100, 5000)}`]);
      questsLeft--;
    }

    // PvP
    const ppCount = emit(pvpLeft);
    for (let p = 0; p < ppCount; p++) {
      sessionEvents.push(["pvp_match", `result=${rand() > 0.5 ? "win" : "lose"};rating_delta=${randInt(-30, 50)}`]);
      pvpLeft--;
    }

    // PvE
    const peCount = emit(pveLeft);
    for (let p = 0; p < peCount; p++) {
      const isDungeon = rand() > 0.4;
      sessionEvents.push([isDungeon ? "dungeon_clear" : "pve_run", isDungeon ? `dungeon=${pick(DUNGEON_NAMES)};time_sec=${randInt(120, 900)}` : `area=${pick(DUNGEON_NAMES)};mobs_killed=${randInt(10, 100)}`]);
      pveLeft--;
    }

    // Soft currency
    const seCount = emit(softELeft);
    for (let e = 0; e < seCount; e++) {
      sessionEvents.push(["soft_earn", `amount=${randInt(500, 10000)};source=${pick(SOFT_SOURCES)}`]);
      softELeft--;
    }
    const ssCount = emit(softSLeft);
    for (let e = 0; e < ssCount; e++) {
      sessionEvents.push(["soft_spend", `amount=${randInt(200, 8000)};target=${pick(SPEND_TARGETS)}`]);
      softSLeft--;
    }

    // Hard currency
    const heCount = emit(hardELeft);
    for (let e = 0; e < heCount; e++) {
      sessionEvents.push(["hard_earn", `amount=${randInt(5, 100)};source=${pick(HARD_SOURCES)}`]);
      hardELeft--;
    }
    const hsCount = emit(hardSLeft);
    for (let e = 0; e < hsCount; e++) {
      sessionEvents.push(["hard_spend", `amount=${randInt(5, 80)};target=${pick(SPEND_TARGETS)}`]);
      hardSLeft--;
    }

    // Gacha
    const gaCount = emit(gachaLeft);
    for (let g = 0; g < gaCount; g++) {
      sessionEvents.push(["gacha_open", `type=${pick(GACHA_TYPES)};pulls=${randInt(1, 10)};rarity=${pick(["common", "rare", "epic", "legendary"])}`]);
      gachaLeft--;
    }

    // Shop
    const shCount = emit(shopLeft);
    for (let s2 = 0; s2 < shCount; s2++) {
      sessionEvents.push(["shop_view", `section=${pick(["featured", "daily", "gem_shop", "costume", "equipment"])}`]);
      shopLeft--;
    }

    // IAP offer
    const iaCount = emit(iapLeft);
    for (let a = 0; a < iaCount; a++) {
      const evtName = rand() > 0.5 ? "iap_offer_view" : "battle_pass_view";
      sessionEvents.push([evtName, `offer=${pick(SKU_CATEGORIES)};price_usd=${randFloat(0.99, 99.99)}`]);
      iapLeft--;
    }

    // Chat
    const chCount = emit(chatLeft);
    for (let c = 0; c < chCount; c++) {
      sessionEvents.push(["chat_message", `channel=${pick(CHAT_CHANNELS_LIST)}`]);
      chatLeft--;
    }

    // Friends
    const frCount = emit(friendsLeft);
    for (let f = 0; f < frCount; f++) {
      sessionEvents.push(["friend_add", `friend=player_${String(randInt(1, NUM_PLAYERS)).padStart(4, "0")}`]);
      friendsLeft--;
    }

    // Guild activity
    if (guildJoinEmitted) {
      const gaEvt = emit(guildActLeft);
      for (let g = 0; g < gaEvt; g++) {
        sessionEvents.push(["guild_activity", `type=${pick(["guild_boss", "guild_war", "guild_quest", "guild_donate", "guild_buff"])}`]);
        guildActLeft--;
      }
    }

    // Battle pass claim
    if (rand() < 0.1 && s > 2) {
      sessionEvents.push(["battle_pass_claim", `tier=${randInt(1, 30)};reward=${pick(["currency", "material", "equipment", "costume"])}`]);
    }

    // Shuffle and emit with timestamps spread across session
    sessionEvents.sort(() => rand() - 0.5);
    for (let e = 0; e < sessionEvents.length; e++) {
      const evtOffsetMs = Math.round((e + 1) / (sessionEvents.length + 2) * sessionLen * 60000);
      const evtTime = new Date(sessionStartMs + evtOffsetMs);
      eventsRows.push([userId, evtTime.toISOString(), sessionEvents[e][0], sessionId, sessionEvents[e][1]]);
    }

    // Session end
    const endMs = sessionStartMs + sessionLen * 60000;
    eventsRows.push([userId, new Date(endMs).toISOString(), "session_end", sessionId, `duration_seconds=${sessionLen * 60}`]);
  }

  // Payments (D7 window)
  if (rand() < cfg.payP) {
    const txnCount = randInt(cfg.txn[0], cfg.txn[1]);
    const totalRev = randFloat(cfg.rev[0], cfg.rev[1]);
    for (let t = 0; t < txnCount; t++) {
      const txnDay = randInt(0, 6);
      const txnMs = installMs + txnDay * 86400000 + randInt(0, 86399) * 1000;
      const amount = +(totalRev / txnCount * (0.5 + rand())).toFixed(2);
      paymentsRows.push([
        userId,
        new Date(txnMs).toISOString(),
        Math.max(0.99, amount),
        pick(SKU_CATEGORIES),
        pick(PAYMENT_CHANNELS),
        rand() < 0.02 ? "true" : "false",
      ]);
    }
  }
}

// ─── UA Costs (span full install window) ──────────────────────────────────
const uaCostRows = [];
for (const campaign of CAMPAIGNS) {
  for (let d = 0; d < INSTALL_WINDOW_DAYS; d++) {
    const date = new Date(BASE_DATE.getTime() + d * 86400000);
    const dailySpend = randFloat(500, 5000);
    const cpi = randFloat(1, 8);
    const installs = Math.round(dailySpend / cpi);
    uaCostRows.push([
      campaign,
      date.toISOString().split("T")[0],
      dailySpend,
      installs * randInt(50, 200),
      installs * randInt(3, 15),
      installs,
    ]);
  }
}

// ─── Inject dirty data for Clean & Unify demonstrations ─────────────────────

// 1. Duplicate events (~3% of events duplicated exactly)
const dupCount = Math.floor(eventsRows.length * 0.03);
for (let d = 0; d < dupCount; d++) {
  const srcIdx = Math.floor(rand() * eventsRows.length);
  eventsRows.push([...eventsRows[srcIdx]]); // exact duplicate
}
console.log(`  Injected ${dupCount} exact duplicate events`);

// 2. Late / future-dated events (~1.5% with timestamps far outside D0-D7 window)
const lateCount = Math.floor(eventsRows.length * 0.015);
for (let l = 0; l < lateCount; l++) {
  const srcIdx = Math.floor(rand() * eventsRows.length);
  const src = eventsRows[srcIdx];
  const userId = src[0];
  // Push timestamp 30-90 days into the future
  const origTime = new Date(src[1]).getTime();
  const offsetDays = randInt(30, 90);
  const lateTime = new Date(origTime + offsetDays * 86400000);
  eventsRows.push([userId, lateTime.toISOString(), src[2], src[3], src[4]]);
}
console.log(`  Injected ${lateCount} late/future-dated events`);

// 3. Events with invalid/malformed timestamps (~0.5%)
const badTsCount = Math.floor(eventsRows.length * 0.005);
const BAD_TIMESTAMPS = ["", "NaN", "1970-01-01T00:00:00.000Z", "invalid-date", "2099-12-31T23:59:59Z"];
for (let b = 0; b < badTsCount; b++) {
  const srcIdx = Math.floor(rand() * eventsRows.length);
  const src = eventsRows[srcIdx];
  eventsRows.push([src[0], pick(BAD_TIMESTAMPS), src[2], src[3], src[4]]);
}
console.log(`  Injected ${badTsCount} events with invalid timestamps`);

// 4. Events with missing/empty user_id (~0.3%)
const noUserCount = Math.floor(eventsRows.length * 0.003);
for (let n = 0; n < noUserCount; n++) {
  const srcIdx = Math.floor(rand() * eventsRows.length);
  const src = eventsRows[srcIdx];
  eventsRows.push(["", src[1], src[2], src[3], src[4]]);
}
console.log(`  Injected ${noUserCount} events with missing user_id`);

// 5. Duplicate payments (~2%)
const dupPayCount = Math.floor(paymentsRows.length * 0.02);
for (let d = 0; d < dupPayCount; d++) {
  const srcIdx = Math.floor(rand() * paymentsRows.length);
  paymentsRows.push([...paymentsRows[srcIdx]]);
}
console.log(`  Injected ${dupPayCount} duplicate payment transactions`);

// Shuffle events to mix dirty data in naturally
eventsRows.sort(() => rand() - 0.5);

// ─── Write CSVs ──────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, "..", "public");

// Players
const playersCsv = "game_user_id,install_id,install_time,campaign_id,adset_id,creative_id,channel,country,os,device_model,device_tier,consent_tracking,consent_marketing\n"
  + playersRows.map((r) => r.join(",")).join("\n");
fs.writeFileSync(path.join(outDir, "game-players.csv"), playersCsv);
console.log(`  game-players.csv: ${playersRows.length} rows (${(playersCsv.length / 1024).toFixed(0)} KB)`);

// Events
const eventsCsv = "game_user_id,event_time,event_name,session_id,params\n"
  + eventsRows.map((r) => r.join(",")).join("\n");
fs.writeFileSync(path.join(outDir, "game-events.csv"), eventsCsv);
console.log(`  game-events.csv: ${eventsRows.length} rows (${(eventsCsv.length / 1024).toFixed(0)} KB)`);

// Payments
const paymentsCsv = "game_user_id,txn_time,amount_usd,product_sku,payment_channel,is_refund\n"
  + paymentsRows.map((r) => r.join(",")).join("\n");
fs.writeFileSync(path.join(outDir, "game-payments.csv"), paymentsCsv);
console.log(`  game-payments.csv: ${paymentsRows.length} rows (${(paymentsCsv.length / 1024).toFixed(0)} KB)`);

// UA Costs
const uaCostCsv = "campaign_id,date,spend,impressions,clicks,installs\n"
  + uaCostRows.map((r) => r.join(",")).join("\n");
fs.writeFileSync(path.join(outDir, "game-ua-costs.csv"), uaCostCsv);
console.log(`  game-ua-costs.csv: ${uaCostRows.length} rows (${(uaCostCsv.length / 1024).toFixed(0)} KB)`);

// Summary
const installDates = playersRows.map(r => r[2].split("T")[0]);
const minDate = installDates.sort()[0];
const maxDate = installDates.sort()[installDates.length - 1];
console.log(`\n  Install date range: ${minDate} → ${maxDate}`);
console.log("Done!");
