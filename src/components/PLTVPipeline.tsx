"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Papa from "papaparse";
import {
  PLTVStep,
  GamePlayer,
  GameEvent,
  PaymentTxn,
  UACost,
  PLTVFeatureRow,
  PLTVModelResult,
  ModelCategory,
  DecisionProblem,
} from "@/lib/types";
import DecisionDataLab from "@/components/DecisionDataLab";
import {
  generateGameData,
  computePLTVFeatures,
  trainPLTVModel,
  buildAudiences,
  simulateROAS,
  parseCSVPlayers,
  parseCSVEvents,
  parseCSVPayments,
  runCleaningPipeline,
  PLTV_FEATURE_META,
  PLTV_NUMERIC_FEATURES,
  AudienceSegment,
  ROASSimRow,
  CleaningReport,
  RawCSVPlayer,
  RawCSVEvent,
  RawCSVPayment,
} from "@/lib/pltv-engine";
import InfoTooltip, { InfoBanner } from "@/components/InfoTooltip";
import {
  type StrategyId, type StrategyDef, type ComparisonResult, type ComparisonInsights,
  getStrategyDefs, runComparison, summarizeInsights, getPresetKValues, ensureLtv90,
  computeOfflineAnalysis,
  type OfflineAnalysisResult,
  simulateActivation,
  type ActivationConfig,
  type ActivationResult,
} from "@/lib/strategy-comparator";
import {
  ArrowRight,
  ArrowLeft,
  Play,
  ChevronRight,
  Database,
  Sparkles,
  Layers,
  Brain,
  Users,
  Shield,
  Zap,
  Target,
  TrendingUp,
  BarChart3,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Swords,
  Save,
  GitBranch,
  Server,
  Clock,
  Hash,
  Settings,
  Crosshair,
  HelpCircle,
  DollarSign,
  ShieldAlert,
  Gem,
  Gamepad2,
  Compass,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// ─── Step definitions ────────────────────────────────────────────────────────

const PLTV_STEPS: { label: string; description: string; icon: React.ReactNode }[] = [
  { label: "Raw Ingestion", description: "Bronze layer", icon: <Database size={14} /> },
  { label: "Clean & Unify", description: "Silver layer", icon: <Sparkles size={14} /> },
  { label: "Feature Store", description: "Gold layer — 6 blocks", icon: <Layers size={14} /> },
  { label: "Training Dataset", description: "D0–D7 → predict D60", icon: <Target size={14} /> },
  { label: "Model Training", description: "Pick problem → train", icon: <Brain size={14} /> },
  { label: "Strategy Comparator", description: "Evaluate LTV90", icon: <Zap size={14} /> },
  { label: "Decisions Lab", description: "Segments → Actions", icon: <Crosshair size={14} /> },
];

// ─── Decision Problems (11 JTBD from the game publishing context) ────────────

const MODEL_CATEGORY_META: Record<ModelCategory, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  value:          { label: "Value",          color: "text-blue-400",   bgColor: "bg-blue-500/15 border-blue-500/30",   icon: <Gem size={12} className="text-blue-400" /> },
  risk:           { label: "Risk",           color: "text-amber-400",  bgColor: "bg-amber-500/15 border-amber-500/30", icon: <ShieldAlert size={12} className="text-amber-400" /> },
  responsiveness: { label: "Responsiveness", color: "text-purple-400", bgColor: "bg-purple-500/15 border-purple-500/30", icon: <Gamepad2 size={12} className="text-purple-400" /> },
  intent:         { label: "Intent / Role",  color: "text-cyan-400",   bgColor: "bg-cyan-500/15 border-cyan-500/30",   icon: <Compass size={12} className="text-cyan-400" /> },
};

const DECISION_PROBLEMS: DecisionProblem[] = [
  // UA
  { id: "UA1", category: "UA", shortLabel: "Bid Optimization", question: "How much should we bid for this cohort?", modelFamily: ["value"], coreFeatures: ["D1/D3/D7 engagement depth", "Early progression velocity", "Session frequency volatility", "Early purchase signals", "UA channel / creative", "Country/device", "Social interaction signals"], activationUsecases: ["Feed pLTV to ads network for Value Optimization", "Adjust tROAS targets", "Adjust bid multiplier"] },
  { id: "UA2", category: "UA", shortLabel: "Channel Budget", question: "Which channel deserves more budget?", modelFamily: ["value", "risk"], coreFeatures: ["Channel tag", "Campaign objective", "Creative type", "Early retention (RR1, RR3)", "Early ARPU trajectory", "Payment conversion delay"], activationUsecases: ["Channel's expected ROAS projection", "Budget reallocation table", "Kill / scale decision matrix"] },
  { id: "UA3", category: "UA", shortLabel: "Campaign Kill", question: "Should we kill this campaign?", modelFamily: ["value", "risk"], coreFeatures: ["CPI vs expected LTV", "Early payer rate", "Early churn risk", "Engagement depth", "Cohort decay speed"], activationUsecases: ["Auto-alert when campaign risk > threshold", "Suggested kill / monitor flag"] },
  // LiveOps
  { id: "LO1", category: "LiveOps", shortLabel: "Offer Targeting", question: "Who should receive what offer?", modelFamily: ["responsiveness", "value"], coreFeatures: ["Purchase cadence", "Historical discount responsiveness", "Price ladder progression", "Currency accumulation pattern", "Inventory depletion rate"], activationUsecases: ["Dynamic offer engine", "Personalized bundle recommendation", "Discount targeting rules"] },
  { id: "LO2", category: "LiveOps", shortLabel: "Push/SMS", question: "Who should get push/SMS?", modelFamily: ["risk"], coreFeatures: ["Session drop trend", "Login gap", "Engagement depth decline", "Guild detachment", "Event inactivity"], activationUsecases: ["CleverTap audience auto-sync", "Risk-tier-based messaging"] },
  { id: "LO3", category: "LiveOps", shortLabel: "Event Boost", question: "Who should get event reward boost?", modelFamily: ["responsiveness"], coreFeatures: ["Past event participation", "Progression bottleneck signals", "Frustration indicators", "Competitive ranking drop"], activationUsecases: ["Engagement Lift Potential scoring", "Targeted event reward multiplier"] },
  { id: "LO4", category: "LiveOps", shortLabel: "Churn Prevention", question: "Who needs churn prevention?", modelFamily: ["risk"], coreFeatures: ["Session variance", "Drop in PvP activity", "Drop in guild interaction", "Time since last milestone", "Purchase pause"], activationUsecases: ["Retention package trigger", "Free bonus currency", "Personalized encouragement"] },
  { id: "LO5", category: "LiveOps", shortLabel: "VIP Program", question: "Who should be invited to VIP program?", modelFamily: ["value"], coreFeatures: ["Early high ARPPU signal", "Rapid price ladder climb", "Competitive ranking", "Social dominance behavior", "Payment frequency acceleration"], activationUsecases: ["VIP invite trigger", "Dedicated CS routing", "Exclusive event access"] },
  // Intent
  { id: "INT1", category: "LiveOps", shortLabel: "Spend Routing", question: "Which shop surface / bundle should this player see first?", modelFamily: ["intent"], coreFeatures: ["Spend category share", "Purchase frequency & recency", "Basket composition", "Screen views by category", "Gacha preview clicks", "Inventory pressure", "Grind fatigue signals"], activationUsecases: ["Personalize shop layout", "Category-aligned bundles", "Tailored promos", "Reduce promo spam"] },
  { id: "INT2", category: "LiveOps", shortLabel: "Content Routing", question: "What content should we spotlight for this player?", modelFamily: ["intent"], coreFeatures: ["Level/milestone velocity", "Quest completion patterns", "Time-in-mode distribution (PvE/PvP/social)", "Session length & cadence", "Preference signals", "Social behavior"], activationUsecases: ["Personalize 'What to do next' panel", "Auto-route to best-fit game mode", "Content-specific event invites", "Adjust onboarding by intent"] },
  { id: "INT3", category: "LiveOps", shortLabel: "Social Ignition", question: "Should we push guild/social actions, and which type?", modelFamily: ["intent"], coreFeatures: ["Invites sent/accepted", "Party join rate", "Guild browse frequency", "Chat frequency", "Co-op sessions", "Network exposure", "Play-style signals"], activationUsecases: ["Recommend best-fit guild", "Trigger 'join guild' mission + reward", "Invite to mentor program", "Route to community channels"] },
];

// ─── Target variable options per model category ──────────────────────────────
const TARGET_VAR_OPTIONS: Record<ModelCategory, { key: string; engineTarget: "ltv_d60" | "ltv_d30"; label: string; desc: string; recommended?: boolean }[]> = {
  value: [
    { key: "ltv_d60", engineTarget: "ltv_d60", label: "LTV D60", desc: "Predicted revenue through day 60", recommended: true },
    { key: "ltv_d30", engineTarget: "ltv_d30", label: "LTV D30", desc: "Predicted revenue through day 30" },
  ],
  risk: [
    { key: "churn_risk_d30", engineTarget: "ltv_d60", label: "Churn Risk D30", desc: "Probability of zero revenue by D30 (inverted LTV)", recommended: true },
    { key: "churn_risk_d7", engineTarget: "ltv_d30", label: "Churn Risk D7", desc: "Early churn signal — zero engagement by D7" },
    { key: "ltv_d60_risk", engineTarget: "ltv_d60", label: "LTV D60 (risk-adjusted)", desc: "Revenue prediction with risk weighting" },
  ],
  responsiveness: [
    { key: "conversion_d14", engineTarget: "ltv_d30", label: "Purchase Conversion D14", desc: "Likelihood of first purchase by day 14", recommended: true },
    { key: "offer_response", engineTarget: "ltv_d60", label: "Offer Response Score", desc: "Predicted response to promotional offers" },
    { key: "engagement_lift", engineTarget: "ltv_d60", label: "Engagement Lift Potential", desc: "Predicted engagement increase from intervention" },
  ],
  intent: [
    { key: "intent_spend", engineTarget: "ltv_d60", label: "Spend Intent", desc: "Predicted spending category & depth", recommended: true },
    { key: "intent_content", engineTarget: "ltv_d30", label: "Content Preference", desc: "Predicted preferred content/game mode" },
    { key: "intent_social", engineTarget: "ltv_d60", label: "Social Intent", desc: "Predicted social engagement propensity" },
  ],
};

