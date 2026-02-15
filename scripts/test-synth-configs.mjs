// Quick test script to run synth engine with different configs and check correlations
// Run with: node scripts/test-synth-configs.mjs

// ── Minimal reimplementation of key engine logic for testing ──

class SeededRNG {
  constructor(seed) { this.s = seed % 2147483647 || 1; }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  float(min, max) { return this.next() * (max - min) + min; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  normal() { const u1 = Math.max(1e-12, this.next()), u2 = this.next(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
  lognormal(mu, sig) { return Math.exp(mu + sig * this.normal()); }
  pareto(alpha, xm = 1) { return xm / Math.pow(1 - this.next(), 1 / alpha); }
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  const d = Math.sqrt(vx * vy);
  return d > 0 ? cov / d : 0;
}

const PRICE_TIERS = [0.99, 4.99, 9.99, 19.99, 49.99, 99.99];

function testConfig(label, cfg) {
  const rng = new SeededRNG(cfg.seed || 42);
  const N = cfg.totalUsers || 2000;
  const corrStr = cfg.engagePayCorrelation === "strong" ? 0.75 : cfg.engagePayCorrelation === "medium" ? 0.45 : 0.15;
  const payerRate = cfg.payerRate || 0.08;
  const burstBehavior = cfg.burstBehavior ?? false;
  const purchaseDecay = cfg.purchaseDecay ?? 0.06;
  const avgTxn = cfg.avgTxnPerPayer || 5;
  const sessionMean = cfg.sessionCountMean || 12;
  const engDecay = cfg.engagementDecay || 0.08;

  const archetypes = [
    { w: 0.03, spendPrior: 1.7, engagePrior: 1.2, retBase: 0.95, retDecay: 0.02 },
    { w: 0.12, spendPrior: 0.9, engagePrior: 0.8, retBase: 0.80, retDecay: 0.05 },
    { w: 0.15, spendPrior: 0.3, engagePrior: 0.5, retBase: 0.65, retDecay: 0.08 },
    { w: 0.25, spendPrior: -0.6, engagePrior: 0.9, retBase: 0.70, retDecay: 0.06 },
    { w: 0.30, spendPrior: -1.2, engagePrior: -0.2, retBase: 0.45, retDecay: 0.12 },
    { w: 0.15, spendPrior: -1.5, engagePrior: -1.0, retBase: 0.20, retDecay: 0.25 },
  ];
  const totalW = archetypes.reduce((s, a) => s + a.w, 0);
  archetypes.forEach(a => a.w /= totalW);

  const engWt = 0.15 + corrStr * 0.45;
  const spWt = 1 - engWt;

  // Expected mean payLatent for centering
  let expPayLatent = 0;
  for (const a of archetypes) {
    const expSL = a.spendPrior + corrStr * a.engagePrior * 1.2;
    expPayLatent += a.w * (spWt * expSL + engWt * a.engagePrior);
  }

  function pickArch() {
    const r = rng.next(); let cum = 0;
    for (const a of archetypes) { cum += a.w; if (r < cum) return a; }
    return archetypes[4];
  }

  const DAY = 86400000;
  const baseMs = new Date("2024-10-01").getTime();
  const installWindow = 90;

  // Per-user data
  const users = [];

  for (let i = 0; i < N; i++) {
    const arch = pickArch();
    const engageLatent = arch.engagePrior + rng.normal() * 0.35;
    const spendLatent = arch.spendPrior + rng.normal() * 0.45 + corrStr * engageLatent * 1.2;
    const engagement = clamp(sigmoid(engageLatent));
    const spender = clamp(sigmoid(spendLatent));

    const installOffset = rng.int(0, installWindow - 1);
    const daysAvailable = Math.min(90, installWindow - installOffset);
    const installMs = baseMs + installOffset * DAY;

    // Retention → active days
    const activeDays = [];
    let streak = 0;
    const retDecay = arch.retDecay + engDecay * 0.5;
    for (let day = 0; day <= Math.min(30, daysAvailable); day++) {
      const base = clamp(arch.retBase + rng.float(-0.05, 0.05), 0.05, 0.99);
      const hazard = streak >= 2 ? 1 / (1 + 0.35 * (streak - 1)) : 1;
      const p = clamp(base * Math.pow(1 - retDecay, day) * hazard, 0.01, 1);
      if (rng.next() < p) { activeDays.push(day); streak = 0; } else { streak++; }
    }

    const activeDaysW7 = activeDays.filter(d => d <= 6).length;
    const sessPerDay = Math.max(1, Math.round((sessionMean / 7) * (0.3 + 1.4 * engagement)));
    const sessionCountW7 = activeDaysW7 * sessPerDay;
    const maxDayW7 = activeDays.filter(d => d <= 6).length > 0 ? Math.max(...activeDays.filter(d => d <= 6)) : -1;
    const lastLoginGap = maxDayW7 >= 0 ? Math.max(0, 7 - maxDayW7) : 7;

    // Pay decision
    const payLatent = spWt * spendLatent + engWt * engageLatent;
    const payIntercept = Math.log(payerRate / (1 - payerRate));
    const centered = payLatent - expPayLatent;
    const payProb = 1 / (1 + Math.exp(-(payIntercept + 1.2 * centered)));
    const willPay = rng.next() < payProb;

    let ltv7 = 0, ltv30 = 0, ltv90 = 0;
    let payerFlag = 0;

    if (willPay) {
      payerFlag = 1;
      const txnCount = Math.min(Math.max(1, Math.round(avgTxn * spender + rng.normal())), 25);
      const lateMonProb = corrStr * engagement * 0.5;
      const isLateMon = rng.next() < lateMonProb;
      const burstFrac = burstBehavior ? 0.6 : 0.3;

      for (let t = 0; t < txnCount; t++) {
        let dayOff;
        if (isLateMon) {
          dayOff = rng.int(8, Math.min(daysAvailable, 60));
        } else if (t < txnCount * burstFrac) {
          dayOff = rng.int(0, 3);
        } else {
          const engSpread = Math.round(engagement * corrStr * 30);
          const latest = Math.max(5, Math.round(90 * (1 - purchaseDecay)) + engSpread);
          dayOff = Math.min(daysAvailable, rng.int(4, latest));
        }
        const amount = rng.pick(PRICE_TIERS) * (1 + rng.normal() * 0.1);
        const net = Math.max(0.99, amount);
        if (dayOff <= 6) ltv7 += net;
        if (dayOff <= 29) ltv30 += net;
        if (dayOff <= 89) ltv90 += net;
      }
      // Update payer_flag based on d7 payments
      payerFlag = ltv7 > 0 ? 1 : 0;
    }

    users.push({ engagement, spender, sessionCountW7, lastLoginGap, activeDaysW7, payerFlag, ltv7, ltv30, ltv90 });
  }

  // Compute stats
  const payers = users.filter(u => u.ltv30 > 0);
  const payerPct = (payers.length / N * 100).toFixed(1);
  const lateMonetizers = users.filter(u => u.ltv30 > 0 && u.ltv7 === 0);

  // Correlations with ltv30
  const ltv30 = users.map(u => u.ltv30);
  const corrPayerFlag = pearson(users.map(u => u.payerFlag), ltv30);
  const corrLtv7 = pearson(users.map(u => u.ltv7), ltv30);
  const corrSessW7 = pearson(users.map(u => u.sessionCountW7), ltv30);
  const corrLoginGap = pearson(users.map(u => u.lastLoginGap), ltv30);
  const corrActiveDays = pearson(users.map(u => u.activeDaysW7), ltv30);

  // Separation ratios
  const nonPayers = users.filter(u => u.ltv30 === 0);
  const avgSessPayer = payers.reduce((s, u) => s + u.sessionCountW7, 0) / (payers.length || 1);
  const avgSessNon = nonPayers.reduce((s, u) => s + u.sessionCountW7, 0) / (nonPayers.length || 1);
  const avgGapPayer = payers.reduce((s, u) => s + u.lastLoginGap, 0) / (payers.length || 1);
  const avgGapNon = nonPayers.reduce((s, u) => s + u.lastLoginGap, 0) / (nonPayers.length || 1);

  console.log(`\n═══ ${label} ═══`);
  console.log(`Payer rate: ${payerPct}% (${payers.length}/${N}), Late monetizers: ${lateMonetizers.length} (${(lateMonetizers.length/N*100).toFixed(1)}%)`);
  console.log(`Correlations with ltv_d30:`);
  console.log(`  payer_flag:      ${corrPayerFlag.toFixed(4)}`);
  console.log(`  ltv_d7 (pay7):   ${corrLtv7.toFixed(4)}`);
  console.log(`  session_cnt_w7:  ${corrSessW7.toFixed(4)}`);
  console.log(`  last_login_gap:  ${corrLoginGap.toFixed(4)}`);
  console.log(`  active_days_w7:  ${corrActiveDays.toFixed(4)}`);
  console.log(`Session sep: payer=${avgSessPayer.toFixed(1)} vs non=${avgSessNon.toFixed(1)} (${(avgSessPayer/avgSessNon).toFixed(2)}x)`);
  console.log(`Gap sep: payer=${avgGapPayer.toFixed(1)} vs non=${avgGapNon.toFixed(1)}`);
}

// ─── Test configs: Round 2 — more aggressive late monetizer + calibration fixes ───

// Vary the lateMonFraction and logistic coefficient to find optimal
function testConfigV2(label, cfg, lateMonFrac, logCoeff) {
  const rng2 = new SeededRNG(42);
  const N2 = 2000;
  const corrStr2 = cfg.engagePayCorrelation === "strong" ? 0.75 : cfg.engagePayCorrelation === "medium" ? 0.45 : 0.15;
  const payerRate2 = cfg.payerRate || 0.08;
  const burstBehavior2 = cfg.burstBehavior ?? false;
  const purchaseDecay2 = cfg.purchaseDecay ?? 0.06;
  const avgTxn2 = cfg.avgTxnPerPayer || 5;
  const sessionMean2 = cfg.sessionCountMean || 12;
  const engDecay2 = cfg.engagementDecay || 0.08;

  const archetypes2 = [
    { w: 0.03, spendPrior: 1.7, engagePrior: 1.2, retBase: 0.95, retDecay: 0.02 },
    { w: 0.12, spendPrior: 0.9, engagePrior: 0.8, retBase: 0.80, retDecay: 0.05 },
    { w: 0.15, spendPrior: 0.3, engagePrior: 0.5, retBase: 0.65, retDecay: 0.08 },
    { w: 0.25, spendPrior: -0.6, engagePrior: 0.9, retBase: 0.70, retDecay: 0.06 },
    { w: 0.30, spendPrior: -1.2, engagePrior: -0.2, retBase: 0.45, retDecay: 0.12 },
    { w: 0.15, spendPrior: -1.5, engagePrior: -1.0, retBase: 0.20, retDecay: 0.25 },
  ];
  const tw = archetypes2.reduce((s, a) => s + a.w, 0);
  archetypes2.forEach(a => a.w /= tw);

  const ew = 0.15 + corrStr2 * 0.45, sw = 1 - ew;
  let expPL = 0;
  for (const a of archetypes2) { expPL += a.w * (sw * (a.spendPrior + corrStr2 * a.engagePrior * 1.2) + ew * a.engagePrior); }

  function pickA() { const r = rng2.next(); let c = 0; for (const a of archetypes2) { c += a.w; if (r < c) return a; } return archetypes2[4]; }

  const users2 = [];
  for (let i = 0; i < N2; i++) {
    const arch = pickA();
    const eL = arch.engagePrior + rng2.normal() * 0.35;
    const sL = arch.spendPrior + rng2.normal() * 0.45 + corrStr2 * eL * 1.2;
    const eng = clamp(sigmoid(eL));
    const spd = clamp(sigmoid(sL));

    const instOff = rng2.int(0, 89);
    const daysAvail = Math.min(90, 90 - instOff);

    const actDays = [];
    let strk = 0;
    // Engagement directly affects retention (the key fix)
    const engRetBoost = (eng - 0.5) * corrStr2 * 0.3;
    const rd = clamp(arch.retDecay + engDecay2 * 0.5 - engRetBoost, 0.01, 0.5);
    const rb = clamp(arch.retBase + engRetBoost * 0.5, 0.1, 0.98);
    for (let d = 0; d <= Math.min(30, daysAvail); d++) {
      const b = clamp(rb + rng2.float(-0.05, 0.05), 0.05, 0.99);
      const h = strk >= 2 ? 1 / (1 + 0.35 * (strk - 1)) : 1;
      if (rng2.next() < clamp(b * Math.pow(1 - rd, d) * h, 0.01, 1)) { actDays.push(d); strk = 0; } else { strk++; }
    }

    const adW7 = actDays.filter(d => d <= 6).length;
    const spd2 = Math.max(1, Math.round((sessionMean2 / 7) * (0.3 + 1.4 * eng)));
    const scW7 = adW7 * spd2;
    const md7 = actDays.filter(d => d <= 6);
    const llg = md7.length > 0 ? Math.max(0, 7 - Math.max(...md7)) : 7;

    const pL = sw * sL + ew * eL;
    const pI = Math.log(payerRate2 / (1 - payerRate2));
    const pP = 1 / (1 + Math.exp(-(pI + logCoeff * (pL - expPL))));
    const wP = rng2.next() < pP;

    let l7 = 0, l30 = 0, l90 = 0, pf = 0;
    if (wP) {
      const tc = Math.min(Math.max(1, Math.round(avgTxn2 * spd + rng2.normal())), 25);
      // Late monetizer: use configurable fraction, scaled by engagement
      const isLM = rng2.next() < (lateMonFrac * (0.5 + eng));
      const bf = burstBehavior2 ? 0.6 : 0.3;
      for (let t = 0; t < tc; t++) {
        let dOff;
        if (isLM) { dOff = rng2.int(8, Math.min(daysAvail, 60)); }
        else if (t < tc * bf) { dOff = rng2.int(0, 3); }
        else { dOff = Math.min(daysAvail, rng2.int(4, Math.max(5, Math.round(90 * (1 - purchaseDecay2)) + Math.round(eng * corrStr2 * 30)))); }
        const amt = Math.max(0.99, rng2.pick(PRICE_TIERS) * (1 + rng2.normal() * 0.1));
        if (dOff <= 6) l7 += amt;
        if (dOff <= 29) l30 += amt;
        if (dOff <= 89) l90 += amt;
      }
      pf = l7 > 0 ? 1 : 0;
    }
    users2.push({ eng, scW7, llg, adW7, pf, l7, l30, l90 });
  }

  const p2 = users2.filter(u => u.l30 > 0);
  const lm2 = users2.filter(u => u.l30 > 0 && u.l7 === 0);
  const lt = users2.map(u => u.l30);
  const cPF = pearson(users2.map(u => u.pf), lt);
  const cL7 = pearson(users2.map(u => u.l7), lt);
  const cSC = pearson(users2.map(u => u.scW7), lt);
  const cLG = pearson(users2.map(u => u.llg), lt);
  const cAD = pearson(users2.map(u => u.adW7), lt);

  console.log(`\n═══ ${label} ═══  [lateMonFrac=${lateMonFrac}, logCoeff=${logCoeff}]`);
  console.log(`Payer: ${(p2.length/N2*100).toFixed(1)}% (${p2.length}), LateMon: ${lm2.length} (${(lm2.length/N2*100).toFixed(1)}%)`);
  console.log(`  payer_flag:  ${cPF.toFixed(4)}  |  ltv_d7:  ${cL7.toFixed(4)}`);
  console.log(`  session_w7:  ${cSC.toFixed(4)}  |  gap:     ${cLG.toFixed(4)}  |  active_d: ${cAD.toFixed(4)}`);
}

// V3: same as V2 but with configurable engRetBoost
function testConfigV3(label, cfg, lateMonFrac, logCoeff, boostCoeff) {
  const rng3 = new SeededRNG(42);
  const N3 = 2000;
  const corrStr3 = cfg.engagePayCorrelation === "strong" ? 0.75 : cfg.engagePayCorrelation === "medium" ? 0.45 : 0.15;
  const payerRate3 = cfg.payerRate || 0.08;
  const burstBeh3 = cfg.burstBehavior ?? false;
  const pDecay3 = cfg.purchaseDecay ?? 0.06;
  const avgTxn3 = cfg.avgTxnPerPayer || 5;
  const sessMean3 = cfg.sessionCountMean || 12;
  const engDec3 = cfg.engagementDecay || 0.08;

  const archs = [
    { w: 0.03, spendPrior: 1.7, engagePrior: 1.2, retBase: 0.95, retDecay: 0.02 },
    { w: 0.12, spendPrior: 0.9, engagePrior: 0.8, retBase: 0.80, retDecay: 0.05 },
    { w: 0.15, spendPrior: 0.3, engagePrior: 0.5, retBase: 0.65, retDecay: 0.08 },
    { w: 0.25, spendPrior: -0.6, engagePrior: 0.9, retBase: 0.70, retDecay: 0.06 },
    { w: 0.30, spendPrior: -1.2, engagePrior: -0.2, retBase: 0.45, retDecay: 0.12 },
    { w: 0.15, spendPrior: -1.5, engagePrior: -1.0, retBase: 0.20, retDecay: 0.25 },
  ];
  const tw3 = archs.reduce((s, a) => s + a.w, 0);
  archs.forEach(a => a.w /= tw3);
  const ew3 = 0.15 + corrStr3 * 0.45, sw3 = 1 - ew3;
  let expPL3 = 0;
  for (const a of archs) { expPL3 += a.w * (sw3 * (a.spendPrior + corrStr3 * a.engagePrior * 1.2) + ew3 * a.engagePrior); }
  function pickA3() { const r = rng3.next(); let c = 0; for (const a of archs) { c += a.w; if (r < c) return a; } return archs[4]; }

  const users3 = [];
  for (let i = 0; i < N3; i++) {
    const arch = pickA3();
    const eL = arch.engagePrior + rng3.normal() * 0.35;
    const sL = arch.spendPrior + rng3.normal() * 0.45 + corrStr3 * eL * 1.2;
    const eng = clamp(sigmoid(eL));

    const instOff = rng3.int(0, 89);
    const daysAvail = Math.min(90, 90 - instOff);

    // KEY: engagement-dependent retention with configurable boost
    const engRetBoost = (eng - 0.5) * corrStr3 * boostCoeff;
    const rd = clamp(arch.retDecay + engDec3 * 0.5 - engRetBoost, 0.01, 0.5);
    const rb = clamp(arch.retBase + engRetBoost * 0.5, 0.1, 0.98);

    const actDays = [];
    let strk = 0;
    for (let d = 0; d <= Math.min(30, daysAvail); d++) {
      const b = clamp(rb + rng3.float(-0.05, 0.05), 0.05, 0.99);
      const h = strk >= 2 ? 1 / (1 + 0.35 * (strk - 1)) : 1;
      if (rng3.next() < clamp(b * Math.pow(1 - rd, d) * h, 0.01, 1)) { actDays.push(d); strk = 0; } else { strk++; }
    }

    const adW7 = actDays.filter(d => d <= 6).length;
    const spd2 = Math.max(1, Math.round((sessMean3 / 7) * (0.3 + 1.4 * eng)));
    const scW7 = adW7 * spd2;
    const md7 = actDays.filter(d => d <= 6);
    const llg = md7.length > 0 ? Math.max(0, 7 - Math.max(...md7)) : 7;

    const pL = sw3 * sL + ew3 * eL;
    const pI = Math.log(payerRate3 / (1 - payerRate3));
    const pP = 1 / (1 + Math.exp(-(pI + logCoeff * (pL - expPL3))));
    const wP = rng3.next() < pP;

    let l1 = 0, l7 = 0, l14 = 0, l30 = 0, pf = 0;
    if (wP) {
      const spd = clamp(sigmoid(sL));
      const tc = Math.min(Math.max(1, Math.round(avgTxn3 * spd + rng3.normal())), 25);
      const isLM = rng3.next() < (lateMonFrac * (0.4 + eng));
      const isDeepLate = isLM && rng3.next() < 0.7; // 70% of late monetizers pay after d14
      const bf = burstBeh3 ? 0.6 : 0.3;
      for (let t = 0; t < tc; t++) {
        let dOff;
        if (isDeepLate) { dOff = rng3.int(15, Math.min(daysAvail, 60)); }
        else if (isLM) { dOff = rng3.int(8, 14); }
        else if (t < tc * bf) { dOff = rng3.int(0, 3); }
        else { dOff = Math.min(daysAvail, rng3.int(4, Math.max(5, Math.round(90 * (1 - pDecay3)) + Math.round(eng * corrStr3 * 30)))); }
        const amt = Math.max(0.99, rng3.pick(PRICE_TIERS) * (1 + rng3.normal() * 0.1));
        if (dOff <= 0) l1 += amt;
        if (dOff <= 6) l7 += amt;
        if (dOff <= 13) l14 += amt;
        if (dOff <= 29) l30 += amt;
      }
      pf = l7 > 0 ? 1 : 0;
    }
    users3.push({ eng, scW7, llg, adW7, pf, l1, l7, l14, l30 });
  }

  const p3 = users3.filter(u => u.l30 > 0);
  const lm3 = users3.filter(u => u.l30 > 0 && u.l7 === 0);
  const deepLm = users3.filter(u => u.l30 > 0 && u.l14 === 0);
  const lt3 = users3.map(u => u.l30);
  const np3 = users3.filter(u => u.l30 === 0);
  const cPF = pearson(users3.map(u => u.pf), lt3);
  const cL1 = pearson(users3.map(u => u.l1), lt3);
  const cL7 = pearson(users3.map(u => u.l7), lt3);
  const cL14 = pearson(users3.map(u => u.l14), lt3);
  const cSC = pearson(users3.map(u => u.scW7), lt3);
  const cLG = pearson(users3.map(u => u.llg), lt3);
  const cAD = pearson(users3.map(u => u.adW7), lt3);

  console.log(`\n═══ ${label} ═══  [boost=${boostCoeff}, lmf=${lateMonFrac}, lc=${logCoeff}]`);
  console.log(`Payer: ${(p3.length/N3*100).toFixed(1)}% (${p3.length}), LateMon(d7): ${lm3.length} (${(lm3.length/N3*100).toFixed(1)}%), DeepLate(d14): ${deepLm.length} (${(deepLm.length/N3*100).toFixed(1)}%)`);
  console.log(`  payer_flag:  ${cPF.toFixed(4)}  |  ltv_d1:  ${cL1.toFixed(4)}  |  ltv_d7:  ${cL7.toFixed(4)}  |  ltv_d14: ${cL14.toFixed(4)}`);
  console.log(`  session_w7:  ${cSC.toFixed(4)}  |  gap:     ${cLG.toFixed(4)}  |  active_d: ${cAD.toFixed(4)}`);
}

// V4: same as V3 but with configurable deepLateRatio
function testConfigV4(label, cfg, lateMonFrac, logCoeff, boostCoeff, deepLateRatio) {
  const rng4 = new SeededRNG(42);
  const N4 = 2000;
  const corrStr4 = cfg.engagePayCorrelation === "strong" ? 0.75 : cfg.engagePayCorrelation === "medium" ? 0.45 : 0.15;
  const payerRate4 = cfg.payerRate || 0.08;
  const burstBeh4 = cfg.burstBehavior ?? false;
  const pDecay4 = cfg.purchaseDecay ?? 0.06;
  const avgTxn4 = cfg.avgTxnPerPayer || 5;
  const sessMean4 = cfg.sessionCountMean || 12;
  const engDec4 = cfg.engagementDecay || 0.08;

  const archs = [
    { w: 0.03, spendPrior: 1.7, engagePrior: 1.2, retBase: 0.95, retDecay: 0.02 },
    { w: 0.12, spendPrior: 0.9, engagePrior: 0.8, retBase: 0.80, retDecay: 0.05 },
    { w: 0.15, spendPrior: 0.3, engagePrior: 0.5, retBase: 0.65, retDecay: 0.08 },
    { w: 0.25, spendPrior: -0.6, engagePrior: 0.9, retBase: 0.70, retDecay: 0.06 },
    { w: 0.30, spendPrior: -1.2, engagePrior: -0.2, retBase: 0.45, retDecay: 0.12 },
    { w: 0.15, spendPrior: -1.5, engagePrior: -1.0, retBase: 0.20, retDecay: 0.25 },
  ];
  const tw4 = archs.reduce((s, a) => s + a.w, 0);
  archs.forEach(a => a.w /= tw4);
  const ew4 = 0.15 + corrStr4 * 0.45, sw4 = 1 - ew4;
  let expPL4 = 0;
  for (const a of archs) { expPL4 += a.w * (sw4 * (a.spendPrior + corrStr4 * a.engagePrior * 1.2) + ew4 * a.engagePrior); }
  function pickA4() { const r = rng4.next(); let c = 0; for (const a of archs) { c += a.w; if (r < c) return a; } return archs[4]; }

  const users4 = [];
  for (let i = 0; i < N4; i++) {
    const arch = pickA4();
    const eL = arch.engagePrior + rng4.normal() * 0.35;
    const sL = arch.spendPrior + rng4.normal() * 0.45 + corrStr4 * eL * 1.2;
    const eng = clamp(sigmoid(eL));
    const instOff = rng4.int(0, 89);
    const daysAvail = Math.min(90, 90 - instOff);

    const engRetBoost = (eng - 0.5) * corrStr4 * boostCoeff;
    const rd = clamp(arch.retDecay + engDec4 * 0.5 - engRetBoost, 0.01, 0.5);
    const rb = clamp(arch.retBase + engRetBoost * 0.5, 0.1, 0.98);
    const actDays = [];
    let strk = 0;
    for (let d = 0; d <= Math.min(30, daysAvail); d++) {
      const b = clamp(rb + rng4.float(-0.05, 0.05), 0.05, 0.99);
      const h = strk >= 2 ? 1 / (1 + 0.35 * (strk - 1)) : 1;
      if (rng4.next() < clamp(b * Math.pow(1 - rd, d) * h, 0.01, 1)) { actDays.push(d); strk = 0; } else { strk++; }
    }
    const adW7 = actDays.filter(d => d <= 6).length;
    const spd2 = Math.max(1, Math.round((sessMean4 / 7) * (0.3 + 1.4 * eng)));
    const scW7 = adW7 * spd2;
    const md7 = actDays.filter(d => d <= 6);
    const llg = md7.length > 0 ? Math.max(0, 7 - Math.max(...md7)) : 7;

    const pL = sw4 * sL + ew4 * eL;
    const pI = Math.log(payerRate4 / (1 - payerRate4));
    const pP = 1 / (1 + Math.exp(-(pI + logCoeff * (pL - expPL4))));
    const wP = rng4.next() < pP;

    let l1 = 0, l7 = 0, l14 = 0, l30 = 0, pf = 0;
    if (wP) {
      const spd = clamp(sigmoid(sL));
      const tc = Math.min(Math.max(1, Math.round(avgTxn4 * spd + rng4.normal())), 25);
      const isLM = rng4.next() < (lateMonFrac * (0.4 + eng));
      const isDeepLate = isLM && rng4.next() < deepLateRatio;
      const bf = burstBeh4 ? 0.6 : 0.3;
      for (let t = 0; t < tc; t++) {
        let dOff;
        if (isDeepLate) { dOff = rng4.int(15, Math.min(daysAvail, 60)); }
        else if (isLM) { dOff = rng4.int(8, 14); }
        else if (t < tc * bf) { dOff = rng4.int(0, 3); }
        else { dOff = Math.min(daysAvail, rng4.int(4, Math.max(5, Math.round(90 * (1 - pDecay4)) + Math.round(eng * corrStr4 * 30)))); }
        const amt = Math.max(0.99, rng4.pick(PRICE_TIERS) * (1 + rng4.normal() * 0.1));
        if (dOff <= 0) l1 += amt;
        if (dOff <= 6) l7 += amt;
        if (dOff <= 13) l14 += amt;
        if (dOff <= 29) l30 += amt;
      }
      pf = l7 > 0 ? 1 : 0;
    }
    users4.push({ eng, scW7, llg, adW7, pf, l1, l7, l14, l30 });
  }

  const p4 = users4.filter(u => u.l30 > 0);
  const lm4 = users4.filter(u => u.l30 > 0 && u.l7 === 0);
  const deepLm = users4.filter(u => u.l30 > 0 && u.l14 === 0);
  const lt4 = users4.map(u => u.l30);
  const cPF = pearson(users4.map(u => u.pf), lt4);
  const cL1 = pearson(users4.map(u => u.l1), lt4);
  const cL7 = pearson(users4.map(u => u.l7), lt4);
  const cL14 = pearson(users4.map(u => u.l14), lt4);
  const cSC = pearson(users4.map(u => u.scW7), lt4);
  const cLG = pearson(users4.map(u => u.llg), lt4);
  const cAD = pearson(users4.map(u => u.adW7), lt4);

  console.log(`\n═══ ${label} ═══  [dlr=${deepLateRatio}, lmf=${lateMonFrac}, lc=${logCoeff}]`);
  console.log(`Payer: ${(p4.length/N4*100).toFixed(1)}% (${p4.length}), LateMon(d7): ${lm4.length} (${(lm4.length/N4*100).toFixed(1)}%), DeepLate(d14): ${deepLm.length} (${(deepLm.length/N4*100).toFixed(1)}%)`);
  console.log(`  payer_flag:  ${cPF.toFixed(4)}  |  ltv_d1:  ${cL1.toFixed(4)}  |  ltv_d7:  ${cL7.toFixed(4)}  |  ltv_d14: ${cL14.toFixed(4)}`);
  console.log(`  session_w7:  ${cSC.toFixed(4)}  |  gap:     ${cLG.toFixed(4)}  |  active_d: ${cAD.toFixed(4)}`);
}

const baseCfg = { payerRate: 0.08, engagePayCorrelation: "strong", burstBehavior: false, purchaseDecay: 0.20, sessionCountMean: 20, engagementDecay: 0.18 };

// Deep diagnostic: what does the active days distribution actually look like?
function diagnostic(cfg, boostCoeff) {
  const rng = new SeededRNG(42);
  const N = 2000;
  const corrStr = 0.75; // strong
  const engDec = cfg.engagementDecay || 0.08;

  const archs = [
    { w: 0.03, spendPrior: 1.7, engagePrior: 1.2, retBase: 0.95, retDecay: 0.02 },
    { w: 0.12, spendPrior: 0.9, engagePrior: 0.8, retBase: 0.80, retDecay: 0.05 },
    { w: 0.15, spendPrior: 0.3, engagePrior: 0.5, retBase: 0.65, retDecay: 0.08 },
    { w: 0.25, spendPrior: -0.6, engagePrior: 0.9, retBase: 0.70, retDecay: 0.06 },
    { w: 0.30, spendPrior: -1.2, engagePrior: -0.2, retBase: 0.45, retDecay: 0.12 },
    { w: 0.15, spendPrior: -1.5, engagePrior: -1.0, retBase: 0.20, retDecay: 0.25 },
  ];
  const tw = archs.reduce((s, a) => s + a.w, 0);
  archs.forEach(a => a.w /= tw);
  function pickA() { const r = rng.next(); let c = 0; for (const a of archs) { c += a.w; if (r < c) return a; } return archs[4]; }

  // Buckets: engaged (>0.65) vs disengaged (<0.35)
  const engaged = [], disengaged = [], middle = [];

  for (let i = 0; i < N; i++) {
    const arch = pickA();
    const eL = arch.engagePrior + rng.normal() * 0.35;
    const eng = clamp(sigmoid(eL));
    const engRetBoost = (eng - 0.5) * corrStr * boostCoeff;
    const rd = clamp(arch.retDecay + engDec * 0.5 - engRetBoost, 0.01, 0.5);
    const rb = clamp(arch.retBase + engRetBoost * 0.5, 0.1, 0.98);

    const actDays = [];
    let strk = 0;
    for (let d = 0; d <= 6; d++) {
      const b = clamp(rb + rng.float(-0.05, 0.05), 0.05, 0.99);
      const h = strk >= 2 ? 1 / (1 + 0.35 * (strk - 1)) : 1;
      if (rng.next() < clamp(b * Math.pow(1 - rd, d) * h, 0.01, 1)) { actDays.push(d); strk = 0; } else { strk++; }
    }
    const maxD = actDays.length > 0 ? Math.max(...actDays) : -1;
    const gap = maxD >= 0 ? 7 - maxD : 7;
    const bucket = eng > 0.65 ? engaged : eng < 0.35 ? disengaged : middle;
    bucket.push({ eng, adW7: actDays.length, maxD, gap, rd, rb });
  }

  const avg = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0) / (arr.length || 1);
  console.log(`\n─── Diagnostic (boost=${boostCoeff}) ───`);
  console.log(`Engaged (${engaged.length}): avgGap=${avg(engaged, x=>x.gap).toFixed(2)}, avgActiveDays=${avg(engaged, x=>x.adW7).toFixed(2)}, avgMaxDay=${avg(engaged, x=>x.maxD).toFixed(2)}, avgRetDecay=${avg(engaged, x=>x.rd).toFixed(3)}, avgRetBase=${avg(engaged, x=>x.rb).toFixed(3)}`);
  console.log(`Middle  (${middle.length}): avgGap=${avg(middle, x=>x.gap).toFixed(2)}, avgActiveDays=${avg(middle, x=>x.adW7).toFixed(2)}, avgMaxDay=${avg(middle, x=>x.maxD).toFixed(2)}`);
  console.log(`Diseng  (${disengaged.length}): avgGap=${avg(disengaged, x=>x.gap).toFixed(2)}, avgActiveDays=${avg(disengaged, x=>x.adW7).toFixed(2)}, avgMaxDay=${avg(disengaged, x=>x.maxD).toFixed(2)}, avgRetDecay=${avg(disengaged, x=>x.rd).toFixed(3)}, avgRetBase=${avg(disengaged, x=>x.rb).toFixed(3)}`);
  // Gap histograms
  const gapHist = (arr) => {
    const h = [0,0,0,0,0,0,0,0]; // gap 0..7
    arr.forEach(x => h[Math.round(x.gap)]++);
    return h.map((v,i) => `${i}:${v}`).join(' ');
  };
  console.log(`  Engaged gap dist: [${gapHist(engaged)}]`);
  console.log(`  Diseng gap dist:  [${gapHist(disengaged)}]`);
}

// Test varying deep-late ratio
console.log("─── Varying deepLateRatio (lmf=0.7, boost=0.7) ───");
for (const dlr of [0.5, 0.7, 0.85, 0.95]) {
  testConfigV4(`dlr=${dlr}`, baseCfg, 0.7, 0.8, 0.7, dlr);
}

console.log("\n─── With lmf=0.9 ───");
for (const dlr of [0.7, 0.85, 0.95]) {
  testConfigV4(`lmf=0.9, dlr=${dlr}`, baseCfg, 0.9, 0.8, 0.7, dlr);
}

console.log("\n─── Weak corr sanity ───");
testConfigV4("Weak", {...baseCfg, engagePayCorrelation: "weak", burstBehavior: true, purchaseDecay: 0.06}, 0.2, 0.8, 0.7, 0.7);
