"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  UserFeatureRow,
  TrainingResult,
  PredictionResult,
  ExperimentRun,
} from "@/lib/types";
import { predict, getFeatureStats, restoreModel } from "@/lib/ml-engine";
import {
  Play,
  RotateCcw,
  Gauge,
  User,
  Zap,
  Shield,
  FileBarChart,
  ArrowRight,
  Shuffle,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ModelTestingProps {
  featureData: UserFeatureRow[];
  trainingResult: TrainingResult | null;
  experiments?: ExperimentRun[];
  onModelChange?: (result: TrainingResult) => void;
}

export default function ModelTesting({
  featureData,
  trainingResult,
  experiments = [],
  onModelChange,
}: ModelTestingProps) {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [predictionResult, setPredictionResult] =
    useState<PredictionResult | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<
    PredictionResult[]
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mlops_prediction_history");
        return saved ? JSON.parse(saved) : [];
      } catch { return []; }
    }
    return [];
  });
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showSplitInfo, setShowSplitInfo] = useState(false);

  // Persist prediction history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("mlops_prediction_history", JSON.stringify(predictionHistory));
    } catch (e) {
      console.warn("Failed to save prediction history:", e);
    }
  }, [predictionHistory]);

  const featureNames = trainingResult?.config.features || [];

  const featureStatsMap = useMemo(() => {
    const map: Record<
      string,
      { min: number; max: number; mean: number; median: number; std: number }
    > = {};
    for (const f of featureNames) {
      map[f] = getFeatureStats(featureData, f);
    }
    return map;
  }, [featureData, featureNames]);

  const handleLoadUser = (userId: string) => {
    const userRow = featureData.find((r) => r.user_id === userId);
    if (userRow) {
      const vals: Record<string, string> = {};
      for (const f of featureNames) {
        vals[f] = String(userRow[f] ?? "0");
      }
      setInputValues(vals);
      setSelectedUserId(userId);
    }
  };

  const handleRandomUser = () => {
    const randomIdx = Math.floor(Math.random() * featureData.length);
    const user = featureData[randomIdx];
    handleLoadUser(String(user.user_id));
  };

  const handlePredict = () => {
    const input: Record<string, number> = {};
    for (const f of featureNames) {
      input[f] = parseFloat(inputValues[f] || "0") || 0;
    }
    const result = predict(input);
    if (result) {
      setPredictionResult(result);
      setPredictionHistory((prev) => [result, ...prev].slice(0, 20));
    }
  };

  const handleReset = () => {
    setInputValues({});
    setPredictionResult(null);
    setSelectedUserId("");
  };

  const probData = useMemo(() => {
    if (!predictionResult) return [];
    return predictionResult.probabilities.map((p) => ({
      label: p.label,
      probability: Math.round(p.probability * 1000) / 10,
    }));
  }, [predictionResult]);

  if (!trainingResult) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-zinc-900 border border-zinc-800 rounded-lg">
        <Shield size={48} className="text-zinc-700 mb-4" />
        <p className="text-zinc-500 text-sm">No trained model available</p>
        <p className="text-zinc-600 text-xs mt-2">
          Go to the Experiments step to train a model first
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ─── Left: Model Info + Input ─── */}
      <div className="col-span-4 space-y-4">
        {/* Model Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-green-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Active Model
            </span>
            <InfoTooltip
              title="Model Registry — Deployment"
              variant="info"
              wide
              content={
                <>
                  <p>This is the <strong>trained model</strong> currently serving predictions. In production, this would be behind an API endpoint.</p>
                  <p className="mt-1"><strong>Before deploying, verify:</strong></p>
                  <ul className="mt-0.5 space-y-0.5">
                    <li>- Metrics are stable across multiple training runs</li>
                    <li>- The model performs well on <strong>edge cases</strong>, not just average users</li>
                    <li>- Feature computation in production matches training (no training/serving skew)</li>
                  </ul>
                </>
              }
            />
            <span className="ml-auto text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
              deployed
            </span>
          </div>

          {/* Model Selector */}
          {experiments.length > 1 && onModelChange && (
            <div className="mb-3">
              <button
                onClick={() => setShowModelSelector(!showModelSelector)}
                className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:border-zinc-600 transition-colors"
              >
                <span className="truncate">
                  {experiments.find((e) => e.result.modelId === trainingResult.modelId)?.name || trainingResult.modelId}
                </span>
                <ChevronDown size={12} className={`shrink-0 ml-2 text-zinc-500 transition-transform ${showModelSelector ? "rotate-180" : ""}`} />
              </button>
              {showModelSelector && (
                <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {experiments.filter((e) => e.status === "completed").map((exp) => {
                    const isActive = exp.result.modelId === trainingResult.modelId;
                    return (
                      <button
                        key={exp.id}
                        onClick={() => {
                          if (!isActive) {
                            if (exp.result.serializedModel) {
                              restoreModel(exp.result.serializedModel);
                            }
                            onModelChange(exp.result);
                            setPredictionResult(null);
                            setInputValues({});
                            setSelectedUserId("");
                          }
                          setShowModelSelector(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                          isActive ? "bg-green-500/10 text-green-400" : "text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
                        }`}
                      >
                        {isActive && <CheckCircle2 size={11} className="shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{exp.name}</div>
                          <div className="text-[10px] text-zinc-600 flex gap-2 mt-0.5">
                            <span>{exp.result.modelType.replace("_", " ")}</span>
                            <span className="text-amber-400/60">{exp.result.config.targetVariable}</span>
                            <span className="text-green-400/60">{(exp.result.accuracy * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Model ID</span>
              <span className="text-zinc-300 font-mono">
                {trainingResult.modelId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Type</span>
              <span className="text-zinc-300">
                {trainingResult.modelType.replace("_", " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Target</span>
              <span className="text-amber-400">
                {trainingResult.config.targetVariable}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Accuracy</span>
              <span className="text-green-400 font-mono">
                {(trainingResult.accuracy * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Features</span>
              <span className="text-zinc-300">
                {trainingResult.config.features.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Created</span>
              <span className="text-zinc-400">
                {new Date(trainingResult.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Load from existing user */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-cyan-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Load Test Data
            </span>
            <InfoTooltip
              title="Testing — Catch Problems Before Production"
              variant="warning"
              content={
                <>
                  <p>Test with <strong>real user data</strong> to see if predictions make sense.</p>
                  <p className="mt-1"><strong>Key checks:</strong></p>
                  <ul className="mt-0.5 space-y-0.5">
                    <li>- Do predictions match your <strong>intuition</strong> for known users?</li>
                    <li>- Try <strong>extreme values</strong> — does the model handle them?</li>
                    <li>- Test users from <strong>different segments</strong> (new vs veteran)</li>
                  </ul>
                </>
              }
            />
          </div>
          <div className="flex gap-2 mb-3">
            <select
              value={selectedUserId}
              onChange={(e) => handleLoadUser(e.target.value)}
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select a user...</option>
              {featureData.map((r) => (
                <option key={String(r.user_id)} value={String(r.user_id)}>
                  {String(r.user_id)}
                </option>
              ))}
            </select>
            <button
              onClick={handleRandomUser}
              className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              title="Random user"
            >
              <Shuffle size={16} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-600">
            Load real user data to test, or manually enter values below
          </p>

          {/* Train/Test Split Info */}
          <button
            onClick={() => setShowSplitInfo(!showSplitInfo)}
            className="w-full mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border border-zinc-800"
          >
            <Shield size={10} />
            {showSplitInfo ? "Hide" : "Show"} train/test split ({trainingResult.trainSize} train, {trainingResult.testSize} test)
          </button>
          {showSplitInfo && (
            <div className="mt-2 bg-zinc-800/50 rounded-lg p-3 space-y-2 border border-zinc-700">
              <div>
                <div className="text-[10px] font-semibold text-amber-400 mb-1 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Training Set ({trainingResult.trainUserIds.length} users) — excluded from testing
                </div>
                <div className="flex flex-wrap gap-1">
                  {trainingResult.trainUserIds.map((uid) => (
                    <span
                      key={uid}
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400/80 border border-amber-500/20"
                    >
                      {uid}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-green-400 mb-1 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Test Set ({trainingResult.testUserIds.length} users) — used for evaluation metrics
                </div>
                <div className="flex flex-wrap gap-1">
                  {trainingResult.testUserIds.map((uid) => (
                    <span
                      key={uid}
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-green-500/10 text-green-400/80 border border-green-500/20"
                    >
                      {uid}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-zinc-600 pt-1 border-t border-zinc-700">
                The model was trained on amber users and evaluated on green users. You can load any user for prediction, but predictions on training users may appear artificially confident.
              </div>
            </div>
          )}
        </div>

        {/* Feature Inputs */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileBarChart size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Feature Values
            </span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {featureNames.map((feat) => {
              const stats = featureStatsMap[feat];
              return (
                <div key={feat}>
                  <label className="text-[11px] text-zinc-400 mb-0.5 block flex items-center justify-between">
                    <span>{feat}</span>
                    {stats && (
                      <span className="text-zinc-600">
                        [{stats.min} - {stats.max}]
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={inputValues[feat] || ""}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [feat]: e.target.value,
                      }))
                    }
                    placeholder={stats ? `mean: ${stats.mean}` : "0"}
                    className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handlePredict}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-500 active:scale-[0.98] transition-all"
          >
            <Zap size={16} />
            Run Prediction
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-3 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* ─── Right: Prediction Results ─── */}
      <div className="col-span-8 space-y-4">
        {predictionResult ? (
          <>
            {/* Main Prediction */}
            <div className="bg-zinc-900 border border-green-500/30 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Gauge size={20} className="text-green-400" />
                <span className="text-lg font-bold text-zinc-200">
                  Prediction Result
                </span>
                <InfoTooltip
                  title="Interpreting Predictions"
                  variant="tip"
                  content={
                    <>
                      <p>The prediction shows the model&apos;s <strong>best guess</strong> plus confidence (probability).</p>
                      <p className="mt-1"><strong>Low confidence?</strong> The user may be near a decision boundary — the model is unsure. Consider adding more features or more training data for these edge cases.</p>
                    </>
                  }
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs text-zinc-500 mb-1">
                    Target: {trainingResult.config.targetVariable}
                  </div>
                  <div className="text-3xl font-bold text-green-400 flex items-center gap-2">
                    <ArrowRight size={24} />
                    {predictionResult.prediction}
                  </div>
                  {selectedUserId && (
                    <div className="text-xs text-zinc-500 mt-2">
                      Input from user:{" "}
                      <span className="text-cyan-400">{selectedUserId}</span>
                    </div>
                  )}
                </div>
                {/* Probability Chart */}
                <div className="w-80 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={probData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#27272a"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#a1a1aa", fontSize: 11 }}
                        axisLine={{ stroke: "#3f3f46" }}
                      />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        axisLine={{ stroke: "#3f3f46" }}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          border: "1px solid #3f3f46",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number | undefined) => [`${value ?? 0}%`, "Probability"]}
                      />
                      <Bar dataKey="probability" radius={[4, 4, 0, 0]}>
                        {probData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              entry.label === predictionResult.prediction
                                ? "#22c55e"
                                : "#3f3f46"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Feature values used */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                Input Feature Values
              </h3>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {featureNames.map((f) => (
                  <div
                    key={f}
                    className="bg-zinc-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="text-zinc-500 truncate">{f}</div>
                    <div className="text-zinc-200 font-mono mt-0.5">
                      {inputValues[f] || "0"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
            <Play size={48} className="text-zinc-700 mb-4" />
            <p className="text-zinc-500 text-sm">
              Load a user or enter feature values, then click{" "}
              <span className="text-green-400">Run Prediction</span>
            </p>
          </div>
        )}

        {/* Prediction History */}
        {predictionHistory.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <FileBarChart size={14} className="text-blue-400" />
              Prediction History
              <span className="text-[10px] text-zinc-600 font-normal ml-1">({predictionHistory.length})</span>
              <InfoTooltip
                title="Prediction History — Spot Patterns"
                variant="info"
                content={
                  <>
                    <p>Track predictions over time to spot <strong>systematic biases</strong>.</p>
                    <p className="mt-1">If the model always predicts the same class, it may be overfit or the features aren&apos;t discriminative enough.</p>
                  </>
                }
              />
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 text-left text-zinc-500">#</th>
                    <th className="px-3 py-2 text-left text-zinc-500">
                      Prediction
                    </th>
                    <th className="px-3 py-2 text-left text-zinc-500">
                      Confidence
                    </th>
                    <th className="px-3 py-2 text-left text-zinc-500">
                      Key Features
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {predictionHistory.map((result, i) => {
                    const topProb = result.probabilities.reduce((a, b) =>
                      a.probability > b.probability ? a : b
                    );
                    const keyFeats = Object.entries(result.inputFeatures)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ");
                    return (
                      <tr key={i} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-zinc-500">
                          {predictionHistory.length - i}
                        </td>
                        <td className="px-3 py-2 text-green-400 font-semibold">
                          {result.prediction}
                        </td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">
                          {(topProb.probability * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-zinc-500 font-mono truncate max-w-[300px]">
                          {keyFeats}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => setPredictionHistory([])}
              className="mt-2 text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
            >
              Clear history
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
