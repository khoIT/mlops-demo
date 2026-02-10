"use client";

import { useState, useMemo } from "react";
import {
  UserFeatureRow,
  FeatureDefinition,
  TrainingConfig,
  TrainingResult,
  ExperimentRun,
} from "@/lib/types";
import { DEFAULT_FEATURES, TARGET_VARIABLES, trainModel } from "@/lib/ml-engine";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  BarChart3,
  Settings2,
  ListChecks,
  TrendingDown,
  Grid3X3,
  Sparkles,
} from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
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
} from "recharts";

interface FeatureTrainingProps {
  featureData: UserFeatureRow[];
  features: FeatureDefinition[];
  experiments: ExperimentRun[];
  onExperimentComplete: (run: ExperimentRun) => void;
  onModelReady: (result: TrainingResult) => void;
}

export default function FeatureTraining({
  featureData,
  features,
  experiments,
  onExperimentComplete,
  onModelReady,
}: FeatureTrainingProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    DEFAULT_FEATURES.map((f) => f.id)
  );
  const [targetVariable, setTargetVariable] = useState<string>("is_power_user");
  const [modelType, setModelType] = useState<
    "logistic_regression" | "decision_tree"
  >("logistic_regression");
  const [testSplit, setTestSplit] = useState(0.3);
  const [learningRate, setLearningRate] = useState(0.1);
  const [epochs, setEpochs] = useState(200);
  const [maxDepth, setMaxDepth] = useState(5);
  const [isTraining, setIsTraining] = useState(false);
  const [activeResult, setActiveResult] = useState<TrainingResult | null>(null);
  const [experimentName, setExperimentName] = useState("Experiment 1");

  const toggleFeature = (id: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleTrain = async () => {
    if (selectedFeatures.length === 0) return;
    setIsTraining(true);
    setActiveResult(null);

    // Simulate async training delay for realism
    await new Promise((r) => setTimeout(r, 800));

    try {
      const config: TrainingConfig = {
        targetVariable,
        features: selectedFeatures,
        modelType,
        testSplit,
        learningRate,
        epochs,
        maxDepth,
      };

      const result = trainModel(featureData, config);
      setActiveResult(result);
      onModelReady(result);

      const run: ExperimentRun = {
        id: `run_${Date.now()}`,
        name: experimentName,
        result,
        status: "completed",
        createdAt: new Date().toISOString(),
      };
      onExperimentComplete(run);
      setExperimentName(`Experiment ${experiments.length + 2}`);
    } catch (err) {
      console.error("Training failed:", err);
    } finally {
      setIsTraining(false);
    }
  };

  const lossData = useMemo(() => {
    if (!activeResult) return [];
    return activeResult.trainingLoss.map((loss, i) => ({
      epoch: i + 1,
      loss: Math.round(loss * 10000) / 10000,
    }));
  }, [activeResult]);

  const importanceData = useMemo(() => {
    if (!activeResult) return [];
    return [...activeResult.featureImportance]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
  }, [activeResult]);

  const COLORS = [
    "#3b82f6",
    "#8b5cf6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#ec4899",
    "#6366f1",
    "#14b8a6",
    "#f97316",
  ];

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ─── Left panel: Configuration ─── */}
      <div className="col-span-4 space-y-4">
        {/* Experiment Name */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-zinc-200">
              New Experiment
            </span>
          </div>
          <input
            type="text"
            value={experimentName}
            onChange={(e) => setExperimentName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
            placeholder="Experiment name..."
          />
        </div>

        {/* Target Variable */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Target Variable
            </span>
            <InfoTooltip
              title="Choosing the Right Target"
              variant="warning"
              wide
              content={
                <>
                  <p>The target variable is <strong>what the model learns to predict</strong>. This is the most important decision in supervised ML.</p>
                  <p className="mt-1"><strong>Watch out for:</strong></p>
                  <ul className="mt-0.5 space-y-0.5">
                    <li>- <strong>Class imbalance:</strong> If one class has 90%+ of examples, accuracy is misleading</li>
                    <li>- <strong>Leaky features:</strong> Features computed from the same data as the label can inflate accuracy</li>
                    <li>- <strong>Actionability:</strong> Can you actually do something different based on this prediction?</li>
                  </ul>
                </>
              }
            />
          </div>
          <div className="space-y-2">
            {TARGET_VARIABLES.map((tv) => (
              <label
                key={tv.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all ${
                  targetVariable === tv.id
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <input
                  type="radio"
                  name="target"
                  value={tv.id}
                  checked={targetVariable === tv.id}
                  onChange={() => setTargetVariable(tv.id)}
                  className="accent-amber-500"
                />
                <div>
                  <div className="text-sm text-zinc-200">{tv.name}</div>
                  <div className="text-xs text-zinc-500">{tv.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Feature Selection */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListChecks size={16} className="text-purple-400" />
              <span className="text-sm font-semibold text-zinc-200">
                Input Features
              </span>
              <InfoTooltip
                title="Feature Selection Tips"
                variant="tip"
                wide
                content={
                  <>
                    <p>Not all features help. Some add <strong>noise</strong> that hurts the model.</p>
                    <p className="mt-1"><strong>Best practices:</strong></p>
                    <ul className="mt-0.5 space-y-0.5">
                      <li>- Start with <strong>fewer features</strong> and add more only if metrics improve</li>
                      <li>- Remove features that are <strong>highly correlated</strong> with each other (redundant)</li>
                      <li>- Check <strong>feature importance</strong> after training — drop features near zero</li>
                      <li>- Never include the target itself or a proxy of it as a feature</li>
                    </ul>
                  </>
                }
              />
            </div>
            <span className="text-xs text-zinc-500">
              {selectedFeatures.length}/{features.length} selected
            </span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {features.map((feat) => (
              <label
                key={feat.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                  selectedFeatures.includes(feat.id)
                    ? "bg-purple-500/10 text-zinc-200"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(feat.id)}
                  onChange={() => toggleFeature(feat.id)}
                  className="accent-purple-500 rounded"
                />
                <span className="text-sm">{feat.name}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {feat.type}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Hyperparameters */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 size={16} className="text-cyan-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Model Configuration
            </span>
            <InfoTooltip
              title="Hyperparameter Tuning"
              variant="info"
              wide
              content={
                <>
                  <p>Hyperparameters control <strong>how the model learns</strong>, not what it learns.</p>
                  <p className="mt-1"><strong>Key decisions:</strong></p>
                  <ul className="mt-0.5 space-y-0.5">
                    <li>- <strong>Logistic Regression:</strong> Simple, interpretable, good baseline. Tune learning rate and epochs.</li>
                    <li>- <strong>Decision Tree:</strong> Handles non-linear patterns. Tune max depth to prevent overfitting.</li>
                    <li>- <strong>Test split:</strong> 20-30% is standard. Too small = unreliable metrics. Too large = less training data.</li>
                    <li>- <strong>Learning rate:</strong> Too high = unstable. Too low = slow convergence. Start at 0.1.</li>
                  </ul>
                </>
              }
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">
                Model Type
              </label>
              <select
                value={modelType}
                onChange={(e) =>
                  setModelType(
                    e.target.value as "logistic_regression" | "decision_tree"
                  )
                }
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="logistic_regression">
                  Logistic Regression
                </option>
                <option value="decision_tree">Decision Tree</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">
                Test Split: {Math.round(testSplit * 100)}%
              </label>
              <input
                type="range"
                min={0.1}
                max={0.5}
                step={0.05}
                value={testSplit}
                onChange={(e) => setTestSplit(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            {modelType === "logistic_regression" ? (
              <>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    Learning Rate: {learningRate}
                  </label>
                  <input
                    type="range"
                    min={0.001}
                    max={1}
                    step={0.01}
                    value={learningRate}
                    onChange={(e) =>
                      setLearningRate(parseFloat(e.target.value))
                    }
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    Epochs: {epochs}
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={1000}
                    step={50}
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">
                  Max Depth: {maxDepth}
                </label>
                <input
                  type="range"
                  min={2}
                  max={15}
                  step={1}
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Train Button */}
        <button
          onClick={handleTrain}
          disabled={isTraining || selectedFeatures.length === 0}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
            isTraining
              ? "bg-blue-600/50 text-blue-300 cursor-wait"
              : selectedFeatures.length === 0
              ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]"
          }`}
        >
          {isTraining ? (
            <>
              <div className="w-4 h-4 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
              Training...
            </>
          ) : (
            <>
              <Play size={16} />
              Start Training Run
            </>
          )}
        </button>
      </div>

      {/* ─── Right panel: Results ─── */}
      <div className="col-span-8 space-y-4">
        {/* Experiment History */}
        {experiments.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <FlaskConical size={14} className="text-blue-400" />
              Experiment Runs
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 text-left text-zinc-500">Name</th>
                    <th className="px-3 py-2 text-left text-zinc-500">Model</th>
                    <th className="px-3 py-2 text-left text-zinc-500">Target</th>
                    <th className="px-3 py-2 text-left text-zinc-500">Accuracy</th>
                    <th className="px-3 py-2 text-left text-zinc-500">F1</th>
                    <th className="px-3 py-2 text-left text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {experiments.map((exp) => (
                    <tr
                      key={exp.id}
                      className="hover:bg-zinc-800/30 cursor-pointer"
                      onClick={() => {
                        setActiveResult(exp.result);
                        onModelReady(exp.result);
                      }}
                    >
                      <td className="px-3 py-2 text-zinc-200 font-medium">
                        {exp.name}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {exp.result.modelType.replace("_", " ")}
                      </td>
                      <td className="px-3 py-2 text-amber-400">
                        {exp.result.config.targetVariable}
                      </td>
                      <td className="px-3 py-2 text-green-400 font-mono">
                        {(exp.result.accuracy * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-blue-400 font-mono">
                        {(exp.result.f1Score * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2">
                        {exp.status === "completed" ? (
                          <CheckCircle2
                            size={14}
                            className="text-green-500"
                          />
                        ) : (
                          <XCircle size={14} className="text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Active Result */}
        {activeResult ? (
          <div className="space-y-4">
            {/* Metric Cards */}
            <div className="bg-zinc-800/50 rounded-lg p-3 mb-3 flex items-start gap-2">
              <InfoTooltip
                title="Reading Model Metrics"
                variant="tip"
                wide
                content={
                  <>
                    <p><strong>Accuracy</strong> = % of all predictions that are correct. Can be misleading with imbalanced data.</p>
                    <p className="mt-1"><strong>Precision</strong> = When the model says &quot;yes&quot;, how often is it right? High precision = few false alarms.</p>
                    <p className="mt-1"><strong>Recall</strong> = Of all actual &quot;yes&quot; cases, how many did the model catch? High recall = few misses.</p>
                    <p className="mt-1"><strong>F1 Score</strong> = Balance between precision and recall. Best single metric for imbalanced datasets.</p>
                    <p className="mt-1 text-amber-400">If accuracy is high but F1 is low, the model is likely guessing the majority class.</p>
                  </>
                }
              />
              <span className="text-[11px] text-zinc-500">Hover the info icon to learn what each metric means and when to trust it</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                {
                  label: "Accuracy",
                  value: `${(activeResult.accuracy * 100).toFixed(1)}%`,
                  color: "text-green-400",
                  bg: "bg-green-500/10 border-green-500/20",
                },
                {
                  label: "Precision",
                  value: `${(activeResult.precision * 100).toFixed(1)}%`,
                  color: "text-blue-400",
                  bg: "bg-blue-500/10 border-blue-500/20",
                },
                {
                  label: "Recall",
                  value: `${(activeResult.recall * 100).toFixed(1)}%`,
                  color: "text-purple-400",
                  bg: "bg-purple-500/10 border-purple-500/20",
                },
                {
                  label: "F1 Score",
                  value: `${(activeResult.f1Score * 100).toFixed(1)}%`,
                  color: "text-amber-400",
                  bg: "bg-amber-500/10 border-amber-500/20",
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className={`rounded-lg p-4 border ${m.bg} text-center`}
                >
                  <div className={`text-2xl font-bold ${m.color}`}>
                    {m.value}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Training Loss Curve */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <TrendingDown size={14} className="text-red-400" />
                  Training Loss
                  <InfoTooltip
                    title="Loss Curve — Is Training Working?"
                    variant="info"
                    content={
                      <>
                        <p>The loss curve shows <strong>how wrong the model is</strong> over time. It should decrease and flatten.</p>
                        <p className="mt-1"><strong>Red flags:</strong></p>
                        <ul className="mt-0.5 space-y-0.5">
                          <li>- <strong>Not decreasing:</strong> Learning rate may be too low, or features aren&apos;t predictive</li>
                          <li>- <strong>Oscillating:</strong> Learning rate too high</li>
                          <li>- <strong>Flat from start:</strong> Model can&apos;t learn anything useful from these features</li>
                        </ul>
                      </>
                    }
                  />
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={lossData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="epoch"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={{ stroke: "#3f3f46" }}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={{ stroke: "#3f3f46" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #3f3f46",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="loss"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Feature Importance */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <BarChart3 size={14} className="text-blue-400" />
                  Feature Importance
                  <InfoTooltip
                    title="Feature Importance — What Drives Predictions?"
                    variant="tip"
                    content={
                      <>
                        <p>Shows which features the model relies on most.</p>
                        <p className="mt-1"><strong>What to do:</strong></p>
                        <ul className="mt-0.5 space-y-0.5">
                          <li>- Features near <strong>zero</strong> can likely be removed</li>
                          <li>- If one feature dominates, the model may be <strong>overfitting</strong> to it</li>
                          <li>- Validate that top features make <strong>business sense</strong></li>
                        </ul>
                      </>
                    }
                  />
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={importanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      type="number"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={{ stroke: "#3f3f46" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="feature"
                      width={120}
                      tick={{ fill: "#a1a1aa", fontSize: 10 }}
                      axisLine={{ stroke: "#3f3f46" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #3f3f46",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                      {importanceData.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={COLORS[idx % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Confusion Matrix */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                <Grid3X3 size={14} className="text-purple-400" />
                Confusion Matrix
                <InfoTooltip
                  title="Confusion Matrix — Where the Model Fails"
                  variant="warning"
                  wide
                  content={
                    <>
                      <p>
                        Shows <strong>exactly where</strong> the model gets confused. Rows = actual, columns = predicted.
                      </p>
                      <p className="mt-1">
                        <strong>Green diagonal</strong> = correct predictions. <strong>Red off-diagonal</strong> = mistakes.
                      </p>
                      <p className="mt-1">
                        <strong>Product decision:</strong> Are false positives or false negatives worse for your use case? A spam
                        filter should minimize false negatives (missed spam), while a fraud detector should minimize false
                        positives (blocked legit users).
                      </p>
                    </>
                  }
                />
              </h3>
              <div className="flex items-center gap-6">
                <div className="overflow-auto">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-zinc-500">
                          Actual \ Predicted
                        </th>
                        {activeResult.classLabels.map((label) => (
                          <th
                            key={label}
                            className="px-3 py-2 text-zinc-400 font-semibold"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.confusionMatrix.map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-zinc-400 font-semibold">
                            {activeResult.classLabels[i]}
                          </td>
                          {row.map((val, j) => {
                            const isCorrect = i === j;
                            const maxVal = Math.max(...row);
                            const intensity =
                              maxVal > 0 ? val / maxVal : 0;
                            return (
                              <td
                                key={j}
                                className={`px-4 py-3 text-center font-mono font-bold rounded ${
                                  isCorrect
                                    ? "text-green-400"
                                    : val > 0
                                    ? "text-red-400"
                                    : "text-zinc-600"
                                }`}
                                style={{
                                  backgroundColor: isCorrect
                                    ? `rgba(34,197,94,${intensity * 0.2})`
                                    : val > 0
                                    ? `rgba(239,68,68,${intensity * 0.15})`
                                    : undefined,
                                }}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-zinc-500 space-y-1">
                  <div>
                    Train size:{" "}
                    <span className="text-zinc-300 font-mono">
                      {activeResult.trainSize}
                    </span>
                  </div>
                  <div>
                    Test size:{" "}
                    <span className="text-zinc-300 font-mono">
                      {activeResult.testSize}
                    </span>
                  </div>
                  <div>
                    Model:{" "}
                    <span className="text-zinc-300">
                      {activeResult.modelType.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-96 bg-zinc-900 border border-zinc-800 rounded-lg">
            <FlaskConical size={48} className="text-zinc-700 mb-4" />
            <p className="text-zinc-500 text-sm">
              Configure your experiment and click{" "}
              <span className="text-blue-400">Start Training Run</span> to see
              results
            </p>
            <p className="text-zinc-600 text-xs mt-2">
              Select a target variable, choose input features, and tune
              hyperparameters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
