"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Papa from "papaparse";
import {
  Database, Search, Table2, Filter, Code2, Layers, Wrench, Brain, BarChart3,
  TrendingUp, Target, Zap, DollarSign, AlertTriangle, Play, ChevronRight,
  ArrowRight, ArrowLeft, CheckCircle2, Sparkles, Settings, ToggleLeft, ToggleRight,
  Eye, Users, FlaskConical, Shuffle, Clock, AlertOctagon, Pencil, Trash2, Info, X,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  SimPlayerRow, SimEventRow, SimPaymentRow, SimUaCostRow, SimLabelRow,
  FeatureMatrixRow, FeatureBuildConfig, TrainedModelResult, ActivationRun,
  EconomicImpactRow, UpliftResult, DecisionRecommendation,
  SimModelType, SimTarget, SplitStrategy, ActivationConfig,
  FEATURE_TEMPLATES,
  parsePlayers, parseEvents, parsePayments, parseUaCosts, parseLabels,
  summarizePlayers, summarizePayments,
  generateSqlPreview, buildFeatureMatrix, getNumericFeatureColumns,
  computeCorrelationMatrix, computeDistribution,
  trainModel, simulateActivation, computeEconomicImpact, simulateUplift,
  extractProtocol, protocolsMatch, computeAULC, computeCoverage,
  computeOverpredictionRate, estimateInferenceCost,
  generateBaselineModel, generateRecommendations,
  computeFeatureImportanceDelta, computeLiftDelta,
} from "@/lib/pltv-sim-engine";
import { InfoBanner } from "@/components/InfoTooltip";
import {
  SynthConfig, SynthOutputStats, SynthPreviewStats,
  SYNTH_PRESETS, getDefaultConfig, computePreview, generateSyntheticData,
  serializePlayersCsv, serializeEventsCsv, serializePaymentsCsv,
  serializeUaCostsCsv, serializeLabelsCsv, computeStatsFromData,
  computeCorrelationReport,
} from "@/lib/pltv-synth-engine";

// ═══════════════════════════════════════════════════════════════════════════════
// Step definitions
// ═══════════════════════════════════════════════════════════════════════════════

const STEPS = [
  { label: "Raw Logs", description: "Browse data", icon: <Database size={14} /> },
  { label: "Feature Builder", description: "Engineer features", icon: <Wrench size={14} /> },
  { label: "Train Model", description: "4 algorithms", icon: <Brain size={14} /> },
  { label: "Offline Eval", description: "Lift / Precision / Ranking", icon: <BarChart3 size={14} /> },
  { label: "Activation Sim", description: "Send → Revenue", icon: <Zap size={14} /> },
  { label: "Economic Impact", description: "Profit & ROAS", icon: <DollarSign size={14} /> },
];

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

