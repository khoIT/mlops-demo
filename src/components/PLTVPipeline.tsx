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
} from "@/lib/types";
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
  { label: "Instrumentation", description: "Event spec & governance", icon: <Shield size={14} /> },
  { label: "Raw Ingestion", description: "Bronze layer", icon: <Database size={14} /> },
  { label: "Clean & Unify", description: "Silver layer", icon: <Sparkles size={14} /> },
  { label: "Feature Store", description: "Gold layer — 6 blocks", icon: <Layers size={14} /> },
  { label: "Training Dataset", description: "D0–D7 → predict D60", icon: <Target size={14} /> },
  { label: "Model Training", description: "Gradient boosted trees", icon: <Brain size={14} /> },
  { label: "Scoring", description: "Deciles & segments", icon: <Zap size={14} /> },
  { label: "Audiences", description: "Segment builder", icon: <Users size={14} /> },
  { label: "Ad Platforms", description: "Push & activate", icon: <Upload size={14} /> },
  { label: "Validation", description: "Leakage & bias traps", icon: <Eye size={14} /> },
  { label: "Closed Loop", description: "Retrain & monitor", icon: <TrendingUp size={14} /> },
];

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
  const [activeStep, setActiveStep] = useState<PLTVStep>(0);
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

  // Step 6: API contract collapse
  const [apiContractExpanded, setApiContractExpanded] = useState(false);

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
    const data = generateGameData(500);
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
      result: modelResult,
      timestamp: Date.now(),
    };
    setModelRegistry((prev) => [...prev, version]);
  }, [modelResult, modelRegistry.length, modelTrack, selectedFeatures, targetVar, useLogTarget, trainingDatasetId, datasetRegistry]);

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
          const isActive = idx === activeStep;
          const stepNum = idx as PLTVStep;
          return (
            <button
              key={idx}
              onClick={() => setActiveStep(stepNum)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold ${
                isActive ? "bg-emerald-600 text-white" : "bg-zinc-700 text-zinc-400"
              }`}>
                {idx}
              </span>
              <span className="hidden xl:inline">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* ═══ Step 0: Instrumentation & Governance ═══ */}
      {activeStep === 0 && (
        <div className="space-y-4">
          <InfoBanner title="Step 0 — Instrumentation & Governance" variant="info">
            <p>Before any ML, you need <strong>clean, joinable, consented data</strong>. This step defines what to collect and how to govern it.</p>
          </InfoBanner>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><Shield size={16} className="text-emerald-400" />Identity & Attribution</h4>
              <div className="space-y-2 text-xs text-zinc-400">
                <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700">
                  <div className="font-mono text-[10px] text-emerald-400 mb-1">Join Keys (required)</div>
                  <ul className="space-y-0.5">
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" /><code className="text-zinc-300">game_user_id</code> — internal player ID</li>
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" /><code className="text-zinc-300">install_id / device_ad_id</code> — IDFA/GAID where allowed</li>
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" /><code className="text-zinc-300">mmp_user_id, click_id</code> — AppsFlyer/Adjust</li>
                  </ul>
                </div>
                <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700">
                  <div className="font-mono text-[10px] text-amber-400 mb-1">Attribution Fields</div>
                  <ul className="space-y-0.5">
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-amber-400" /><code className="text-zinc-300">install_time, campaign_id, adset_id, creative_id</code></li>
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-amber-400" /><code className="text-zinc-300">channel, country, os, device_model, app_version</code></li>
                    <li className="flex items-center gap-1.5"><ChevronRight size={10} className="text-amber-400" /><code className="text-zinc-300">consent_flags</code> (tracking + marketing)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><Database size={16} className="text-blue-400" />Event Schema</h4>
              <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700 mb-2">
                <div className="font-mono text-[10px] text-blue-400 mb-1">event_log (fact table)</div>
                <code className="text-[10px] text-zinc-400 leading-relaxed">
                  (game_user_id, event_time, event_name, params_json, session_id, client_time, server_time, app_version)
                </code>
              </div>
              <div className="text-xs text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-300">Must-have events:</p>
                <div className="grid grid-cols-2 gap-1">
                  {["session start/end", "level/stage progression", "earn/spend currencies", "guild join, chat, friend add", "gacha open, battle pass", "tutorial steps, first PvP"].map((e) => (
                    <div key={e} className="flex items-center gap-1 text-[10px]"><CheckCircle2 size={10} className="text-emerald-400" />{e}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-green-400" />Payments (Server-Authoritative)</h4>
              <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700 mb-2">
                <code className="text-[10px] text-zinc-400">payment_txn(game_user_id, txn_time, amount_usd, product_sku, payment_channel, is_refund)</code>
              </div>
              <div className="text-[10px] text-zinc-500">Also helpful: gross, net, tax, platform_fee, chargebacks/refunds</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><BarChart3 size={16} className="text-cyan-400" />UA Cost Data (Optional)</h4>
              <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700 mb-2">
                <code className="text-[10px] text-zinc-400">ua_cost(campaign_id, date, spend, impressions, clicks, installs)</code>
              </div>
              <div className="text-[10px] text-zinc-500">For ROAS & bidding simulation — not required for pLTV label.</div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
            <strong>Privacy note:</strong> If you can&apos;t use ad IDs due to privacy, push audiences via platform-specific APIs using hashed identifiers (email/phone) only with consent. Otherwise focus on internal UA evaluation.
          </div>

          <div className="flex justify-end">
            <button onClick={() => setActiveStep(1)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
              Continue to Raw Ingestion <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 1: Raw Ingestion (Bronze) ═══ */}
      {activeStep === 1 && (
        <div className="space-y-4">
          <InfoBanner title="Step 1 — Raw Ingestion (Bronze Layer)" variant="info">
            <p>Stream/batch ingest telemetry + payments + attribution. Partition by event_date. Run data quality checks: schema, nulls, volume anomalies.</p>
          </InfoBanner>

          {/* Data source controls */}
          <div className="flex items-center gap-3">
            {dataGenerated && dataSource && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {dataSource === "csv" ? "Loaded from CSV" : dataSource === "uploaded" ? "Uploaded" : "Generated in-memory"}
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  eventsFileRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Upload size={12} /> Upload CSVs
              </button>
              <button
                onClick={handleGenerateData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
              <span className="text-sm text-zinc-400">Loading game data...</span>
            </div>
          )}

          {dataGenerated && !isLoadingData && (
            <div className="space-y-4">
              {/* ─── Data Profile ─── */}
              {dataProfile && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={14} className="text-emerald-400" />
                    <span className="text-xs font-bold text-zinc-200">Data Profile</span>
                    <InfoTooltip title="Data Profile" variant="info" content={<p>Overview of ingested raw data: event distribution, attribution channels, top players, and summary metrics.</p>} />
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {/* Event Type Distribution */}
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                      <h5 className="text-[10px] font-semibold text-zinc-400 mb-2">Event Type Distribution</h5>
                      <div className="space-y-1">
                        {dataProfile.eventDistribution.slice(0, 10).map((d) => {
                          const maxCount = dataProfile.eventDistribution[0]?.count || 1;
                          const pct = (d.count / maxCount) * 100;
                          return (
                            <div key={d.name} className="flex items-center gap-2 text-[9px]">
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
                        <h5 className="text-[10px] font-semibold text-zinc-400 mb-2">Channel Distribution</h5>
                        <div className="space-y-1">
                          {dataProfile.channelDistribution.map((d) => {
                            const maxCount = dataProfile.channelDistribution[0]?.count || 1;
                            const pct = (d.count / maxCount) * 100;
                            return (
                              <div key={d.name} className="flex items-center gap-2 text-[9px]">
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
                        <h5 className="text-[10px] font-semibold text-zinc-400 mb-2">OS Distribution</h5>
                        <div className="space-y-1">
                          {dataProfile.osDistribution.map((d) => {
                            const maxCount = dataProfile.osDistribution[0]?.count || 1;
                            const pct = (d.count / maxCount) * 100;
                            return (
                              <div key={d.name} className="flex items-center gap-2 text-[9px]">
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
                      <h5 className="text-[10px] font-semibold text-zinc-400 mb-2">Top Players by Activity</h5>
                      <div className="space-y-1">
                        {dataProfile.topPlayers.map((d) => {
                          const maxCount = dataProfile.topPlayers[0]?.count || 1;
                          const pct = (d.count / maxCount) * 100;
                          return (
                            <div key={d.name} className="flex items-center gap-2 text-[9px]">
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
                        <div className="text-[9px] text-zinc-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Players Table ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
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
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
                  />
                  <select value={playerFilterChannel} onChange={(e) => { setPlayerFilterChannel(e.target.value); setPlayerPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All Channels</option>
                    {playerChannels.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={playerFilterCountry} onChange={(e) => { setPlayerFilterCountry(e.target.value); setPlayerPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All Countries</option>
                    {playerCountries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={playerFilterOS} onChange={(e) => { setPlayerFilterOS(e.target.value); setPlayerPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-emerald-500/50">
                    <option value="all">All OS</option>
                    {playerOSes.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="overflow-x-auto max-h-[300px] border border-zinc-800 rounded-lg">
                  <table className="w-full text-[10px]">
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
                          <td className="px-2 py-1 text-zinc-500 text-[9px]">{p.device_model}</td>
                          <td className="px-2 py-1 text-zinc-500 font-mono text-[9px]">{p.campaign_id}</td>
                          <td className="px-2 py-1">
                            <div className="flex gap-1">
                              {p.consent_tracking ? <CheckCircle2 size={10} className="text-green-400" /> : <AlertTriangle size={10} className="text-red-400" />}
                              {p.consent_marketing ? <CheckCircle2 size={10} className="text-blue-400" /> : <AlertTriangle size={10} className="text-zinc-600" />}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pagedPlayers.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-600 text-xs">No players match your filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] text-zinc-600">
                    Showing {playerPage * PLAYER_PAGE_SIZE + 1}–{Math.min((playerPage + 1) * PLAYER_PAGE_SIZE, filteredPlayers.length)} of {filteredPlayers.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={playerPage === 0} onClick={() => setPlayerPage((p) => p - 1)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                    <span className="text-[9px] text-zinc-500 px-2">{playerPage + 1} / {playerTotalPages}</span>
                    <button disabled={playerPage >= playerTotalPages - 1} onClick={() => setPlayerPage((p) => p + 1)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              </div>

              {/* ─── Events Table ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
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
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
                  />
                  <select value={eventFilterName} onChange={(e) => { setEventFilterName(e.target.value); setEventPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-blue-500/50">
                    <option value="all">All Events</option>
                    {eventNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select value={eventFilterUser} onChange={(e) => { setEventFilterUser(e.target.value); setEventPage(0); }} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-blue-500/50 max-w-[160px]">
                    <option value="all">All Players</option>
                    {eventUserIds.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="overflow-x-auto max-h-[320px] border border-zinc-800 rounded-lg">
                  <table className="w-full text-[10px]">
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
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              e.event_name.includes("session") ? "bg-blue-500/10 text-blue-400" :
                              e.event_name.includes("level") || e.event_name.includes("quest") ? "bg-purple-500/10 text-purple-400" :
                              e.event_name.includes("soft") || e.event_name.includes("hard") || e.event_name.includes("gacha") || e.event_name.includes("shop") ? "bg-amber-500/10 text-amber-400" :
                              e.event_name.includes("guild") || e.event_name.includes("friend") || e.event_name.includes("chat") ? "bg-green-500/10 text-green-400" :
                              e.event_name.includes("pvp") || e.event_name.includes("pve") || e.event_name.includes("dungeon") ? "bg-red-500/10 text-red-400" :
                              "bg-zinc-700/50 text-zinc-300"
                            }`}>{e.event_name}</span>
                          </td>
                          <td className="px-2 py-1 text-zinc-600 font-mono text-[9px]">{e.session_id}</td>
                          <td className="px-2 py-1 text-zinc-500 font-mono text-[9px] max-w-[200px] truncate">
                            {Object.entries(e.params).map(([k, v]) => `${k}=${v}`).join("; ") || "—"}
                          </td>
                        </tr>
                      ))}
                      {pagedEvents.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600 text-xs">No events match your filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] text-zinc-600">
                    Showing {filteredEvents.length > 0 ? eventPage * EVENT_PAGE_SIZE + 1 : 0}–{Math.min((eventPage + 1) * EVENT_PAGE_SIZE, filteredEvents.length)} of {filteredEvents.length.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button disabled={eventPage === 0} onClick={() => setEventPage((p) => p - 1)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                    <span className="text-[9px] text-zinc-500 px-2">{eventPage + 1} / {eventTotalPages}</span>
                    <button disabled={eventPage >= eventTotalPages - 1} onClick={() => setEventPage((p) => p + 1)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(0)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => { if (!dataGenerated) handleGenerateData(); setActiveStep(2); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
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
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              <Play size={16} /> Run Cleaning Pipeline
            </button>
          )}

          {cleaningReport && (
            <div className="space-y-4">
              {/* ─── Before → After Summary ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
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
                      <div className="text-[9px] text-zinc-500 mb-1">{s.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 font-mono">{s.before}</span>
                        <ArrowRight size={10} className="text-zinc-600" />
                        <span className={`text-sm font-bold font-mono ${s.color}`}>{s.after}</span>
                      </div>
                      <div className="text-[8px] text-zinc-600 mt-0.5">{s.delta}</div>
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
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">1</div>
                      <h5 className="text-xs font-bold text-zinc-200">Deduplicate Events</h5>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-2">Hash key: <code className="text-emerald-400">game_user_id | session_id | event_time | event_name</code></div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-zinc-300">{cleaningReport.rawEventCount.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">Raw</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-amber-400">{cleaningReport.duplicatesRemoved.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">Duplicates</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-emerald-400">{cleaningReport.dedupedEventCount.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">After Dedup</div>
                      </div>
                    </div>
                    {cleaningReport.duplicateExamples.length > 0 && (
                      <div className="mt-2 text-[9px] text-zinc-500">
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
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">2</div>
                      <h5 className="text-xs font-bold text-zinc-200">Normalize Timestamps & Quarantine Late Events</h5>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-2">
                      All timestamps → <code className="text-emerald-400">server_time (UTC)</code>. Events before install (clock drift &gt;1h) or &gt;62 days after install → quarantined.
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-emerald-400">{cleaningReport.timestampsNormalized.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">Passed</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className={`text-xs font-bold ${cleaningReport.lateEventsQuarantined > 0 ? "text-red-400" : "text-zinc-500"}`}>{cleaningReport.lateEventsQuarantined}</div>
                        <div className="text-[8px] text-zinc-600">Quarantined</div>
                      </div>
                    </div>
                    {cleaningReport.lateEventExamples.length > 0 && (
                      <div className="mt-2 text-[9px] text-zinc-500">
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
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">3</div>
                      <h5 className="text-xs font-bold text-zinc-200">Identity Mapping & Consent</h5>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-2">
                      Join <code className="text-emerald-400">game_user_id ↔ install_id</code> with consent flags. Only users with tracking consent eligible for ad platform activation.
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-zinc-300">{cleaningReport.totalPlayers.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">Total Players</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-green-400">{cleaningReport.playersWithConsent}</div>
                        <div className="text-[8px] text-zinc-600">With Consent</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className={`text-xs font-bold ${cleaningReport.playersWithoutConsent > 0 ? "text-amber-400" : "text-zinc-500"}`}>{cleaningReport.playersWithoutConsent}</div>
                        <div className="text-[8px] text-zinc-600">No Consent</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: More transformations + quality */}
                <div className="space-y-3">
                  {/* 4. Revenue standardization */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">4</div>
                      <h5 className="text-xs font-bold text-zinc-200">Revenue Standardization</h5>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">done</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-2">
                      All amounts → <code className="text-emerald-400">USD net</code>. Refund transactions removed; refund amounts deducted from gross revenue.
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-zinc-300">{cleaningReport.totalTxn}</div>
                        <div className="text-[8px] text-zinc-600">Raw Txns</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-red-400">{cleaningReport.refundCount}</div>
                        <div className="text-[8px] text-zinc-600">Refunds</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-zinc-400">${cleaningReport.grossRevenueUsd.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">Gross</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded p-1.5">
                        <div className="text-xs font-bold text-green-400">${cleaningReport.netRevenueUsd.toLocaleString()}</div>
                        <div className="text-[8px] text-zinc-600">Net</div>
                      </div>
                    </div>
                  </div>

                  {/* 5. Schema validation */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">5</div>
                      <h5 className="text-xs font-bold text-zinc-200">Schema Validation</h5>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-auto ${
                        (cleaningReport.nullUserIds + cleaningReport.nullEventNames + cleaningReport.nullTimestamps) === 0
                          ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {(cleaningReport.nullUserIds + cleaningReport.nullEventNames + cleaningReport.nullTimestamps) === 0 ? "passed" : "issues"}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-2">Check every row for required fields: <code className="text-emerald-400">game_user_id</code>, <code className="text-emerald-400">event_name</code>, <code className="text-emerald-400">event_time</code>, <code className="text-emerald-400">session_id</code>.</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Null user_id", val: cleaningReport.nullUserIds },
                        { label: "Null event_name", val: cleaningReport.nullEventNames },
                        { label: "Null timestamp", val: cleaningReport.nullTimestamps },
                        { label: "Missing session", val: cleaningReport.missingSessionIds },
                      ].map((c) => (
                        <div key={c.label} className="bg-zinc-800/50 rounded p-1.5">
                          <div className={`text-xs font-bold ${c.val === 0 ? "text-green-400" : "text-red-400"}`}>{c.val}</div>
                          <div className="text-[8px] text-zinc-600">{c.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 6. Volume anomaly */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">6</div>
                      <h5 className="text-xs font-bold text-zinc-200">Volume Anomaly Detection</h5>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-auto ${
                        cleaningReport.volumeAnomalies.length === 0
                          ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {cleaningReport.volumeAnomalies.length === 0 ? "no anomalies" : `${cleaningReport.volumeAnomalies.length} anomalies`}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mb-2">
                      Avg <code className="text-emerald-400">{cleaningReport.avgEventsPerDay.toLocaleString()}</code> events/day ± <code className="text-emerald-400">{cleaningReport.stdEventsPerDay.toLocaleString()}</code>. Flag days with |z-score| &gt; 2.
                    </div>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={cleaningReport.eventsPerDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 8 }} axisLine={{ stroke: "#3f3f46" }} tickFormatter={(d: string) => d.slice(5)} />
                        <YAxis tick={{ fill: "#52525b", fontSize: 8 }} axisLine={{ stroke: "#3f3f46" }} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "10px" }} />
                        <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
                        <ReferenceLine y={cleaningReport.avgEventsPerDay} stroke="#3b82f6" strokeDasharray="4 4" />
                      </BarChart>
                    </ResponsiveContainer>
                    {cleaningReport.volumeAnomalies.length > 0 && (
                      <div className="mt-1 text-[9px] text-amber-400/70">
                        Anomalies: {cleaningReport.volumeAnomalies.map((a) => `${a.date} (z=${a.zscore})`).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Silver Output Schema ─── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
                  <Layers size={12} className="text-blue-400" /> Silver Layer Output — What the data looks like now
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-[10px] font-semibold text-blue-400 mb-1">silver.event_log</div>
                    <div className="text-[9px] text-zinc-400 space-y-0.5">
                      <div><code className="text-zinc-300">game_user_id</code> — deduplicated, non-null</div>
                      <div><code className="text-zinc-300">event_time</code> — server UTC, within [install, install+62d]</div>
                      <div><code className="text-zinc-300">event_name</code> — standardized 22 event types</div>
                      <div><code className="text-zinc-300">session_id</code> — session boundary marker</div>
                      <div><code className="text-zinc-300">params</code> — parsed key=value pairs</div>
                      <div className="pt-1 text-emerald-400 font-mono">{cleaningReport.timestampsNormalized.toLocaleString()} rows</div>
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-[10px] font-semibold text-blue-400 mb-1">silver.player_identity</div>
                    <div className="text-[9px] text-zinc-400 space-y-0.5">
                      <div><code className="text-zinc-300">game_user_id</code> — primary key</div>
                      <div><code className="text-zinc-300">install_id</code> — MMP join key</div>
                      <div><code className="text-zinc-300">install_time</code> — UTC</div>
                      <div><code className="text-zinc-300">channel, campaign, country, os</code> — attribution</div>
                      <div><code className="text-zinc-300">consent_tracking, consent_marketing</code> — boolean</div>
                      <div className="pt-1 text-emerald-400 font-mono">{cleaningReport.totalPlayers.toLocaleString()} rows</div>
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-[10px] font-semibold text-blue-400 mb-1">silver.payment_txn</div>
                    <div className="text-[9px] text-zinc-400 space-y-0.5">
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
            <button onClick={() => setActiveStep(1)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => {
              if (!cleaningRan && dataGenerated) {
                const { cleanedEvents, cleanedPayments, report } = runCleaningPipeline(players, events, payments);
                setCleaningReport(report);
                setEvents(cleanedEvents);
                setPayments(cleanedPayments);
                setCleaningRan(true);
              }
              setActiveStep(3);
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
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
                      <h4 className="text-xs font-bold text-zinc-200">{features[0].blockLabel}</h4>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">{selectedInBlock}/{features.length} selected</span>
                      {features.some((m) => m.leakageRisk === "high" && selectedFeatures.includes(m.name)) && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">has leak risk</span>
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
                                <span className="text-[10px] font-semibold text-zinc-200">{meta.label}</span>
                                {meta.leakageRisk !== "none" && (
                                  <span className={`text-[8px] px-1 rounded ${meta.leakageRisk === "high" ? "bg-red-500/20 text-red-400" : meta.leakageRisk === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                                    {meta.leakageRisk} leak
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-zinc-500 mt-0.5 ml-4">{meta.description}</div>
                              {stat && isSelected && (
                                <div className="flex gap-2 mt-1 ml-4 text-[8px] text-zinc-600">
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
            <div className="text-xs text-zinc-400">
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
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                <Play size={14} /> Compute Feature Store
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <CheckCircle2 size={12} /> Computed — {featureRows.length.toLocaleString()} users
              </span>
            )}
          </div>

          {/* Feature Store Preview Table */}
          {featureStoreComputed && featureRows.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
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
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 max-w-[240px]"
                />
                <select
                  value={fsFilterFeature}
                  onChange={(e) => setFsFilterFeature(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-zinc-300 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="all">All Selected Features ({selectedFeatures.length})</option>
                  {selectedFeatures.map((f) => (
                    <option key={f} value={f}>{f.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto max-h-[320px] border border-zinc-800 rounded-lg">
                <table className="w-full text-[9px]">
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
                      <tr><td colSpan={fsDisplayColumns.length + 3} className="px-3 py-6 text-center text-zinc-600 text-xs">No users match your search</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-[9px] text-zinc-600">
                  Showing {fsFilteredRows.length > 0 ? fsPage * FS_PAGE_SIZE + 1 : 0}–{Math.min((fsPage + 1) * FS_PAGE_SIZE, fsFilteredRows.length)} of {fsFilteredRows.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button disabled={fsPage === 0} onClick={() => setFsPage((p) => p - 1)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                  <span className="text-[9px] text-zinc-500 px-2">{fsPage + 1} / {fsTotalPages}</span>
                  <button disabled={fsPage >= fsTotalPages - 1} onClick={() => setFsPage((p) => p + 1)} className="px-2 py-0.5 text-[10px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(2)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => {
              if (!featureStoreComputed && dataGenerated) {
                if (featureRows.length === 0) {
                  const features = computePLTVFeatures(players, events, payments);
                  setFeatureRows(features);
                }
                setFeatureStoreComputed(true);
              }
              setActiveStep(4);
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
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
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <BarChart3 size={12} className="text-amber-400" /> Split Strategy
              </h4>
              <div className="flex gap-2 mb-3">
                <button onClick={() => { setSplitStrategy("temporal"); setDatasetBuilt(false); }}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-[11px] font-medium border transition-colors ${splitStrategy === "temporal" ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  <Clock size={12} className="inline mr-1" /> Temporal Split
                </button>
                <button onClick={() => { setSplitStrategy("random"); setDatasetBuilt(false); }}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-[11px] font-medium border transition-colors ${splitStrategy === "random" ? "bg-blue-600/20 border-blue-500/40 text-blue-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  <Layers size={12} className="inline mr-1" /> Random Split
                </button>
              </div>
              {splitStrategy === "temporal" ? (
                <div className="space-y-2">
                  <p className="text-[9px] text-zinc-500 mb-2">Assign install months to train/val/test. Mirrors production: train on older, test on newest.</p>
                  {installMonthDist.map((d) => {
                    const label = new Date(d.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" });
                    const current = trainMonths.includes(d.month) ? "train" : valMonths.includes(d.month) ? "val" : testMonths.includes(d.month) ? "test" : "none";
                    return (
                      <div key={d.month} className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-300 w-20">{label}</span>
                        <span className="text-[9px] text-zinc-500 w-16">{d.count} users</span>
                        <div className="flex gap-1">
                          {(["train", "val", "test"] as const).map((split) => (
                            <button key={split} onClick={() => {
                              setTrainMonths((prev) => split === "train" ? [...prev.filter((m) => m !== d.month), d.month] : prev.filter((m) => m !== d.month));
                              setValMonths((prev) => split === "val" ? [...prev.filter((m) => m !== d.month), d.month] : prev.filter((m) => m !== d.month));
                              setTestMonths((prev) => split === "test" ? [...prev.filter((m) => m !== d.month), d.month] : prev.filter((m) => m !== d.month));
                              setDatasetBuilt(false);
                            }} className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
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
                    <div className="flex justify-between text-[10px] mb-1">
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
                      <label className="text-[9px] text-zinc-500">Train %</label>
                      <input type="range" min={50} max={85} step={5} value={trainSplit * 100}
                        onChange={(e) => { const v = Number(e.target.value) / 100; setTrainSplit(v); setValSplit(Math.min(valSplit, (1 - v) * 0.8)); setDatasetBuilt(false); }}
                        className="w-full accent-emerald-500 h-1" />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500">Val %</label>
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
                <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
                  <Zap size={12} className="text-emerald-400" /> Split &amp; Save Datasets
                </h4>
                {!datasetBuilt ? (
                  <div className="space-y-3">
                    <button onClick={handleBuildDataset} disabled={filteredFeatureRows.length === 0}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600">
                      <Play size={16} /> Split &amp; Save ({filteredFeatureRows.length} users → 3 datasets)
                    </button>
                    {splitStrategy === "temporal" && (
                      <div className="text-[9px] text-zinc-500 bg-zinc-800/50 rounded p-2">
                        Train: <strong className="text-emerald-400">{trainMonths.map((m) => new Date(m + "-01").toLocaleDateString("en-US", { month: "short" })).join(" + ")}</strong>
                        {" · "}Val: <strong className="text-blue-400">{valMonths.map((m) => new Date(m + "-01").toLocaleDateString("en-US", { month: "short" })).join(" + ")}</strong>
                        {" · "}Test: <strong className="text-amber-400">{testMonths.map((m) => new Date(m + "-01").toLocaleDateString("en-US", { month: "short" })).join(" + ")}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs">
                      <CheckCircle2 size={14} /> 3 datasets saved to registry ({splitStrategy} split)
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                        <div className="text-xs font-bold text-emerald-400">{trainSet.length}</div>
                        <div className="text-[8px] text-zinc-600">Train</div>
                      </div>
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2">
                        <div className="text-xs font-bold text-blue-400">{valSet.length}</div>
                        <div className="text-[8px] text-zinc-600">Validation</div>
                      </div>
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2">
                        <div className="text-xs font-bold text-amber-400">{testSet.length}</div>
                        <div className="text-[8px] text-zinc-600">Test</div>
                      </div>
                    </div>
                    {excludedCount > 0 && <div className="text-[9px] text-red-400">{excludedCount} users unassigned/excluded</div>}
                    <button onClick={() => setDatasetBuilt(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300 underline">Re-split with different settings</button>
                  </div>
                )}
              </div>

              {/* LTV Distribution */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-bold text-zinc-200 mb-2">LTV Distribution (all data)</h4>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={ltvDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 8 }} axisLine={{ stroke: "#3f3f46" }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 8 }} axisLine={{ stroke: "#3f3f46" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "10px" }} />
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
                <span className="text-xs font-semibold text-zinc-200">Dataset Registry</span>
                <span className="text-[9px] text-zinc-500">— Click any dataset to inspect</span>
              </div>
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <table className="w-full text-[10px]">
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
                          <td className="px-2 py-1.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${roleColor}`}>{ds.splitRole}</span></td>
                          <td className="px-2 py-1.5 text-zinc-400 font-mono text-[9px]">{ds.dateRange ? `${ds.dateRange.min} → ${ds.dateRange.max}` : "—"}</td>
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
                      <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
                        <Eye size={12} className="text-cyan-400" /> Inspecting: <span className="text-cyan-400 font-mono">{ds.name}</span>
                      </h4>
                      <div className="flex items-center gap-3 text-[9px] text-zinc-500">
                        <span>Rows: <strong className="text-zinc-300">{ds.rowCount}</strong></span>
                        <span>Payer: <strong className="text-zinc-300">{ds.payerRate}%</strong></span>
                        <span>Avg LTV: <strong className="text-emerald-400">${ds.avgLTV}</strong></span>
                      </div>
                    </div>

                    {/* Feature-Target Correlation */}
                    {dsCorrs.length > 0 && (
                      <div>
                        <h5 className="text-[10px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                          <TrendingUp size={10} className="text-blue-400" /> Feature → Target Correlation (ltv_d60)
                        </h5>
                        <div className="space-y-0.5">
                          {dsCorrs.slice(0, 10).map((fc) => {
                            const absCorr = Math.abs(fc.correlation);
                            const color = absCorr > 0.5 ? "bg-emerald-500" : absCorr > 0.2 ? "bg-blue-500" : "bg-zinc-600";
                            return (
                              <div key={fc.feature} className="flex items-center gap-2">
                                <span className="text-[9px] text-zinc-400 w-[180px] truncate text-right">{fc.feature.replace(/_/g, " ")}</span>
                                <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${color} rounded-full`} style={{ width: `${absCorr * 100}%` }} />
                                </div>
                                <span className={`text-[9px] font-mono w-[45px] ${fc.correlation > 0 ? "text-emerald-400" : "text-red-400"}`}>
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
                        <h5 className="text-[10px] font-semibold text-zinc-400">Sample Data</h5>
                        <input type="text" placeholder="Search by user ID..." value={dsInspectSearch}
                          onChange={(e) => { setDsInspectSearch(e.target.value); setDsInspectPage(0); }}
                          className="flex-1 max-w-[200px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500" />
                      </div>
                      <div className="overflow-x-auto max-h-[200px] border border-zinc-700 rounded-lg">
                        <table className="w-full text-[9px]">
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
                        <span className="text-[9px] text-zinc-600">{inspectFiltered.length} rows{searchQ ? " (filtered)" : ""}</span>
                        <div className="flex items-center gap-1">
                          <button disabled={dsInspectPage === 0} onClick={() => setDsInspectPage((p) => p - 1)} className="px-2 py-0.5 text-[9px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">Prev</button>
                          <span className="text-[9px] text-zinc-500 px-1">{dsInspectPage + 1}/{inspectPages}</span>
                          <button disabled={dsInspectPage >= inspectPages - 1} onClick={() => setDsInspectPage((p) => p + 1)} className="px-2 py-0.5 text-[9px] rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">Next</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(3)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => {
              if (!datasetBuilt) handleBuildDataset();
              setActiveStep(5);
            }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
              Next: Train Model <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 5: Model Training ═══ */}
      {activeStep === 5 && (
        <div className="space-y-4">
          <InfoBanner title="Step 5 — Model Training" variant="info">
            <p>Select a <strong>training dataset</strong> from Step 4, configure the target variable and model track, then train. Save the model to the registry for scoring in Step 6.</p>
          </InfoBanner>

          <div className="grid grid-cols-3 gap-4">
            {/* Training Dataset Selector */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <Database size={12} className="text-cyan-400" /> Training Dataset
              </h4>
              {datasetRegistry.length === 0 ? (
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-xs text-zinc-500">
                  <AlertTriangle size={12} className="text-amber-400 inline mr-1" />
                  No datasets. Go to <button onClick={() => setActiveStep(4)} className="text-cyan-400 underline">Step 4</button> first.
                </div>
              ) : (
                <select value={trainingDatasetId ?? ""} onChange={(e) => { setTrainingDatasetId(e.target.value ? Number(e.target.value) : null); setModelResult(null); }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-cyan-500">
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
                  <div className="mt-2 bg-zinc-800/50 rounded-lg p-2 border border-zinc-700 text-[10px] space-y-0.5">
                    <div className="flex justify-between"><span className="text-zinc-500">Role</span><span className={`${d.splitRole === "train" ? "text-emerald-400" : d.splitRole === "validation" ? "text-blue-400" : "text-amber-400"}`}>{d.splitRole}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Users</span><span className="text-zinc-300">{d.rowCount}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Payer %</span><span className="text-zinc-300">{d.payerRate}%</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Avg LTV</span><span className="text-emerald-400">${d.avgLTV}</span></div>
                    {d.dateRange && <div className="flex justify-between"><span className="text-zinc-500">Dates</span><span className="text-zinc-400 text-[9px]">{d.dateRange.min} → {d.dateRange.max}</span></div>}
                  </div>
                );
              })()}
            </div>

            {/* Target Variable */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <Target size={12} className="text-blue-400" /> Target Variable
              </h4>
              <div className="space-y-2">
                {(["ltv_d60", "ltv_d30"] as const).map((t) => (
                  <label key={t} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all ${
                    targetVar === t ? "border-emerald-500/50 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                  }`}>
                    <input type="radio" checked={targetVar === t} onChange={() => { setTargetVar(t); setModelResult(null); }} className="accent-emerald-500" />
                    <div>
                      <div className="text-[11px] text-zinc-200">{t === "ltv_d60" ? "LTV D60" : "LTV D30"}</div>
                      <div className="text-[9px] text-zinc-500">{t === "ltv_d60" ? "Revenue → day 60" : "Revenue → day 30"}</div>
                    </div>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[10px] text-zinc-300 cursor-pointer mt-2">
                <input type="checkbox" checked={useLogTarget} onChange={(e) => { setUseLogTarget(e.target.checked); setModelResult(null); }} className="accent-emerald-500" />
                Log-transform: <code className="text-emerald-400">log(1+LTV)</code>
              </label>
            </div>

            {/* Model Track */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2">
                <Brain size={12} className="text-purple-400" /> Model Track
              </h4>
              <div className="flex gap-2 mb-2">
                <button onClick={() => { setModelTrack("cold"); setModelResult(null); }} className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-medium border transition-colors ${modelTrack === "cold" ? "bg-blue-600/20 border-blue-500/40 text-blue-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  Cold-start
                </button>
                <button onClick={() => { setModelTrack("warm"); setModelResult(null); }} className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-medium border transition-colors ${modelTrack === "warm" ? "bg-amber-600/20 border-amber-500/40 text-amber-400" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}>
                  Warm-start
                </button>
              </div>
              <p className="text-[9px] text-zinc-500">
                {modelTrack === "cold"
                  ? "No payment features → works for all users from D0."
                  : "Includes D7 revenue features → higher precision for payers."}
              </p>
            </div>
          </div>

          {/* Train Button */}
          <div className="flex items-center gap-4">
            <button onClick={handleTrain} disabled={!trainingDatasetId}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600">
              <Play size={16} /> Train pLTV Model{trainingDatasetId ? ` on ds_v${trainingDatasetId}` : ""}
            </button>
            {modelResult && (
              <div className="text-xs text-zinc-500">
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
                    <div className="text-[9px] text-zinc-500 mb-0.5">{m.desc}</div>
                    <div className="text-xs font-semibold text-zinc-300">{m.label}</div>
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-2 gap-4">
                {/* Decile chart */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-zinc-300 mb-1">Decile Chart — Predicted vs Actual LTV</h4>
                  <p className="text-[9px] text-zinc-500 mb-2">Bars should increase left to right. Top decile should capture most revenue.</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={modelResult.decileChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="decile" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Decile", position: "bottom", fill: "#52525b", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Avg LTV ($)", angle: -90, position: "left", fill: "#52525b", fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#040121ff", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
                      <Bar dataKey="avgPredicted" name="Predicted" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="avgActual" name="Actual" fill="#10b981" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Calibration */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-zinc-300 mb-1">Calibration — Predicted vs Actual by Bucket</h4>
                  <p className="text-[9px] text-zinc-500 mb-2">Points near the diagonal = well calibrated. Overprediction is dangerous for bidding.</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={modelResult.calibration}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="bucket" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={{ stroke: "#3f3f46" }} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Avg $", angle: -90, position: "left", fill: "#52525b", fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
                      <Bar dataKey="predicted" name="Predicted" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="actual" name="Actual" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Feature Importance */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-zinc-300 mb-2">Feature Importance (Top 15)</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={modelResult.featureImportance.slice(0, 15)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} />
                    <YAxis dataKey="feature" type="category" tick={{ fill: "#a1a1aa", fontSize: 9 }} axisLine={{ stroke: "#3f3f46" }} width={140} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
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
                    <span className="text-xs font-semibold text-zinc-200">Model Registry</span>
                    <span className="text-[9px] text-zinc-500">Save this model version for reproducible scoring at Step 6</span>
                  </div>
                  <button onClick={handleSaveModel} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98]">
                    <Save size={12} /> Save as v{modelRegistry.length + 1}
                  </button>
                </div>
                {modelRegistry.length > 0 && (
                  <div className="border border-zinc-700 rounded-lg overflow-hidden">
                    <table className="w-full text-[10px]">
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
                            <td className="px-2 py-1.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full ${m.modelTrack === "warm" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"}`}>{m.modelTrack}</span></td>
                            <td className="px-2 py-1.5 text-cyan-400 font-mono text-[9px] max-w-[160px] truncate" title={m.trainingDatasetName}>{m.trainingDatasetName}</td>
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
            <button onClick={() => setActiveStep(4)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => modelResult && setActiveStep(6)} disabled={!modelResult} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600">
              Next: Scoring &amp; Inference <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 6: Online Inference ═══ */}
      {activeStep === 6 && (
        <div className="space-y-4">
          <InfoBanner title="Step 6 — Scoring &amp; Testing" variant="info">
            <p>Select a <strong>saved model</strong> from Step 5 and <strong>any dataset</strong> from Step 4 (e.g. the test split, validation split, or even a different cohort). This simulates production scoring where a frozen model scores unseen data.</p>
          </InfoBanner>

          {/* ─── Historical vs Online callout ─── */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 flex items-start gap-2">
            <Server size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <strong>Historical Training → Online Inference separation:</strong>
              <span className="text-zinc-400 ml-1">Step 5 trains on past data (e.g. Oct+Nov). Step 6 scores <em>new</em> data (e.g. Jan cohort) with the frozen model. This mirrors how production ML systems work — the model is retrained periodically on historical batches, while inference runs continuously on fresh data.</span>
            </div>
          </div>

          {/* ─── Model × Dataset Selector ─── */}
          <div className="bg-zinc-900 border border-emerald-500/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Server size={16} className="text-emerald-400" />
              <span className="text-sm font-bold text-zinc-200">Inference Configuration</span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Production pattern</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Model selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <GitBranch size={10} className="text-emerald-400" /> Model Version
                </label>
                {modelRegistry.length === 0 ? (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-xs text-zinc-500">
                    <AlertTriangle size={12} className="text-amber-400 inline mr-1" />
                    No models saved. Go to <button onClick={() => setActiveStep(5)} className="text-emerald-400 underline">Step 5</button> and train + save a model first.
                  </div>
                ) : (
                  <select
                    value={scoringModelId ?? ""}
                    onChange={(e) => setScoringModelId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Select model...</option>
                    {modelRegistry.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                )}
                {scoringModelId && (() => {
                  const m = modelRegistry.find((x) => x.id === scoringModelId);
                  if (!m) return null;
                  return (
                    <div className="bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-700 text-[10px] space-y-1">
                      <div className="flex justify-between"><span className="text-zinc-500">Track</span><span className="text-zinc-300">{m.modelTrack}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Features</span><span className="text-zinc-300">{m.features.length}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">R²</span><span className={m.r2 > 0.5 ? "text-green-400" : "text-amber-400"}>{m.r2}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Target</span><span className="text-zinc-300">{m.useLogTarget ? `log(1+${m.targetVar})` : m.targetVar}</span></div>
                    </div>
                  );
                })()}
              </div>

              {/* Dataset selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database size={10} className="text-cyan-400" /> Dataset Version
                </label>
                {datasetRegistry.length === 0 ? (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 text-xs text-zinc-500">
                    <AlertTriangle size={12} className="text-amber-400 inline mr-1" />
                    No datasets saved. Go to <button onClick={() => setActiveStep(4)} className="text-cyan-400 underline">Step 4</button> and save a dataset first.
                  </div>
                ) : (
                  <select
                    value={scoringDatasetId ?? ""}
                    onChange={(e) => setScoringDatasetId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Select dataset...</option>
                    {datasetRegistry.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                {scoringDatasetId && (() => {
                  const d = datasetRegistry.find((x) => x.id === scoringDatasetId);
                  if (!d) return null;
                  return (
                    <div className="bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-700 text-[10px] space-y-1">
                      <div className="flex justify-between"><span className="text-zinc-500">Source</span><span className="text-zinc-300">{d.source ?? "unknown"}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Users</span><span className="text-zinc-300">{d.rowCount}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Date Range</span><span className="text-zinc-300">{d.dateRange ? `${d.dateRange.min} → ${d.dateRange.max}` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Payer Rate</span><span className="text-zinc-300">{d.payerRate}%</span></div>
                      <div className="flex justify-between"><span className="text-zinc-500">Avg LTV</span><span className="text-emerald-400">${d.avgLTV}</span></div>
                      {d.filters !== "none" && <div className="flex justify-between"><span className="text-zinc-500">Filters</span><span className="text-purple-400">{d.filters}</span></div>}
                    </div>
                  );
                })()}
              </div>
            </div>

            <button
              onClick={handleRunScoring}
              disabled={!scoringModelId || !scoringDatasetId}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-600 w-full justify-center"
            >
              <Zap size={16} /> Run Scoring — {scoringModelId && scoringDatasetId ? `Model ${scoringModelId} × Dataset ${scoringDatasetId}` : "Select both to proceed"}
            </button>
          </div>

          {/* ─── API Contract (collapsible) ─── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button onClick={() => setApiContractExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-purple-400" />
                <span className="text-xs font-semibold text-zinc-200">Production API Contract</span>
                <span className="text-[9px] text-zinc-500">How external services request scoring</span>
              </div>
              <ChevronRight size={14} className={`text-zinc-500 transition-transform ${apiContractExpanded ? "rotate-90" : ""}`} />
            </button>
            {apiContractExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-zinc-800">
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="text-[9px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5">Request</div>
                    <pre className="bg-zinc-800 rounded-lg p-3 text-[10px] text-zinc-300 font-mono border border-zinc-700 overflow-x-auto">{`POST /api/v1/score
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "model_version": "${scoringModelId ? `v${scoringModelId}` : "<model_id>"}",
  "dataset_version": "${scoringDatasetId ? `ds_v${scoringDatasetId}` : "<dataset_id>"}",
  "audience_rules": {
    "whale":     { "min_decile": 10, "action": "vip_onboarding" },
    "high_value": { "min_decile": 8, "action": "premium_offer" },
    "mid_value":  { "min_decile": 5, "action": "engagement_push" },
    "low_value":  { "min_decile": 1, "action": "retention_campaign" }
  },
  "output_format": "user_id_list"
}`}</pre>
                  </div>
                  <div>
                    <div className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">Response</div>
                    <pre className="bg-zinc-800 rounded-lg p-3 text-[10px] text-zinc-300 font-mono border border-zinc-700 overflow-x-auto">{`{
  "job_id": "score_20240212_001",
  "model_version": "${scoringModelId ? `v${scoringModelId}` : "<model_id>"}",
  "dataset_version": "${scoringDatasetId ? `ds_v${scoringDatasetId}` : "<dataset_id>"}",
  "scored_at": "${new Date().toISOString()}",
  "total_users": ${scoringResult?.scoredUsers.length ?? "N"},
  "audiences": {
    "whale":      { "count": ${scoringResult?.audiences.find((a) => a.name.includes("Whale"))?.userCount ?? "?"}, "action": "vip_onboarding" },
    "high_value": { "count": ${scoringResult?.audiences.find((a) => a.name.includes("High"))?.userCount ?? "?"}, "action": "premium_offer" },
    "mid_value":  { "count": ${scoringResult?.audiences.find((a) => a.name.includes("Mid"))?.userCount ?? "?"}, "action": "engagement_push" }
  },
  "download_url": "/exports/score_20240212_001.parquet"
}`}</pre>
                  </div>
                </div>
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-2.5 text-[10px] text-purple-300 flex items-start gap-2">
                  <Clock size={12} className="text-purple-400 mt-0.5 shrink-0" />
                  <span>
                    <strong>Production flow:</strong> UA team or scheduled pipeline calls this endpoint daily with the latest dataset snapshot.
                    The scoring service loads the specified model weights, computes pLTV for every user, segments into audiences, and returns user_id lists
                    that are pushed to ad platforms (Meta, Google, TikTok) for lookalike seeding or value-based optimization.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ─── Scoring Results ─── */}
          {scoringResult && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Scored <strong>{scoringResult.scoredUsers.length}</strong> users using <strong className="text-emerald-200">{scoringResult.modelName}</strong> on <strong className="text-cyan-300">{scoringResult.datasetName}</strong></span>
                <span className="ml-auto text-[9px] text-zinc-500">{new Date(scoringResult.timestamp).toLocaleTimeString()}</span>
              </div>

              {/* Segment summary */}
              <div className="grid grid-cols-5 gap-2">
                {["Whale (Top 1%)", "High Value", "Mid Value", "Low Value", "Minimal Value"].map((seg) => {
                  const users = scoringResult.scoredUsers.filter((u) => u.segment === seg);
                  const avgPred = users.length > 0 ? Math.round(users.reduce((s, u) => s + u.pltv_pred, 0) / users.length * 100) / 100 : 0;
                  return (
                    <div key={seg} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                      <div className="text-[10px] text-zinc-500">{seg}</div>
                      <div className="text-lg font-bold text-emerald-400">{users.length}</div>
                      <div className="text-[9px] text-zinc-600">Avg pLTV: <span className="text-zinc-400">${avgPred}</span></div>
                    </div>
                  );
                })}
              </div>

              {/* Scored users table */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-zinc-300">Scored Users (top 20 by predicted LTV)</h4>
                  <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                    <Hash size={10} /> Model: <span className="text-emerald-400 font-mono">{scoringResult.modelName.split(" — ")[0]}</span>
                    · Dataset: <span className="text-cyan-400 font-mono">{scoringResult.datasetName.split(" — ")[0]}</span>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[280px]">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800">
                        <th className="px-2 py-1.5 text-left text-zinc-500">user</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">pLTV Pred</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">Actual D60</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">Decile</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">Segment</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">Payer D7</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">Level</th>
                        <th className="px-2 py-1.5 text-left text-zinc-500">Guild</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {[...scoringResult.scoredUsers]
                        .sort((a, b) => b.pltv_pred - a.pltv_pred)
                        .slice(0, 20)
                        .map((u) => (
                          <tr key={u.game_user_id} className={`hover:bg-zinc-800/30 ${u.is_top_1pct ? "bg-amber-500/5" : ""}`}>
                            <td className="px-2 py-1 text-cyan-400 font-mono">{u.game_user_id}</td>
                            <td className="px-2 py-1 text-emerald-400 font-mono font-bold">${u.pltv_pred}</td>
                            <td className="px-2 py-1 text-zinc-300 font-mono">${u.actual_ltv_d60}</td>
                            <td className="px-2 py-1 font-mono">{u.pltv_decile}</td>
                            <td className="px-2 py-1">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                u.segment.includes("Whale") ? "bg-amber-500/20 text-amber-400" :
                                u.segment.includes("High") ? "bg-emerald-500/20 text-emerald-400" :
                                u.segment.includes("Mid") ? "bg-blue-500/20 text-blue-400" :
                                "bg-zinc-700 text-zinc-400"
                              }`}>{u.segment}</span>
                            </td>
                            <td className="px-2 py-1">{u.features.is_payer_by_d7 ? <CheckCircle2 size={10} className="text-green-400" /> : <span className="text-zinc-600">—</span>}</td>
                            <td className="px-2 py-1 text-zinc-300 font-mono">{u.features.max_level_w7d}</td>
                            <td className="px-2 py-1">{u.features.joined_guild_by_d3 ? <CheckCircle2 size={10} className="text-green-400" /> : <span className="text-zinc-600">—</span>}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Predicted vs Actual scatter */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-zinc-300 mb-2">Predicted vs Actual LTV</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="x" name="Predicted" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Predicted pLTV ($)", position: "bottom", fill: "#52525b", fontSize: 10 }} />
                    <YAxis dataKey="y" name="Actual" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={{ stroke: "#3f3f46" }} label={{ value: "Actual LTV D60 ($)", angle: -90, position: "insideLeft", offset: 10, fill: "#52525b", fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#d8890aff", border: "1px solid #3f3f46", borderRadius: "8px", fontSize: "11px" }} />
                    <Scatter
                      data={scoringResult.scoredUsers.slice(0, 200).map((u) => ({ x: u.pltv_pred, y: u.actual_ltv_d60, user: u.game_user_id }))}
                      fill="#10b981"
                      fillOpacity={0.6}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Audience actions */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-amber-400" />
                  <span className="text-xs font-semibold text-zinc-200">Audience → Action Mapping</span>
                  <span className="text-[9px] text-zinc-500">Each audience set is sent to ad platforms with a specific action</span>
                </div>
                <div className="space-y-2">
                  {scoringResult.audiences.map((aud) => (
                    <div key={aud.id} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">{aud.name}</div>
                        <div className="text-[9px] text-zinc-500">{aud.description}</div>
                        <code className="text-[8px] px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400 mt-1 inline-block">{aud.criteria}</code>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-center"><div className="text-[9px] text-zinc-500">Users</div><div className="font-bold text-emerald-400">{aud.userCount}</div></div>
                        <div className="text-center"><div className="text-[9px] text-zinc-500">Avg pLTV</div><div className="font-bold text-blue-400">${aud.avgPLTV}</div></div>
                        <div className="text-center"><div className="text-[9px] text-zinc-500">Match</div><div className="font-bold text-purple-400">{aud.matchRate}%</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(5)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={14} className="inline mr-1" />Back</button>
            <button onClick={() => setActiveStep(7)} disabled={!scoringResult} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600">
              Next: Audiences <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 7: Audience Building ═══ */}
      {activeStep === 7 && (
        <div className="space-y-4">
          <InfoBanner title="Step 7 — Audience Building" variant="info">
            <p>Define audience segments from model scores. Each must pass consent checks, min size thresholds, and dedupe + TTL rules.</p>
          </InfoBanner>

          <div className="space-y-3">
            {audiences.map((aud) => (
              <div key={aud.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-200">{aud.name}</h4>
                    <p className="text-[10px] text-zinc-500">{aud.description}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-center">
                      <div className="text-zinc-500 text-[9px]">Users</div>
                      <div className="font-bold text-emerald-400">{aud.userCount}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-zinc-500 text-[9px]">Avg pLTV</div>
                      <div className="font-bold text-blue-400">${aud.avgPLTV}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-zinc-500 text-[9px]">Avg Actual</div>
                      <div className="font-bold text-amber-400">${aud.avgActualLTV}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-zinc-500 text-[9px]">Est. Match Rate</div>
                      <div className="font-bold text-purple-400">{aud.matchRate}%</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[9px] px-2 py-1 bg-zinc-800 rounded text-zinc-400 border border-zinc-700">{aud.criteria}</code>
                  <span className="text-[9px] text-zinc-600">TTL: 30 days</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(6)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => setActiveStep(8)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
              Next: Ad Platforms <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 8: Ad Platform Push ═══ */}
      {activeStep === 8 && (
        <div className="space-y-4">
          <InfoBanner title="Step 8 — Push to Ad Platforms" variant="info">
            <p>Two patterns: <strong>Custom Audiences</strong> (seed/retargeting) and <strong>Value-based optimization feeds</strong> (upload predicted value as conversion signal).</p>
          </InfoBanner>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><Upload size={14} className="text-blue-400" />Custom Audiences</h4>
              <div className="space-y-2">
                {audiences.slice(0, 3).map((aud) => (
                  <div key={aud.id} className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-zinc-200">{aud.name}</span>
                      <span className="text-[9px] text-emerald-400">{aud.userCount} users</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {["Meta", "Google", "TikTok"].map((platform) => (
                        <span key={platform} className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">{platform}</span>
                      ))}
                      <span className="text-[8px] text-zinc-600 ml-auto">Match: ~{aud.matchRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><TrendingUp size={14} className="text-amber-400" />Value-Based Optimization</h4>
              <div className="space-y-2 text-xs text-zinc-400">
                <div className="bg-zinc-800/50 rounded p-2.5 border border-zinc-700">
                  <div className="text-[10px] font-semibold text-zinc-200 mb-1">How it works</div>
                  <p className="text-[10px] text-zinc-500">Upload pLTV predictions as conversion values. Ad platforms learn to optimize for predicted lifetime value instead of just installs.</p>
                </div>
                <div className="bg-amber-500/10 rounded p-2.5 border border-amber-500/20">
                  <div className="text-[10px] font-semibold text-amber-300 mb-1">Caution</div>
                  <p className="text-[10px] text-amber-400/80">Must align with platform policies. Overprediction → overbidding → wasted spend. Calibration from Step 5 is critical here.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ROAS Simulation */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h4 className="text-xs font-bold text-zinc-200 mb-2 flex items-center gap-2"><BarChart3 size={14} className="text-cyan-400" />ROAS Simulation by Channel</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 text-left text-zinc-500">Channel</th>
                    <th className="px-3 py-2 text-right text-zinc-500">Installs</th>
                    <th className="px-3 py-2 text-right text-zinc-500">Est. Spend</th>
                    <th className="px-3 py-2 text-right text-zinc-500">Pred Revenue</th>
                    <th className="px-3 py-2 text-right text-zinc-500">Actual Revenue</th>
                    <th className="px-3 py-2 text-right text-zinc-500">Pred ROAS</th>
                    <th className="px-3 py-2 text-right text-zinc-500">Actual ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {roasData.map((row) => (
                    <tr key={row.channel} className="hover:bg-zinc-800/30">
                      <td className="px-3 py-2 text-zinc-200 font-medium">{row.channel}</td>
                      <td className="px-3 py-2 text-right text-zinc-300 font-mono">{row.installs}</td>
                      <td className="px-3 py-2 text-right text-zinc-400 font-mono">${row.spend.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-blue-400 font-mono">${row.predicted_revenue.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-emerald-400 font-mono">${row.actual_revenue.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-400">{row.predicted_roas}x</td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={row.actual_roas >= 1 ? "text-green-400" : "text-red-400"}>{row.actual_roas}x</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(7)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => setActiveStep(9)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
              Next: Validation <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 9: Validation Playbook ═══ */}
      {activeStep === 9 && (
        <div className="space-y-4">
          <InfoBanner title="Step 9 — pLTV Validation Playbook (Leakage & Bias Traps)" variant="warning">
            <p>The most critical step. Bad validation → bad bids → wasted budget. Check every trap below before shipping.</p>
          </InfoBanner>

          <div className="grid grid-cols-2 gap-4">
            {/* Data Splitting */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><Target size={14} className="text-blue-400" />Data Splitting That Matches Reality</h4>
              <div className="space-y-2 text-[10px] text-zinc-400">
                <p><strong className="text-zinc-200">Do NOT random-split</strong> if the game changes over time.</p>
                <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                  <div className="font-semibold text-zinc-300 mb-1">Use time-based split:</div>
                  <ul className="space-y-0.5">
                    <li>Train: Oct–Nov installs</li>
                    <li>Validate: Dec installs</li>
                    <li>Test (holdout): Jan installs</li>
                  </ul>
                </div>
                <p>Optionally also <strong className="text-zinc-300">geo-split</strong> to test generalization across markets.</p>
              </div>
            </div>

            {/* Leakage Traps */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400" />Leakage Traps</h4>
              <div className="space-y-1.5">
                {[
                  "Using events after t0+7d in features (late-arriving data)",
                  "Using 'total revenue' fields updated later",
                  "Using days_since_install computed at extraction time",
                  "Using labels in features (e.g. payer_by_d60)",
                  "Using churn computed after the label window",
                ].map((trap) => (
                  <div key={trap} className="flex items-start gap-1.5 text-[10px] text-red-400/80">
                    <span className="text-red-500 mt-0.5 shrink-0">✕</span>
                    <span>{trap}</span>
                  </div>
                ))}
                <div className="mt-2 bg-red-500/10 rounded p-2 border border-red-500/20 text-[10px] text-red-300">
                  <strong>Hard rule:</strong> Every feature must be computed with an explicit <code>as_of_time</code>. Enforce via unit tests.
                </div>
              </div>
            </div>

            {/* Bias Traps */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><Eye size={14} className="text-amber-400" />Bias Traps</h4>
              <div className="space-y-2">
                {[
                  { name: "Selection Bias", desc: "UA targeting skews observed users. If UA changes, model breaks.", fix: "Time-split eval + channel mix monitoring + retrain with recent data" },
                  { name: "Survivorship Bias", desc: "Training only on users who stuck around inflates metrics.", fix: "Include early churners (LTV=0 is a valid label)" },
                  { name: "Geo/Device Confounding", desc: "Country/device correlates with spend due to pricing.", fix: "Keep features but monitor per-geo calibration" },
                ].map((bias) => (
                  <div key={bias.name} className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                    <div className="text-[10px] font-semibold text-amber-300">{bias.name}</div>
                    <div className="text-[9px] text-zinc-500">{bias.desc}</div>
                    <div className="text-[9px] text-emerald-400/80 mt-0.5">Fix: {bias.fix}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics That Matter */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><BarChart3 size={14} className="text-purple-400" />Metrics That Matter for UA</h4>
              <div className="space-y-2">
                <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] font-semibold text-zinc-300">Ranking Metrics</div>
                  <ul className="text-[9px] text-zinc-500 space-y-0.5 mt-0.5">
                    <li>• Top-decile lift: actual LTV of top 10% vs average</li>
                    <li>• Precision@K for high value threshold</li>
                    <li>• Gains/Lorenz curve</li>
                  </ul>
                </div>
                <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] font-semibold text-zinc-300">Calibration</div>
                  <ul className="text-[9px] text-zinc-500 space-y-0.5 mt-0.5">
                    <li>• Predicted vs actual by decile bucket</li>
                    <li>• <strong className="text-amber-300">Overprediction is dangerous for bidding</strong></li>
                  </ul>
                </div>
                <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                  <div className="text-[10px] font-semibold text-zinc-300">Business Simulation</div>
                  <ul className="text-[9px] text-zinc-500 space-y-0.5 mt-0.5">
                    <li>• If we bid based on pLTV, what ROAS would we expect?</li>
                    <li>• Evaluate by channel/geo segments</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(8)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <button onClick={() => setActiveStep(10)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500">
              Next: Closed Loop <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Step 10: Closed-Loop Learning ═══ */}
      {activeStep === 10 && (
        <div className="space-y-4">
          <InfoBanner title="Step 10 — Closed-Loop Learning" variant="info">
            <p>Join campaign performance back to scored cohorts. Monitor drift, retrain on triggers. This is what separates a demo from production.</p>
          </InfoBanner>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><TrendingUp size={14} className="text-emerald-400" />Performance Monitoring</h4>
              <div className="space-y-2">
                {[
                  "Join campaign performance → scored cohorts",
                  "Track ROAS by audience segment weekly",
                  "Monitor calibration drift over time",
                  "Segment stability checks (does top1% stay sensible?)",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                    <CheckCircle2 size={10} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-400" />Drift Detection</h4>
              <div className="space-y-2">
                {[
                  "Feature distribution shift (PSI per feature)",
                  "Score distribution shift week over week",
                  "App version / campaign mix changes vs score",
                  "\"What changed\" dashboard for stakeholders",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                    <AlertTriangle size={10} className="text-amber-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h4 className="text-xs font-bold text-zinc-200 mb-3 flex items-center gap-2"><Zap size={14} className="text-blue-400" />Retrain Strategy</h4>
              <div className="space-y-2">
                {[
                  "Retrain weekly/biweekly or on drift triggers",
                  "A/B holdout: control (D7 payers) vs test (pLTV top-value including non-payers)",
                  "Shadow mode first: score but don't act",
                  "Measure: CPI, ROAS D7/D30, pay rate, ARPPU, retention",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                    <Zap size={10} className="text-blue-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-xs text-emerald-300">
            <strong className="text-emerald-200">Online Validation — The Part That Convinces Marketing:</strong>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <div className="font-semibold text-emerald-200 mb-1">Shadow Mode (Phase 1)</div>
                <p className="text-emerald-400/80">Score users but don&apos;t change bidding. Compare model predictions against existing segments. Build confidence in ranking quality.</p>
              </div>
              <div>
                <div className="font-semibold text-emerald-200 mb-1">A/B Holdout (Phase 2)</div>
                <ul className="text-emerald-400/80 space-y-0.5">
                  <li>• <strong>Control:</strong> Current lookalike seed (D7 payers)</li>
                  <li>• <strong>Test:</strong> Predicted top-value (including non-payers with high pLTV)</li>
                  <li>• Measure: CPI, ROAS D7/D30, pay rate, ARPPU, retention</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setActiveStep(9)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">Back</button>
            <div className="text-xs text-zinc-500 flex items-center gap-2">
              <Swords size={14} className="text-emerald-400" />
              <span>End of pLTV Pipeline — <strong className="text-emerald-400">Lineage 2M</strong> style</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