const BLOCK_COLORS: Record<string, string> = {
  sessions: "#3b82f6",
  progression: "#8b5cf6",
  economy: "#f59e0b",
  social: "#10b981",
  monetization: "#ef4444",
  acquisition: "#06b6d4",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PLTVPipeline() {
  const [activeStep, setActiveStep] = useState<PLTVStep>(1);
  const [dataGenerated, setDataGenerated] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataSource, setDataSource] = useState<"csv" | "generated" | "uploaded" | null>(null);

  // Synthetic data
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [payments, setPayments] = useState<PaymentTxn[]>([]);
  const [uaCosts, setUACosts] = useState<UACost[]>([]);

  // Features
  const [featureRows, setFeatureRows] = useState<PLTVFeatureRow[]>([]);

  // Feature selection
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([...PLTV_NUMERIC_FEATURES]);
  const [modelTrack, setModelTrack] = useState<"cold" | "warm">("warm");
  const [useLogTarget, setUseLogTarget] = useState(true);
  const [targetVar, setTargetVar] = useState<"ltv_d60" | "ltv_d30">("ltv_d60");

  // Model
  const [modelResult, setModelResult] = useState<PLTVModelResult | null>(null);

  // Audiences
  const [audiences, setAudiences] = useState<AudienceSegment[]>([]);
  const [roasData, setRoasData] = useState<ROASSimRow[]>([]);

  // Cleaning
  const [cleaningReport, setCleaningReport] = useState<CleaningReport | null>(null);
  const [cleaningRan, setCleaningRan] = useState(false);

  // File upload refs
  const eventsFileRef = useRef<HTMLInputElement>(null);
  const playersFileRef = useRef<HTMLInputElement>(null);
  const paymentsFileRef = useRef<HTMLInputElement>(null);

  // Table search & filter state
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerFilterChannel, setPlayerFilterChannel] = useState<string>("all");
  const [playerFilterCountry, setPlayerFilterCountry] = useState<string>("all");
  const [playerFilterOS, setPlayerFilterOS] = useState<string>("all");
  const [playerPage, setPlayerPage] = useState(0);
  const PLAYER_PAGE_SIZE = 25;

  const [eventSearch, setEventSearch] = useState("");
  const [eventFilterName, setEventFilterName] = useState<string>("all");
  const [eventFilterUser, setEventFilterUser] = useState<string>("all");
  const [eventPage, setEventPage] = useState(0);
  const EVENT_PAGE_SIZE = 50;

  // Feature store state
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
  const [featureStoreComputed, setFeatureStoreComputed] = useState(false);
  const [fsSearch, setFsSearch] = useState("");
  const [fsFilterFeature, setFsFilterFeature] = useState<string>("all");
  const [fsPage, setFsPage] = useState(0);
  const FS_PAGE_SIZE = 20;

  // Training dataset state
  const [splitStrategy, setSplitStrategy] = useState<"random" | "temporal">("temporal");
  const [trainSplit, setTrainSplit] = useState(0.7);
  const [valSplit, setValSplit] = useState(0.15);
  const maturityDays = 60;
  const [datasetBuilt, setDatasetBuilt] = useState(false);
  const [trainSet, setTrainSet] = useState<PLTVFeatureRow[]>([]);
  const [valSet, setValSet] = useState<PLTVFeatureRow[]>([]);
  const [testSet, setTestSet] = useState<PLTVFeatureRow[]>([]);
  const [excludedCount, setExcludedCount] = useState(0);
  // Temporal split: assign months to splits
  const [trainMonths, setTrainMonths] = useState<string[]>(["2024-10", "2024-11"]);
  const [valMonths, setValMonths] = useState<string[]>(["2024-12"]);
  const [testMonths, setTestMonths] = useState<string[]>(["2025-01"]);
  // Date range filter
  const [dateFilterStart, setDateFilterStart] = useState<string>("");
  const [dateFilterEnd, setDateFilterEnd] = useState<string>("");
  // Feature-based filters
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterOS, setFilterOS] = useState<string>("all");
  const [filterPayerOnly, setFilterPayerOnly] = useState(false);

  // ─── Model Registry ────────────────────────────────────────────────────
  interface PLTVModelVersion {
    id: number;
    name: string;
    features: string[];
    modelTrack: "cold" | "warm";
    targetVar: string;
    useLogTarget: boolean;
    mae: number;
    rmse: number;
    r2: number;
    topDecileLift: number;
    topDecileCapture: number;
    trainSize: number;
    testSize: number;
    trainingDatasetId: number | null;
    trainingDatasetName: string;
    problemId: string | null;
    modelCategory: ModelCategory;
    result: PLTVModelResult;
    timestamp: number;
  }

  interface PLTVDatasetVersion {
    id: number;
    name: string;
    source: "csv" | "generated" | "uploaded" | null;
    splitRole: "train" | "validation" | "test" | "custom";
    rowCount: number;
    payerRate: number;
    avgLTV: number;
    avgLTV90: number;
    featureRows: PLTVFeatureRow[];
    dateRange: { min: string; max: string } | null;
    filters: string;
    timestamp: number;
  }

  const [modelRegistry, setModelRegistry] = useState<PLTVModelVersion[]>([]);
  const [datasetRegistry, setDatasetRegistry] = useState<PLTVDatasetVersion[]>([]);
  const [scoringModelId, setScoringModelId] = useState<number | null>(null);
  const [scoringDatasetId, setScoringDatasetId] = useState<number | null>(null);
  const [scoringResult, setScoringResult] = useState<{ modelName: string; datasetName: string; scoredUsers: PLTVModelResult["scoredUsers"]; audiences: AudienceSegment[]; roasData: ROASSimRow[]; timestamp: number } | null>(null);

  // Step 4: dataset inspection
  const [inspectDatasetId, setInspectDatasetId] = useState<number | null>(null);
  const [dsInspectSearch, setDsInspectSearch] = useState("");
  const [dsInspectPage, setDsInspectPage] = useState(0);
  const DS_INSPECT_PAGE_SIZE = 20;

  // Step 5: training dataset selection
  const [trainingDatasetId, setTrainingDatasetId] = useState<number | null>(null);

  // Step 6: Strategy Comparator state
  const [scSelectedDatasetIds, setScSelectedDatasetIds] = useState<number[]>([]);
  const [scSelectedStrategies, setScSelectedStrategies] = useState<StrategyId[]>(["model_a", "ltv3d", "ltv7d"]);
  const [scKMode, setScKMode] = useState<"preset" | "manual">("manual");
  const [scManualK, setScManualK] = useState(100);
  const [scComparisonResult, setScComparisonResult] = useState<ComparisonResult | null>(null);
  const [scInsights, setScInsights] = useState<ComparisonInsights | null>(null);
  const [scInsightsExpanded, setScInsightsExpanded] = useState(false);
  const [scOffline, setScOffline] = useState<OfflineAnalysisResult | null>(null);
  const [scActivationConfig, setScActivationConfig] = useState<ActivationConfig>({
    topK: 500,
    budget: 20000,
    baseCPI: 1.6,
    adsSensitivity: 0.6,
  });
  const [scActivationResult, setScActivationResult] = useState<ActivationResult | null>(null);

  // Step 5: Problem selection & model category
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [selectedModelCategory, setSelectedModelCategory] = useState<ModelCategory>("value");
  const [problemSelectorOpen, setProblemSelectorOpen] = useState(true);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("ltv_d60");

  // Step 7: Decision Intelligence — now handled by DecisionDataLab component

  // ─── Auto-load CSVs from public/ on mount ────────────────────────────────

  useEffect(() => {
    if (dataGenerated) return;
    setIsLoadingData(true);

    Promise.all([
      fetch("/game-players.csv").then((r) => r.text()),
      fetch("/game-events.csv").then((r) => r.text()),
      fetch("/game-payments.csv").then((r) => r.text()),
    ])
      .then(([playersCsv, eventsCsv, paymentsCsv]) => {
        const parsedPlayers = Papa.parse<RawCSVPlayer>(playersCsv, { header: true, skipEmptyLines: true });
        const parsedEvents = Papa.parse<RawCSVEvent>(eventsCsv, { header: true, skipEmptyLines: true });
        const parsedPayments = Papa.parse<RawCSVPayment>(paymentsCsv, { header: true, skipEmptyLines: true });

        const typedPlayers = parseCSVPlayers(parsedPlayers.data);
        const typedEvents = parseCSVEvents(parsedEvents.data);
        const typedPayments = parseCSVPayments(parsedPayments.data);

        setPlayers(typedPlayers);
        setEvents(typedEvents);
        setPayments(typedPayments);
        setDataGenerated(true);
        setDataSource("csv");

        const features = computePLTVFeatures(typedPlayers, typedEvents, typedPayments);
        setFeatureRows(features);
      })
      .catch((err) => {
        console.warn("CSV auto-load failed, will use in-memory generation:", err);
      })
      .finally(() => setIsLoadingData(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleGenerateData = useCallback(() => {
    const data = generateGameData();
    setPlayers(data.players);
    setEvents(data.events);
    setPayments(data.payments);
    setUACosts(data.uaCosts);
    setDataGenerated(true);
    setDataSource("generated");

    const features = computePLTVFeatures(data.players, data.events, data.payments);
    setFeatureRows(features);
  }, []);

  const handleUploadCSVs = useCallback((playersFile: File | null, eventsFile: File | null, paymentsFile: File | null) => {
    if (!eventsFile || !playersFile) return;
    setIsLoadingData(true);

    const readFile = (file: File): Promise<string> =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });

    Promise.all([
      readFile(playersFile),
      readFile(eventsFile),
      paymentsFile ? readFile(paymentsFile) : Promise.resolve(""),
    ]).then(([pCsv, eCsv, pmCsv]) => {
      const typedPlayers = parseCSVPlayers(Papa.parse<RawCSVPlayer>(pCsv, { header: true, skipEmptyLines: true }).data);
      const typedEvents = parseCSVEvents(Papa.parse<RawCSVEvent>(eCsv, { header: true, skipEmptyLines: true }).data);
      const typedPayments = pmCsv
        ? parseCSVPayments(Papa.parse<RawCSVPayment>(pmCsv, { header: true, skipEmptyLines: true }).data)
        : [];

      setPlayers(typedPlayers);
      setEvents(typedEvents);
      setPayments(typedPayments);
      setDataGenerated(true);
      setDataSource("uploaded");

      const features = computePLTVFeatures(typedPlayers, typedEvents, typedPayments);
      setFeatureRows(features);
      setIsLoadingData(false);
    });
  }, []);

  const handleTrain = useCallback(() => {
    // Use selected training dataset from registry, fallback to featureRows
    const trainDs = trainingDatasetId ? datasetRegistry.find((d) => d.id === trainingDatasetId) : null;
    const rows = trainDs ? trainDs.featureRows : featureRows;
    if (rows.length === 0) return;
    const result = trainPLTVModel(rows, selectedFeatures, {
      testSplit: 0.2,
      target: targetVar,
      useLogTarget,
      modelTrack,
    });
    setModelResult(result);

    // Build audiences and ROAS
    const auds = buildAudiences(result.scoredUsers);
    setAudiences(auds);
    const roas = simulateROAS(result.scoredUsers, uaCosts);
    setRoasData(roas);
  }, [trainingDatasetId, datasetRegistry, featureRows, selectedFeatures, targetVar, useLogTarget, modelTrack, uaCosts]);

  const handleSaveModel = useCallback(() => {
    if (!modelResult) return;
    const trainDs = trainingDatasetId ? datasetRegistry.find((d) => d.id === trainingDatasetId) : null;
    const version: PLTVModelVersion = {
      id: modelRegistry.length + 1,
      name: `v${modelRegistry.length + 1} — ${modelTrack} / ${selectedFeatures.length}F / R²=${modelResult.r2}`,
      features: [...selectedFeatures],
      modelTrack,
      targetVar,
      useLogTarget,
      mae: modelResult.mae,
      rmse: modelResult.rmse,
      r2: modelResult.r2,
      topDecileLift: modelResult.topDecileLift,
      topDecileCapture: modelResult.topDecileCapture,
      trainSize: modelResult.trainSize,
      testSize: modelResult.testSize,
      trainingDatasetId: trainingDatasetId,
      trainingDatasetName: trainDs?.name ?? "—",
      problemId: selectedProblemId,
      modelCategory: selectedModelCategory,
      result: modelResult,
      timestamp: Date.now(),
    };
    setModelRegistry((prev) => [...prev, version]);
  }, [modelResult, modelRegistry.length, modelTrack, selectedFeatures, targetVar, useLogTarget, trainingDatasetId, datasetRegistry, selectedProblemId, selectedModelCategory]);

  const handleRunScoring = useCallback(() => {
    const model = modelRegistry.find((m) => m.id === scoringModelId);
    const dataset = datasetRegistry.find((d) => d.id === scoringDatasetId);
    if (!model || !dataset) return;
    // Re-run training on the selected dataset with the saved model's config
    const result = trainPLTVModel(dataset.featureRows, model.features, {
      testSplit: 0.0, // Score all rows — this is inference, not training
      target: model.targetVar as "ltv_d60" | "ltv_d30",
      useLogTarget: model.useLogTarget,
      modelTrack: model.modelTrack,
    });
    const auds = buildAudiences(result.scoredUsers);
    const roas = simulateROAS(result.scoredUsers, uaCosts);
    setScoringResult({
      modelName: model.name,
      datasetName: dataset.name,
      scoredUsers: result.scoredUsers,
      audiences: auds,
      roasData: roas,
      timestamp: Date.now(),
    });
  }, [scoringModelId, scoringDatasetId, modelRegistry, datasetRegistry, uaCosts]);

  // ─── Strategy Comparator: run comparison ────────────────────────────
  const handleRunComparison = useCallback(() => {
    if (scSelectedDatasetIds.length === 0) return;
    
    // Combine all selected datasets
    const allRows: PLTVFeatureRow[] = [];
    const datasetNames: string[] = [];
    let totalUsers = 0;
    let totalLtv90 = 0;
    
    for (const dsId of scSelectedDatasetIds) {
      const ds = datasetRegistry.find((d) => d.id === dsId);
      if (!ds) continue;
      allRows.push(...ds.featureRows);
      datasetNames.push(ds.name);
      totalUsers += ds.rowCount;
      totalLtv90 += ds.avgLTV90 * ds.rowCount;
    }
    
    if (allRows.length === 0) return;

    // Build Model A scores: use the first saved model, or train on-the-fly
    const modelAScores = new Map<string, number>();
    if (modelRegistry.length > 0) {
      // Score using the first model in registry
      const model = modelRegistry[0];
      const result = trainPLTVModel(allRows, model.features, {
        testSplit: 0.0,
        target: model.targetVar as "ltv_d60" | "ltv_d30",
        useLogTarget: model.useLogTarget,
        modelTrack: model.modelTrack,
      });
      for (const u of result.scoredUsers) {
        modelAScores.set(u.game_user_id, u.pltv_pred);
      }
    } else {
      // Fallback: train with defaults
      const result = trainPLTVModel(allRows, [...PLTV_NUMERIC_FEATURES], {
        testSplit: 0.0,
        target: "ltv_d60",
        useLogTarget: true,
        modelTrack: "warm",
      });
      for (const u of result.scoredUsers) {
        modelAScores.set(u.game_user_id, u.pltv_pred);
      }
    }

    const allDefs = getStrategyDefs(modelAScores);
    const selectedDefs = allDefs.filter((d) => scSelectedStrategies.includes(d.id));
    if (selectedDefs.length === 0) return;

    // K values
    let kValues: number[];
    if (scKMode === "preset") {
      kValues = getPresetKValues(allRows.length).map((p) => p.k);
    } else {
      kValues = [Math.min(scManualK, allRows.length)];
    }

    // Use first dataset ID for compatibility, but update name to reflect multiple datasets
    const firstDsId = scSelectedDatasetIds[0];
    const combinedName = datasetNames.length === 1 ? datasetNames[0] : `${datasetNames.length} datasets combined`;
    const result = runComparison(allRows, selectedDefs, kValues, firstDsId, combinedName);
    
    // Update result to reflect actual total users and avg LTV
    const updatedResult = {
      ...result,
      totalUsers: allRows.length,
      avgLtv90: totalUsers > 0 ? Math.round((totalLtv90 / totalUsers) * 100) / 100 : 0,
      datasetName: combinedName
    };
    
    setScComparisonResult(updatedResult);
    const insights = summarizeInsights(updatedResult);
    setScInsights(insights);

    const offlineK = (scKMode === "manual")
      ? Math.min(scManualK, allRows.length)
      : (kValues.length > 0 ? kValues[Math.floor(kValues.length / 2)] : Math.min(500, allRows.length));
    const offline = computeOfflineAnalysis(allRows, allDefs, scSelectedStrategies, offlineK);
    setScOffline(offline);
    setScActivationResult(null);
  }, [scSelectedDatasetIds, scSelectedStrategies, scKMode, scManualK, datasetRegistry, modelRegistry]);

  const handleSendActivation = useCallback(() => {
    if (scSelectedDatasetIds.length === 0) return;
    const dsId = scSelectedDatasetIds[0];
    const ds = datasetRegistry.find((d) => d.id === dsId);
    if (!ds) return;
    const rows = ds.featureRows;
    if (rows.length === 0) return;

    // Rebuild defs so activation uses the exact same scores as the current comparator run
    const modelAScores = new Map<string, number>();
    if (modelRegistry.length > 0) {
      const model = modelRegistry[0];
      const result = trainPLTVModel(rows, model.features, {
        testSplit: 0.0,
        target: model.targetVar as "ltv_d60" | "ltv_d30",
        useLogTarget: model.useLogTarget,
        modelTrack: model.modelTrack,
      });
      for (const u of result.scoredUsers) modelAScores.set(u.game_user_id, u.pltv_pred);
    } else {
      const result = trainPLTVModel(rows, [...PLTV_NUMERIC_FEATURES], {
        testSplit: 0.0,
        target: "ltv_d60",
        useLogTarget: true,
        modelTrack: "warm",
      });
      for (const u of result.scoredUsers) modelAScores.set(u.game_user_id, u.pltv_pred);
    }

    const defs = getStrategyDefs(modelAScores);
    const offline = scOffline ?? computeOfflineAnalysis(
      rows,
      defs,
      scSelectedStrategies,
      Math.min(typeof scActivationConfig.topK === "number" ? Math.round(scActivationConfig.topK) : 500, rows.length),
    );
    setScOffline(offline);

    const activation = simulateActivation(rows, defs, scSelectedStrategies, scActivationConfig, offline);
    setScActivationResult(activation);
  }, [scSelectedDatasetIds, datasetRegistry, modelRegistry, scActivationConfig, scOffline, scSelectedStrategies]);

  // Auto-select the most recent TEST dataset when entering Step 6
  useEffect(() => {
    if (activeStep === 6 && scSelectedDatasetIds.length === 0 && datasetRegistry.length > 0) {
      const testDs = [...datasetRegistry].reverse().find((d) => d.splitRole === "test");
      if (testDs) setScSelectedDatasetIds([testDs.id]);
    }
  }, [activeStep, datasetRegistry, scSelectedDatasetIds.length]);

  const toggleFeature = useCallback((name: string) => {
    setSelectedFeatures((prev) => {
      if (prev.includes(name)) {
        if (prev.length <= 3) return prev;
        return prev.filter((f) => f !== name);
      }
      return [...prev, name];
    });
  }, []);

  // ─── Derived data ────────────────────────────────────────────────────────

  const featureBlockGroups = useMemo(() => {
    const groups: Record<string, typeof PLTV_FEATURE_META> = {};
    for (const meta of PLTV_FEATURE_META) {
      if (!groups[meta.block]) groups[meta.block] = [];
      groups[meta.block].push(meta);
    }
    return groups;
  }, []);

  const ltvDistribution = useMemo(() => {
    if (featureRows.length === 0) return [];
    const buckets = [0, 1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];
    return buckets.map((min, i) => {
      const max = buckets[i + 1] ?? Infinity;
      const label = max === Infinity ? `$${min}+` : `$${min}-${max}`;
      const count = featureRows.filter((r) => r.ltv_d60 >= min && r.ltv_d60 < max).length;
      return { label, count, pct: Math.round((count / featureRows.length) * 1000) / 10 };
    });
  }, [featureRows]);

  const payerStats = useMemo(() => {
    if (featureRows.length === 0) return null;
    const payers = featureRows.filter((r) => r.is_payer_by_d7 === 1);
    const totalRev = featureRows.reduce((s, r) => s + r.ltv_d60, 0);
    const payerRev = payers.reduce((s, r) => s + r.ltv_d60, 0);
    return {
      totalUsers: featureRows.length,
      payerCount: payers.length,
      payerRate: Math.round((payers.length / featureRows.length) * 1000) / 10,
      totalRevenue: Math.round(totalRev),
      payerRevenue: Math.round(payerRev),
      arppu: payers.length > 0 ? Math.round(payerRev / payers.length * 100) / 100 : 0,
      arpu: Math.round(totalRev / featureRows.length * 100) / 100,
    };
  }, [featureRows]);

  // ─── Data Profile derived stats ──────────────────────────────────────────

  const dataProfile = useMemo(() => {
    if (events.length === 0) return null;

    // Event type distribution
    const eventCounts = new Map<string, number>();
    for (const e of events) {
      eventCounts.set(e.event_name, (eventCounts.get(e.event_name) || 0) + 1);
    }
    const eventDistribution = [...eventCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Channel distribution
    const channelCounts = new Map<string, number>();
    for (const p of players) {
      channelCounts.set(p.channel, (channelCounts.get(p.channel) || 0) + 1);
    }
    const channelDistribution = [...channelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // OS distribution
    const osCounts = new Map<string, number>();
    for (const p of players) {
      osCounts.set(p.os, (osCounts.get(p.os) || 0) + 1);
    }
    const osDistribution = [...osCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Country distribution
    const countryCounts = new Map<string, number>();
    for (const p of players) {
      countryCounts.set(p.country, (countryCounts.get(p.country) || 0) + 1);
    }
    const countryDistribution = [...countryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Top players by event count
    const userEventCounts = new Map<string, number>();
    for (const e of events) {
      userEventCounts.set(e.game_user_id, (userEventCounts.get(e.game_user_id) || 0) + 1);
    }
    const topPlayers = [...userEventCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    const uniqueEventTypes = eventCounts.size;
    const uniqueUsers = new Set(events.map((e) => e.game_user_id)).size;
    const avgEventsPerUser = Math.round(events.length / Math.max(uniqueUsers, 1));
    const payerCount = payments.filter((p) => !p.is_refund).length;
    const totalRevenue = Math.round(payments.filter((p) => !p.is_refund).reduce((s, p) => s + p.amount_usd, 0));

    return {
      eventDistribution,
      channelDistribution,
      osDistribution,
      countryDistribution,
      topPlayers,
      totalEvents: events.length,
      uniqueUsers,
      uniqueEventTypes,
      avgEventsPerUser,
      payerCount,
      totalRevenue,
    };
  }, [events, players, payments]);

  // Decision segment computation now handled inside DecisionDataLab component

  // ─── Filtered table data ───────────────────────────────────────────────

  const playerChannels = useMemo(() => [...new Set(players.map((p) => p.channel))].sort(), [players]);
  const playerCountries = useMemo(() => [...new Set(players.map((p) => p.country))].sort(), [players]);
  const playerOSes = useMemo(() => [...new Set(players.map((p) => p.os))].sort(), [players]);

  const filteredPlayers = useMemo(() => {
    let result = players;
    if (playerFilterChannel !== "all") result = result.filter((p) => p.channel === playerFilterChannel);
    if (playerFilterCountry !== "all") result = result.filter((p) => p.country === playerFilterCountry);
    if (playerFilterOS !== "all") result = result.filter((p) => p.os === playerFilterOS);
    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase();
      result = result.filter((p) =>
        p.game_user_id.toLowerCase().includes(q) ||
        p.channel.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.campaign_id.toLowerCase().includes(q) ||
        p.device_model.toLowerCase().includes(q)
      );
    }
    return result;
  }, [players, playerSearch, playerFilterChannel, playerFilterCountry, playerFilterOS]);

  const playerTotalPages = Math.max(1, Math.ceil(filteredPlayers.length / PLAYER_PAGE_SIZE));
  const pagedPlayers = useMemo(() => filteredPlayers.slice(playerPage * PLAYER_PAGE_SIZE, (playerPage + 1) * PLAYER_PAGE_SIZE), [filteredPlayers, playerPage]);

  const eventNames = useMemo(() => [...new Set(events.map((e) => e.event_name))].sort(), [events]);
  const eventUserIds = useMemo(() => [...new Set(events.map((e) => e.game_user_id))].sort(), [events]);

  const filteredEvents = useMemo(() => {
    let result = events;
    if (eventFilterName !== "all") result = result.filter((e) => e.event_name === eventFilterName);
    if (eventFilterUser !== "all") result = result.filter((e) => e.game_user_id === eventFilterUser);
    if (eventSearch.trim()) {
      const q = eventSearch.toLowerCase();
      result = result.filter((e) =>
        e.game_user_id.toLowerCase().includes(q) ||
        e.event_name.toLowerCase().includes(q) ||
        e.session_id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [events, eventSearch, eventFilterName, eventFilterUser]);

  const eventTotalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENT_PAGE_SIZE));
  const pagedEvents = useMemo(() => filteredEvents.slice(eventPage * EVENT_PAGE_SIZE, (eventPage + 1) * EVENT_PAGE_SIZE), [filteredEvents, eventPage]);

  // ─── Feature Store filtered data ──────────────────────────────────────

  const toggleBlock = useCallback((block: string) => {
    setExpandedBlocks((prev) => ({ ...prev, [block]: !prev[block] }));
  }, []);

  const fsFilteredRows = useMemo(() => {
    let result = featureRows;
    if (fsSearch.trim()) {
      const q = fsSearch.toLowerCase();
      result = result.filter((r) => r.game_user_id.toLowerCase().includes(q));
    }
    return result;
  }, [featureRows, fsSearch]);

  const fsTotalPages = Math.max(1, Math.ceil(fsFilteredRows.length / FS_PAGE_SIZE));
  const pagedFeatureRows = useMemo(() => fsFilteredRows.slice(fsPage * FS_PAGE_SIZE, (fsPage + 1) * FS_PAGE_SIZE), [fsFilteredRows, fsPage]);

  const fsDisplayColumns = useMemo(() => {
    if (fsFilterFeature === "all") return selectedFeatures;
    return selectedFeatures.filter((f) => f === fsFilterFeature);
  }, [selectedFeatures, fsFilterFeature]);

  // Feature stats for each selected feature
  const featureStats = useMemo(() => {
    if (featureRows.length === 0) return new Map<string, { min: number; max: number; mean: number; std: number }>();
    const stats = new Map<string, { min: number; max: number; mean: number; std: number }>();
    for (const f of selectedFeatures) {
      const vals = featureRows.map((r) => (r as unknown as Record<string, number>)[f]).filter((v) => typeof v === "number" && !isNaN(v));
      if (vals.length === 0) continue;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      stats.set(f, { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, mean: Math.round(mean * 100) / 100, std: Math.round(std * 100) / 100 });
    }
    return stats;
  }, [featureRows, selectedFeatures]);

  // ─── Training Dataset builder helpers ─────────────────────────────────

  // Filtered rows based on date range + feature filters
  const filteredFeatureRows = useMemo(() => {
    let rows = featureRows;
    if (dateFilterStart) rows = rows.filter((r) => r.install_date >= dateFilterStart);
    if (dateFilterEnd) rows = rows.filter((r) => r.install_date <= dateFilterEnd);
    if (filterChannel !== "all") rows = rows.filter((r) => r.channel === filterChannel);
    if (filterCountry !== "all") rows = rows.filter((r) => r.country === filterCountry);
    if (filterOS !== "all") rows = rows.filter((r) => r.os === filterOS);
    if (filterPayerOnly) rows = rows.filter((r) => r.is_payer_by_d7 === 1);
    return rows;
  }, [featureRows, dateFilterStart, dateFilterEnd, filterChannel, filterCountry, filterOS, filterPayerOnly]);

  // Install month distribution for temporal split visualization
  const installMonthDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of featureRows) {
      const ym = r.install_date.slice(0, 7); // "YYYY-MM"
      counts.set(ym, (counts.get(ym) || 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
  }, [featureRows]);

  // Available filter options
  const filterOptions = useMemo(() => {
    const channels = new Set(featureRows.map((r) => r.channel));
    const countries = new Set(featureRows.map((r) => r.country));
    const oses = new Set(featureRows.map((r) => r.os));
    return {
      channels: [...channels].sort(),
      countries: [...countries].sort(),
      oses: [...oses].sort(),
    };
  }, [featureRows]);

  // Helper to create a PLTVDatasetVersion from a set of rows
  const makeDatasetVersion = useCallback((id: number, rows: PLTVFeatureRow[], role: PLTVDatasetVersion["splitRole"], roleName: string): PLTVDatasetVersion => {
    const payers = rows.filter((r) => r.is_payer_by_d7 === 1);
    const avgLTV = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.ltv_d60, 0) / rows.length * 100) / 100 : 0;
    const avgLTV90 = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.ltv_d90, 0) / rows.length * 100) / 100 : 0;
    const dates = rows.map((r) => r.install_date).sort();
    const dateRange = dates.length > 0 ? { min: dates[0], max: dates[dates.length - 1] } : null;
    const activeFilters: string[] = [];
    if (dateFilterStart || dateFilterEnd) activeFilters.push(`date:${dateFilterStart || "*"}→${dateFilterEnd || "*"}`);
    if (filterChannel !== "all") activeFilters.push(`ch:${filterChannel}`);
    if (filterCountry !== "all") activeFilters.push(`co:${filterCountry}`);
    if (filterOS !== "all") activeFilters.push(`os:${filterOS}`);
    if (filterPayerOnly) activeFilters.push("payers_only");
    const filterStr = activeFilters.length > 0 ? activeFilters.join(", ") : "none";
    const dateLabel = dateRange ? `${dateRange.min.slice(0, 7)}→${dateRange.max.slice(0, 7)}` : "";
    return {
      id,
      name: `ds_v${id} [${roleName}] — ${rows.length} users${dateLabel ? ` / ${dateLabel}` : ""}`,
      source: dataSource,
      splitRole: role,
      rowCount: rows.length,
      payerRate: rows.length > 0 ? Math.round((payers.length / rows.length) * 1000) / 10 : 0,
      avgLTV,
      avgLTV90,
      featureRows: [...rows],
      dateRange,
      filters: filterStr,
      timestamp: Date.now(),
    };
  }, [dataSource, dateFilterStart, dateFilterEnd, filterChannel, filterCountry, filterOS, filterPayerOnly]);

  const handleBuildDataset = useCallback(() => {
    if (filteredFeatureRows.length === 0) return;

    let train: PLTVFeatureRow[], val: PLTVFeatureRow[], test: PLTVFeatureRow[];

    if (splitStrategy === "temporal") {
      train = filteredFeatureRows.filter((r) => trainMonths.includes(r.install_date.slice(0, 7)));
      val = filteredFeatureRows.filter((r) => valMonths.includes(r.install_date.slice(0, 7)));
      test = filteredFeatureRows.filter((r) => testMonths.includes(r.install_date.slice(0, 7)));
      const assigned = train.length + val.length + test.length;
      setExcludedCount(filteredFeatureRows.length - assigned);
    } else {
      const matureRows = filteredFeatureRows.filter((_, i) => i < Math.floor(filteredFeatureRows.length * 0.97));
      setExcludedCount(filteredFeatureRows.length - matureRows.length);

      const shuffled = [...matureRows].sort((a, b) => {
        const ha = a.game_user_id.charCodeAt(4) + a.game_user_id.charCodeAt(5);
        const hb = b.game_user_id.charCodeAt(4) + b.game_user_id.charCodeAt(5);
        return ha - hb;
      });

      const trainEnd = Math.floor(shuffled.length * trainSplit);
      const valEnd = Math.floor(shuffled.length * (trainSplit + valSplit));
      train = shuffled.slice(0, trainEnd);
      val = shuffled.slice(trainEnd, valEnd);
      test = shuffled.slice(valEnd);
    }

    setTrainSet(train);
    setValSet(val);
    setTestSet(test);

    // Auto-save 3 datasets to the registry
    const baseId = datasetRegistry.length + 1;
    const trainDs = makeDatasetVersion(baseId, train, "train", "Train");
    const valDs = makeDatasetVersion(baseId + 1, val, "validation", "Validation");
    const testDs = makeDatasetVersion(baseId + 2, test, "test", "Test");
    setDatasetRegistry((prev) => [...prev, trainDs, valDs, testDs]);
    setInspectDatasetId(baseId); // auto-select train for inspection
    setTrainingDatasetId(baseId); // auto-select train for training in Step 5
    setDatasetBuilt(true);
  }, [filteredFeatureRows, splitStrategy, trainSplit, valSplit, trainMonths, valMonths, testMonths, datasetRegistry.length, makeDatasetVersion]);


  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Step navigator */}
      <div className="flex gap-0.5 bg-zinc-900 rounded-xl p-1.5 border border-zinc-800 overflow-x-auto">
        {PLTV_STEPS.map((step, idx) => {
          idx += 1;
          const isActive = idx === activeStep;
          const stepNum = idx as PLTVStep;
          return (
            <button
              key={idx}
              onClick={() => setActiveStep(stepNum)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                isActive ? "bg-emerald-600 text-white" : "bg-zinc-700 text-zinc-400"
              }`}>
                {idx}
              </span>
              <span className="hidden xl:inline">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* ═══ Step 1: Raw Ingestion (Bronze) ═══ */}
      {activeStep === 1 && (
        <div className="space-y-4">
          <InfoBanner title="Step 1 — Raw Ingestion (Bronze Layer)" variant="info">
            <p>Stream/batch ingest telemetry + payments + attribution. Partition by event_date. Run data quality checks: schema, nulls, volume anomalies.</p>
          </InfoBanner>

          {/* Data source controls */}
          <div className="flex items-center gap-3">
            {dataGenerated && dataSource && (
              <span className="text-[12px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {dataSource === "csv" ? "Loaded from CSV" : dataSource === "uploaded" ? "Uploaded" : "Generated in-memory"}
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  eventsFileRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Upload size={12} /> Upload CSVs
              </button>
              <button
                onClick={handleGenerateData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Play size={12} /> Generate In-Memory (500)
              </button>
            </div>
            {/* Hidden file inputs */}
            <input ref={eventsFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
              const evtFile = e.target.files?.[0] || null;
              if (evtFile) {
                // After events file, prompt for players
                playersFileRef.current?.click();
                // Store events file for later
                (window as unknown as Record<string, File>).__pltv_evt = evtFile;
              }
            }} />
            <input ref={playersFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
              const plFile = e.target.files?.[0] || null;
              if (plFile) {
                paymentsFileRef.current?.click();
                (window as unknown as Record<string, File>).__pltv_pl = plFile;
              }
            }} />
            <input ref={paymentsFileRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
              const pmFile = e.target.files?.[0] || null;
              const evtFile = (window as unknown as Record<string, File>).__pltv_evt || null;
              const plFile = (window as unknown as Record<string, File>).__pltv_pl || null;
              handleUploadCSVs(plFile, evtFile, pmFile);
            }} />
          </div>

          {isLoadingData && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              <span className="text-base text-zinc-400">Loading game data...</span>
            </div>
          )}

          {dataGenerated && !isLoadingData && (
            <div className="space-y-4">
              {/* ─── Data Profile ─── */}
              {dataProfile && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={14} className="text-emerald-400" />
                    <span className="text-sm font-bold text-zinc-200">Data Profile</span>
                    <InfoTooltip title="Data Profile" variant="info" content={<p>Overview of ingested raw data: event distribution, attribution channels, top players, and summary metrics.</p>} />
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {/* Event Type Distribution */}
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                      <h5 className="text-[12px] font-semibold text-zinc-400 mb-2">Event Type Distribution</h5>
                      <div className="space-y-1">
                        {dataProfile.eventDistribution.slice(0, 10).map((d) => {
                          const maxCount = dataProfile.eventDistribution[0]?.count || 1;
                          const pct = (d.count / maxCount) * 100;
                          return (
                            <div key={d.name} className="flex items-center gap-2 text-[11px]">
                              <span className="w-24 text-zinc-400 truncate">{d.name}</span>
                              <div className="flex-1 h-3 bg-zinc-700/50 rounded-sm overflow-hidden">
                                <div className="h-full rounded-sm bg-emerald-500/70" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-12 text-right text-zinc-500 font-mono">{d.count.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Channel + OS Distribution */}
                    <div className="space-y-3">
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                        <h5 className="text-[12px] font-semibold text-zinc-400 mb-2">Channel Distribution</h5>
                        <div className="space-y-1">
                          {dataProfile.channelDistribution.map((d) => {
                            const maxCount = dataProfile.channelDistribution[0]?.count || 1;
                            const pct = (d.count / maxCount) * 100;
                            return (
                              <div key={d.name} className="flex items-center gap-2 text-[11px]">
                                <span className="w-20 text-zinc-400 truncate">{d.name}</span>
                                <div className="flex-1 h-3 bg-zinc-700/50 rounded-sm overflow-hidden">
                                  <div className="h-full rounded-sm bg-blue-500/70" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-8 text-right text-zinc-500 font-mono">{d.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                        <h5 className="text-[12px] font-semibold text-zinc-400 mb-2">OS Distribution</h5>
                        <div className="space-y-1">
                          {dataProfile.osDistribution.map((d) => {
                            const maxCount = dataProfile.osDistribution[0]?.count || 1;
                            const pct = (d.count / maxCount) * 100;
                            return (
                              <div key={d.name} className="flex items-center gap-2 text-[11px]">
                                <span className="w-16 text-zinc-400">{d.name}</span>
                                <div className="flex-1 h-3 bg-zinc-700/50 rounded-sm overflow-hidden">
                                  <div className="h-full rounded-sm bg-purple-500/70" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-8 text-right text-zinc-500 font-mono">{d.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Top Players */}
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                      <h5 className="text-[12px] font-semibold text-zinc-400 mb-2">Top Players by Activity</h5>
                      <div className="space-y-1">
                        {dataProfile.topPlayers.map((d) => {
                          const maxCount = dataProfile.topPlayers[0]?.count || 1;
                          const pct = (d.count / maxCount) * 100;
                          return (
                            <div key={d.name} className="flex items-center gap-2 text-[11px]">
                              <span className="w-20 text-cyan-400 font-mono truncate">{d.name}</span>
                              <div className="flex-1 h-3 bg-zinc-700/50 rounded-sm overflow-hidden">
                                <div className="h-full rounded-sm bg-cyan-500/70" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-10 text-right text-zinc-500 font-mono">{d.count.toLocaleString()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Summary stat cards */}
                  <div className="grid grid-cols-6 gap-2">
                    {[
                      { label: "Total Events", value: dataProfile.totalEvents.toLocaleString(), color: "text-blue-400" },
                      { label: "Unique Players", value: dataProfile.uniqueUsers.toLocaleString(), color: "text-emerald-400" },
                      { label: "Event Types", value: dataProfile.uniqueEventTypes, color: "text-purple-400" },
                      { label: "Avg Events/Player", value: dataProfile.avgEventsPerUser, color: "text-cyan-400" },
                      { label: "Payments", value: dataProfile.payerCount, color: "text-green-400" },
                      { label: "Total Revenue", value: `$${dataProfile.totalRevenue.toLocaleString()}`, color: "text-amber-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2.5 text-center">
                        <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-[11px] text-zinc-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Players Table ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <Users size={12} className="text-emerald-400" />
                    Players <span className="text-zinc-500 font-normal">({filteredPlayers.length.toLocaleString()} of {players.length.toLocaleString()})</span>
                  </h4>
                </div>
                {/* Search + Filters */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Search user ID, channel, campaign, device..."
                    value={playerSearch}
                    onChange={(e) => { setPlayerSearch(e.target.value); setPlayerPage(0); }}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                  />
                  <select value={playerFilterChannel} onChange={(e) => { setPlayerFilterChannel(e.target.value); setPlayerPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All Channels</option>
                    {playerChannels.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={playerFilterCountry} onChange={(e) => { setPlayerFilterCountry(e.target.value); setPlayerPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All Countries</option>
                    {playerCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={playerFilterOS} onChange={(e) => { setPlayerFilterOS(e.target.value); setPlayerPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All OS</option>
                    {playerOSes.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="overflow-x-auto max-h-[300px] border border-zinc-800 rounded-lg">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800">
                        {["game_user_id", "channel", "country", "os", "device_tier", "device_model", "campaign", "consent"].map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left text-zinc-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {pagedPlayers.map((p) => (
                        <tr key={p.game_user_id} className="hover:bg-zinc-800/30">
                          <td className="px-2 py-1 text-cyan-400 font-mono">{p.game_user_id}</td>
                          <td className="px-2 py-1 text-zinc-300">{p.channel}</td>
                          <td className="px-2 py-1 text-zinc-300">{p.country}</td>
                          <td className="px-2 py-1 text-zinc-300">{p.os}</td>
                          <td className="px-2 py-1 text-zinc-300">{p.device_tier}</td>
                          <td className="px-2 py-1 text-zinc-500 text-[11px]">{p.device_model}</td>
                          <td className="px-2 py-1 text-zinc-500 font-mono text-[11px]">{p.campaign_id}</td>
                          <td className="px-2 py-1">
                            <div className="flex gap-1">
                              {p.consent_tracking ? <CheckCircle2 size={10} className="text-green-400" /> : <AlertTriangle size={10} className="text-red-400" />}
                              {p.consent_marketing ? <CheckCircle2 size={10} className="text-blue-400" /> : <AlertTriangle size={10} className="text-zinc-600" />}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pagedPlayers.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-600 text-sm">No players match your filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-zinc-600">
                    Showing {playerPage * PLAYER_PAGE_SIZE + 1}–{Math.min((playerPage + 1) * PLAYER_PAGE_SIZE, filteredPlayers.length)} of {filteredPlayers.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={playerPage === 0} onClick={() => setPlayerPage((p) => p - 1)} className="px-2 py-0.5 text-[12px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                    <span className="text-[11px] text-zinc-500 px-2">{playerPage + 1} / {playerTotalPages}</span>
                    <button disabled={playerPage >= playerTotalPages - 1} onClick={() => setPlayerPage((p) => p + 1)} className="px-2 py-0.5 text-[12px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              </div>

              {/* ─── Events Table ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <Database size={12} className="text-blue-400" />
                    Event Log <span className="text-zinc-500 font-normal">({filteredEvents.length.toLocaleString()} of {events.length.toLocaleString()})</span>
                  </h4>
                </div>
                {/* Search + Filters */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Search user ID, event name, session..."
                    value={eventSearch}
                    onChange={(e) => { setEventSearch(e.target.value); setEventPage(0); }}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                  />
                  <select value={eventFilterName} onChange={(e) => { setEventFilterName(e.target.value); setEventPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-blue-500/50">
                    <option value="all">All Events</option>
                    {eventNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select value={eventFilterUser} onChange={(e) => { setEventFilterUser(e.target.value); setEventPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-blue-500/50 max-w-[160px]">
                    <option value="all">All Players</option>
                    {eventUserIds.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="overflow-x-auto max-h-[320px] border border-zinc-800 rounded-lg">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800">
                        {["game_user_id", "event_time", "event_name", "session_id", "params"].map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left text-zinc-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {pagedEvents.map((e, i) => (
                        <tr key={`${e.session_id}_${i}`} className="hover:bg-zinc-800/30">
                          <td className="px-2 py-1 text-cyan-400 font-mono">{e.game_user_id}</td>
                          <td className="px-2 py-1 text-zinc-500 font-mono whitespace-nowrap">{new Date(e.event_time).toLocaleString()}</td>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                              e.event_name.includes("session") ? "bg-blue-500/10 text-blue-400" :
                              e.event_name.includes("level") || e.event_name.includes("quest") ? "bg-purple-500/10 text-purple-400" :
                              e.event_name.includes("soft") || e.event_name.includes("hard") || e.event_name.includes("gacha") || e.event_name.includes("shop") ? "bg-amber-500/10 text-amber-400" :
                              e.event_name.includes("guild") || e.event_name.includes("friend") || e.event_name.includes("chat") ? "bg-green-500/10 text-green-400" :
                              e.event_name.includes("pvp") || e.event_name.includes("pve") || e.event_name.includes("dungeon") ? "bg-red-500/10 text-red-400" :
                              "bg-zinc-700/50 text-zinc-300"
                            }`}>{e.event_name}</span>
                          </td>
                          <td className="px-2 py-1 text-zinc-600 font-mono text-[11px]">{e.session_id}</td>
                          <td className="px-2 py-1 text-zinc-500 font-mono text-[11px] max-w-[200px] truncate">
                            {Object.entries(e.params).map(([k, v]) => `${k}=${v}`).join("; ") || "—"}
                          </td>
                        </tr>
                      ))}
                      {pagedEvents.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600 text-sm">No events match your filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-zinc-600">
                    Showing {filteredEvents.length > 0 ? eventPage * EVENT_PAGE_SIZE + 1 : 0}–{Math.min((eventPage + 1) * EVENT_PAGE_SIZE, filteredEvents.length)} of {filteredEvents.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={eventPage === 0} onClick={() => setEventPage((p) => p - 1)} className="px-2 py-0.5 text-[12px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                    <span className="text-[11px] text-zinc-500 px-2">{eventPage + 1} / {eventTotalPages}</span>
                    <button disabled={eventPage >= eventTotalPages - 1} onClick={() => setEventPage((p) => p + 1)} className="px-2 py-0.5 text-[12px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(1)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => { if (!dataGenerated) handleGenerateData(); setActiveStep(2); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500">
              Next: Clean & Unify <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Clean & Unify (Silver) ═══ */}
      {activeStep === 2 && (
        <div className="space-y-4">
          <InfoBanner title="Step 2 — Clean & Unify (Silver Layer)" variant="info">
            <p>Run the cleaning pipeline on raw Bronze data. Each transformation is applied sequentially, producing a <strong>Silver</strong> dataset ready for feature engineering.</p>
          </InfoBanner>

          {!cleaningRan && (
            <button
              onClick={() => {
                const { cleanedEvents, cleanedPayments, report } = runCleaningPipeline(players, events, payments);
                setCleaningReport(report);
                setEvents(cleanedEvents);
                setPayments(cleanedPayments);
                setCleaningRan(true);
              }}
              disabled={!dataGenerated}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              <Play size={16} /> Run Cleaning Pipeline
            </button>
          )}

          {cleaningReport && (
            <div className="space-y-4">
              {/* ─── Before → After Summary ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                  <ArrowRight size={12} className="text-emerald-400" /> Bronze → Silver Summary
                </h4>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Events", before: cleaningReport.rawEventCount.toLocaleString(), after: cleaningReport.timestampsNormalized.toLocaleString(), delta: `−${(cleaningReport.rawEventCount - cleaningReport.timestampsNormalized).toLocaleString()}`, color: "text-blue-400" },
                    { label: "Duplicates Removed", before: "—", after: cleaningReport.duplicatesRemoved.toLocaleString(), delta: cleaningReport.duplicatesRemoved > 0 ? "removed" : "none found", color: "text-amber-400" },
                    { label: "Late/Invalid Events", before: "—", after: cleaningReport.lateEventsQuarantined.toLocaleString(), delta: "quarantined", color: "text-red-400" },
                    { label: "Net Revenue", before: `$${cleaningReport.grossRevenueUsd.toLocaleString()}`, after: `$${cleaningReport.netRevenueUsd.toLocaleString()}`, delta: `−$${cleaningReport.refundAmountUsd} refunds`, color: "text-green-400" },
                  ].map((s) => (
                    <div key={s.label} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                      <div className="text-[11px] text-zinc-500 mb-1">{s.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-500 font-mono">{s.before}</span>
                        <ArrowRight size={10} className="text-zinc-600" />
                        <span className={`text-base font-bold font-mono ${s.color}`}>{s.after}</span>
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{s.delta}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─── Pipeline Steps Detail ─── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Transformations */}
                <div className="space-y-3">
                  {/* 1. Dedup */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">1</div>
                      <h5 className="text-sm font-bold text-zinc-200">Deduplicate Events</h5>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[12px] text-zinc-400 mb-2">Hash key: <code className="text-emerald-400">game_user_id | session_id | event_time | event_name</code></div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-zinc-300">{cleaningReport.rawEventCount.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">Raw</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-amber-400">{cleaningReport.duplicatesRemoved.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">Duplicates</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-emerald-400">{cleaningReport.dedupedEventCount.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">After Dedup</div>
                      </div>
                    </div>
                    {cleaningReport.duplicateExamples.length > 0 && (
                      <div className="mt-2 text-[11px] text-zinc-500">
                        <span className="text-zinc-600">Example dups:</span>
                        {cleaningReport.duplicateExamples.slice(0, 2).map((d, i) => (
                          <span key={i} className="ml-1 text-amber-400/70">{d.game_user_id}/{d.event_name}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Timestamp normalization */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">2</div>
                      <h5 className="text-sm font-bold text-zinc-200">Normalize Timestamps & Quarantine Late Events</h5>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[12px] text-zinc-400 mb-2">
                      All timestamps → <code className="text-emerald-400">server_time (UTC)</code>. Events before install (clock drift &gt;1h) or &gt;62 days after install → quarantined.
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-emerald-400">{cleaningReport.timestampsNormalized.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">Passed</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className={`text-sm font-bold ${cleaningReport.lateEventsQuarantined > 0 ? "text-red-400" : "text-zinc-500"}`}>{cleaningReport.lateEventsQuarantined}</div>
                        <div className="text-[10px] text-zinc-600">Quarantined</div>
                      </div>
                    </div>
                    {cleaningReport.lateEventExamples.length > 0 && (
                      <div className="mt-2 text-[11px] text-zinc-500">
                        <span className="text-zinc-600">Quarantined examples:</span>
                        {cleaningReport.lateEventExamples.map((d, i) => (
                          <span key={i} className="ml-1 text-red-400/70">{d.game_user_id} ({d.delay_hours}h before install)</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Identity mapping */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">3</div>
                      <h5 className="text-sm font-bold text-zinc-200">Identity Mapping & Consent</h5>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[12px] text-zinc-400 mb-2">
                      Join <code className="text-emerald-400">game_user_id ↔ install_id</code> with consent flags. Only users with tracking consent eligible for ad platform activation.
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-zinc-300">{cleaningReport.totalPlayers.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">Total Players</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-green-400">{cleaningReport.playersWithConsent}</div>
                        <div className="text-[10px] text-zinc-600">With Consent</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className={`text-sm font-bold ${cleaningReport.playersWithoutConsent > 0 ? "text-amber-400" : "text-zinc-500"}`}>{cleaningReport.playersWithoutConsent}</div>
                        <div className="text-[10px] text-zinc-600">No Consent</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: More transformations + quality */}
                <div className="space-y-3">
                  {/* 4. Revenue standardization */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">4</div>
                      <h5 className="text-sm font-bold text-zinc-200">Revenue Standardization</h5>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[12px] text-zinc-400 mb-2">
                      All amounts → <code className="text-emerald-400">USD net</code>. Refund transactions removed; refund amounts deducted from gross revenue.
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-zinc-300">{cleaningReport.totalTxn}</div>
                        <div className="text-[10px] text-zinc-600">Raw Txns</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-red-400">{cleaningReport.refundCount}</div>
                        <div className="text-[10px] text-zinc-600">Refunds</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-zinc-400">${cleaningReport.grossRevenueUsd.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">Gross</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-sm font-bold text-green-400">${cleaningReport.netRevenueUsd.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-600">Net</div>
                      </div>
                    </div>
                  </div>

                  {/* 5. Schema validation */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">5</div>
                      <h5 className="text-sm font-bold text-zinc-200">Schema Validation</h5>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ml-auto ${
                        (cleaningReport.nullUserIds + cleaningReport.nullEventNames + cleaningReport.nullTimestamps) === 0
                          ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {(cleaningReport.nullUserIds + cleaningReport.nullEventNames + cleaningReport.nullTimestamps) === 0 ? "passed" : "issues"}
                      </span>
                    </div>
                    <div className="text-[12px] text-zinc-400 mb-2">Check every row for required fields: <code className="text-emerald-400">game_user_id</code>, <code className="text-emerald-400">event_name</code>, <code className="text-emerald-400">event_time</code>, <code className="text-emerald-400">session_id</code>.</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Null user_id", val: cleaningReport.nullUserIds },
                        { label: "Null event_name", val: cleaningReport.nullEventNames },
                        { label: "Null timestamp", val: cleaningReport.nullTimestamps },
                        { label: "Missing session", val: cleaningReport.missingSessionIds },
                      ].map((c) => (
                        <div key={c.label} className="bg-zinc-800/50 rounded p-1.5">
                          <div className={`text-sm font-bold ${c.val === 0 ? "text-green-400" : "text-red-400"}`}>{c.val}</div>
                          <div className="text-[10px] text-zinc-600">{c.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 6. Volume anomaly */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">6</div>
                      <h5 className="text-sm font-bold text-zinc-200">Volume Anomaly Detection</h5>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ml-auto ${
                        cleaningReport.volumeAnomalies.length === 0
                          ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {cleaningReport.volumeAnomalies.length === 0 ? "no anomalies" : `${cleaningReport.volumeAnomalies.length} anomalies`}
                      </span>
                    </div>
                    <div className="text-[12px] text-zinc-400 mb-2">
                      Avg <code className="text-emerald-400">{cleaningReport.avgEventsPerDay.toLocaleString()}</code> events/day ± <code className="text-emerald-400">{cleaningReport.stdEventsPerDay.toLocaleString()}</code>. Flag days with |z-score| &gt; 2.
                    </div>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={cleaningReport.eventsPerDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} tickFormatter={(d: string) => d.slice(5)} />
                        <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }} />
                        <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
                        <ReferenceLine y={cleaningReport.avgEventsPerDay} stroke="#3b82f6" strokeDasharray="4 4" />
                      </BarChart>
                    </ResponsiveContainer>
                    {cleaningReport.volumeAnomalies.length > 0 && (
                      <div className="mt-1 text-[11px] text-amber-400/70">
                        Anomalies: {cleaningReport.volumeAnomalies.map((a) => `${a.date} (z=${a.zscore})`).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Silver Output Schema ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                  <Layers size={12} className="text-blue-400" /> Silver Layer Output — What the data looks like now
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-[12px] font-semibold text-blue-400 mb-1">silver.event_log</div>
                    <div className="text-[11px] text-zinc-400 space-y-0.5">
                      <div><code className="text-zinc-300">game_user_id</code> — deduplicated, non-null</div>
                      <div><code className="text-zinc-300">event_time</code> — server UTC, within [install, install+62d]</div>
                      <div><code className="text-zinc-300">event_name</code> — standardized 22 event types</div>
                      <div><code className="text-zinc-300">session_id</code> — session boundary marker</div>
                      <div><code className="text-zinc-300">params</code> — parsed key=value pairs</div>
                      <div className="pt-1 text-emerald-400 font-mono">{cleaningReport.timestampsNormalized.toLocaleString()} rows</div>
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-[12px] font-semibold text-blue-400 mb-1">silver.player_identity</div>
                    <div className="text-[11px] text-zinc-400 space-y-0.5">
                      <div><code className="text-zinc-300">game_user_id</code> — primary key</div>
                      <div><code className="text-zinc-300">install_id</code> — MMP join key</div>
                      <div><code className="text-zinc-300">install_time</code> — UTC</div>
                      <div><code className="text-zinc-300">channel, campaign, country, os</code> — attribution</div>
                      <div><code className="text-zinc-300">consent_tracking, consent_marketing</code> — boolean</div>
                      <div className="pt-1 text-emerald-400 font-mono">{cleaningReport.totalPlayers.toLocaleString()} rows</div>
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-[12px] font-semibold text-blue-400 mb-1">silver.payment_txn</div>
                    <div className="text-[11px] text-zinc-400 space-y-0.5">
                      <div><code className="text-zinc-300">game_user_id</code> — FK to player_identity</div>
                      <div><code className="text-zinc-300">txn_time</code> — server UTC</div>
                      <div><code className="text-zinc-300">amount_usd</code> — net, USD standardized</div>
                      <div><code className="text-zinc-300">product_sku</code> — canonical SKU category</div>
                      <div><code className="text-zinc-300">payment_channel</code> — normalized</div>
                      <div className="pt-1 text-emerald-400 font-mono">{(cleaningReport.totalTxn - cleaningReport.refundCount).toLocaleString()} rows (refunds excluded)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(1)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => {
              if (!cleaningRan && dataGenerated) {
                const { cleanedEvents, cleanedPayments, report } = runCleaningPipeline(players, events, payments);
                setCleaningReport(report);
                setEvents(cleanedEvents);
                setPayments(cleanedPayments);
                setCleaningRan(true);
              }
              setActiveStep(3);
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500">
              Next: Feature Store <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Feature Store (Gold) ═══ */}
      {activeStep === 3 && (
        <div className="space-y-4">
          <InfoBanner title="Step 3 — Feature Store (Gold Layer)" variant="info">
            <p>Select features from 6 blocks computed over the <strong>D0–D7 observation window</strong>. All values anchored to <code className="text-emerald-300">install_time</code>. Click a block to expand, toggle features, then compute on your real data.</p>
          </InfoBanner>

          {/* Collapsible feature blocks */}
          <div className="space-y-2">
            {Object.entries(featureBlockGroups).map(([block, features]) => {
              const isExpanded = expandedBlocks[block] === true; // default collapsed
              const selectedInBlock = features.filter((m) => selectedFeatures.includes(m.name)).length;
              return (
                <div key={block} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-1 p-3 hover:bg-zinc-800/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedInBlock > 0}
                      ref={undefined}
                      onChange={(e) => {
                        e.stopPropagation();
                        const names = features.map((m) => m.name);
                        if (selectedInBlock > 0) {
                          // uncheck all in group (respect min-3 global constraint)
                          setSelectedFeatures((prev) => {
                            const remaining = prev.filter((f) => !names.includes(f));
                            return remaining.length >= 3 ? remaining : prev;
                          });
                        } else {
                          // check all in group
                          setSelectedFeatures((prev) => [...new Set([...prev, ...names])]);
                        }
                      }}
                      className="accent-emerald-500 shrink-0 mr-1 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={() => toggleBlock(block)}
                      className="flex-1 flex items-center gap-2"
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: BLOCK_COLORS[block] }} />
                      <h4 className="text-sm font-bold text-zinc-200">{features[0].blockLabel}</h4>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">{selectedInBlock}/{features.length} selected</span>
                      {features.some((m) => m.leakageRisk === "high" && selectedFeatures.includes(m.name)) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">has leak risk</span>
                      )}
                      <ChevronRight size={14} className={`text-zinc-500 ml-auto transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <div className="grid grid-cols-3 gap-2">
                        {features.map((meta) => {
                          const isSelected = selectedFeatures.includes(meta.name);
                          const stat = featureStats.get(meta.name);
                          return (
                            <button
                              key={meta.name}
                              onClick={() => toggleFeature(meta.name)}
                              className={`text-left rounded border p-2 transition-all ${
                                isSelected
                                  ? "border-emerald-500/30 bg-emerald-500/5"
                                  : "border-zinc-800 bg-zinc-800/30 opacity-50"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${isSelected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`} />
                                <span className="text-[12px] font-semibold text-zinc-200">{meta.label}</span>
                                {meta.leakageRisk !== "none" && (
                                  <span className={`text-[10px] px-1 rounded ${meta.leakageRisk === "high" ? "bg-red-500/20 text-red-400" : meta.leakageRisk === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                                    {meta.leakageRisk} leak
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 mt-0.5 ml-4">{meta.description}</div>
                              {stat && isSelected && (
                                <div className="flex gap-2 mt-1 ml-4 text-[10px] text-zinc-600">
                                  <span>min: <span className="text-zinc-400">{stat.min}</span></span>
                                  <span>max: <span className="text-zinc-400">{stat.max}</span></span>
                                  <span>μ: <span className="text-zinc-400">{stat.mean}</span></span>
                                  <span>σ: <span className="text-zinc-400">{stat.std}</span></span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selection summary + Compute button */}
          <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              <strong className="text-zinc-200">{selectedFeatures.length}</strong> of {PLTV_NUMERIC_FEATURES.length} features selected
              <span className="text-zinc-600 ml-2">(min 3 required)</span>
            </div>
            {!featureStoreComputed ? (
              <button
                onClick={() => {
                  if (featureRows.length === 0 && dataGenerated) {
                    const features = computePLTVFeatures(players, events, payments);
                    setFeatureRows(features);
                  }
                  setFeatureStoreComputed(true);
                }}
                disabled={selectedFeatures.length < 3 || !dataGenerated}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                <Play size={14} /> Compute Feature Store
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] text-emerald-400">
                <CheckCircle2 size={12} /> Computed — {featureRows.length.toLocaleString()} users
              </span>
            )}
          </div>

          {/* Feature Store Preview Table */}
          {featureStoreComputed && featureRows.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <Layers size={12} className="text-blue-400" />
                  Feature Store Preview
                  <span className="text-zinc-500 font-normal">({fsFilteredRows.length.toLocaleString()} users)</span>
                </h4>
              </div>
              {/* Search + Filter */}
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Search by user ID..."
                  value={fsSearch}
                  onChange={(e) => { setFsSearch(e.target.value); setFsPage(0); }}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 max-w-[240px]"
                />
                <select
                  value={fsFilterFeature}
                  onChange={(e) => setFsFilterFeature(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="all">All Selected Features ({selectedFeatures.length})</option>
                  {selectedFeatures.map((f) => (
                    <option key={f} value={f}>{f.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto max-h-[320px] border border-zinc-800 rounded-lg">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-zinc-900 z-10">
                    <tr className="border-b border-zinc-800">
                      <th className="px-2 py-1.5 text-left text-zinc-500 font-medium sticky left-0 bg-zinc-900 z-20">user</th>
                      {fsDisplayColumns.map((f) => (
                        <th key={f} className="px-2 py-1.5 text-left text-zinc-500 font-medium whitespace-nowrap">{f.replace(/_/g, " ")}</th>
                      ))}
                      <th className="px-2 py-1.5 text-left text-amber-500 font-bold whitespace-nowrap">LTV D60</th>
                      <th className="px-2 py-1.5 text-left text-blue-500 font-bold whitespace-nowrap">LTV D30</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {pagedFeatureRows.map((row) => (
                      <tr key={row.game_user_id} className="hover:bg-zinc-800/30">
                        <td className="px-2 py-1 text-cyan-400 font-mono sticky left-0 bg-zinc-900">{row.game_user_id}</td>
                        {fsDisplayColumns.map((f) => {
                          const val = (row as unknown as Record<string, unknown>)[f];
                          return (
                            <td key={f} className="px-2 py-1 text-zinc-300 font-mono whitespace-nowrap">
                              {typeof val === "number" ? (Number.isInteger(val) ? val : val.toFixed(2)) : String(val)}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-amber-400 font-mono font-bold">${row.ltv_d60.toFixed(2)}</td>
                        <td className="px-2 py-1 text-blue-400 font-mono">${row.ltv_d30.toFixed(2)}</td>
                      </tr>
                    ))}
                    {pagedFeatureRows.length === 0 && (
                      <tr><td colSpan={fsDisplayColumns.length + 3} className="px-3 py-6 text-center text-zinc-600 text-sm">No users match your search</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-zinc-600">
                  Showing {fsFilteredRows.length > 0 ? fsPage * FS_PAGE_SIZE + 1 : 0}–{Math.min((fsPage + 1) * FS_PAGE_SIZE, fsFilteredRows.length)} of {fsFilteredRows.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={fsPage === 0} onClick={() => setFsPage((p) => p - 1)} className="px-2 py-0.5 text-[12px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                  <span className="text-[11px] text-zinc-500 px-2">{fsPage + 1} / {fsTotalPages}</span>
                  <button disabled={fsPage >= fsTotalPages - 1} onClick={() => setFsPage((p) => p + 1)} className="px-2 py-0.5 text-[12px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(2)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => {
              if (!featureStoreComputed && dataGenerated) {
                if (featureRows.length === 0) {
                  const features = computePLTVFeatures(players, events, payments);
                  setFeatureRows(features);
                }
                setFeatureStoreComputed(true);
              }
              setActiveStep(4);
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500">
              Next: Training Dataset <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 4: Create Datasets ═══ */}
      {activeStep === 4 && (
        <div className="space-y-4">
          <InfoBanner title="Step 4 — Create Datasets" variant="info">
            <p>Split your feature data into <strong>Train / Validation / Test</strong> datasets. Choose a split strategy, optionally filter the population, then click <strong>Split &amp; Save</strong>. Three datasets are automatically saved to the registry. Select any dataset below to inspect its sample, correlations, and statistics.</p>
          </InfoBanner>

          <div className="grid grid-cols-2 gap-4">
            {/* ─── Left: Split Strategy ─── */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <BarChart3 size={12} className="text-amber-400" /> Split Strategy
              </h4>
              <div className="flex gap-2 mb-3">
                <button onClick={() => { setSplitStrategy("temporal"); setDatasetBuilt(false); }}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-[13px] font-medium border transition-colors ${splitStrategy === "temporal" ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  <Clock size={12} className="inline mr-1" /> Temporal Split
                </button>
                <button onClick={() => { setSplitStrategy("random"); setDatasetBuilt(false); }}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-[13px] font-medium border transition-colors ${splitStrategy === "random" ? "bg-blue-600/20 border-blue-500/40 text-blue-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  <Layers size={12} className="inline mr-1" /> Random Split
                </button>
              </div>
              {splitStrategy === "temporal" ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 mb-2">Assign install months to train/val/test. Mirrors production: train on older, test on newest.</p>
                  {installMonthDist.map((d) => {
                    const label = new Date(d.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" });
                    const current = trainMonths.includes(d.month) ? "train" : valMonths.includes(d.month) ? "val" : testMonths.includes(d.month) ? "test" : "none";
                    return (
                      <div key={d.month} className="flex items-center gap-2">
                        <span className="text-[12px] text-zinc-300 w-20">{label}</span>
                        <span className="text-[11px] text-zinc-500 w-16">{d.count} users</span>
                        <div className="flex gap-1">
                          {(["train", "val", "test"] as const).map((split) => (
                            <button key={split} onClick={() => {
                              setTrainMonths((prev) => split === "train" ? [...prev.filter((m) => m !== d.month), d.month] : prev.filter((m) => m !== d.month));
                              setValMonths((prev) => split === "val" ? [...prev.filter((m) => m !== d.month), d.month] : prev.filter((m) => m !== d.month));
                              setTestMonths((prev) => split === "test" ? [...prev.filter((m) => m !== d.month), d.month] : prev.filter((m) => m !== d.month));
                              setDatasetBuilt(false);
                            }} className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                              current === split
                                ? (split === "train" ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-400" : split === "val" ? "bg-blue-600/30 border-blue-500/50 text-blue-400" : "bg-amber-600/30 border-amber-500/50 text-amber-400")
                                : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
                            }`}>{split}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-zinc-400">Train: <strong className="text-emerald-400">{Math.round(trainSplit * 100)}%</strong></span>
                      <span className="text-zinc-400">Val: <strong className="text-blue-400">{Math.round(valSplit * 100)}%</strong></span>
                      <span className="text-zinc-400">Test: <strong className="text-amber-400">{Math.round((1 - trainSplit - valSplit) * 100)}%</strong></span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden border border-zinc-700">
                      <div className="bg-emerald-600" style={{ width: `${trainSplit * 100}%` }} />
                      <div className="bg-blue-600" style={{ width: `${valSplit * 100}%` }} />
                      <div className="bg-amber-600" style={{ width: `${(1 - trainSplit - valSplit) * 100}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-500">Train %</label>
                      <input type="range" min={50} max={85} step={5} value={trainSplit * 100}
                        onChange={(e) => { const v = Number(e.target.value) / 100; setTrainSplit(v); setValSplit(Math.min(valSplit, (1 - v) * 0.8)); setDatasetBuilt(false); }}
                        className="w-full accent-emerald-500 h-1" />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-500">Val %</label>
                      <input type="range" min={5} max={Math.round((1 - trainSplit) * 100 - 5)} step={5} value={valSplit * 100}
                        onChange={(e) => { setValSplit(Number(e.target.value) / 100); setDatasetBuilt(false); }}
                        className="w-full accent-blue-500 h-1" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Right: Split & Save ─── */}
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                  <Zap size={12} className="text-emerald-400" /> Split &amp; Save Datasets
                </h4>
                {!datasetBuilt ? (
                  <div className="space-y-3">
                    <button onClick={handleBuildDataset} disabled={filteredFeatureRows.length === 0}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600">
                      <Play size={16} /> Split &amp; Save ({filteredFeatureRows.length} users → 3 datasets)
                    </button>
                    {splitStrategy === "temporal" && (
                      <div className="text-[11px] text-zinc-500 bg-zinc-800/50 rounded p-2">
                        Train: <strong className="text-emerald-400">{trainMonths.map((m) => new Date(m + "-01").toLocaleDateString("en-US", { month: "short" })).join(" + ")}</strong>
                        {" · "}Val: <strong className="text-blue-400">{valMonths.map((m) => new Date(m + "-01").toLocaleDateString("en-US", { month: "short" })).join(" + ")}</strong>
                        {" · "}Test: <strong className="text-amber-400">{testMonths.map((m) => new Date(m + "-01").toLocaleDateString("en-US", { month: "short" })).join(" + ")}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm">
                      <CheckCircle2 size={14} /> 3 datasets saved to registry ({splitStrategy} split)
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                        <div className="text-sm font-bold text-emerald-400">{trainSet.length}</div>
                        <div className="text-[10px] text-zinc-600">Train</div>
                      </div>
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2">
                        <div className="text-sm font-bold text-blue-400">{valSet.length}</div>
                        <div className="text-[10px] text-zinc-600">Validation</div>
                      </div>
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2">
                        <div className="text-sm font-bold text-amber-400">{testSet.length}</div>
                        <div className="text-[10px] text-zinc-600">Test</div>
                      </div>
                    </div>
                    {excludedCount > 0 && <div className="text-[11px] text-red-400">{excludedCount} users unassigned/excluded</div>}
                    <button onClick={() => setDatasetBuilt(false)} className="text-[12px] text-zinc-500 hover:text-zinc-300 underline">Re-split with different settings</button>
                  </div>
                )}
              </div>

              {/* LTV Distribution */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-sm font-bold text-zinc-200 mb-2">LTV Distribution (all data)</h4>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={ltvDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ─── Dataset Registry + Inspector ─── */}
          {datasetBuilt && datasetRegistry.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-cyan-400" />
                <span className="text-sm font-semibold text-zinc-200">Dataset Registry</span>
                <span className="text-[11px] text-zinc-500">— Click any dataset to inspect</span>
              </div>
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-zinc-800"><tr className="border-b border-zinc-700">
                    <th className="px-2 py-1.5 text-left text-zinc-400">Dataset</th>
                    <th className="px-2 py-1.5 text-left text-zinc-400">Role</th>
                    <th className="px-2 py-1.5 text-left text-zinc-400">Date Range</th>
                    <th className="px-2 py-1.5 text-right text-zinc-400">Rows</th>
                    <th className="px-2 py-1.5 text-right text-zinc-400">Payer %</th>
                    <th className="px-2 py-1.5 text-right text-zinc-400">Avg LTV</th>
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {datasetRegistry.map((ds) => {
                      const roleColor = ds.splitRole === "train" ? "bg-emerald-500/20 text-emerald-400" : ds.splitRole === "validation" ? "bg-blue-500/20 text-blue-400" : ds.splitRole === "test" ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-400";
                      return (
                        <tr key={ds.id} onClick={() => { setInspectDatasetId(ds.id); setDsInspectSearch(""); setDsInspectPage(0); }}
                          className={`cursor-pointer transition-colors ${inspectDatasetId === ds.id ? "bg-cyan-500/10 border-l-2 border-l-cyan-500" : "hover:bg-zinc-800/30"}`}>
                          <td className="px-2 py-1.5 text-cyan-400 font-mono font-semibold">{ds.name}</td>
                          <td className="px-2 py-1.5"><span className={`text-[11px] px-1.5 py-0.5 rounded-full ${roleColor}`}>{ds.splitRole}</span></td>
                          <td className="px-2 py-1.5 text-zinc-400 font-mono text-[11px]">{ds.dateRange ? `${ds.dateRange.min} → ${ds.dateRange.max}` : "—"}</td>
                          <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">{ds.rowCount}</td>
                          <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">{ds.payerRate}%</td>
                          <td className="px-2 py-1.5 text-right text-emerald-400 font-mono">${ds.avgLTV}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ─── Dataset Inspector ─── */}
              {inspectDatasetId && (() => {
                const ds = datasetRegistry.find((d) => d.id === inspectDatasetId);
                if (!ds) return null;
                const searchQ = dsInspectSearch.toLowerCase();
                const inspectFiltered = searchQ ? ds.featureRows.filter((r) => r.game_user_id.toLowerCase().includes(searchQ)) : ds.featureRows;
                const inspectPages = Math.max(1, Math.ceil(inspectFiltered.length / DS_INSPECT_PAGE_SIZE));
                const inspectPaged = inspectFiltered.slice(dsInspectPage * DS_INSPECT_PAGE_SIZE, (dsInspectPage + 1) * DS_INSPECT_PAGE_SIZE);
                // Compute correlations for this dataset
                const dsCorrs = (() => {
                  if (ds.featureRows.length < 10) return [];
                  const tgt = "ltv_d60";
                  const tVals = ds.featureRows.map((r) => (r as unknown as Record<string, number>)[tgt]);
                  const tMean = tVals.reduce((a, b) => a + b, 0) / tVals.length;
                  return selectedFeatures
                    .filter((f) => !["channel", "country", "os", "device_tier", "sku_category_first_purchase"].includes(f))
                    .map((f) => {
                      const fVals = ds.featureRows.map((r) => (r as unknown as Record<string, number>)[f]);
                      const fMean = fVals.reduce((a, b) => a + b, 0) / fVals.length;
                      let cov = 0, fVar = 0, tVar = 0;
                      for (let i = 0; i < fVals.length; i++) { cov += (fVals[i] - fMean) * (tVals[i] - tMean); fVar += (fVals[i] - fMean) ** 2; tVar += (tVals[i] - tMean) ** 2; }
                      return { feature: f, correlation: Math.round((fVar > 0 && tVar > 0 ? cov / Math.sqrt(fVar * tVar) : 0) * 1000) / 1000 };
                    }).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
                })();
                return (
                  <div className="space-y-3 border-t border-zinc-700 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        <Eye size={12} className="text-cyan-400" /> Inspecting: <span className="text-cyan-400 font-mono">{ds.name}</span>
                      </h4>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                        <span>Rows: <strong className="text-zinc-300">{ds.rowCount}</strong></span>
                        <span>Payer: <strong className="text-zinc-300">{ds.payerRate}%</strong></span>
                        <span>Avg LTV: <strong className="text-emerald-400">${ds.avgLTV}</strong></span>
                      </div>
                    </div>

                    {/* Feature-Target Correlation */}
                    {dsCorrs.length > 0 && (
                      <div>
                        <h5 className="text-[12px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                          <TrendingUp size={10} className="text-blue-400" /> Feature → Target Correlation (ltv_d60)
                        </h5>
                        <div className="space-y-0.5">
                          {dsCorrs.slice(0, 10).map((fc) => {
                            const absCorr = Math.abs(fc.correlation);
                            const color = absCorr > 0.5 ? "bg-emerald-500" : absCorr > 0.2 ? "bg-blue-500" : "bg-zinc-600";
                            return (
                              <div key={fc.feature} className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-400 w-[180px] truncate text-right">{fc.feature.replace(/_/g, " ")}</span>
                                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${color} rounded-full`} style={{ width: `${absCorr * 100}%` }} />
                                </div>
                                <span className={`text-[11px] font-mono w-[45px] ${fc.correlation > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  {fc.correlation > 0 ? "+" : ""}{fc.correlation}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Sample Table */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h5 className="text-[12px] font-semibold text-zinc-400">Sample Data</h5>
                        <input type="text" placeholder="Search by user ID..." value={dsInspectSearch}
                          onChange={(e) => { setDsInspectSearch(e.target.value); setDsInspectPage(0); }}
                          className="flex-1 max-w-[200px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500" />
                      </div>
                      <div className="overflow-x-auto max-h-[200px] border border-zinc-700 rounded-lg">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-zinc-800 z-10">
                            <tr className="border-b border-zinc-700">
                              <th className="px-2 py-1 text-left text-zinc-500">user_id</th>
                              <th className="px-2 py-1 text-left text-zinc-500">install_date</th>
                              <th className="px-2 py-1 text-left text-zinc-500">channel</th>
                              <th className="px-2 py-1 text-left text-zinc-500">country</th>
                              <th className="px-2 py-1 text-right text-zinc-500">sessions_w1d</th>
                              <th className="px-2 py-1 text-right text-zinc-500">ltv_d30</th>
                              <th className="px-2 py-1 text-right text-zinc-500">ltv_d60</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50">
                            {inspectPaged.map((r) => (
                              <tr key={r.game_user_id} className="hover:bg-zinc-800/30">
                                <td className="px-2 py-1 text-cyan-400 font-mono">{r.game_user_id}</td>
                                <td className="px-2 py-1 text-zinc-400">{r.install_date}</td>
                                <td className="px-2 py-1 text-zinc-400">{r.channel}</td>
                                <td className="px-2 py-1 text-zinc-400">{r.country}</td>
                                <td className="px-2 py-1 text-right text-zinc-300 font-mono">{r.sessions_cnt_w1d}</td>
                                <td className="px-2 py-1 text-right text-blue-400 font-mono">${r.ltv_d30.toFixed(2)}</td>
                                <td className="px-2 py-1 text-right text-emerald-400 font-mono">${r.ltv_d60.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-zinc-600">{inspectFiltered.length} rows{searchQ ? " (filtered)" : ""}</span>
                        <div className="flex items-center gap-1">
                          <button disabled={dsInspectPage === 0} onClick={() => setDsInspectPage((p) => p - 1)} className="px-2 py-0.5 text-[11px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">Prev</button>
                          <span className="text-[11px] text-zinc-500 px-1">{dsInspectPage + 1}/{inspectPages}</span>
                          <button disabled={dsInspectPage >= inspectPages - 1} onClick={() => setDsInspectPage((p) => p + 1)} className="px-2 py-0.5 text-[11px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">Next</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(3)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => {
              if (!datasetBuilt) handleBuildDataset();
              setActiveStep(5);
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500">
              Next: Train Model <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 5: Model Training ═══ */}
      {activeStep === 5 && (
        <div className="space-y-4">
          <InfoBanner title="Step 5 — Model Training" variant="info">
            <p>Pick the <strong>business problem</strong> you want to solve, tag the model category, select training data, then train. The problem selection is for context — it guides which features matter and what decisions the model will power.</p>
          </InfoBanner>

          {/* ─── Problem Selector (11 JTBD) — Collapsible ─── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button onClick={() => setProblemSelectorOpen((v) => !v)}
              className="w-full flex items-center gap-2 p-4 hover:bg-zinc-800/30 transition-colors">
              <HelpCircle size={14} className="text-emerald-400 shrink-0" />
              <span className="text-sm font-bold text-zinc-200">What business question are you solving?</span>
              {selectedProblemId && (() => {
                const prob = DECISION_PROBLEMS.find((p) => p.id === selectedProblemId);
                return prob ? (
                  <span className="flex items-center gap-1.5 ml-2">
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">{prob.id}</span>
                    <span className="text-[12px] text-zinc-400">{prob.shortLabel}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${MODEL_CATEGORY_META[selectedModelCategory].bgColor} ${MODEL_CATEGORY_META[selectedModelCategory].color}`}>{MODEL_CATEGORY_META[selectedModelCategory].label}</span>
                  </span>
                ) : null;
              })()}
              <span className="text-[11px] text-zinc-500 ml-auto mr-2">{problemSelectorOpen ? "Collapse" : "Expand"}</span>
              <ChevronRight size={14} className={`text-zinc-500 transition-transform ${problemSelectorOpen ? "rotate-90" : ""}`} />
            </button>

            {problemSelectorOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-zinc-800">
                {/* UA Problems */}
                <div className="pt-3">
                  <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><DollarSign size={10} className="text-emerald-400" /> UA Decisions</div>
                  <div className="grid grid-cols-3 gap-2">
                    {DECISION_PROBLEMS.filter((p) => p.category === "UA").map((p) => {
                      const isSelected = selectedProblemId === p.id;
                      return (
                        <button key={p.id} onClick={() => {
                          setSelectedProblemId(isSelected ? null : p.id);
                          if (!isSelected && p.modelFamily[0]) {
                            const newCat = p.modelFamily[0];
                            setSelectedModelCategory(newCat);
                            const rec = TARGET_VAR_OPTIONS[newCat].find((t) => t.recommended) ?? TARGET_VAR_OPTIONS[newCat][0];
                            setSelectedTargetKey(rec.key); setTargetVar(rec.engineTarget); setModelResult(null);
                          }
                        }}
                          className={`text-left p-3 rounded-lg border transition-all ${isSelected ? "border-emerald-500/50 bg-emerald-500/10" : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/30"}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">{p.id}</span>
                            <span className="text-[12px] font-semibold text-zinc-200">{p.shortLabel}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-snug">{p.question}</p>
                          <div className="flex gap-1 mt-1.5">{p.modelFamily.map((mf) => <span key={mf} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${MODEL_CATEGORY_META[mf].bgColor} ${MODEL_CATEGORY_META[mf].color}`}>{MODEL_CATEGORY_META[mf].label}</span>)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* LiveOps + Intent Problems */}
                <div>
                  <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Gamepad2 size={10} className="text-purple-400" /> LiveOps &amp; Intent Decisions</div>
                  <div className="grid grid-cols-4 gap-2">
                    {DECISION_PROBLEMS.filter((p) => p.category === "LiveOps").map((p) => {
                      const isSelected = selectedProblemId === p.id;
                      return (
                        <button key={p.id} onClick={() => {
                          setSelectedProblemId(isSelected ? null : p.id);
                          if (!isSelected && p.modelFamily[0]) {
                            const newCat = p.modelFamily[0];
                            setSelectedModelCategory(newCat);
                            const rec = TARGET_VAR_OPTIONS[newCat].find((t) => t.recommended) ?? TARGET_VAR_OPTIONS[newCat][0];
                            setSelectedTargetKey(rec.key); setTargetVar(rec.engineTarget); setModelResult(null);
                          }
                        }}
                          className={`text-left p-3 rounded-lg border transition-all ${isSelected ? "border-purple-500/50 bg-purple-500/10" : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/30"}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.id.startsWith("INT") ? "text-cyan-400 bg-cyan-500/20" : "text-purple-400 bg-purple-500/20"}`}>{p.id}</span>
                            <span className="text-[12px] font-semibold text-zinc-200">{p.shortLabel}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">{p.question}</p>
                          <div className="flex gap-1 mt-1.5">{p.modelFamily.map((mf) => <span key={mf} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${MODEL_CATEGORY_META[mf].bgColor} ${MODEL_CATEGORY_META[mf].color}`}>{MODEL_CATEGORY_META[mf].label}</span>)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected problem detail + model category tag */}
                {selectedProblemId && (() => {
                  const prob = DECISION_PROBLEMS.find((p) => p.id === selectedProblemId)!;
                  return (
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Core Features (Suggested)</div>
                        <div className="space-y-0.5">{prob.coreFeatures.map((f) => <div key={f} className="flex items-center gap-1.5 text-[11px] text-zinc-400"><ChevronRight size={8} className="text-emerald-400 shrink-0" />{f}</div>)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Activation Usecases</div>
                        <div className="space-y-0.5">{prob.activationUsecases.map((u) => <div key={u} className="flex items-center gap-1.5 text-[11px] text-zinc-400"><CheckCircle2 size={8} className="text-blue-400 shrink-0" />{u}</div>)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Model Category Tag</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(["value", "risk", "responsiveness", "intent"] as ModelCategory[]).map((cat) => {
                            const meta = MODEL_CATEGORY_META[cat];
                            return (
                              <button key={cat} onClick={() => {
                                setSelectedModelCategory(cat);
                                const rec = TARGET_VAR_OPTIONS[cat].find((t) => t.recommended) ?? TARGET_VAR_OPTIONS[cat][0];
                                setSelectedTargetKey(rec.key); setTargetVar(rec.engineTarget); setModelResult(null);
                              }}
                                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12px] font-medium border transition-all ${selectedModelCategory === cat ? meta.bgColor + " " + meta.color : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                                {meta.icon} {meta.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Training Dataset Selector */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <Database size={12} className="text-cyan-400" /> Training Dataset
              </h4>
              {datasetRegistry.length === 0 ? (
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-sm text-zinc-500">
                  <AlertTriangle size={12} className="text-amber-400 inline mr-1" />
                  No datasets. Go to <button onClick={() => setActiveStep(4)} className="text-cyan-400 underline">Step 4</button> first.
                </div>
              ) : (
                <select value={trainingDatasetId ?? ""} onChange={(e) => { setTrainingDatasetId(e.target.value ? Number(e.target.value) : null); setModelResult(null); }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500">
                  <option value="">Select dataset...</option>
                  {datasetRegistry.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
              {trainingDatasetId && (() => {
                const d = datasetRegistry.find((x) => x.id === trainingDatasetId);
                if (!d) return null;
                return (
                  <div className="mt-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700 text-[12px] space-y-0.5">
                    <div className="flex justify-between"><span className="text-zinc-500">Role</span><span className={`${d.splitRole === "train" ? "text-emerald-400" : d.splitRole === "validation" ? "text-blue-400" : "text-amber-400"}`}>{d.splitRole}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Users</span><span className="text-zinc-300">{d.rowCount}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Payer %</span><span className="text-zinc-300">{d.payerRate}%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Avg LTV</span><span className="text-emerald-400">${d.avgLTV}</span></div>
                    {d.dateRange && <div className="flex justify-between"><span className="text-zinc-500">Dates</span><span className="text-zinc-400 text-[11px]">{d.dateRange.min} → {d.dateRange.max}</span></div>}
                  </div>
                );
              })()}
            </div>

            {/* Target Variable — dynamic based on model category */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-1 flex items-center gap-2">
                <Target size={12} className="text-blue-400" /> Target Variable
              </h4>
              <div className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1.5">
                Showing targets for <span className={`font-semibold ${MODEL_CATEGORY_META[selectedModelCategory].color}`}>{MODEL_CATEGORY_META[selectedModelCategory].label}</span> models
              </div>
              <div className="space-y-1.5">
                {TARGET_VAR_OPTIONS[selectedModelCategory].map((opt) => (
                  <label key={opt.key} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ${
                    selectedTargetKey === opt.key ? "border-emerald-500/50 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                  }`}>
                    <input type="radio" checked={selectedTargetKey === opt.key} onChange={() => { setSelectedTargetKey(opt.key); setTargetVar(opt.engineTarget); setModelResult(null); }} className="accent-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] text-zinc-200">{opt.label}</span>
                        {opt.recommended && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">REC</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-zinc-800">
                <label className="flex items-center gap-2 text-[12px] text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={useLogTarget} onChange={(e) => { setUseLogTarget(e.target.checked); setModelResult(null); }} className="accent-emerald-500" />
                  Log-transform: <code className="text-emerald-400">log(1+y)</code>
                </label>
                <div className="text-[10px] text-zinc-600 mt-1 ml-5">Engine maps to <code className="text-zinc-500">{targetVar}</code></div>
              </div>
            </div>

            {/* Model Track */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <Brain size={12} className="text-purple-400" /> Model Track
              </h4>
              <div className="flex gap-2 mb-2">
                <button onClick={() => { setModelTrack("cold"); setModelResult(null); }} className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors ${modelTrack === "cold" ? "bg-blue-600/20 border-blue-500/40 text-blue-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  Cold-start
                </button>
                <button onClick={() => { setModelTrack("warm"); setModelResult(null); }} className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors ${modelTrack === "warm" ? "bg-amber-600/20 border-amber-500/40 text-amber-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  Warm-start
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                {modelTrack === "cold"
                  ? "No payment features → works for all users from D0."
                  : "Includes D7 revenue features → higher precision for payers."}
              </p>
            </div>
          </div>

          {/* Train Button */}
          <div className="flex items-center gap-4">
            <button onClick={handleTrain} disabled={!trainingDatasetId}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600">
              <Play size={16} /> Train pLTV Model{trainingDatasetId ? ` on ds_v${trainingDatasetId}` : ""}
            </button>
            {modelResult && (
              <div className="text-sm text-zinc-500">
                Trained in <span className="text-zinc-300 font-mono">{modelResult.trainingDurationMs}ms</span>
                · {modelResult.trainSize} train / {modelResult.testSize} test
                · Type: <span className="text-emerald-400">{modelResult.modelType}</span>
              </div>
            )}
          </div>

          {modelResult && (
            <div className="space-y-4">
              {/* Metrics */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "MAE", value: `$${modelResult.mae}`, color: "text-blue-400", desc: "Mean Absolute Error" },
                  { label: "RMSE", value: `$${modelResult.rmse}`, color: "text-purple-400", desc: "Root Mean Squared Error" },
                  { label: "R²", value: modelResult.r2, color: modelResult.r2 > 0.5 ? "text-green-400" : "text-amber-400", desc: "Variance explained" },
                  { label: "Top Decile Lift", value: `${modelResult.topDecileLift}x`, color: "text-amber-400", desc: "How much more top 10% spends vs avg" },
                  { label: "Top 10% Capture", value: `${Math.round(modelResult.topDecileCapture * 100)}%`, color: "text-emerald-400", desc: "% of total revenue in top decile" },
                ].map((m) => (
                  <div key={m.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                    <div className="text-[11px] text-zinc-500 mb-0.5">{m.desc}</div>
                    <div className="text-sm font-semibold text-zinc-300">{m.label}</div>
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-2 gap-4">
                {/* Decile chart */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-1">Decile Chart — Predicted vs Actual LTV</h4>
                  <p className="text-[11px] text-zinc-500 mb-2">Bars should increase left to right. Top decile should capture most revenue.</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={modelResult.decileChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="decile" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Decile", position: "bottom", fill: "#52525b", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Avg LTV ($)", angle: -90, position: "left", fill: "#52525b", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#040121ff", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "13px" }} />
                      <Bar dataKey="avgPredicted" name="Predicted" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="avgActual" name="Actual" fill="#10b981" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Calibration */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-1">Calibration — Predicted vs Actual by Bucket</h4>
                  <p className="text-[11px] text-zinc-500 mb-2">Points near the diagonal = well calibrated. Overprediction is dangerous for bidding.</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={modelResult.calibration}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="bucket" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Avg $", angle: -90, position: "left", fill: "#52525b", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "13px" }} />
                      <Bar dataKey="predicted" name="Predicted" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="actual" name="Actual" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Feature Importance */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-zinc-300 mb-2">Feature Importance (Top 15)</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={modelResult.featureImportance.slice(0, 15)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#3f3f46" }} />
                    <YAxis dataKey="feature" type="category" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} width={140} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "13px" }} />
                    <Bar dataKey="importance" fill="#10b981" radius={[0, 4, 4, 0]}>
                      {modelResult.featureImportance.slice(0, 15).map((entry, i) => {
                        const meta = PLTV_FEATURE_META.find((m) => m.name === entry.feature);
                        return <Cell key={i} fill={meta ? BLOCK_COLORS[meta.block] : "#10b981"} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* ─── Save Model to Registry ─── */}
              <div className="bg-zinc-900 border border-emerald-500/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-emerald-400" />
                    <span className="text-sm font-semibold text-zinc-200">Model Registry</span>
                    <span className="text-[11px] text-zinc-500">Save this model version for reproducible scoring at Step 6</span>
                  </div>
                  <button onClick={handleSaveModel} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98]">
                    <Save size={12} /> Save as v{modelRegistry.length + 1}
                  </button>
                </div>
                {modelRegistry.length > 0 && (
                  <div className="border border-zinc-700 rounded-lg overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead className="bg-zinc-800"><tr className="border-b border-zinc-700">
                        <th className="px-2 py-1.5 text-left text-zinc-400">Version</th>
                        <th className="px-2 py-1.5 text-left text-zinc-400">Track</th>
                        <th className="px-2 py-1.5 text-left text-zinc-400">Training Dataset</th>
                        <th className="px-2 py-1.5 text-right text-zinc-400">R²</th>
                        <th className="px-2 py-1.5 text-right text-zinc-400">MAE</th>
                        <th className="px-2 py-1.5 text-right text-zinc-400">Top Decile Lift</th>
                        <th className="px-2 py-1.5 text-right text-zinc-400">Train / Test</th>
                        <th className="px-2 py-1.5 text-left text-zinc-400">Saved</th>
                      </tr></thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {modelRegistry.map((m) => (
                          <tr key={m.id} className="hover:bg-zinc-800/30">
                            <td className="px-2 py-1.5 text-emerald-400 font-mono font-semibold">{m.name}</td>
                            <td className="px-2 py-1.5"><span className={`text-[11px] px-1.5 py-0.5 rounded-full ${m.modelTrack === "warm" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"}`}>{m.modelTrack}</span></td>
                            <td className="px-2 py-1.5 text-cyan-400 font-mono text-[11px] max-w-[160px] truncate" title={m.trainingDatasetName}>{m.trainingDatasetName}</td>
                            <td className="px-2 py-1.5 text-right font-mono"><span className={m.r2 > 0.5 ? "text-green-400" : "text-amber-400"}>{m.r2}</span></td>
                            <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">${m.mae}</td>
                            <td className="px-2 py-1.5 text-right text-amber-400 font-mono">{m.topDecileLift}x</td>
                            <td className="px-2 py-1.5 text-right text-zinc-400 font-mono">{m.trainSize} / {m.testSize}</td>
                            <td className="px-2 py-1.5 text-zinc-500">{new Date(m.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(4)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => modelResult && setActiveStep(6)} disabled={!modelResult} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600">
              Next: Scoring &amp; Inference <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 6: Strategy Comparator ═══ */}
      {activeStep === 6 && (
        <div className="space-y-4">
          <InfoBanner title="Step 6 — Strategy Comparator" variant="info">
            <p>Compare how well different strategies predict <strong>LTV90</strong>. Select datasets, strategies (pLTV models + LTV-day baselines), and K values. The comparator evaluates recall, precision, lift, and value capture against the true LTV90 ranking.</p>
          </InfoBanner>

          {/* ─── Configuration Panel ─── */}
          <div className="grid grid-cols-12 gap-4">
            {/* Left: Dataset + Strategy + K selection */}
            <div className="col-span-5 space-y-3">
              {/* Dataset Selection */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Database size={12} className="text-cyan-400" />Evaluation Dataset</h4>
                <div className="text-[11px] text-zinc-500">Select multiple datasets to evaluate across all</div>
                {datasetRegistry.length === 0 ? (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-sm text-zinc-500">
                    <AlertTriangle size={12} className="text-amber-400 inline mr-1" />
                    No datasets. Go to <button onClick={() => setActiveStep(4)} className="text-cyan-400 underline">Step 4</button> first.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {datasetRegistry.map((d) => {
                      const selected = scSelectedDatasetIds.includes(d.id);
                      return (
                        <button key={d.id} onClick={() => setScSelectedDatasetIds(selected ? scSelectedDatasetIds.filter((x) => x !== d.id) : [...scSelectedDatasetIds, d.id])}
                          className={`w-full text-left rounded-lg p-2.5 border text-[12px] transition-all ${selected ? "bg-cyan-500/10 border-cyan-500/30" : "bg-zinc-800/30 border-zinc-700 hover:border-zinc-600"}`}>
                          <div className="flex items-center justify-between">
                            <span className={`font-semibold ${selected ? "text-cyan-400" : "text-zinc-300"}`}>{d.name.split(" — ")[0]}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.splitRole === "test" ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-400"}`}>{d.splitRole}</span>
                          </div>
                          <div className="flex gap-3 mt-1 text-[10px] text-zinc-500">
                            <span>{d.rowCount} users</span>
                            <span>Payer {d.payerRate}%</span>
                            <span>Avg LTV60 ${d.avgLTV}</span>
                            <span>Avg LTV90 ${d.avgLTV90}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Strategy Selection */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Crosshair size={12} className="text-emerald-400" />Strategies</h4>
                <div className="space-y-1">
                  {([
                    { id: "model_a" as StrategyId, label: "Model A (pLTV GBT)", color: "text-emerald-400", desc: modelRegistry.length > 0 ? `${modelRegistry[0].name}` : "Trained via Step 5" },
                    { id: "model_b" as StrategyId, label: "Model B (Cold-Start)", color: "text-blue-400", desc: "Engagement-only heuristic — sessions, progression, social (no revenue)" },
                    { id: "model_c" as StrategyId, label: "Model C (Noisy Ensemble)", color: "text-purple-400", desc: "Model A + ±40% deterministic noise — simulates poor calibration" },
                    { id: "ltv3d" as StrategyId, label: "LTV 3d Ranking", color: "text-amber-400", desc: "Early-payer D3 proxy — revenue within 72h + session activity" },
                    { id: "ltv7d" as StrategyId, label: "LTV 7d Ranking", color: "text-red-400", desc: "Raw D7 revenue ranking" },
                  ]).map((s) => {
                    const checked = scSelectedStrategies.includes(s.id);
                    return (
                      <label key={s.id} className={`flex items-center gap-2 rounded-lg p-2 border cursor-pointer transition-all ${checked ? "bg-zinc-800/50 border-zinc-600" : "border-zinc-800 hover:border-zinc-700"}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setScSelectedStrategies((prev) => checked ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                          className="accent-emerald-500 w-3.5 h-3.5" />
                        <div className="flex-1">
                          <span className={`text-[12px] font-semibold ${s.color}`}>{s.label}</span>
                          <div className="text-[10px] text-zinc-500">{s.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* K Selection */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><TrendingUp size={12} className="text-purple-400" />K Selection</h4>
                <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                  <button onClick={() => setScKMode("manual")} className={`flex-1 px-2 py-1.5 rounded text-[12px] font-medium ${scKMode === "manual" ? "bg-purple-600/20 text-purple-400 border border-purple-500/30" : "text-zinc-500"}`}>Manual K</button>
                  <button onClick={() => setScKMode("preset")} className={`flex-1 px-2 py-1.5 rounded text-[12px] font-medium ${scKMode === "preset" ? "bg-purple-600/20 text-purple-400 border border-purple-500/30" : "text-zinc-500"}`}>Preset Sweep</button>
                </div>
                {scKMode === "manual" ? (
                  <div className="flex items-center gap-2">
                    <input type="range" min={10} max={Math.max(10, scSelectedDatasetIds.length > 0 ? (datasetRegistry.find((d) => d.id === scSelectedDatasetIds[0])?.rowCount ?? 1000) : 1000)} step={10} value={scManualK}
                      onChange={(e) => setScManualK(Number(e.target.value))} className="flex-1 accent-purple-500 h-1.5" />
                    <input type="number" value={scManualK} onChange={(e) => setScManualK(Number(e.target.value))}
                      className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono" />
                  </div>                  
                ) : (
                  <div className="text-[11px] text-zinc-400">
                    Sweep: 0.1%, 0.5%, 1%, 2%, 5%, 10% + absolute 100, 500, 1000
                  </div>
                )}
              </div>

              {/* Run Button */}
              <button onClick={handleRunComparison} disabled={scSelectedDatasetIds.length === 0 || scSelectedStrategies.length === 0}
                className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600 w-full justify-center">
                <Play size={16} /> Run Comparison ({scSelectedStrategies.length} strategies × {scSelectedDatasetIds.length} datasets)
              </button>
            </div>

            {/* Right: Results */}
            <div className="col-span-7 space-y-3">
              {!scComparisonResult ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
                  <BarChart3 size={32} className="text-zinc-600 mx-auto" />
                  <div className="text-sm text-zinc-500">Select datasets, strategies, and K values, then click <strong className="text-emerald-400">Run Comparison</strong>.</div>
                  {modelRegistry.length === 0 && (
                    <div className="text-[11px] text-amber-400 flex items-center gap-1 justify-center"><AlertTriangle size={10} />Train and save a model in Step 5 first for pLTV model strategies.</div>
                  )}
                </div>
              ) : (
                <>
                  {/* Dataset info */}
                  {scSelectedDatasetIds.length > 0 && (() => {
                    const selectedDatasets = scSelectedDatasetIds.map(id => datasetRegistry.find(d => d.id === id)).filter((d): d is PLTVDatasetVersion => d !== undefined);
                    if (selectedDatasets.length === 0) return null;
                    
                    const totalUsers = selectedDatasets.reduce((sum, d) => sum + d.rowCount, 0);
                    const totalLtv90 = selectedDatasets.reduce((sum, d) => sum + (d.avgLTV90 * d.rowCount), 0);
                    const avgLtv90 = totalUsers > 0 ? Math.round((totalLtv90 / totalUsers) * 100) / 100 : 0;
                    
                    return (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-cyan-400">
                              {selectedDatasets.length === 1 ? selectedDatasets[0].name : `${selectedDatasets.length} datasets combined`}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {totalUsers.toLocaleString()} users • Avg LTV90 ${avgLtv90} • 
                              {selectedDatasets.length === 1 ? `${selectedDatasets[0].splitRole} set` : `${selectedDatasets.map(d => d.splitRole).join(", ")} sets`}
                            </div>
                            {selectedDatasets.length > 1 && (
                              <div className="text-[10px] text-zinc-600 mt-1">
                                {selectedDatasets.map(d => `${d.name.split(" — ")[0]} (${d.rowCount})`).join(" • ")}
                              </div>
                            )}
                          </div>
                          <div className={`px-2 py-1 rounded text-[10px] font-bold ${
                            selectedDatasets.length === 1 && selectedDatasets[0].splitRole === "test" ? "bg-amber-500/20 text-amber-400" : 
                            selectedDatasets.length === 1 && selectedDatasets[0].splitRole === "validation" ? "bg-blue-500/20 text-blue-400" : 
                            selectedDatasets.length === 1 ? "bg-green-500/20 text-green-400" :
                            "bg-purple-500/20 text-purple-400"
                          }`}>
                            {selectedDatasets.length === 1 ? selectedDatasets[0].splitRole.toUpperCase() : "MULTI"}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Summary cards */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-emerald-400">{scComparisonResult.totalUsers.toLocaleString()}</div>
                      <div className="text-[11px] text-zinc-500">Total Users</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-cyan-400">${scComparisonResult.avgLtv90}</div>
                      <div className="text-[11px] text-zinc-500">Avg LTV90</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-purple-400">{scComparisonResult.strategies.length}</div>
                      <div className="text-[11px] text-zinc-500">Strategies</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-amber-400">{scComparisonResult.kValues.length}</div>
                      <div className="text-[11px] text-zinc-500">K Values</div>
                    </div>
                  </div>

                  {/* Metrics Table */}
                  {/* <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-zinc-200 mb-2 flex items-center gap-2"><BarChart3 size={12} className="text-emerald-400" />Strategy Metrics by K</h4>
                    <div className="overflow-x-auto max-h-[340px]">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-zinc-900 z-10">
                          <tr className="border-b border-zinc-800">
                            <th className="px-2 py-1.5 text-left text-zinc-500">Strategy</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">K</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">K%</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">Recall</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">Precision</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">Lift vs Rand</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">Lift vs LTV7</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">Value Cap</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">Mean LTV90</th>
                            <th className="px-2 py-1.5 text-right text-zinc-500">N</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {scComparisonResult.metrics.map((m, i) => {
                            const stratColor = m.strategyId === "model_a" ? "text-emerald-400" : m.strategyId === "model_b" ? "text-blue-400" : m.strategyId === "model_c" ? "text-purple-400" : m.strategyId === "ltv3d" ? "text-amber-400" : m.strategyId === "ltv7d" ? "text-red-400" : "text-cyan-400";
                            return (
                              <tr key={i} className="hover:bg-zinc-800/30">
                                <td className={`px-2 py-1 font-semibold ${stratColor}`}>{m.strategyLabel}</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-300">{m.k}</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-400">{m.kPct}%</td>
                                <td className={`px-2 py-1 text-right font-mono font-bold ${m.recall >= 0.8 ? "text-green-400" : m.recall >= 0.5 ? "text-amber-400" : "text-red-400"}`}>{(m.recall * 100).toFixed(1)}%</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-300">{(m.precision * 100).toFixed(1)}%</td>
                                <td className={`px-2 py-1 text-right font-mono ${m.liftVsRandom >= 2 ? "text-green-400" : "text-zinc-300"}`}>{m.liftVsRandom}×</td>
                                <td className={`px-2 py-1 text-right font-mono ${m.liftVsLtv7 >= 1.1 ? "text-green-400" : m.liftVsLtv7 >= 0.95 ? "text-zinc-300" : "text-red-400"}`}>{m.liftVsLtv7}×</td>
                                <td className="px-2 py-1 text-right font-mono text-emerald-400">{(m.cumValueCaptured * 100).toFixed(1)}%</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-300">${m.meanLtv90}</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-500">{m.selectedCount}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div> */}

                  {/* ─── Offline Lift Curve ─── */}
                  {scOffline && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><TrendingUp size={12} className="text-purple-400" />Offline Lift Curve</h4>
                          {scSelectedDatasetIds.length > 0 && (() => {
                            const selectedDatasets = scSelectedDatasetIds.map(id => datasetRegistry.find(d => d.id === id)).filter((d): d is PLTVDatasetVersion => d !== undefined);
                            const totalUsers = selectedDatasets.reduce((sum, d) => sum + d.rowCount, 0);
                            return (
                              <div className="text-[11px] text-zinc-500 mt-1">
                                Dataset: {selectedDatasets.length === 1 ? selectedDatasets[0].name : `${selectedDatasets.length} datasets combined`} ({totalUsers.toLocaleString()} users)
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">{scOffline.offlineNote}</div>
                      </div>
                      {(() => {
                        const base = scOffline.liftCurves[0]?.points ?? [];
                        const data = base.map((p) => {
                          const row: Record<string, number> = { x: p.x };
                          for (const s of scOffline.liftCurves) {
                            const pp = s.points.find((q) => q.x === p.x);
                            row[s.strategyId] = pp ? pp.y : 0;
                          }
                          return row;
                        });
                        return (
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={data}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="x" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }}
                                tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} domain={[0, 1]}
                                tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                                formatter={(v: unknown) => `${(Number(v) * 100).toFixed(1)}%`} labelFormatter={(l) => `${(Number(l) * 100).toFixed(1)}% selected`} />
                              {scOffline.liftCurves.map((s) => (
                                <Line key={s.strategyId} type="monotone" dataKey={s.strategyId} stroke={s.color} strokeWidth={2} dot={false} name={s.strategyLabel} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </div>
                  )}

                  {/* ─── Offline Seed Quality @ Top-K ─── */}
                  {scOffline && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div>
                        <h4 className="text-sm font-bold text-zinc-200 mb-2 flex items-center gap-2"><Target size={12} className="text-cyan-400" />Offline Seed Quality @ Top-K</h4>
                        {scSelectedDatasetIds.length > 0 && (() => {
                            const selectedDatasets = scSelectedDatasetIds.map(id => datasetRegistry.find(d => d.id === id)).filter((d): d is PLTVDatasetVersion => d !== undefined);
                            const totalUsers = selectedDatasets.reduce((sum, d) => sum + d.rowCount, 0);
                            return (
                              <div className="text-[11px] text-zinc-500 mb-2">
                                Dataset: {selectedDatasets.length === 1 ? selectedDatasets[0].name : `${selectedDatasets.length} datasets combined`} ({totalUsers.toLocaleString()} users)
                              </div>
                            );
                          })()}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="px-2 py-1.5 text-left text-zinc-500">Strategy</th>
                              <th className="px-2 py-1.5 text-right text-zinc-500">K</th>
                              <th className="px-2 py-1.5 text-right text-zinc-500">Revenue captured</th>
                              <th className="px-2 py-1.5 text-right text-zinc-500">Precision@K (whales)</th>
                              <th className="px-2 py-1.5 text-right text-zinc-500">Spearman ρ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50">
                            {scOffline.seedQuality.map((r) => (
                              <tr key={r.strategyId} className="hover:bg-zinc-800/30">
                                <td className="px-2 py-1 font-semibold" style={{ color: scOffline.liftCurves.find((s) => s.strategyId === r.strategyId)?.color ?? "#a1a1aa" }}>
                                  {r.strategyLabel}
                                </td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-300">{r.k}</td>
                                <td className="px-2 py-1 text-right font-mono text-emerald-400">{(r.revenueCaptured * 100).toFixed(1)}%</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-300">{(r.precisionAtK * 100).toFixed(1)}%</td>
                                <td className="px-2 py-1 text-right font-mono text-zinc-300">{r.spearman.toFixed(3)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-[10px] text-zinc-500">Whale threshold (90th pctl): ${scOffline.whaleThreshold} • Total target revenue: ${scOffline.totalTargetRevenue.toLocaleString()} • {scOffline.isProxy ? "⚠ Using D60 proxy" : `Target: ${scOffline.targetLabel}`}</div>
                    </div>
                  )}

                  {/* ─── Online Simulation (Activation) ─── */}
                  {scOffline && (
                    <div className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Zap size={12} className="text-cyan-400" />Online Simulation (Activation)</h4>
                          {scSelectedDatasetIds.length > 0 && (() => {
                            const selectedDatasets = scSelectedDatasetIds.map(id => datasetRegistry.find(d => d.id === id)).filter((d): d is PLTVDatasetVersion => d !== undefined);
                            const totalUsers = selectedDatasets.reduce((sum, d) => sum + d.rowCount, 0);
                            return (
                              <div className="text-[11px] text-zinc-500 mb-2">
                                Dataset: {selectedDatasets.length === 1 ? selectedDatasets[0].name : `${selectedDatasets.length} datasets combined`} ({totalUsers.toLocaleString()} users)
                              </div>
                            );
                          })()}
                        </div>
                        {scActivationResult && (
                          <div className="text-[11px] text-zinc-500 font-mono">sendNonce={scActivationResult.sendNonce}</div>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <div className="text-[10px] text-zinc-500 mb-1">Top-K</div>
                          <input type="number" value={scActivationConfig.topK}
                            onChange={(e) => setScActivationConfig((p) => ({ ...p, topK: Number(e.target.value) }))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono" />
                        </div>
                        <div>
                          <div className="text-[10px] text-zinc-500 mb-1">Budget ($)</div>
                          <input type="number" value={scActivationConfig.budget}
                            onChange={(e) => setScActivationConfig((p) => ({ ...p, budget: Number(e.target.value) }))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono" />
                        </div>
                        <div>
                          <div className="text-[10px] text-zinc-500 mb-1">Base CPI ($)</div>
                          <input type="number" step={0.1} value={scActivationConfig.baseCPI}
                            onChange={(e) => setScActivationConfig((p) => ({ ...p, baseCPI: Number(e.target.value) }))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono" />
                        </div>
                        <div>
                          <div className="text-[10px] text-zinc-500 mb-1">Ads Sensitivity (0–1)</div>
                          <input type="number" step={0.05} min={0} max={1} value={scActivationConfig.adsSensitivity}
                            onChange={(e) => setScActivationConfig((p) => ({ ...p, adsSensitivity: Number(e.target.value) }))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[12px] text-zinc-200 font-mono" />
                        </div>
                      </div>

                      <button onClick={handleSendActivation}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-[12px] font-semibold rounded-lg hover:bg-cyan-500 active:scale-[0.98] w-full justify-center">
                        <Server size={14} /> Send Seeds (Simulate Online)
                      </button>

                      {scActivationResult && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-zinc-950/30 border border-zinc-800 rounded-lg p-3">
                              <div className="text-[12px] font-bold text-zinc-200 mb-2">Activation Contract</div>
                              <table className="w-full text-[11px]">
                                <thead><tr className="border-b border-zinc-800">
                                  <th className="px-2 py-1 text-left text-zinc-500">Strategy</th>
                                  <th className="px-2 py-1 text-left text-zinc-500">Status</th>
                                </tr></thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                  {scActivationResult.contracts.map((c) => (
                                    <tr key={c.strategyId}>
                                      <td className="px-2 py-1 text-zinc-300">{c.strategyLabel}</td>
                                      <td className="px-2 py-1 font-mono text-emerald-400">{c.status}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="bg-zinc-950/30 border border-zinc-800 rounded-lg p-3">
                              <div className="text-[12px] font-bold text-zinc-200 mb-2">Activation Results</div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead><tr className="border-b border-zinc-800">
                                    <th className="px-2 py-1 text-left text-zinc-500">Strategy</th>
                                    <th className="px-2 py-1 text-right text-zinc-500">CPI</th>
                                    <th className="px-2 py-1 text-right text-zinc-500">Installs</th>
                                    <th className="px-2 py-1 text-right text-zinc-500">Revenue (D30)</th>
                                    <th className="px-2 py-1 text-right text-zinc-500">ROAS</th>
                                    <th className="px-2 py-1 text-right text-zinc-500">Profit</th>
                                  </tr></thead>
                                  <tbody className="divide-y divide-zinc-800/50">
                                    {scActivationResult.onlineResults.map((r) => (
                                      <tr key={r.strategyId}>
                                        <td className="px-2 py-1 text-zinc-300">{r.strategyLabel}</td>
                                        <td className="px-2 py-1 text-right font-mono text-zinc-300">${r.cpi.toFixed(2)}</td>
                                        <td className="px-2 py-1 text-right font-mono text-zinc-300">{r.installs.toLocaleString()}</td>
                                        <td className="px-2 py-1 text-right font-mono text-emerald-400">${r.revenue.toLocaleString()}</td>
                                        <td className="px-2 py-1 text-right font-mono text-zinc-300">{r.roas.toFixed(2)}×</td>
                                        <td className={`px-2 py-1 text-right font-mono ${r.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>${r.profit.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          <div className="bg-zinc-950/30 border border-zinc-800 rounded-lg p-3">
                            <div className="text-[12px] font-bold text-zinc-200 mb-2">Revenue Curve (D0 → D30)</div>
                            {(() => {
                              const base = scActivationResult.onlineResults[0]?.revenueCurve ?? [];
                              const data = base.map((p) => {
                                const row: Record<string, number> = { day: p.day };
                                for (const s of scActivationResult.onlineResults) {
                                  const pp = s.revenueCurve.find((q) => q.day === p.day);
                                  row[s.strategyId] = pp ? pp.revenue : 0;
                                }
                                return row;
                              });
                              return (
                                <ResponsiveContainer width="100%" height={240}>
                                  <LineChart data={data}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }}
                                      label={{ value: "Day", position: "bottom", fill: "#52525b", fontSize: 11 }} />
                                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }}
                                      tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
                                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                                      formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} labelFormatter={(l) => `Day ${l}`} />
                                    {scActivationResult.onlineResults.map((s) => {
                                      const color = scOffline?.liftCurves.find((x) => x.strategyId === s.strategyId)?.color ?? "#a1a1aa";
                                      return <Line key={s.strategyId} type="monotone" dataKey={s.strategyId} stroke={color} strokeWidth={2} dot={false} name={s.strategyLabel} />;
                                    })}
                                  </LineChart>
                                </ResponsiveContainer>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Cumulative Value Captured Curve */}
                  {scComparisonResult.kValues.length > 1 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-zinc-200 mb-2">Cumulative Value Captured vs K</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="k" type="number" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }}
                            label={{ value: "K (users selected)", position: "bottom", fill: "#52525b", fontSize: 11 }} />
                          <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#3f3f46" }} domain={[0, 1]}
                            tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "12px" }}
                            formatter={(v: unknown) => `${(Number(v) * 100).toFixed(1)}%`} />
                          {scComparisonResult.strategies.map((sid) => {
                            const data = scComparisonResult.metrics.filter((m) => m.strategyId === sid).map((m) => ({ k: m.k, value: m.cumValueCaptured }));
                            const color = sid === "model_a" ? "#10b981" : sid === "model_b" ? "#3b82f6" : sid === "model_c" ? "#8b5cf6" : sid === "ltv3d" ? "#f59e0b" : sid === "ltv7d" ? "#ef4444" : "#06b6d4";
                            return <Line key={sid} data={data} dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} name={sid} />;
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Recall Bar Chart (per strategy at each K) & Strategy Overlap */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-zinc-200 mb-2">Recall by Strategy (per K)</h4>
                      {scComparisonResult.kValues.map((k) => {
                        const kMetrics = scComparisonResult.metrics.filter((m) => m.k === k);
                        const maxRecall = Math.max(...kMetrics.map((m) => m.recall), 0.01);
                        return (
                          <div key={k} className="mb-3">
                            <div className="text-[10px] text-zinc-500 mb-1">K = {k} ({(k / scComparisonResult.totalUsers * 100).toFixed(2)}%)</div>
                            <div className="space-y-0.5">
                              {kMetrics.sort((a, b) => b.recall - a.recall).map((m) => {
                                const barColor = m.strategyId === "model_a" ? "bg-emerald-500" : m.strategyId === "model_b" ? "bg-blue-500" : m.strategyId === "model_c" ? "bg-purple-500" : m.strategyId === "ltv3d" ? "bg-amber-500" : m.strategyId === "ltv7d" ? "bg-red-500" : "bg-cyan-500";
                                return (
                                  <div key={m.strategyId} className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-400 w-28 truncate">{m.strategyLabel.split(" (")[0]}</span>
                                    <div className="flex-1 bg-zinc-800 rounded-full h-3 overflow-hidden">
                                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${(m.recall / maxRecall) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-300 w-12 text-right">{(m.recall * 100).toFixed(1)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  {/* Overlap Matrix */}
                  {scComparisonResult.overlapMatrix.length > 0 && scComparisonResult.kValues.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-zinc-200 mb-2">Strategy Overlap (Jaccard) at K={scComparisonResult.kValues[Math.floor(scComparisonResult.kValues.length / 2)]}</h4>
                      {(() => {
                        const midK = scComparisonResult.kValues[Math.floor(scComparisonResult.kValues.length / 2)];
                        const overlaps = scComparisonResult.overlapMatrix.filter((o) => o.k === midK);
                        const strats = scComparisonResult.strategies;
                        return (
                          <div className="overflow-x-auto">
                            <table className="text-[11px]">
                              <thead><tr><th className="px-2 py-1"></th>{strats.map((s) => <th key={s} className="px-2 py-1 text-zinc-400">{s.replace("model_", "M").replace("ltv", "LTV")}</th>)}</tr></thead>
                              <tbody>
                                {strats.map((s1) => (
                                  <tr key={s1}>
                                    <td className="px-2 py-1 text-zinc-400 font-semibold">{s1.replace("model_", "M").replace("ltv", "LTV")}</td>
                                    {strats.map((s2) => {
                                      if (s1 === s2) return <td key={s2} className="px-2 py-1 text-center text-zinc-600">1.000</td>;
                                      const o = overlaps.find((x) => (x.s1 === s1 && x.s2 === s2) || (x.s1 === s2 && x.s2 === s1));
                                      const val = o?.jaccard ?? 0;
                                      return <td key={s2} className={`px-2 py-1 text-center font-mono ${val > 0.7 ? "text-green-400" : val > 0.4 ? "text-amber-400" : "text-red-400"}`}>{val.toFixed(3)}</td>;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  </div>

                  {/* Auto Insights Panel */}
                  {scInsights && (
                    <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2"><Sparkles size={12} className="text-emerald-400" />Auto Insights</h4>
                        <button onClick={() => navigator.clipboard.writeText(`${scInsights.summary}\n\n${scInsights.bullets.map((b) => `• ${b.text}`).join("\n")}\n\n${scInsights.details}`)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20">Copy</button>
                      </div>
                      <p className="text-[12px] text-zinc-300 leading-relaxed">{scInsights.summary}</p>
                      <div className="space-y-1">
                        {scInsights.bullets.map((b, i) => (
                          <div key={i} className={`flex items-start gap-2 text-[12px] ${b.type === "good" ? "text-green-400" : b.type === "warning" ? "text-amber-400" : "text-blue-400"}`}>
                            {b.type === "good" ? <CheckCircle2 size={11} className="mt-0.5 shrink-0" /> : b.type === "warning" ? <AlertTriangle size={11} className="mt-0.5 shrink-0" /> : <Eye size={11} className="mt-0.5 shrink-0" />}
                            <span>{b.text}</span>
                          </div>
                        ))}
                      </div>
                      {/* Recommendations */}
                      {scInsights.recommendations.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {scInsights.recommendations.map((rec) => (
                            <div key={rec.useCase} className="bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-700">
                              <div className="text-[11px] font-bold text-zinc-300">{rec.useCase}</div>
                              <div className="text-[11px] text-emerald-400 font-mono">{rec.strategy}</div>
                              <div className="text-[10px] text-zinc-500">{rec.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Expandable Details */}
                      <button onClick={() => setScInsightsExpanded((v) => !v)}
                        className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
                        <ChevronRight size={10} className={`transition-transform ${scInsightsExpanded ? "rotate-90" : ""}`} />
                        Detailed Breakdown
                      </button>
                      {scInsightsExpanded && (
                        <pre className="bg-zinc-800 rounded-lg p-3 text-[10px] text-zinc-400 font-mono border border-zinc-700 overflow-auto max-h-[300px] whitespace-pre">{scInsights.details}</pre>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(5)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
            <button onClick={() => setActiveStep(7)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-base font-semibold rounded-lg hover:bg-emerald-500">
              Next: Decisions <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 7: Decision Data Lab ═══ */}
      {activeStep === 7 && (
        <div className="space-y-4">
          <DecisionDataLab
            modelRegistry={modelRegistry}
            scoringResult={scoringResult}
            featureRows={featureRows}
            selectedProblemId={selectedProblemId}
            selectedModelCategory={selectedModelCategory}
          />
          <div className="flex justify-between">
            <button onClick={() => setActiveStep(6)} className="px-4 py-2 text-base text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back to Scoring</button>
            <div className="text-sm text-zinc-500 flex items-center gap-2">
              <Swords size={14} className="text-emerald-400" />
              <span>End of pLTV Pipeline — <strong className="text-emerald-400">Decision Data Lab</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