// ─── Hover tooltip for chart explanations ────────────────────────────────────
function ChartTip({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`inline-flex items-center gap-1 text-[10px] text-zinc-500 ${label ? "bg-zinc-800 px-1.5 py-0.5 rounded" : ""} cursor-help select-none`}
      >
        {label || null} <Info size={10} className="text-zinc-500 hover:text-zinc-300 transition-colors" />
      </span>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl shadow-black/50 p-2.5 pointer-events-none">
          <span className="text-[11px] text-zinc-300 leading-relaxed block">{tip}</span>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rotate-45 border-r border-b border-zinc-700 bg-zinc-950" />
        </span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function PLTVSimPipeline() {
  // ─── Data loading state ───────────────────────────────────────────────
  const [players, setPlayers] = useState<SimPlayerRow[]>([]);
  const [events, setEvents] = useState<SimEventRow[]>([]);
  const [payments, setPayments] = useState<SimPaymentRow[]>([]);
  const [uaCosts, setUaCosts] = useState<SimUaCostRow[]>([]);
  const [labels, setLabels] = useState<SimLabelRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ─── Navigation ───────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);

  // ─── Step 1: Raw Log Explorer ─────────────────────────────────────────
  const [logTab, setLogTab] = useState<"players" | "events" | "payments" | "ua_cost" | "labels">("players");
  const [logFilter, setLogFilter] = useState("");
  const [logPage, setLogPage] = useState(0);
  const LOG_PAGE_SIZE = 25;

  // ─── Step 2: Feature Builder ──────────────────────────────────────────
  const [fbConfig, setFbConfig] = useState<FeatureBuildConfig>({
    selectedTemplates: ["session_count", "payment_sum", "payer_flag", "ua_cost", "first_purchase_hours", "last_login_gap"],
    selectedWindows: [3, 7],
    includeLeakageFeature: false,
    useEvents: true,
    usePayments: true,
    usePlayers: true,
    useUaCost: true,
  });
  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrixRow[]>([]);
  const [fbBuilding, setFbBuilding] = useState(false);
  const [fbDistCol, setFbDistCol] = useState<string | null>(null);

  // ─── Step 3: Model Training ───────────────────────────────────────────
  const [mtModelType, setMtModelType] = useState<SimModelType>("gbt");
  const [mtTarget, setMtTarget] = useState<SimTarget>("ltv30");
  const [mtSplit, setMtSplit] = useState<SplitStrategy>("random");
  const [mtSelectedFeatures, setMtSelectedFeatures] = useState<string[]>([]);
  const [mtTraining, setMtTraining] = useState(false);
  const [modelRegistry, setModelRegistry] = useState<TrainedModelResult[]>([]);
  const [activeModelIdx, setActiveModelIdx] = useState<number>(0);
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ─── Step 4: Offline Eval ─────────────────────────────────────────────
  const [evalTopKSlider, setEvalTopKSlider] = useState(10);
  const [evalSelectedModels, setEvalSelectedModels] = useState<Set<number>>(new Set());
  const [evalProtocolLocked, setEvalProtocolLocked] = useState(false);
  const [evalChampionIdx, setEvalChampionIdx] = useState<number | null>(null);
  const [evalCalibMode, setEvalCalibMode] = useState<"bars" | "error">("bars");
  const [evalScatterModelIdx, setEvalScatterModelIdx] = useState(0);
  const [evalDeltaModelIdx, setEvalDeltaModelIdx] = useState<number | null>(null);

  // ─── Step 5: Activation ───────────────────────────────────────────────
  const [actConfig, setActConfig] = useState<ActivationConfig>({ cpi: 2.0, revenueMultiplier: 1.0, conversionNoise: 0.2, deliveryRate: 0.8 });
  const [actTopK, setActTopK] = useState(10);
  const [actRuns, setActRuns] = useState<ActivationRun[]>([]);
  const [actSelectedModels, setActSelectedModels] = useState<Set<number>>(new Set());

  // ─── Step 6: Economic Impact ──────────────────────────────────────────
  const [ecoData, setEcoData] = useState<EconomicImpactRow[]>([]);

  // ─── Synthetic Data Generator ────────────────────────────────────────
  const [synthOpen, setSynthOpen] = useState(false);
  const [synthConfig, setSynthConfig] = useState<SynthConfig>(getDefaultConfig);
  const [synthRunning, setSynthRunning] = useState(false);
  const [synthStats, setSynthStats] = useState<SynthOutputStats | null>(null);
  const [synthVersion, setSynthVersion] = useState(0);
  const [synthSection, setSynthSection] = useState(0); // 0-4 accordion index

  const synthPreview = useMemo<SynthPreviewStats>(() => computePreview(synthConfig), [synthConfig]);

  // ─── Advanced toggles ─────────────────────────────────────────────────
  const [leakageToggle, setLeakageToggle] = useState(false);
  const [upliftResult, setUpliftResult] = useState<UpliftResult | null>(null);

  // ═══════════════════════════════════════════════════════════════════════
  // Data Loading
  // ═══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const loadCsv = async <T,>(url: string, parser: (rows: Record<string, string>[]) => T): Promise<T> => {
      const res = await fetch(url);
      const text = await res.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      return parser(parsed.data);
    };

    Promise.all([
      loadCsv("/game-players.csv", parsePlayers),
      loadCsv("/game-events.csv", parseEvents),
      loadCsv("/game-payments.csv", parsePayments),
      loadCsv("/game-ua-costs.csv", parseUaCosts),
      loadCsv("/game-labels.csv", parseLabels),
    ])
      .then(([p, e, pay, ua, l]) => {
        setPlayers(p); setEvents(e); setPayments(pay); setUaCosts(ua); setLabels(l);
        setLoadingData(false);
      })
      .catch((err) => { setLoadError(String(err)); setLoadingData(false); });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 2: Build features
  // ═══════════════════════════════════════════════════════════════════════

  const handleBuildFeatures = useCallback(() => {
    setFbBuilding(true);
    setTimeout(() => {
      const matrix = buildFeatureMatrix(players, events, payments, labels, fbConfig);
      setFeatureMatrix(matrix);
      const cols = getNumericFeatureColumns(matrix);
      setMtSelectedFeatures(cols);
      setFbBuilding(false);
    }, 100);
  }, [players, events, payments, labels, fbConfig]);

  const numericCols = useMemo(() => getNumericFeatureColumns(featureMatrix), [featureMatrix]);

  const correlationData = useMemo(() => {
    if (!featureMatrix.length || !numericCols.length) return null;
    const targetCols = [...numericCols, "target_ltv30", "target_ltv90"];
    return computeCorrelationMatrix(featureMatrix, targetCols);
  }, [featureMatrix, numericCols]);

  const distData = useMemo(() => {
    if (!fbDistCol || !featureMatrix.length) return null;
    return computeDistribution(featureMatrix, fbDistCol);
  }, [fbDistCol, featureMatrix]);

  const sqlPreview = useMemo(() => generateSqlPreview(fbConfig), [fbConfig]);

  // ═══════════════════════════════════════════════════════════════════════
  // Synthetic Data Generator
  // ═══════════════════════════════════════════════════════════════════════

  const handleRunSynth = useCallback(async () => {
    setSynthRunning(true);
    await new Promise((r) => setTimeout(r, 30)); // let UI update

    // 1. Generate data in memory
    const result = generateSyntheticData(synthConfig);

    // 2. Serialize to CSV strings
    const csvPayload = {
      players: serializePlayersCsv(result.players),
      events: serializeEventsCsv(result.events),
      payments: serializePaymentsCsv(result.payments),
      uaCosts: serializeUaCostsCsv(result.uaCosts),
      labels: serializeLabelsCsv(result.labels),
    };

    // 3. Write CSVs to public/ via API route
    try {
      const res = await fetch("/api/write-synth-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(csvPayload),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Failed to write CSVs:", err);
      }
    } catch (e) {
      console.error("Failed to write CSVs:", e);
    }

    // 4. Re-read CSVs from disk to verify and populate state
    const loadCsv = async <T,>(url: string, parser: (rows: Record<string, string>[]) => T): Promise<T> => {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      return parser(parsed.data);
    };

    const [p, e, pay, ua, l] = await Promise.all([
      loadCsv("/game-players.csv", parsePlayers),
      loadCsv("/game-events.csv", parseEvents),
      loadCsv("/game-payments.csv", parsePayments),
      loadCsv("/game-ua-costs.csv", parseUaCosts),
      loadCsv("/game-labels.csv", parseLabels),
    ]);

    // 5. Set state from re-read CSV data
    setPlayers(p); setEvents(e); setPayments(pay); setUaCosts(ua); setLabels(l);

    // Keep Step 3 usable: rebuild features immediately (no need to go back to Step 2)
    const matrix = buildFeatureMatrix(p, e, pay, l, fbConfig);
    setFeatureMatrix(matrix);
    const cols = getNumericFeatureColumns(matrix);
    setMtSelectedFeatures(cols);

    // 6. Compute output stats from the re-read data
    const stats = computeStatsFromData(p, e, pay, ua, l);
    setSynthStats(stats);
    setSynthVersion((v) => v + 1);

    // 7. Invalidate downstream (models & downstream analysis)
    setModelRegistry([]);
    setActiveModelIdx(0);
    setActRuns([]);
    setEcoData([]);
    setSynthRunning(false);
  }, [synthConfig, fbConfig]);

  const handleExportCorrelationJson = useCallback(() => {
    if (!featureMatrix.length) return;
    const report = computeCorrelationReport(featureMatrix as unknown as Record<string, number>[], synthConfig);

    // Include trained model results for debugging
    const modelResults = modelRegistry.map((m) => ({
      run_id: m.run_id,
      model_label: m.modelLabel,
      model_type: m.modelType,
      target: m.target,
      features_used: m.features,
      split_strategy: m.splitStrategy,
      leakage_enabled: m.leakageEnabled,
      metrics: { mae: m.mae, rmse: m.rmse, r2: m.r2, spearman_corr: m.spearmanCorr, calibration_error: m.calibrationError },
      train_size: m.trainSize,
      test_size: m.testSize,
      feature_importance: m.featureImportance,
      shap_values: m.shapValues,
    }));

    const exportPayload = { ...report, trained_models: modelResults };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `synth-correlation-report-v${synthVersion}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [featureMatrix, synthVersion, synthConfig, modelRegistry]);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 3: Train model
  // ═══════════════════════════════════════════════════════════════════════

  const handleTrainModel = useCallback(() => {
    if (!featureMatrix.length || !mtSelectedFeatures.length) return;
    setMtTraining(true);
    setTimeout(() => {
      const result = trainModel(featureMatrix, mtSelectedFeatures, mtTarget, mtModelType, mtSplit, leakageToggle, Date.now());
      setModelRegistry((prev) => [...prev, result]);
      setActiveModelIdx(modelRegistry.length);
      setMtTraining(false);
    }, 100);
  }, [featureMatrix, mtSelectedFeatures, mtTarget, mtModelType, mtSplit, leakageToggle, modelRegistry.length]);

  const activeModel = modelRegistry[activeModelIdx] || null;

  // ═══════════════════════════════════════════════════════════════════════
  // Step 4: Eval helpers
  // ═══════════════════════════════════════════════════════════════════════

  const evalModels = useMemo(() => {
    if (!evalSelectedModels.size) return modelRegistry;
    return [...evalSelectedModels].filter((i) => i < modelRegistry.length).map((i) => modelRegistry[i]);
  }, [modelRegistry, evalSelectedModels]);

  const evalProtocol = useMemo(() => {
    if (!modelRegistry.length) return null;
    return extractProtocol(modelRegistry[evalChampionIdx ?? 0]);
  }, [modelRegistry, evalChampionIdx]);

  const evalProtocolWarnings = useMemo(() => {
    if (!evalProtocolLocked || !evalProtocol || evalModels.length < 2) return new Map<string, string[]>();
    const warnings = new Map<string, string[]>();
    for (const m of evalModels) {
      const p = extractProtocol(m);
      const { match, differences } = protocolsMatch(evalProtocol, p);
      if (!match) warnings.set(m.run_id, differences);
    }
    return warnings;
  }, [evalProtocolLocked, evalProtocol, evalModels]);

  const evalRecommendations = useMemo(() => {
    if (evalModels.length < 2) return [] as DecisionRecommendation[];
    return generateRecommendations(evalModels, evalTopKSlider);
  }, [evalModels, evalTopKSlider]);

  const handleAddBaseline = useCallback((type: "ltv3d" | "ltv7d") => {
    if (!featureMatrix.length) return;
    const baseline = generateBaselineModel(featureMatrix, type, mtTarget, mtSplit, Date.now());
    setModelRegistry((prev) => [...prev, baseline]);
  }, [featureMatrix, mtTarget, mtSplit]);

  const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  // ═══════════════════════════════════════════════════════════════════════
  // Step 5: Activation
  // ═══════════════════════════════════════════════════════════════════════

  const handleRunActivation = useCallback(() => {
    const modelsToRun = actSelectedModels.size
      ? [...actSelectedModels].filter((i) => i < modelRegistry.length).map((i) => modelRegistry[i])
      : activeModel ? [activeModel] : [];
    if (!modelsToRun.length) return;
    const newRuns = modelsToRun.map((m, mi) => simulateActivation(m, actTopK, actConfig, Date.now() + mi));
    setActRuns((prev) => [...newRuns, ...prev]);
  }, [activeModel, actTopK, actConfig, actSelectedModels, modelRegistry]);

  // ═══════════════════════════════════════════════════════════════════════
  // Step 6: Economic Impact
  // ═══════════════════════════════════════════════════════════════════════

  const handleComputeEconomic = useCallback(() => {
    if (!activeModel) return;
    const data = computeEconomicImpact(activeModel, actConfig, Date.now());
    setEcoData(data);
  }, [activeModel, actConfig]);

  // Uplift
  const handleRunUplift = useCallback(() => {
    if (!activeModel) return;
    const result = simulateUplift(activeModel, 0.5, Date.now());
    setUpliftResult(result);
  }, [activeModel]);

  // ═══════════════════════════════════════════════════════════════════════
  // Loading
  // ═══════════════════════════════════════════════════════════════════════

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading game data (5 CSVs)...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <AlertTriangle size={24} className="text-red-400 mx-auto mb-2" />
        <p className="text-red-400 text-sm">Failed to load data: {loadError}</p>
        <p className="text-zinc-500 text-xs mt-1">Run <code className="bg-zinc-800 px-1 rounded">node scripts/generate-game-data-2.js</code> first.</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* ─── Step Indicator ─── */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-2">
        {STEPS.map((step, i) => (
          <button key={i} onClick={() => setActiveStep(i)}
            className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] transition-all ${activeStep === i ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${activeStep === i ? "bg-cyan-500 text-white" : "bg-zinc-800 text-zinc-500"}`}>{i + 1}</span>
            <div>
              <div className="font-semibold">{step.label}</div>
              <div className="text-[11px] opacity-60">{step.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ─── Advanced Toggles Bar ─── */}
      <div className="flex items-center gap-4 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2">
        <span className="text-[12px] text-zinc-500 font-semibold uppercase tracking-wider">Advanced:</span>
        <button onClick={() => { setLeakageToggle(!leakageToggle); setFbConfig((c) => ({ ...c, includeLeakageFeature: !leakageToggle })); }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-all ${leakageToggle ? "bg-red-500/20 border-red-500/40 text-red-400" : "border-zinc-700 text-zinc-500"}`}>
          {leakageToggle ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          🔥 Data Leakage {leakageToggle ? "ON" : "OFF"}
        </button>
        <button onClick={() => setMtSplit(mtSplit === "random" ? "time" : "random")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-all ${mtSplit === "time" ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "border-zinc-700 text-zinc-500"}`}>
          {mtSplit === "time" ? <Clock size={12} /> : <Shuffle size={12} />}
          🎲 Split: {mtSplit === "time" ? "Time-based" : "Random"}
        </button>
        <button onClick={handleRunUplift} disabled={!activeModel}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium border border-zinc-700 text-zinc-500 hover:text-purple-400 hover:border-purple-500/40 disabled:opacity-30 transition-all">
          🎯 Run Uplift Model
        </button>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-600">
          <span>{players.length} players</span>
          <span>{events.length.toLocaleString()} events</span>
          <span>{payments.length} payments</span>
          <span>{labels.length} labels</span>
        </div>
      </div>

      {/* ═══ Step 1: Raw Log Explorer ═══ */}
      {activeStep === 0 && (
        <div className="space-y-3">
          <InfoBanner title="Step 1 — Browse Raw Logs" variant="info">
            <p>Explore the raw data tables generated by the game telemetry pipeline. This simulates real-world messy logs before any feature engineering.</p>
          </InfoBanner>

          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {(["players", "events", "payments", "ua_cost", "labels"] as const).map((tab) => (
              <button key={tab} onClick={() => { setLogTab(tab); setLogPage(0); }}
                className={`flex-1 px-3 py-2 rounded text-[12px] font-medium transition-all ${logTab === tab ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30" : "text-zinc-500 hover:text-zinc-300"}`}>
                {tab === "players" ? "Players" : tab === "events" ? "Game Events" : tab === "payments" ? "Payments" : tab === "ua_cost" ? "UA Cost" : "Labels (Ground Truth)"}
              </button>
            ))}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Filter by user_id..." value={logFilter} onChange={(e) => { setLogFilter(e.target.value); setLogPage(0); }}
                className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-[12px] text-zinc-200 placeholder:text-zinc-600" />
            </div>
          </div>

          {/* Summary Cards */}
          {logTab === "players" && (() => {
            const summary = summarizePlayers(players);
            return (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-emerald-400">{summary.rowCount.toLocaleString()}</div>
                  <div className="text-[10px] text-zinc-500">Total Players</div>
                </div>
                {summary.topValues?.map((tv) => (
                  <div key={tv.column} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="text-[10px] text-zinc-500 mb-1">{tv.column}</div>
                    <div className="space-y-0.5">
                      {tv.values.slice(0, 4).map((v) => (
                        <div key={v.value} className="flex justify-between text-[10px]">
                          <span className="text-zinc-400">{v.value}</span>
                          <span className="text-zinc-500 font-mono">{v.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {logTab === "payments" && (() => {
            const summary = summarizePayments(payments);
            return (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-emerald-400">{summary.rowCount.toLocaleString()}</div>
                  <div className="text-[10px] text-zinc-500">Total Transactions</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-cyan-400">{summary.uniqueUsers}</div>
                  <div className="text-[10px] text-zinc-500">Unique Payers</div>
                </div>
                {summary.topValues?.map((tv) => (
                  <div key={tv.column} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="text-[10px] text-zinc-500 mb-1">{tv.column}</div>
                    {tv.values.slice(0, 4).map((v) => (
                      <div key={v.value} className="flex justify-between text-[10px]">
                        <span className="text-zinc-400">{v.value}</span>
                        <span className="text-zinc-500 font-mono">{v.count}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Data Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-zinc-900 z-10">
                  <tr className="border-b border-zinc-800">
                    {logTab === "players" && ["game_user_id", "install_time", "campaign_id", "channel", "country", "os", "device_tier"].map((h) => <th key={h} className="px-2 py-2 text-left text-zinc-500 font-medium">{h}</th>)}
                    {logTab === "events" && ["game_user_id", "event_time", "event_name", "session_id", "params"].map((h) => <th key={h} className="px-2 py-2 text-left text-zinc-500 font-medium">{h}</th>)}
                    {logTab === "payments" && ["game_user_id", "txn_time", "amount_usd", "product_sku", "payment_channel", "is_refund"].map((h) => <th key={h} className="px-2 py-2 text-left text-zinc-500 font-medium">{h}</th>)}
                    {logTab === "ua_cost" && ["campaign_id", "date", "spend", "impressions", "clicks", "installs"].map((h) => <th key={h} className="px-2 py-2 text-left text-zinc-500 font-medium">{h}</th>)}
                    {logTab === "labels" && ["game_user_id", "install_date", "ua_cost", "ltv_d3", "ltv_d7", "ltv_d30", "ltv_d90", "is_payer_by_d7", "profit_d90"].map((h) => <th key={h} className="px-2 py-2 text-left text-zinc-500 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {logTab === "players" && players.filter((p) => !logFilter || p.game_user_id.includes(logFilter)).slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE).map((p) => (
                    <tr key={p.game_user_id} className="hover:bg-zinc-800/30">
                      <td className="px-2 py-1 font-mono text-cyan-400">{p.game_user_id}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.install_time}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.campaign_id}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.channel}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.country}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.os}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.device_tier}</td>
                    </tr>
                  ))}
                  {logTab === "events" && events.filter((e) => !logFilter || e.game_user_id.includes(logFilter)).slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE).map((e, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className="px-2 py-1 font-mono text-cyan-400">{e.game_user_id}</td>
                      <td className="px-2 py-1 text-zinc-400">{e.event_time}</td>
                      <td className="px-2 py-1 text-zinc-300 font-semibold">{e.event_name}</td>
                      <td className="px-2 py-1 text-zinc-500 font-mono">{e.session_id}</td>
                      <td className="px-2 py-1 text-zinc-500 truncate max-w-[300px]">{e.params}</td>
                    </tr>
                  ))}
                  {logTab === "payments" && payments.filter((p) => !logFilter || p.game_user_id.includes(logFilter)).slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE).map((p, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className="px-2 py-1 font-mono text-cyan-400">{p.game_user_id}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.txn_time}</td>
                      <td className="px-2 py-1 text-emerald-400 font-mono">${p.amount_usd.toFixed(2)}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.product_sku}</td>
                      <td className="px-2 py-1 text-zinc-400">{p.payment_channel}</td>
                      <td className={`px-2 py-1 ${p.is_refund ? "text-red-400" : "text-zinc-500"}`}>{p.is_refund ? "YES" : "no"}</td>
                    </tr>
                  ))}
                  {logTab === "ua_cost" && uaCosts.filter((u) => !logFilter || u.campaign_id.includes(logFilter)).slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE).map((u, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className="px-2 py-1 text-zinc-300">{u.campaign_id}</td>
                      <td className="px-2 py-1 text-zinc-400">{u.date}</td>
                      <td className="px-2 py-1 text-emerald-400 font-mono">${u.spend.toFixed(2)}</td>
                      <td className="px-2 py-1 text-zinc-400 font-mono">{u.impressions.toLocaleString()}</td>
                      <td className="px-2 py-1 text-zinc-400 font-mono">{u.clicks.toLocaleString()}</td>
                      <td className="px-2 py-1 text-zinc-400 font-mono">{u.installs}</td>
                    </tr>
                  ))}
                  {logTab === "labels" && labels.filter((l) => !logFilter || l.game_user_id.includes(logFilter)).slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE).map((l) => (
                    <tr key={l.game_user_id} className="hover:bg-zinc-800/30">
                      <td className="px-2 py-1 font-mono text-cyan-400">{l.game_user_id}</td>
                      <td className="px-2 py-1 text-zinc-400">{l.install_date}</td>
                      <td className="px-2 py-1 text-zinc-400 font-mono">${l.ua_cost.toFixed(2)}</td>
                      <td className="px-2 py-1 text-zinc-400 font-mono">${l.ltv_d3.toFixed(2)}</td>
                      <td className="px-2 py-1 text-zinc-400 font-mono">${l.ltv_d7.toFixed(2)}</td>
                      <td className="px-2 py-1 text-emerald-400 font-mono font-bold">${l.ltv_d30.toFixed(2)}</td>
                      <td className="px-2 py-1 text-emerald-400 font-mono font-bold">${l.ltv_d90.toFixed(2)}</td>
                      <td className="px-2 py-1 text-zinc-400">{l.is_payer_by_d7}</td>
                      <td className={`px-2 py-1 font-mono ${l.profit_d90 >= 0 ? "text-green-400" : "text-red-400"}`}>${l.profit_d90.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800">
              <button onClick={() => setLogPage(Math.max(0, logPage - 1))} disabled={logPage === 0} className="text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30">← Prev</button>
              <span className="text-[10px] text-zinc-600">Page {logPage + 1}</span>
              <button onClick={() => setLogPage(logPage + 1)} className="text-[11px] text-zinc-500 hover:text-zinc-300">Next →</button>
            </div>
          </div>

          {/* SQL Preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h4 className="text-sm font-bold text-zinc-200 mb-2 flex items-center gap-2"><Code2 size={12} className="text-cyan-400" />SQL Preview (Feature Query)</h4>
            <pre className="bg-zinc-950 rounded-lg p-3 text-[10px] text-cyan-300 font-mono overflow-auto max-h-[200px] whitespace-pre border border-zinc-800">{sqlPreview}</pre>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setActiveStep(1)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-500">
              Next: Feature Builder <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Feature Builder Workbench ═══ */}
      {activeStep === 1 && (
        <div className="space-y-3">
          <InfoBanner title="Step 2 — Feature Builder Workbench" variant="info">
            <p>Select raw tables, choose aggregation windows, and pick feature templates. The system will compute a feature matrix with GROUP BY + windowed aggregation, then JOIN to the target (LTV D30/LTV D90).</p>
            {leakageToggle && <p className="text-red-400 mt-1">⚠️ <strong>Data Leakage mode is ON.</strong> Future payment features are available. Watch how offline metrics look amazing but online performance degrades.</p>}
          </InfoBanner>

          <div className="grid grid-cols-12 gap-4">
            {/* Left: Config */}
            <div className="col-span-4 space-y-3">
              {/* Data Sources */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Table2 size={12} className="text-cyan-400" />Raw Tables</h4>
                {(["useEvents", "usePayments", "usePlayers", "useUaCost"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-[12px] text-zinc-300">
                    <input type="checkbox" checked={fbConfig[key]} onChange={() => setFbConfig((c) => ({ ...c, [key]: !c[key] }))} className="accent-cyan-500" />
                    {key === "useEvents" ? "game_events" : key === "usePayments" ? "payments" : key === "usePlayers" ? "players" : "ua_costs"}
                  </label>
                ))}
              </div>

              {/* Windows */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Clock size={12} className="text-purple-400" />Aggregation Windows</h4>
                <div className="flex gap-2">
                  {[1, 3, 7, 14, 30].map((d) => (
                    <button key={d} onClick={() => setFbConfig((c) => ({ ...c, selectedWindows: c.selectedWindows.includes(d) ? c.selectedWindows.filter((w) => w !== d) : [...c.selectedWindows, d] }))}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-mono font-bold border transition-all ${fbConfig.selectedWindows.includes(d) ? "bg-purple-500/20 border-purple-500/40 text-purple-400" : "border-zinc-700 text-zinc-500"}`}>
                      D{d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feature Templates */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Wrench size={12} className="text-emerald-400" />Feature Templates</h4>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {FEATURE_TEMPLATES.map((tmpl) => {
                    const checked = fbConfig.selectedTemplates.includes(tmpl.id);
                    const isLeakage = !!tmpl.leakageRisk;
                    return (
                      <label key={tmpl.id} className={`flex items-start gap-2 p-1.5 rounded text-[11px] cursor-pointer transition-all ${checked ? "bg-zinc-800/50" : ""} ${isLeakage ? "border border-red-500/30" : ""}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setFbConfig((c) => ({ ...c, selectedTemplates: checked ? c.selectedTemplates.filter((t) => t !== tmpl.id) : [...c.selectedTemplates, tmpl.id] }))}
                          className={`mt-0.5 ${isLeakage ? "accent-red-500" : "accent-emerald-500"}`} />
                        <div>
                          <span className={`font-mono font-semibold ${isLeakage ? "text-red-400" : "text-zinc-300"}`}>{tmpl.label}</span>
                          {tmpl.requiresWindow && <span className="text-[9px] text-purple-400 ml-1">[windowed]</span>}
                          <div className="text-[10px] text-zinc-500">{tmpl.description}</div>
                          {isLeakage && <div className="text-[10px] text-red-400 flex items-center gap-1"><AlertOctagon size={9} />{tmpl.leakageRisk}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleBuildFeatures} disabled={fbBuilding || fbConfig.selectedTemplates.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600">
                {fbBuilding ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={14} />}
                {fbBuilding ? "Building..." : "Build Feature Matrix"}
              </button>
            </div>

            {/* Right: Results */}
            <div className="col-span-8 space-y-3">
              {!featureMatrix.length ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
                  <Layers size={32} className="text-zinc-600 mx-auto" />
                  <div className="text-sm text-zinc-500">Select tables, windows, and feature templates, then click <strong className="text-emerald-400">Build Feature Matrix</strong>.</div>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-emerald-400">{featureMatrix.length.toLocaleString()}</div>
                      <div className="text-[10px] text-zinc-500">Users</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-cyan-400">{numericCols.length}</div>
                      <div className="text-[10px] text-zinc-500">Features</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-purple-400">{fbConfig.selectedWindows.join(", ")}</div>
                      <div className="text-[10px] text-zinc-500">Windows (days)</div>
                    </div>
                  </div>

                  {/* Feature Matrix Preview */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-zinc-200 mb-2">Feature Matrix ({featureMatrix.length} rows × {numericCols.length} features)</h4>
                    <div className="overflow-x-auto max-h-[250px]">
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-zinc-900"><tr className="border-b border-zinc-800">
                          <th className="px-2 py-1 text-left text-zinc-500">user_id</th>
                          {numericCols.slice(0, 10).map((c) => <th key={c} className="px-2 py-1 text-right text-zinc-500 cursor-pointer hover:text-cyan-400" onClick={() => setFbDistCol(c)}>{c}</th>)}
                          {numericCols.length > 10 && <th className="px-2 py-1 text-zinc-600">+{numericCols.length - 10}</th>}
                        </tr></thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {featureMatrix.slice(0, 20).map((r) => (
                            <tr key={r.user_id} className="hover:bg-zinc-800/30">
                              <td className="px-2 py-0.5 font-mono text-cyan-400">{r.user_id}</td>
                              {numericCols.slice(0, 10).map((c) => <td key={c} className="px-2 py-0.5 text-right font-mono text-zinc-400">{typeof r[c] === "number" ? (r[c] as number).toFixed(2) : r[c]}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Correlation Heatmap */}
                  {correlationData && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-zinc-200 mb-2">Feature Correlation Heatmap</h4>
                      <div className="overflow-x-auto">
                        <table className="text-[9px]">
                          <thead><tr><th></th>{correlationData.columns.map((c) => <th key={c} className="px-1 py-0.5 text-zinc-500 font-normal" style={{ writingMode: "vertical-rl", maxHeight: 80 }}>{c.slice(0, 15)}</th>)}</tr></thead>
                          <tbody>
                            {correlationData.columns.map((row, i) => (
                              <tr key={row}>
                                <td className="px-1 py-0.5 text-zinc-400 font-mono whitespace-nowrap">{row.slice(0, 18)}</td>
                                {correlationData.data[i].map((val, j) => {
                                  const abs = Math.abs(val);
                                  const color = val > 0 ? `rgba(16,185,129,${abs})` : `rgba(239,68,68,${abs})`;
                                  return <td key={j} className="px-1 py-0.5 text-center font-mono" style={{ backgroundColor: color, color: abs > 0.5 ? "white" : "#71717a" }}>{val.toFixed(2)}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Distribution Plot */}
                  {fbDistCol && distData && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-zinc-200 mb-2">Distribution: <span className="text-cyan-400 font-mono">{fbDistCol}</span></h4>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={distData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 9 }} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 9 }} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} />
                          <Bar dataKey="count" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* SQL Preview */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-zinc-200 mb-2 flex items-center gap-2"><Code2 size={12} className="text-cyan-400" />Generated SQL</h4>
                    <pre className="bg-zinc-950 rounded-lg p-3 text-[10px] text-cyan-300 font-mono overflow-auto max-h-[200px] whitespace-pre border border-zinc-800">{sqlPreview}</pre>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(0)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
            <button onClick={() => setActiveStep(2)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-500">Next: Train Model <ArrowRight size={14} /></button>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Model Training Simulator ═══ */}
      {activeStep === 2 && (
        <div className="space-y-3">
          <InfoBanner title="Step 3 — Model Training Simulator" variant="info">
            <p>Choose an algorithm, select features, pick a target variable, and train. Includes feature importance, SHAP-like visualization, and training loss curve.</p>
          </InfoBanner>

          {/* ── 🧪 Synthetic Data Generator ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button onClick={() => setSynthOpen(!synthOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <FlaskConical size={14} className="text-cyan-400" />
                <span className="text-sm font-bold text-zinc-200">Synthetic Data Generator</span>
                {synthVersion > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">v{synthVersion}</span>}
              </div>
              <ChevronRight size={14} className={`text-zinc-500 transition-transform ${synthOpen ? "rotate-90" : ""}`} />
            </button>

            {synthOpen && (
              <div className="border-t border-zinc-800 px-4 pb-4 space-y-3">
                {/* Presets */}
                <div className="flex items-center gap-2 pt-3">
                  <span className="text-[11px] text-zinc-500 font-semibold">Presets:</span>
                  {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
                    <button key={key} onClick={() => setSynthConfig(JSON.parse(JSON.stringify(preset.config)))}
                      className="px-2.5 py-1 text-[11px] rounded-lg border border-zinc-700 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-all"
                      title={preset.description}>
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Accordion Sections */}
                {[
                  { idx: 0, icon: "👥", title: "Population Configuration" },
                  { idx: 1, icon: "💰", title: "Monetization Dynamics" },
                  { idx: 2, icon: "🎮", title: "Behavioral Signals" },
                  { idx: 3, icon: "📉", title: "Noise & Bias Injection" },
                  { idx: 4, icon: "⚙️", title: "Simulation Controls" },
                ].map((sec) => (
                  <div key={sec.idx} className="border border-zinc-800 rounded-lg overflow-hidden">
                    <button onClick={() => setSynthSection(synthSection === sec.idx ? -1 : sec.idx)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-semibold text-zinc-300 hover:bg-zinc-800/50 transition-colors">
                      <span>{sec.icon}</span> {sec.title}
                      <ChevronRight size={12} className={`ml-auto text-zinc-600 transition-transform ${synthSection === sec.idx ? "rotate-90" : ""}`} />
                    </button>

                    {synthSection === sec.idx && (
                      <div className="px-3 pb-3 pt-1 border-t border-zinc-800/50">
                        {/* Section 0: Population */}
                        {sec.idx === 0 && (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Total Users (N)</label>
                              <input type="number" min={100} max={50000} step={100} value={synthConfig.population.totalUsers}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, population: { ...c.population, totalUsers: Number(e.target.value) } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Install Window (days)</label>
                              <input type="number" min={14} max={365} value={synthConfig.population.installWindowDays}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, population: { ...c.population, installWindowDays: Number(e.target.value) } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Cohort Skew</label>
                              <select value={synthConfig.population.cohortSkew}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, population: { ...c.population, cohortSkew: e.target.value as "uniform" | "campaign" } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200">
                                <option value="uniform">Uniform</option>
                                <option value="campaign">Campaign-based</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">% Returning Users</label>
                              <input type="number" min={0} max={1} step={0.05} value={synthConfig.population.pctReturning}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, population: { ...c.population, pctReturning: Number(e.target.value) } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                            </div>
                            <div className="flex items-center gap-2 pt-4">
                              <input type="checkbox" checked={synthConfig.population.geoEnabled}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, population: { ...c.population, geoEnabled: e.target.checked } }))}
                                className="accent-cyan-500 w-3.5 h-3.5" />
                              <span className="text-[11px] text-zinc-400">Geo Distribution</span>
                            </div>
                            <div className="flex items-center gap-2 pt-4">
                              <input type="checkbox" checked={synthConfig.population.deviceMixEnabled}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, population: { ...c.population, deviceMixEnabled: e.target.checked } }))}
                                className="accent-cyan-500 w-3.5 h-3.5" />
                              <span className="text-[11px] text-zinc-400">Device Mix</span>
                            </div>
                          </div>
                        )}

                        {/* Section 1: Monetization */}
                        {sec.idx === 1 && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Payer Rate</label>
                                <input type="number" min={0.005} max={0.5} step={0.005} value={synthConfig.monetization.payerRate}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, payerRate: Number(e.target.value) } }))}
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Revenue Distribution</label>
                                <select value={synthConfig.monetization.revenueDistribution}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, revenueDistribution: e.target.value as "uniform" | "lognormal" | "pareto" | "custom" } }))}
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200">
                                  <option value="uniform">Uniform</option>
                                  <option value="lognormal">Lognormal</option>
                                  <option value="pareto">Pareto (heavy tail)</option>
                                  <option value="custom">Custom</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Top 1% Rev Share</label>
                                <input type="number" min={0.05} max={0.9} step={0.05} value={synthConfig.monetization.whaleTop1Share}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, whaleTop1Share: Number(e.target.value) } }))}
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Gini Coefficient</label>
                                <input type="range" min={0.2} max={0.98} step={0.01} value={synthConfig.monetization.giniCoefficient}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, giniCoefficient: Number(e.target.value) } }))}
                                  className="w-full accent-cyan-500" />
                                <div className="text-[10px] text-zinc-500 text-center">{synthConfig.monetization.giniCoefficient.toFixed(2)}</div>
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Heavy Tail (1-5)</label>
                                <input type="range" min={1} max={5} step={0.5} value={synthConfig.monetization.heavyTailIntensity}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, heavyTailIntensity: Number(e.target.value) } }))}
                                  className="w-full accent-cyan-500" />
                                <div className="text-[10px] text-zinc-500 text-center">{synthConfig.monetization.heavyTailIntensity}</div>
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Avg Txn / Payer</label>
                                <input type="number" min={1} max={50} value={synthConfig.monetization.avgTxnPerPayer}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, avgTxnPerPayer: Number(e.target.value) } }))}
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                              </div>
                              <div>
                                <label className="text-[11px] text-zinc-500 mb-1 block">Purchase Decay</label>
                                <input type="range" min={0} max={0.3} step={0.01} value={synthConfig.monetization.purchaseDecay}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, purchaseDecay: Number(e.target.value) } }))}
                                  className="w-full accent-cyan-500" />
                                <div className="text-[10px] text-zinc-500 text-center">{synthConfig.monetization.purchaseDecay.toFixed(2)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                                <input type="checkbox" checked={synthConfig.monetization.burstBehavior}
                                  onChange={(e) => setSynthConfig((c) => ({ ...c, monetization: { ...c.monetization, burstBehavior: e.target.checked } }))}
                                  className="accent-cyan-500 w-3.5 h-3.5" />
                                Early Spender Burst
                              </label>
                            </div>
                          </div>
                        )}

                        {/* Section 2: Behavioral */}
                        {sec.idx === 2 && (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Session Count (mean/week)</label>
                              <input type="number" min={1} max={50} value={synthConfig.behavioral.sessionCountMean}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, behavioral: { ...c.behavioral, sessionCountMean: Number(e.target.value) } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Level Progression Speed</label>
                              <input type="range" min={0.1} max={1} step={0.05} value={synthConfig.behavioral.levelProgressionSpeed}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, behavioral: { ...c.behavioral, levelProgressionSpeed: Number(e.target.value) } }))}
                                className="w-full accent-cyan-500" />
                              <div className="text-[10px] text-zinc-500 text-center">{synthConfig.behavioral.levelProgressionSpeed.toFixed(2)}</div>
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Engagement Decay</label>
                              <input type="range" min={0.01} max={0.3} step={0.01} value={synthConfig.behavioral.engagementDecay}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, behavioral: { ...c.behavioral, engagementDecay: Number(e.target.value) } }))}
                                className="w-full accent-cyan-500" />
                              <div className="text-[10px] text-zinc-500 text-center">{synthConfig.behavioral.engagementDecay.toFixed(2)}</div>
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Activity Volatility</label>
                              <input type="range" min={0} max={1} step={0.05} value={synthConfig.behavioral.activityVolatility}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, behavioral: { ...c.behavioral, activityVolatility: Number(e.target.value) } }))}
                                className="w-full accent-cyan-500" />
                              <div className="text-[10px] text-zinc-500 text-center">{synthConfig.behavioral.activityVolatility.toFixed(2)}</div>
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Engage↔Pay Correlation</label>
                              <select value={synthConfig.behavioral.engagePayCorrelation}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, behavioral: { ...c.behavioral, engagePayCorrelation: e.target.value as "weak" | "medium" | "strong" } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200">
                                <option value="weak">Weak (hard prediction)</option>
                                <option value="medium">Medium</option>
                                <option value="strong">Strong (easy prediction)</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Section 3: Noise & Bias */}
                        {sec.idx === 3 && (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Label Noise %</label>
                              <input type="range" min={0} max={0.3} step={0.01} value={synthConfig.noise.labelNoisePct}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, noise: { ...c.noise, labelNoisePct: Number(e.target.value) } }))}
                                className="w-full accent-amber-500" />
                              <div className="text-[10px] text-zinc-500 text-center">{(synthConfig.noise.labelNoisePct * 100).toFixed(0)}%</div>
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Missing Features %</label>
                              <input type="range" min={0} max={0.2} step={0.01} value={synthConfig.noise.missingFeaturesPct}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, noise: { ...c.noise, missingFeaturesPct: Number(e.target.value) } }))}
                                className="w-full accent-amber-500" />
                              <div className="text-[10px] text-zinc-500 text-center">{(synthConfig.noise.missingFeaturesPct * 100).toFixed(0)}%</div>
                            </div>
                            <div className="space-y-2 pt-1">
                              {([
                                { key: "delayedRevenue" as const, label: "Delayed Revenue Reporting", color: "accent-amber-500" },
                                { key: "injectLeakage" as const, label: "⚠️ Inject Data Leakage", color: "accent-red-500" },
                                { key: "payerRateShift" as const, label: "Payer Rate Shift Mid-Period", color: "accent-amber-500" },
                                { key: "economyShift" as const, label: "Economy Change Mid-Cohort", color: "accent-amber-500" },
                              ]).map((toggle) => (
                                <label key={toggle.key} className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
                                  <input type="checkbox" checked={synthConfig.noise[toggle.key] as boolean}
                                    onChange={(e) => setSynthConfig((c) => ({ ...c, noise: { ...c.noise, [toggle.key]: e.target.checked } }))}
                                    className={`${toggle.color} w-3.5 h-3.5`} />
                                  {toggle.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Section 4: Simulation Controls */}
                        {sec.idx === 4 && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Max Events / User</label>
                              <input type="number" min={20} max={500} step={10} value={synthConfig.simulation.maxEventsPerUser}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, simulation: { ...c.simulation, maxEventsPerUser: Number(e.target.value) } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                            </div>
                            <div>
                              <label className="text-[11px] text-zinc-500 mb-1 block">Random Seed</label>
                              <input type="number" min={1} value={synthConfig.simulation.seed}
                                onChange={(e) => setSynthConfig((c) => ({ ...c, simulation: { ...c.simulation, seed: Number(e.target.value) } }))}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 font-mono" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Preview Summary */}
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <h5 className="text-[11px] font-semibold text-zinc-400 mb-2">Economy Distribution Preview</h5>
                  <div className="grid grid-cols-7 gap-2">
                    {([
                      { label: "Total Rev", value: `$${synthPreview.expectedTotalRevenue.toLocaleString()}`, color: "text-emerald-400" },
                      { label: "ARPU", value: `$${synthPreview.expectedArpu}`, color: "text-cyan-400" },
                      { label: "ARPPU", value: `$${synthPreview.expectedArppu}`, color: "text-purple-400" },
                      { label: "Payer %", value: `${synthPreview.expectedPayerPct}%`, color: "text-amber-400" },
                      { label: "Gini", value: synthPreview.expectedGini.toFixed(2), color: "text-red-400" },
                      { label: "Txns", value: synthPreview.expectedTxnCount.toLocaleString(), color: "text-blue-400" },
                      { label: "Est. Size", value: `${Math.round(synthPreview.estimatedFileSizeKB / 1024 * 10) / 10} MB`, color: "text-zinc-400" },
                    ]).map((m) => (
                      <div key={m.label} className="text-center">
                        <div className={`text-sm font-bold ${m.color}`}>{m.value}</div>
                        <div className="text-[9px] text-zinc-600">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Run Button */}
                <div className="flex items-center gap-3">
                  <button onClick={handleRunSynth} disabled={synthRunning}
                    className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white text-[13px] font-semibold rounded-lg hover:bg-cyan-500 disabled:opacity-50 transition-all">
                    {synthRunning ? <Sparkles size={14} className="animate-spin" /> : <Play size={14} />}
                    {synthRunning ? "Generating..." : "Run Simulation"}
                  </button>
                  {synthVersion > 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-amber-400">
                      <AlertTriangle size={12} />
                      Dataset v{synthVersion} active. Retrain models in Step 3.
                    </div>
                  )}
                </div>

                {/* Output Summary (after generation) */}
                {synthStats && (
                  <div className="bg-zinc-800/50 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[11px] font-semibold text-emerald-400 flex items-center gap-2"><CheckCircle2 size={12} /> Generation Complete — Dataset v{synthVersion}</h5>
                      <button onClick={handleExportCorrelationJson} disabled={!featureMatrix.length}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-zinc-700 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/40 disabled:opacity-30 transition-all">
                        <Code2 size={11} /> Export Correlation JSON
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { label: "Users", value: synthStats.users.toLocaleString() },
                        { label: "Transactions", value: synthStats.transactions.toLocaleString() },
                        { label: "Events", value: synthStats.events.toLocaleString() },
                        { label: "Total Revenue", value: `$${synthStats.totalRevenue.toLocaleString()}` },
                        { label: "Payer Rate", value: `${synthStats.payerRate}%` },
                        { label: "ARPU", value: `$${synthStats.arpu}` },
                        { label: "ARPPU", value: `$${synthStats.arppu}` },
                        { label: "Gini", value: String(synthStats.giniCoefficient) },
                      ]).map((s) => (
                        <div key={s.label} className="bg-zinc-900 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-zinc-200">{s.value}</div>
                          <div className="text-[9px] text-zinc-500">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Data Shape */}
                    <div className="grid grid-cols-5 gap-2">
                      {([
                        { label: "players rows", value: synthStats.playersRows },
                        { label: "events rows", value: synthStats.eventsRows },
                        { label: "payments rows", value: synthStats.paymentsRows },
                        { label: "labels rows", value: synthStats.labelsRows },
                        { label: "ua_costs rows", value: synthStats.uaCostsRows },
                      ]).map((s) => (
                        <div key={s.label} className="text-center text-[10px]">
                          <span className="font-mono text-zinc-300">{s.value.toLocaleString()}</span>
                          <span className="text-zinc-600 ml-1">{s.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Mini Histograms */}
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { title: "Revenue Distribution (payers)", data: synthStats.revenueDistribution, color: "#10b981" },
                        { title: "Txns per Payer", data: synthStats.txnPerPayerDistribution, color: "#3b82f6" },
                        { title: "LTV Distribution (all)", data: synthStats.ltvDistribution, color: "#8b5cf6" },
                      ]).map((h) => {
                        const maxVal = Math.max(...h.data, 1);
                        return (
                          <div key={h.title}>
                            <div className="text-[10px] text-zinc-500 mb-1">{h.title}</div>
                            <div className="flex items-end gap-px h-10">
                              {h.data.map((v, bi) => (
                                <div key={bi} className="flex-1 rounded-t-sm" style={{ height: `${(v / maxVal) * 100}%`, backgroundColor: h.color, opacity: 0.7, minHeight: v > 0 ? 2 : 0 }} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!featureMatrix.length ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Build features in <button onClick={() => setActiveStep(1)} className="text-cyan-400 underline">Step 2</button> first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {/* Left: Config */}
              <div className="col-span-4 space-y-3">
                {/* Algorithm */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Brain size={12} className="text-emerald-400" />Algorithm</h4>
                  {(["gbt", "rf", "linear", "dummy"] as SimModelType[]).map((m) => (
                    <button key={m} onClick={() => setMtModelType(m)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-[12px] border transition-all ${mtModelType === m ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                      <div className="font-semibold">{m === "gbt" ? "Gradient Boosted Trees" : m === "rf" ? "Random Forest" : m === "linear" ? "Linear Regression" : "Dummy (LTV7 heuristic)"}</div>
                    </button>
                  ))}
                </div>

                {/* Target */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Target size={12} className="text-purple-400" />Target Variable</h4>
                  <div className="flex gap-2">
                    {(["ltv30", "ltv90"] as SimTarget[]).map((t) => (
                      <button key={t} onClick={() => setMtTarget(t)}
                        className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold border transition-all ${mtTarget === t ? "bg-purple-500/20 border-purple-500/30 text-purple-400" : "border-zinc-700 text-zinc-500"}`}>
                        {t === "ltv30" ? "LTV D30" : "LTV D90"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feature Selection */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Layers size={12} className="text-cyan-400" />Features ({mtSelectedFeatures.length}/{numericCols.length})</h4>
                  <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                    {numericCols.map((c) => (
                      <label key={c} className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer hover:text-zinc-300">
                        <input type="checkbox" checked={mtSelectedFeatures.includes(c)}
                          onChange={() => setMtSelectedFeatures((prev) => prev.includes(c) ? prev.filter((f) => f !== c) : [...prev, c])}
                          className="accent-cyan-500 w-3 h-3" />
                        <span className="font-mono">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button onClick={handleTrainModel} disabled={mtTraining || mtSelectedFeatures.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600">
                  {mtTraining ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={14} />}
                  {mtTraining ? "Training..." : "Train Model"}
                </button>

                {/* Model Registry */}
                {modelRegistry.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                    <h4 className="text-sm font-bold text-zinc-200">Model Registry ({modelRegistry.length})</h4>
                    {modelRegistry.map((m, i) => (
                      <div key={m.run_id} className={`relative px-2 py-1.5 rounded text-[11px] border transition-all ${activeModelIdx === i ? "bg-cyan-500/15 border-cyan-500/30" : "border-zinc-800 hover:border-zinc-700"}`}>
                        {renamingIdx === i ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && renameValue.trim()) {
                                  setModelRegistry((prev) => prev.map((mm, j) => j === i ? { ...mm, modelLabel: renameValue.trim() } : mm));
                                  setRenamingIdx(null);
                                }
                                if (e.key === "Escape") setRenamingIdx(null);
                              }}
                              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 font-mono" />
                            <button onClick={() => { if (renameValue.trim()) { setModelRegistry((prev) => prev.map((mm, j) => j === i ? { ...mm, modelLabel: renameValue.trim() } : mm)); } setRenamingIdx(null); }}
                              className="text-emerald-400 hover:text-emerald-300"><CheckCircle2 size={12} /></button>
                            <button onClick={() => setRenamingIdx(null)} className="text-zinc-500 hover:text-zinc-400"><X size={12} /></button>
                          </div>
                        ) : (
                          <div className="cursor-pointer" onClick={() => setActiveModelIdx(i)}>
                            <div className="flex justify-between items-center">
                              <span className={activeModelIdx === i ? "text-cyan-400 font-semibold" : "text-zinc-400"}>{m.modelLabel}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-zinc-500 font-mono mr-1">R²={m.r2}</span>
                                <button onClick={(e) => { e.stopPropagation(); setRenamingIdx(i); setRenameValue(m.modelLabel); }}
                                  className="text-zinc-600 hover:text-zinc-400 p-0.5" title="Rename"><Pencil size={10} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setModelRegistry((prev) => prev.filter((_, j) => j !== i)); if (activeModelIdx >= i && activeModelIdx > 0) setActiveModelIdx((v) => v - 1); }}
                                  className="text-zinc-600 hover:text-red-400 p-0.5" title="Delete"><Trash2 size={10} /></button>
                              </div>
                            </div>
                            <div className="text-[10px] text-zinc-600">{m.target} • {m.splitStrategy} • {m.features.length}f {m.leakageEnabled ? "⚠️LEAK" : ""}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Results */}
              <div className="col-span-8 space-y-3">
                {!activeModel ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
                    <Brain size={32} className="text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">Configure and train a model to see results.</p>
                  </div>
                ) : (
                  <>
                    {/* Metrics Cards */}
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: "MAE", value: `$${activeModel.mae}`, color: "text-emerald-400", tip: "Mean Absolute Error — average $ difference between predicted and actual LTV" },
                        { label: "RMSE", value: `$${activeModel.rmse}`, color: "text-cyan-400", tip: "Root Mean Squared Error — penalizes large prediction errors more than MAE" },
                        { label: "R²", value: activeModel.r2.toFixed(3), color: activeModel.r2 > 0.5 ? "text-green-400" : "text-amber-400", tip: "Coefficient of determination — 1.0 = perfect fit, 0 = no better than mean" },
                        { label: "Spearman ρ", value: activeModel.spearmanCorr.toFixed(3), color: "text-purple-400", tip: "Rank correlation — how well the model orders users by true LTV (1.0 = perfect ranking)" },
                        { label: "Calib Error", value: `$${activeModel.calibrationError}`, color: "text-amber-400", tip: "Avg $ gap between predicted and actual LTV per decile — lower = safer for bid optimization" },
                      ].map((m) => (
                        <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-center">
                          <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                          <div className="text-[11px] text-zinc-500 flex items-center justify-center gap-1">{m.label} <ChartTip label="" tip={m.tip} /></div>
                        </div>
                      ))}
                    </div>

                    {activeModel.leakageEnabled && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-[12px] text-red-400">
                        <AlertOctagon size={14} /> <strong>Data leakage detected!</strong> This model uses future information. Offline metrics will appear inflated.
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {/* Feature Importance */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-bold text-zinc-200">Feature Importance</h4>
                          <ChartTip label="% of total gain" tip="Relative contribution of each feature to the model's predictions. Based on split gain for tree models, coefficient magnitude for linear." />
                        </div>
                        <div className="space-y-1">
                          {activeModel.featureImportance.slice(0, 10).map((fi, i) => (
                            <div key={fi.feature} className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-400 w-32 truncate font-mono">{fi.feature}</span>
                              <div className="flex-1 bg-zinc-800 rounded-full h-3 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${fi.importance * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 w-10 text-right">{(fi.importance * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* SHAP-like */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-bold text-zinc-200">SHAP-like Feature Impact</h4>
                          <ChartTip label="direction + magnitude" tip="Direction of each feature's effect: ↑ positive (higher feature → higher LTV), ↓ negative, ↔ mixed. Bar length = magnitude." />
                        </div>
                        <div className="space-y-1.5">
                          {activeModel.shapValues.map((sv) => (
                            <div key={sv.feature} className="flex items-center gap-2 text-[11px]">
                              <span className="text-zinc-400 w-32 truncate font-mono">{sv.feature}</span>
                              <div className="flex-1 flex items-center">
                                <div className={`h-2.5 rounded ${sv.direction === "positive" ? "bg-emerald-500" : sv.direction === "negative" ? "bg-red-500" : "bg-amber-500"}`}
                                  style={{ width: `${Math.min(100, sv.meanAbsShap * 300)}%` }} />
                              </div>
                              <span className={`text-[10px] font-mono ${sv.direction === "positive" ? "text-emerald-400" : sv.direction === "negative" ? "text-red-400" : "text-amber-400"}`}>
                                {sv.direction === "positive" ? "↑" : sv.direction === "negative" ? "↓" : "↔"} {sv.meanAbsShap}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Training Loss */}
                    {activeModel.trainingLoss.length > 3 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-bold text-zinc-200">Training Loss Evolution</h4>
                          <ChartTip label="MSE per iteration" tip="Mean Squared Error (MSE) on training data across iterations. Should decrease over time — a flat line means the model isn't learning." />
                        </div>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={activeModel.trainingLoss.map((l, i) => ({ iteration: i + 1, loss: l }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="iteration" tick={{ fill: "#71717a", fontSize: 10 }} label={{ value: "Iteration", position: "bottom", fill: "#52525b", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                              formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "MSE Loss"]}
                              labelFormatter={(l) => `Iteration ${l}`} />
                            <Line type="monotone" dataKey="loss" stroke="#10b981" strokeWidth={2} dot={false} name="Training MSE ($²)" />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(1)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
            <button onClick={() => setActiveStep(3)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-500">Next: Offline Eval <ArrowRight size={14} /></button>
          </div>
        </div>
      )}

      {/* ═══ Step 4: Offline Evaluation Panel ═══ */}
      {activeStep === 3 && (
        <div className="space-y-3">
          <InfoBanner title="Step 4 — Offline Evaluation" variant="info">
            <p>Compare models under a locked protocol. Overlay lift curves, calibration, and precision@K across all trained models. Use Champion vs Challenger to find regressions.</p>
          </InfoBanner>

          {!modelRegistry.length ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Train a model in <button onClick={() => setActiveStep(2)} className="text-cyan-400 underline">Step 3</button> first.</p>
            </div>
          ) : (
            <>
              {/* ── 1. Top Bar: Model Selection + Protocol Lock ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Users size={14} className="text-cyan-400" />Models to Compare</h4>
                  <div className="flex items-center gap-3">
                    {/* Baselines */}
                    <div className="flex gap-1">
                      <button onClick={() => handleAddBaseline("ltv3d")} className="px-2 py-1 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:border-cyan-500/40 hover:text-cyan-400 transition-colors">+ LTV3D Baseline</button>
                      <button onClick={() => handleAddBaseline("ltv7d")} className="px-2 py-1 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:border-cyan-500/40 hover:text-cyan-400 transition-colors">+ LTV7D Baseline</button>
                    </div>
                    <span className="text-zinc-700">|</span>
                    {/* Protocol Lock */}
                    <button onClick={() => setEvalProtocolLocked((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${evalProtocolLocked ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                      {evalProtocolLocked ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {evalProtocolLocked ? "Protocol Locked" : "Lock Protocol"}
                    </button>
                  </div>
                </div>
                {/* Model checkboxes */}
                <div className="flex flex-wrap gap-2">
                  {modelRegistry.map((m, i) => {
                    const selected = !evalSelectedModels.size || evalSelectedModels.has(i);
                    const warnings = evalProtocolWarnings.get(m.run_id);
                    return (
                      <button key={m.run_id} onClick={() => {
                        setEvalSelectedModels((prev) => {
                          const next = new Set(prev);
                          if (!prev.size) { modelRegistry.forEach((_, j) => { if (j !== i) next.add(j); }); }
                          else if (next.has(i)) next.delete(i); else next.add(i);
                          if (next.size === modelRegistry.length) return new Set();
                          return next;
                        });
                      }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] border transition-all ${selected ? "bg-zinc-800 border-zinc-600 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: selected ? CHART_COLORS[i % CHART_COLORS.length] : "#3f3f46" }} />
                        <span className="font-semibold">{m.modelLabel}</span>
                        {evalChampionIdx === i && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Champion</span>}
                        {warnings && <AlertTriangle size={10} className="text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
                {/* Protocol Card */}
                {evalProtocolLocked && evalProtocol && (
                  <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-[10px] text-zinc-400 flex items-center gap-4 flex-wrap">
                    <span className="text-zinc-500 font-semibold">Protocol:</span>
                    <span>Target: <strong className="text-zinc-300">{evalProtocol.target.toUpperCase()}</strong></span>
                    <span>Split: <strong className="text-zinc-300">{evalProtocol.splitStrategy}</strong></span>
                    <span>Features: <strong className="text-zinc-300">{evalProtocol.featureSetHash.split("|").length} cols</strong></span>
                    <span>Dataset: <strong className="text-zinc-300">{evalProtocol.datasetSize} rows</strong></span>
                    <span>Leakage: <strong className={evalProtocol.leakageEnabled ? "text-red-400" : "text-zinc-300"}>{evalProtocol.leakageEnabled ? "ON" : "off"}</strong></span>
                    {[...evalProtocolWarnings.entries()].length > 0 && (
                      <span className="text-amber-400 ml-auto"><AlertTriangle size={10} className="inline mr-1" />{[...evalProtocolWarnings.entries()].length} model(s) mismatch protocol</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Top-K Slider ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <h4 className="text-sm font-bold text-zinc-200">Top-K %</h4>
                  <input type="range" min={1} max={50} value={evalTopKSlider} onChange={(e) => setEvalTopKSlider(Number(e.target.value))} className="flex-1 accent-cyan-500 h-1.5" />
                  <span className="text-lg font-bold text-cyan-400 font-mono w-16 text-right">{evalTopKSlider}%</span>
                </div>
                {/* Metric cards for all selected models at K */}
                <div className="mt-3 space-y-1.5">
                  {evalModels.map((m, mi) => {
                    const point = m.liftCurve.reduce((best, p) => Math.abs(p.topPercent - evalTopKSlider) < Math.abs(best.topPercent - evalTopKSlider) ? p : best, m.liftCurve[0]);
                    if (!point) return null;
                    return (
                      <div key={m.run_id} className="flex items-center gap-2 bg-zinc-800/30 rounded-lg px-3 py-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[modelRegistry.indexOf(m) % CHART_COLORS.length] }} />
                        <span className="text-[11px] font-semibold text-zinc-300 w-36 truncate">{m.modelLabel}</span>
                        <div className="flex gap-4 text-[11px] font-mono flex-1">
                          <span className="text-zinc-500">K={point.k}</span>
                          <span className="text-emerald-400">Lift {point.lift}×</span>
                          <span className="text-blue-400">P@K {(point.precision * 100).toFixed(1)}%</span>
                          <span className="text-amber-400">R@K {(point.recall * 100).toFixed(1)}%</span>
                          <span className="text-purple-400">Value {(point.valueCaptured * 100).toFixed(1)}%</span>
                          <span className="text-zinc-500">AULC {computeAULC(m.liftCurve)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 2. Side-by-Side Overlay Charts ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* A. Lift Curve Overlay */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-bold text-zinc-200">Lift Curve</h4>
                    <ChartTip label="Lift (×) vs Top-K%" tip="Lift = (value captured by top K%) / (value captured by random K%). A lift of 3× at 10% means the model's top 10% captures 3× more value than random selection." />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="topPercent" type="number" domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: unknown) => [`${Number(v).toFixed(2)}×`, "Lift"]}
                        labelFormatter={(l) => `Top ${l}%`} />
                      {evalModels.map((m) => {
                        const ci = modelRegistry.indexOf(m);
                        return <Line key={m.run_id} data={m.liftCurve} type="monotone" dataKey="lift" stroke={CHART_COLORS[ci % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} name={`${m.modelLabel} (Lift ×)`} />;
                      })}
                      {/* Random baseline = 1 */}
                      <Line data={[{ topPercent: 0, lift: 1 }, { topPercent: 100, lift: 1 }]} type="linear" dataKey="lift" stroke="#71717a" strokeDasharray="5 5" strokeWidth={1} dot={false} name="Random" />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* B. Value Captured @K Overlay */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-bold text-zinc-200">Value Captured @K</h4>
                    <ChartTip label="% of total revenue" tip="% of total revenue captured when targeting only the top K% of users ranked by the model. Higher = model concentrates high-value users better." />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="topPercent" type="number" domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: unknown) => [`${(Number(v) * 100).toFixed(1)}%`, "Revenue Captured"]}
                        labelFormatter={(l) => `Top ${l}%`} />
                      {evalModels.map((m) => {
                        const ci = modelRegistry.indexOf(m);
                        return <Line key={m.run_id} data={m.liftCurve} type="monotone" dataKey="valueCaptured" stroke={CHART_COLORS[ci % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} name={`${m.modelLabel} (% rev)`} />;
                      })}
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* B2. Precision & Recall @K Overlay */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-zinc-200">Precision & Recall @K</h4>
                    <ChartTip label="Solid = Precision, Dashed = Recall" tip="Precision@K = % of top-K users who are truly high-value. Recall@K = % of all high-value users captured in top-K. Solid lines = Precision, Dashed = Recall." />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="topPercent" type="number" domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: unknown) => `${(Number(v) * 100).toFixed(1)}%`} />
                      {evalModels.map((m) => {
                        const ci = modelRegistry.indexOf(m);
                        return <Line key={`p_${m.run_id}`} data={m.liftCurve} type="monotone" dataKey="precision" stroke={CHART_COLORS[ci % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} name={`${m.modelLabel} (Precision)`} />;
                      })}
                      {evalModels.map((m) => {
                        const ci = modelRegistry.indexOf(m);
                        return <Line key={`r_${m.run_id}`} data={m.liftCurve} type="monotone" dataKey="recall" stroke={CHART_COLORS[ci % CHART_COLORS.length]} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2 }} name={`${m.modelLabel} (Recall)`} />;
                      })}
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* C. Calibration */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><h4 className="text-sm font-bold text-zinc-200">Calibration</h4><ChartTip label="" tip="Calibration measures how closely predicted LTV ($) matches actual LTV ($) per decile. Decile Bars show pred vs actual for one model; Error Trend compares calibration error across models." /></div>
                    <div className="flex gap-1">
                      {(["bars", "error"] as const).map((mode) => (
                        <button key={mode} onClick={() => setEvalCalibMode(mode)}
                          className={`px-2 py-0.5 text-[10px] rounded ${evalCalibMode === mode ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>
                          {mode === "bars" ? "Decile Bars" : "Error Trend"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {evalCalibMode === "bars" ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={(evalModels[evalScatterModelIdx] || evalModels[0])?.calibration || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="bucket" tick={{ fill: "#71717a", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} />
                        <Bar dataKey="predicted" fill="#3b82f6" name="Predicted Avg LTV ($)" />
                        <Bar dataKey="actual" fill="#10b981" name="Actual Avg LTV ($)" />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="space-y-1">
                      {evalModels.map((m) => {
                        const ci = modelRegistry.indexOf(m);
                        return (
                          <div key={m.run_id} className="flex items-center gap-2 text-[11px]">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] }} />
                            <span className="text-zinc-400 w-36 truncate">{m.modelLabel}</span>
                            <div className="flex-1 bg-zinc-800 rounded-full h-3 relative overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.calibrationError * 5)}%`, backgroundColor: CHART_COLORS[ci % CHART_COLORS.length], opacity: 0.7 }} />
                            </div>
                            <span className="font-mono text-amber-400 w-14 text-right">${m.calibrationError}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* D. Predicted vs Actual — small multiples */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><h4 className="text-sm font-bold text-zinc-200">Predicted vs Actual</h4><ChartTip label="" tip="Each dot is a test user. X = actual LTV ($), Y = predicted LTV ($). Points near the diagonal = well-calibrated. Clusters far off = systematic over/under-prediction." /></div>
                    <div className="flex gap-1">
                      {evalModels.map((m, mi) => (
                        <button key={m.run_id} onClick={() => setEvalScatterModelIdx(mi)}
                          className={`px-2 py-0.5 text-[10px] rounded ${evalScatterModelIdx === mi ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-400"}`}>
                          {m.modelLabel.slice(0, 12)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="actual" name="Actual LTV ($)" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                      <YAxis dataKey="predicted" name="Predicted LTV ($)" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} />
                      <Scatter data={(evalModels[evalScatterModelIdx] || evalModels[0])?.testPredictions.slice(0, 300) || []}
                        fill={CHART_COLORS[modelRegistry.indexOf(evalModels[evalScatterModelIdx] || evalModels[0]) % CHART_COLORS.length]} fillOpacity={0.5}
                        name="Test Users" />
                    </ScatterChart>
                  </ResponsiveContainer>
                  {/* Residual summary */}
                  {(() => {
                    const sm = evalModels[evalScatterModelIdx] || evalModels[0];
                    if (!sm) return null;
                    const overPct = computeOverpredictionRate(sm.testPredictions);
                    return (
                      <div className="flex gap-3 mt-2 text-[10px] text-zinc-500">
                        <span>MAE: <strong className="text-zinc-300">${sm.mae}</strong></span>
                        <span>RMSE: <strong className="text-zinc-300">${sm.rmse}</strong></span>
                        <span>R²: <strong className="text-zinc-300">{sm.r2}</strong></span>
                        <span>Overpredict {">"}50%: <strong className={overPct > 0.3 ? "text-red-400" : "text-zinc-300"}>{(overPct * 100).toFixed(1)}%</strong></span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── 3. Model Comparator Table ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><BarChart3 size={14} className="text-purple-400" />Model Comparator</h4>
                  {evalChampionIdx !== null && (
                    <span className="text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">Champion vs Challenger mode</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead><tr className="border-b border-zinc-800">
                      <th className="px-1.5 py-1.5 text-left text-zinc-600 text-[10px]">⭐</th>
                      <th className="px-1.5 py-1.5 text-left text-zinc-500">Model</th>
                      <th className="px-1.5 py-1.5 text-left text-zinc-600 text-[9px]">Run ID</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-600 text-[9px]">Target</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-600 text-[9px]">Split</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-600 text-[9px]">Leakage</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">Spearman</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">Lift@K</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">P@K</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">R@K</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">Value@K</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">AULC</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">R²</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">Calib Err</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">OverPred</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">Inf. ms</th>
                      <th className="px-1.5 py-1.5 text-right text-zinc-500">Coverage</th>
                      <th className="px-1.5 py-1.5 text-center text-zinc-500">Explain</th>
                    </tr></thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {evalModels.map((m, mi) => {
                        const regIdx = modelRegistry.indexOf(m);
                        const pk = m.liftCurve.reduce((best, p) => Math.abs(p.topPercent - evalTopKSlider) < Math.abs(best.topPercent - evalTopKSlider) ? p : best, m.liftCurve[0]);
                        const aulc = computeAULC(m.liftCurve);
                        const overPred = computeOverpredictionRate(m.testPredictions);
                        const infCost = estimateInferenceCost(m);
                        const coverage = computeCoverage(featureMatrix, m.features);
                        const isChampion = evalChampionIdx === regIdx;
                        const champModel = evalChampionIdx !== null ? modelRegistry[evalChampionIdx] : null;
                        const warnings = evalProtocolWarnings.get(m.run_id);

                        // For champion-vs-challenger coloring
                        const cellColor = (val: number, champVal: number | undefined, higherBetter: boolean) => {
                          if (champVal === undefined || isChampion) return "text-zinc-300";
                          const diff = higherBetter ? val - champVal : champVal - val;
                          return diff > 0.01 ? "text-green-400" : diff < -0.01 ? "text-red-400" : "text-zinc-300";
                        };
                        const champPk = champModel?.liftCurve.reduce((best, p) => Math.abs(p.topPercent - evalTopKSlider) < Math.abs(best.topPercent - evalTopKSlider) ? p : best, champModel.liftCurve[0]);

                        return (
                          <tr key={m.run_id} className={`hover:bg-zinc-800/30 ${isChampion ? "bg-yellow-500/5" : ""}`}>
                            <td className="px-1.5 py-1">
                              <button onClick={() => setEvalChampionIdx(isChampion ? null : regIdx)} className={`text-[10px] ${isChampion ? "text-yellow-400" : "text-zinc-700 hover:text-zinc-500"}`} title="Set as champion">
                                {isChampion ? "★" : "☆"}
                              </button>
                            </td>
                            <td className="px-1.5 py-1">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[regIdx % CHART_COLORS.length] }} />
                                <span className="font-semibold text-zinc-200">{m.modelLabel}</span>
                                {warnings && <span className="text-amber-400" title={warnings.join(", ")}><AlertTriangle size={10} /></span>}
                              </div>
                            </td>
                            <td className="px-1.5 py-1 font-mono text-zinc-600 text-[9px]">{m.run_id.slice(0, 12)}</td>
                            <td className="px-1.5 py-1 text-right text-zinc-500 text-[10px]">{m.target}</td>
                            <td className="px-1.5 py-1 text-right text-zinc-500 text-[10px]">{m.splitStrategy}</td>
                            <td className="px-1.5 py-1 text-right">{m.leakageEnabled ? <span className="text-red-400 text-[10px]">⚠ YES</span> : <span className="text-zinc-600 text-[10px]">no</span>}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(m.spearmanCorr, champModel?.spearmanCorr, true)}`}>{m.spearmanCorr}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(pk?.lift ?? 0, champPk?.lift, true)}`}>{pk ? `${pk.lift}×` : "-"}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(pk?.precision ?? 0, champPk?.precision, true)}`}>{pk ? `${(pk.precision * 100).toFixed(1)}%` : "-"}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(pk?.recall ?? 0, champPk?.recall, true)}`}>{pk ? `${(pk.recall * 100).toFixed(1)}%` : "-"}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(pk?.valueCaptured ?? 0, champPk?.valueCaptured, true)}`}>{pk ? `${(pk.valueCaptured * 100).toFixed(1)}%` : "-"}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(aulc, champModel ? computeAULC(champModel.liftCurve) : undefined, true)}`}>{aulc}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(m.r2, champModel?.r2, true)}`}>{m.r2}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${cellColor(m.calibrationError, champModel?.calibrationError, false)}`}>${m.calibrationError}</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${overPred > 0.3 ? "text-red-400" : "text-zinc-400"}`}>{(overPred * 100).toFixed(0)}%</td>
                            <td className="px-1.5 py-1 text-right font-mono text-zinc-400">{infCost}ms</td>
                            <td className={`px-1.5 py-1 text-right font-mono ${coverage < 0.9 ? "text-amber-400" : "text-zinc-400"}`}>{(coverage * 100).toFixed(0)}%</td>
                            <td className="px-1.5 py-1 text-center">
                              {evalChampionIdx !== null && !isChampion && (
                                <button onClick={() => setEvalDeltaModelIdx(evalDeltaModelIdx === regIdx ? null : regIdx)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${evalDeltaModelIdx === regIdx ? "bg-purple-500/20 text-purple-400" : "text-zinc-600 hover:text-zinc-400"}`}>
                                  <Eye size={10} className="inline" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 4A. Explain the Delta ── */}
              {evalChampionIdx !== null && evalDeltaModelIdx !== null && modelRegistry[evalChampionIdx] && modelRegistry[evalDeltaModelIdx] && (
                <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    <Eye size={14} className="text-purple-400" />
                    Delta: <span className="text-yellow-400">{modelRegistry[evalChampionIdx].modelLabel}</span> vs <span className="text-purple-400">{modelRegistry[evalDeltaModelIdx].modelLabel}</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Feature Importance Delta */}
                    <div>
                      <h5 className="text-[11px] font-semibold text-zinc-400 mb-1.5">Feature Importance Shift</h5>
                      <div className="space-y-0.5">
                        {computeFeatureImportanceDelta(modelRegistry[evalChampionIdx], modelRegistry[evalDeltaModelIdx]).slice(0, 8).map((fi) => (
                          <div key={fi.feature} className="flex items-center gap-2 text-[10px]">
                            <span className="text-zinc-500 w-28 truncate font-mono">{fi.feature}</span>
                            <div className="flex-1 flex items-center gap-1">
                              <div className="w-12 text-right font-mono text-zinc-500">{(fi.impA * 100).toFixed(1)}%</div>
                              <span className={fi.delta > 0 ? "text-green-400" : fi.delta < 0 ? "text-red-400" : "text-zinc-600"}>→</span>
                              <div className="w-12 font-mono text-zinc-300">{(fi.impB * 100).toFixed(1)}%</div>
                              <span className={`font-mono text-[9px] ${fi.delta > 0 ? "text-green-400" : fi.delta < 0 ? "text-red-400" : "text-zinc-600"}`}>
                                ({fi.delta > 0 ? "+" : ""}{(fi.delta * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Lift Delta by K-slice */}
                    <div>
                      <h5 className="text-[11px] font-semibold text-zinc-400 mb-1.5">Lift Delta by Top-K</h5>
                      <div className="space-y-0.5">
                        {computeLiftDelta(modelRegistry[evalChampionIdx], modelRegistry[evalDeltaModelIdx]).map((ld) => (
                          <div key={ld.topPercent} className="flex items-center gap-2 text-[10px]">
                            <span className="text-zinc-500 w-12 font-mono">@{ld.topPercent}%</span>
                            <span className="font-mono text-zinc-500 w-10 text-right">{ld.liftA}×</span>
                            <span className="text-zinc-600">→</span>
                            <span className="font-mono text-zinc-300 w-10">{ld.liftB}×</span>
                            <div className="flex-1 flex items-center">
                              <div className={`h-2 rounded ${ld.delta > 0 ? "bg-green-500" : "bg-red-500"}`}
                                style={{ width: `${Math.min(100, Math.abs(ld.delta) * 30)}%` }} />
                            </div>
                            <span className={`font-mono text-[9px] w-12 text-right ${ld.delta > 0 ? "text-green-400" : ld.delta < 0 ? "text-red-400" : "text-zinc-600"}`}>
                              {ld.delta > 0 ? "+" : ""}{ld.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 4C. Decision Recommendations ── */}
              {evalRecommendations.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2 mb-2"><Sparkles size={14} className="text-amber-400" />Decision Recommendations</h4>
                  <div className="space-y-2">
                    {evalRecommendations.map((rec, ri) => (
                      <div key={ri} className="flex items-start gap-3 bg-zinc-800/40 rounded-lg px-3 py-2">
                        <div className="w-2.5 h-2.5 mt-1 rounded-full" style={{ backgroundColor: CHART_COLORS[modelRegistry.indexOf(evalModels[rec.modelIdx]) % CHART_COLORS.length] }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-zinc-200">{evalModels[rec.modelIdx]?.modelLabel}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold">{rec.badge}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{rec.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(2)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
            <button onClick={() => setActiveStep(4)} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-500">Next: Activation Sim <ArrowRight size={14} /></button>
          </div>
        </div>
      )}

      {/* ═══ Step 5: Online Activation Simulator ═══ */}
      {activeStep === 4 && (
        <div className="space-y-3">
          <InfoBanner title="Step 5 — Online Activation Simulator" variant="info">
            <p>Simulate sending Top-K users to an ad network. Select one or many models, configure CPI, delivery rate, revenue multiplier, and conversion noise to compare how models perform under real-world conditions.</p>
          </InfoBanner>

          {!modelRegistry.length ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Train a model in <button onClick={() => setActiveStep(2)} className="text-cyan-400 underline">Step 3</button> first.</p>
            </div>
          ) : (
            <>
              {/* Model Selector */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Users size={14} className="text-cyan-400" />Models to Activate</h4>
                <div className="flex flex-wrap gap-2">
                  {modelRegistry.map((m, i) => {
                    const selected = !actSelectedModels.size || actSelectedModels.has(i);
                    return (
                      <button key={m.run_id} onClick={() => {
                        setActSelectedModels((prev) => {
                          const next = new Set(prev);
                          if (!prev.size) { modelRegistry.forEach((_, j) => { if (j !== i) next.add(j); }); }
                          else if (next.has(i)) next.delete(i); else next.add(i);
                          if (next.size === modelRegistry.length) return new Set();
                          return next;
                        });
                      }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] border transition-all ${selected ? "bg-zinc-800 border-zinc-600 text-zinc-200" : "border-zinc-800 text-zinc-600"}`}>
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: selected ? CHART_COLORS[i % CHART_COLORS.length] : "#3f3f46" }} />
                        <span className="font-semibold">{m.modelLabel}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-zinc-500">{actSelectedModels.size ? actSelectedModels.size : modelRegistry.length} model(s) selected — all will be activated on Send Seeds</p>
              </div>

              {/* Config */}
              <div className="grid grid-cols-6 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500 mb-1">Top-K %</div>
                  <input type="number" value={actTopK} onChange={(e) => setActTopK(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[13px] text-zinc-200 font-mono" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500 mb-1">CPI ($)</div>
                  <input type="number" step={0.1} value={actConfig.cpi} onChange={(e) => setActConfig((c) => ({ ...c, cpi: Number(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[13px] text-zinc-200 font-mono" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500 mb-1">Revenue Multiplier</div>
                  <input type="number" step={0.1} value={actConfig.revenueMultiplier} onChange={(e) => setActConfig((c) => ({ ...c, revenueMultiplier: Number(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[13px] text-zinc-200 font-mono" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500 mb-1">Conversion Noise</div>
                  <input type="number" step={0.05} min={0} max={1} value={actConfig.conversionNoise} onChange={(e) => setActConfig((c) => ({ ...c, conversionNoise: Number(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[13px] text-zinc-200 font-mono" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500 mb-1">Delivery Rate</div>
                  <input type="number" step={0.05} min={0} max={1} value={actConfig.deliveryRate} onChange={(e) => setActConfig((c) => ({ ...c, deliveryRate: Number(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[13px] text-zinc-200 font-mono" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleRunActivation} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 text-white text-[13px] font-semibold rounded-lg hover:bg-cyan-500">
                    <Zap size={14} /> Send Seeds
                  </button>
                </div>
              </div>

              {/* Activation Contract Table */}
              {actRuns.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-zinc-200 mb-2">Activation Contract Table</h4>
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-zinc-800">
                      <th className="px-2 py-1.5 text-left text-zinc-500">run_id</th>
                      <th className="px-2 py-1.5 text-left text-zinc-500">model</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">topK</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">users_sent</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">delivered</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">cost ($)</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">revenue_90d ($)</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">ROI (%)</th>
                      <th className="px-2 py-1.5 text-right text-zinc-500">profit ($)</th>
                    </tr></thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {actRuns.map((r) => (
                        <tr key={r.run_id} className="hover:bg-zinc-800/30">
                          <td className="px-2 py-1 font-mono text-zinc-500">{r.run_id.slice(0, 16)}</td>
                          <td className="px-2 py-1 text-zinc-300">{r.model_label}</td>
                          <td className="px-2 py-1 text-right font-mono text-zinc-300">{r.topK}</td>
                          <td className="px-2 py-1 text-right font-mono text-zinc-400">{r.users_sent.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-mono text-zinc-400">{r.users_delivered.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-mono text-red-400">${r.cost.toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-mono text-emerald-400">${r.revenue_90d.toLocaleString()}</td>
                          <td className={`px-2 py-1 text-right font-mono font-bold ${r.roi >= 0 ? "text-green-400" : "text-red-400"}`}>{(r.roi * 100).toFixed(1)}%</td>
                          <td className={`px-2 py-1 text-right font-mono font-bold ${r.profit >= 0 ? "text-green-400" : "text-red-400"}`}>${r.profit.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Revenue Curve — overlay latest batch of runs */}
              {actRuns.length > 0 && (() => {
                const latestBatchTs = actRuns[0].run_id;
                const batchPrefix = latestBatchTs.slice(0, 13);
                const latestBatch = actRuns.filter((r) => r.run_id.startsWith(batchPrefix));
                return latestBatch.some((r) => r.revenueCurve.length > 0) ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-bold text-zinc-200">Cumulative Revenue Curve</h4>
                      <ChartTip label="$ over 90 days" tip="Cumulative revenue ($) over 90 days per model. Revenue accrues faster in early days and tapers off. Compare curves to see which model generates value fastest." />
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="day" type="number" domain={[0, 90]} tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `D${v}`} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, "Revenue"]}
                          labelFormatter={(l) => `Day ${l}`} />
                        {latestBatch.filter((r) => r.revenueCurve.length > 0).map((r, ri) => (
                          <Line key={r.run_id} data={r.revenueCurve} type="monotone" dataKey="revenue"
                            stroke={CHART_COLORS[ri % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 1.5 }}
                            name={`${r.model_label} ($)`} />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null;
              })()}
            </>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(3)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
            <button onClick={() => { setActiveStep(5); handleComputeEconomic(); }} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-500">Next: Economic Impact <ArrowRight size={14} /></button>
          </div>
        </div>
      )}

      {/* ═══ Step 6: Economic Impact Dashboard ═══ */}
      {activeStep === 5 && (
        <div className="space-y-3">
          <InfoBanner title="Step 6 — Economic Impact Dashboard" variant="info">
            <p>See how model selection translates to real economic outcomes. Best offline ranking ≠ best economic decision. Explore uplift vs baseline, ROAS curve, and budget efficiency.</p>
          </InfoBanner>

          {!activeModel ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">Train a model and run activation first.</p>
            </div>
          ) : (
            <>
              {!ecoData.length && (
                <button onClick={handleComputeEconomic} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
                  <Play size={14} /> Compute Economic Impact
                </button>
              )}

              {ecoData.length > 0 && (
                <>
                  {/* Top-K % vs Profit */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-bold text-zinc-200">Top-K % vs Profit</h4>
                      <ChartTip label="Profit ($) by targeting depth" tip="Net profit ($) = Revenue − Cost at each targeting depth. Green = profitable, Red = loss. Wider targeting dilutes signal quality." />
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ecoData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="topKPercent" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, "Profit"]}
                          labelFormatter={(l) => `Top ${l}%`} />
                        <Bar dataKey="profit" name="Profit ($)">
                          {ecoData.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? "#10b981" : "#ef4444"} />)}
                        </Bar>
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* ROAS Curve */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-bold text-zinc-200">ROAS Curve</h4>
                        <ChartTip label="Revenue / Cost (×)" tip="Return On Ad Spend = Revenue / Cost. ROAS > 1× means profitable. Higher ROAS at smaller K% means the model concentrates value in the top slice." />
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={ecoData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="topKPercent" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(1)}×`} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                            formatter={(v: unknown) => [`${Number(v).toFixed(2)}×`, "ROAS"]}
                            labelFormatter={(l) => `Top ${l}%`} />
                          <Line type="monotone" dataKey="roas" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="ROAS (×)" />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Uplift vs Baseline */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-bold text-zinc-200">Uplift vs Random Baseline</h4>
                        <ChartTip label="% improvement over random" tip="% revenue improvement over random selection at the same K%. Positive = model adds value over random, Negative = model performs worse than random." />
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={ecoData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="topKPercent" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                            formatter={(v: unknown) => [`${(Number(v) * 100).toFixed(1)}%`, "Uplift vs Random"]}
                            labelFormatter={(l) => `Top ${l}%`} />
                          <Bar dataKey="upliftVsBaseline" name="Uplift vs Random (%)">
                            {ecoData.map((d, i) => <Cell key={i} fill={d.upliftVsBaseline >= 0 ? "#06b6d4" : "#ef4444"} />)}
                          </Bar>
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Budget Efficiency Table */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-bold text-zinc-200">Budget Efficiency</h4>
                      <ChartTip label="Economics by K%" tip="Full economic breakdown at each targeting depth. Use this to find the optimal K% that maximizes profit or ROAS for your budget." />
                    </div>
                    <table className="w-full text-[12px]">
                      <thead><tr className="border-b border-zinc-800">
                        <th className="px-2 py-1.5 text-right text-zinc-500">Top-K %</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">K</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">Cost ($)</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">Revenue ($)</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">Profit ($)</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">ROAS (×)</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">Incr. Rev ($)</th>
                        <th className="px-2 py-1.5 text-right text-zinc-500">Uplift (%)</th>
                      </tr></thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {ecoData.map((d) => (
                          <tr key={d.topKPercent} className="hover:bg-zinc-800/30">
                            <td className="px-2 py-1 text-right font-mono text-zinc-300">{d.topKPercent}%</td>
                            <td className="px-2 py-1 text-right font-mono text-zinc-400">{d.k}</td>
                            <td className="px-2 py-1 text-right font-mono text-red-400">${d.cost.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right font-mono text-emerald-400">${d.revenue.toLocaleString()}</td>
                            <td className={`px-2 py-1 text-right font-mono font-bold ${d.profit >= 0 ? "text-green-400" : "text-red-400"}`}>${d.profit.toLocaleString()}</td>
                            <td className="px-2 py-1 text-right font-mono text-amber-400">{d.roas}×</td>
                            <td className="px-2 py-1 text-right font-mono text-cyan-400">${d.incrementalRevenue.toLocaleString()}</td>
                            <td className={`px-2 py-1 text-right font-mono ${d.upliftVsBaseline >= 0 ? "text-green-400" : "text-red-400"}`}>{(d.upliftVsBaseline * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Uplift Model Results */}
              {upliftResult && (
                <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Target size={12} className="text-purple-400" />Uplift Model Results</h4>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center"><div className="text-base font-bold text-purple-400">{upliftResult.treatmentSize}</div><div className="text-[10px] text-zinc-500">Treatment</div></div>
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center"><div className="text-base font-bold text-zinc-400">{upliftResult.controlSize}</div><div className="text-[10px] text-zinc-500">Control</div></div>
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center"><div className="text-base font-bold text-emerald-400">${upliftResult.treatmentAvgLTV}</div><div className="text-[10px] text-zinc-500">Treatment Avg LTV</div></div>
                    <div className="bg-zinc-800/50 rounded-lg p-2 text-center"><div className="text-base font-bold text-cyan-400">${upliftResult.ate}</div><div className="text-[10px] text-zinc-500">ATE (Avg Treatment Effect)</div></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center gap-1 mb-1"><h5 className="text-[11px] font-semibold text-zinc-400">CATE by Decile</h5><ChartTip label="" tip="Conditional Average Treatment Effect by predicted LTV decile. Shows which user segments benefit most from treatment." /></div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={upliftResult.cateByDecile}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="decile" tick={{ fill: "#71717a", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                            formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "CATE"]}
                            labelFormatter={(l) => `Decile ${l}`} />
                          <Bar dataKey="cate" name="CATE ($)">
                            {upliftResult.cateByDecile.map((d, i) => <Cell key={i} fill={d.cate >= 0 ? "#8b5cf6" : "#ef4444"} />)}
                          </Bar>
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1"><h5 className="text-[11px] font-semibold text-zinc-400">Uplift Curve</h5><ChartTip label="" tip="Cumulative uplift ($) when treating the top K% of users by predicted LTV. Decreasing curve = diminishing returns from broader targeting." /></div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={upliftResult.upliftCurve}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="topPercent" tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                            formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "Cumulative Uplift"]}
                            labelFormatter={(l) => `Top ${l}%`} />
                          <Line type="monotone" dataKey="cumulativeUplift" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Cumulative Uplift ($)" />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-start">
            <button onClick={() => setActiveStep(4)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
