import {
  RawLogEntry,
  UserFeatureRow,
  FeatureDefinition,
  TrainingConfig,
  TrainingResult,
  PredictionInput,
  PredictionResult,
  CleanedLog,
  PersonaFeatureRow,
  PersonaDefinition,
  UserPersonaAssignment,
  ClusteringResult,
} from "./types";

// ─── Feature Engineering ─────────────────────────────────────────────────────

export function parseRawLogs(rows: RawLogEntry[]): RawLogEntry[] {
  return rows.map((row) => {
    try {
      const meta = JSON.parse(row.metadata || "{}");
      return {
        ...row,
        device_type: meta.device_type || "",
        source_item: meta.source_item || "",
        folder: meta.folder || "",
      };
    } catch {
      return { ...row, device_type: "", source_item: "", folder: "" };
    }
  });
}

export const DEFAULT_FEATURES: FeatureDefinition[] = [
  {
    id: "session_count",
    name: "Session Count",
    description: "Total number of page visits per user",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "unique_resource_types",
    name: "Unique Resource Types",
    description: "Number of distinct resource_type values visited",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "unique_resources",
    name: "Unique Resources",
    description: "Number of distinct resource_name values viewed",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "mobile_ratio",
    name: "Mobile Usage Ratio",
    description: "Fraction of visits from mobile devices",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "realtime_ratio",
    name: "Realtime Dashboard Ratio",
    description: "Fraction of visits to realtime dashboards",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "tableau_count",
    name: "Tableau Views",
    description: "Number of tableau dashboard visits",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "export_count",
    name: "Export Count",
    description: "Number of export actions performed",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "search_count",
    name: "Search Count",
    description: "Number of search actions performed",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "unique_games",
    name: "Unique Games",
    description: "Number of distinct game folders accessed",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "home_visit_ratio",
    name: "Home Visit Ratio",
    description: "Fraction of visits to the home page",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "avg_hour",
    name: "Average Active Hour",
    description: "Average hour of the day (0-23) when user is active",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
  {
    id: "activity_span_hours",
    name: "Activity Span (hours)",
    description: "Time between first and last activity in hours",
    type: "numeric",
    source: "engineered",
    enabled: true,
  },
];

export const TARGET_VARIABLES: FeatureDefinition[] = [
  {
    id: "is_power_user",
    name: "Is Power User",
    description:
      "Binary: user is in the top 25% for BOTH session count AND resource type diversity (scales with dataset size)",
    type: "categorical",
    source: "engineered",
    enabled: true,
  },
  {
    id: "will_export",
    name: "Will Export",
    description:
      "Binary: user has performed at least one export action (conversion prediction)",
    type: "categorical",
    source: "engineered",
    enabled: true,
  },
  {
    id: "primary_resource",
    name: "Primary Resource Type",
    description:
      "Multi-class: the resource type the user visits most (behavior classification)",
    type: "categorical",
    source: "engineered",
    enabled: true,
  },
];

export function computeUserFeatures(
  logs: RawLogEntry[]
): UserFeatureRow[] {
  const userMap = new Map<string, RawLogEntry[]>();
  for (const log of logs) {
    if (!userMap.has(log.user_id)) userMap.set(log.user_id, []);
    userMap.get(log.user_id)!.push(log);
  }

  // Helper: compute the value at a given percentile (0-100) from a sorted array
  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // First pass: compute all features without target labels
  const rows: UserFeatureRow[] = [];
  for (const [userId, userLogs] of userMap) {
    const sessionCount = userLogs.length;
    const resourceTypes = new Set(userLogs.map((l) => l.resource_type));
    const resourceNames = new Set(userLogs.map((l) => l.resource_name));
    const mobileCount = userLogs.filter(
      (l) => l.device_type === "mobile"
    ).length;
    const realtimeCount = userLogs.filter(
      (l) => l.resource_type === "realtime"
    ).length;
    const tableauCount = userLogs.filter(
      (l) => l.resource_type === "tableau"
    ).length;
    const exportCount = userLogs.filter(
      (l) => l.resource_type === "export"
    ).length;
    const searchCount = userLogs.filter(
      (l) => l.resource_type === "search"
    ).length;
    const homeCount = userLogs.filter(
      (l) => l.resource_type === "home"
    ).length;
    const folders = new Set(
      userLogs.filter((l) => l.folder).map((l) => l.folder)
    );

    const timestamps = userLogs
      .map((l) => new Date(l.timestamp).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);
    const hours = userLogs
      .map((l) => new Date(l.timestamp).getHours())
      .filter((h) => !isNaN(h));
    const avgHour =
      hours.length > 0
        ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) /
          10
        : 12;
    const activitySpan =
      timestamps.length > 1
        ? Math.round(
            ((timestamps[timestamps.length - 1] - timestamps[0]) / 3600000) *
              10
          ) / 10
        : 0;

    // Primary resource type (most visited)
    const typeCounts = new Map<string, number>();
    for (const l of userLogs) {
      typeCounts.set(l.resource_type, (typeCounts.get(l.resource_type) || 0) + 1);
    }
    let primaryResource = "home";
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryResource = type;
      }
    }

    rows.push({
      user_id: userId,
      session_count: sessionCount,
      unique_resource_types: resourceTypes.size,
      unique_resources: resourceNames.size,
      mobile_ratio:
        Math.round((mobileCount / sessionCount) * 1000) / 1000,
      realtime_ratio:
        Math.round((realtimeCount / sessionCount) * 1000) / 1000,
      tableau_count: tableauCount,
      export_count: exportCount,
      search_count: searchCount,
      unique_games: folders.size,
      home_visit_ratio:
        Math.round((homeCount / sessionCount) * 1000) / 1000,
      avg_hour: avgHour,
      activity_span_hours: activitySpan,
      // targets — assigned in second pass below
      is_power_user: "no",
      will_export: "no",
      primary_resource: primaryResource,
    });
  }

  // Second pass: assign target labels using percentile-based thresholds
  // This scales with any dataset size instead of using hardcoded cutoffs
  const sortedSessions = rows.map((r) => Number(r.session_count)).sort((a, b) => a - b);
  const sortedResourceTypes = rows.map((r) => Number(r.unique_resource_types)).sort((a, b) => a - b);
  const sortedExports = rows.map((r) => Number(r.export_count)).sort((a, b) => a - b);

  const sessionP75 = percentile(sortedSessions, 75);
  const resourceTypesP75 = percentile(sortedResourceTypes, 75);
  const exportP75 = percentile(sortedExports, 75);

  for (const row of rows) {
    const sc = Number(row.session_count);
    const rt = Number(row.unique_resource_types);
    const ec = Number(row.export_count);
    // is_power_user: top 25% in BOTH session count AND resource diversity
    row.is_power_user = sc >= sessionP75 && rt >= resourceTypesP75 ? "yes" : "no";
    // will_export: top 25% in export activity (or any export if most users have 0)
    row.will_export = exportP75 > 0 ? (ec >= exportP75 ? "yes" : "no") : (ec > 0 ? "yes" : "no");
  }

  return rows;
}

// ─── ML Models ───────────────────────────────────────────────────────────────

function encodeLabels(labels: string[]): { encoded: number[][]; classes: string[] } {
  const classes = [...new Set(labels)].sort();
  const encoded = labels.map((l) => {
    const vec = new Array(classes.length).fill(0);
    vec[classes.indexOf(l)] = 1;
    return vec;
  });
  return { encoded, classes };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function normalize(
  data: number[][],
  stats?: { means: number[]; stds: number[] }
): { normalized: number[][]; means: number[]; stds: number[] } {
  const nFeatures = data[0].length;
  const means = stats?.means || [];
  const stds = stats?.stds || [];

  if (!stats) {
    for (let j = 0; j < nFeatures; j++) {
      const col = data.map((r) => r[j]);
      const mean = col.reduce((a, b) => a + b, 0) / col.length;
      const std = Math.sqrt(
        col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length
      );
      means.push(mean);
      stds.push(std || 1);
    }
  }

  const normalized = data.map((row) =>
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  return { normalized, means, stds };
}

// ─── Logistic Regression ─────────────────────────────────────────────────────

interface LogisticModel {
  type: "logistic_regression";
  weights: number[][]; // [nClasses x nFeatures]
  biases: number[];
  classes: string[];
  means: number[];
  stds: number[];
  featureNames: string[];
}

function trainLogisticRegression(
  X: number[][],
  yLabels: string[],
  lr: number,
  epochs: number,
  featureNames: string[]
): { model: LogisticModel; losses: number[] } {
  const { normalized, means, stds } = normalize(X);
  const { encoded, classes } = encodeLabels(yLabels);
  const nSamples = normalized.length;
  const nFeatures = normalized[0].length;
  const nClasses = classes.length;

  // Initialize weights
  const weights: number[][] = Array.from({ length: nClasses }, () =>
    Array.from({ length: nFeatures }, () => (Math.random() - 0.5) * 0.1)
  );
  const biases = new Array(nClasses).fill(0);

  const losses: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;

    // Forward pass
    const predictions: number[][] = [];
    for (let i = 0; i < nSamples; i++) {
      const logits = weights.map(
        (w, c) =>
          w.reduce((sum, wj, j) => sum + wj * normalized[i][j], 0) + biases[c]
      );
      const probs = nClasses === 2
        ? [sigmoid(logits[0]), 1 - sigmoid(logits[0])]
        : softmax(logits);
      predictions.push(probs);

      // Cross-entropy loss
      for (let c = 0; c < nClasses; c++) {
        totalLoss -= encoded[i][c] * Math.log(Math.max(probs[c], 1e-10));
      }
    }

    // Add L2 regularization penalty to loss
    const lambda = 0.1; // regularization strength — prevents weight concentration
    let l2Penalty = 0;
    for (let c = 0; c < nClasses; c++) {
      for (let j = 0; j < nFeatures; j++) {
        l2Penalty += weights[c][j] ** 2;
      }
    }
    losses.push(totalLoss / nSamples + (lambda / 2) * l2Penalty);

    // Gradient descent with L2 regularization
    for (let c = 0; c < nClasses; c++) {
      for (let j = 0; j < nFeatures; j++) {
        let grad = 0;
        for (let i = 0; i < nSamples; i++) {
          grad += (predictions[i][c] - encoded[i][c]) * normalized[i][j];
        }
        grad = grad / nSamples + lambda * weights[c][j];
        weights[c][j] -= lr * grad;
      }
      let biasGrad = 0;
      for (let i = 0; i < nSamples; i++) {
        biasGrad += predictions[i][c] - encoded[i][c];
      }
      biases[c] -= (lr * biasGrad) / nSamples;
    }
  }

  return {
    model: { type: "logistic_regression", weights, biases, classes, means, stds, featureNames },
    losses,
  };
}

function predictLogistic(model: LogisticModel, X: number[][]): string[] {
  const { normalized } = normalize(X, { means: model.means, stds: model.stds });
  return normalized.map((row) => {
    const logits = model.weights.map(
      (w, c) =>
        w.reduce((sum, wj, j) => sum + wj * row[j], 0) + model.biases[c]
    );
    const probs =
      model.classes.length === 2
        ? [sigmoid(logits[0]), 1 - sigmoid(logits[0])]
        : softmax(logits);
    const maxIdx = probs.indexOf(Math.max(...probs));
    return model.classes[maxIdx];
  });
}

function predictLogisticProba(
  model: LogisticModel,
  row: number[]
): { label: string; probability: number }[] {
  const { normalized } = normalize([row], {
    means: model.means,
    stds: model.stds,
  });
  const logits = model.weights.map(
    (w, c) =>
      w.reduce((sum, wj, j) => sum + wj * normalized[0][j], 0) +
      model.biases[c]
  );
  const probs =
    model.classes.length === 2
      ? [sigmoid(logits[0]), 1 - sigmoid(logits[0])]
      : softmax(logits);
  return model.classes.map((cls, i) => ({
    label: cls,
    probability: Math.round(probs[i] * 10000) / 10000,
  }));
}

// ─── Decision Tree ───────────────────────────────────────────────────────────

interface TreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: string;
  counts?: Map<string, number>;
}

interface DecisionTreeModel {
  type: "decision_tree";
  root: TreeNode;
  classes: string[];
  means: number[];
  stds: number[];
  featureNames: string[];
}

function giniImpurity(labels: string[]): number {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  let impurity = 1;
  for (const count of counts.values()) {
    const p = count / labels.length;
    impurity -= p * p;
  }
  return impurity;
}

function buildTree(
  X: number[][],
  y: string[],
  depth: number,
  maxDepth: number
): TreeNode {
  const counts = new Map<string, number>();
  for (const l of y) counts.set(l, (counts.get(l) || 0) + 1);

  // Check stop conditions
  if (depth >= maxDepth || y.length <= 2 || counts.size === 1) {
    let maxCount = 0;
    let prediction = y[0];
    for (const [label, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        prediction = label;
      }
    }
    return { prediction, counts };
  }

  const nFeatures = X[0].length;
  let bestGini = Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;

  for (let f = 0; f < nFeatures; f++) {
    const values = [...new Set(X.map((r) => r[f]))].sort((a, b) => a - b);
    for (let t = 0; t < values.length - 1; t++) {
      const threshold = (values[t] + values[t + 1]) / 2;
      const leftY = y.filter((_, i) => X[i][f] <= threshold);
      const rightY = y.filter((_, i) => X[i][f] > threshold);
      if (leftY.length === 0 || rightY.length === 0) continue;

      const gini =
        (leftY.length * giniImpurity(leftY) +
          rightY.length * giniImpurity(rightY)) /
        y.length;

      if (gini < bestGini) {
        bestGini = gini;
        bestFeature = f;
        bestThreshold = threshold;
      }
    }
  }

  if (bestGini === Infinity) {
    let maxCount = 0;
    let prediction = y[0];
    for (const [label, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        prediction = label;
      }
    }
    return { prediction, counts };
  }

  const leftIdx = X.map((r, i) => i).filter(
    (i) => X[i][bestFeature] <= bestThreshold
  );
  const rightIdx = X.map((r, i) => i).filter(
    (i) => X[i][bestFeature] > bestThreshold
  );

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildTree(
      leftIdx.map((i) => X[i]),
      leftIdx.map((i) => y[i]),
      depth + 1,
      maxDepth
    ),
    right: buildTree(
      rightIdx.map((i) => X[i]),
      rightIdx.map((i) => y[i]),
      depth + 1,
      maxDepth
    ),
    counts,
  };
}

function predictTree(node: TreeNode, row: number[]): string {
  if (node.prediction !== undefined) return node.prediction;
  if (row[node.featureIndex!] <= node.threshold!) {
    return predictTree(node.left!, row);
  }
  return predictTree(node.right!, row);
}

function getFeatureImportanceTree(
  root: TreeNode,
  nFeatures: number
): number[] {
  const importance = new Array(nFeatures).fill(0);

  function traverse(node: TreeNode, nSamples: number) {
    if (node.prediction !== undefined || !node.counts) return;
    const total = Array.from(node.counts.values()).reduce((a, b) => a + b, 0);
    importance[node.featureIndex!] += total;
    if (node.left) traverse(node.left, nSamples);
    if (node.right) traverse(node.right, nSamples);
  }

  traverse(root, 1);
  const sum = importance.reduce((a, b) => a + b, 0) || 1;
  return importance.map((v) => Math.round((v / sum) * 1000) / 1000);
}

// ─── Model Serialization ────────────────────────────────────────────────────

// TreeNode.counts is a Map which doesn't JSON-serialize — convert to plain object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTreeNode(node: TreeNode): any {
  return {
    featureIndex: node.featureIndex,
    threshold: node.threshold,
    left: node.left ? serializeTreeNode(node.left) : undefined,
    right: node.right ? serializeTreeNode(node.right) : undefined,
    prediction: node.prediction,
    counts: node.counts ? Object.fromEntries(node.counts) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeTreeNode(obj: any): TreeNode {
  return {
    featureIndex: obj.featureIndex,
    threshold: obj.threshold,
    left: obj.left ? deserializeTreeNode(obj.left) : undefined,
    right: obj.right ? deserializeTreeNode(obj.right) : undefined,
    prediction: obj.prediction,
    counts: obj.counts ? new Map(Object.entries(obj.counts).map(([k, v]) => [k, Number(v)])) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeModel(model: TrainedModel): any {
  if (model.type === "logistic_regression") {
    return { ...model };
  }
  return {
    ...model,
    root: serializeTreeNode(model.root),
  };
}

// Restore currentModel from a serialized model blob (e.g. from localStorage)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function restoreModel(serialized: any): void {
  if (!serialized || !serialized.type) {
    currentModel = null;
    return;
  }
  if (serialized.type === "logistic_regression") {
    currentModel = serialized as LogisticModel;
  } else if (serialized.type === "decision_tree") {
    currentModel = {
      ...serialized,
      root: deserializeTreeNode(serialized.root),
    } as DecisionTreeModel;
  }
}

// ─── Training Pipeline ───────────────────────────────────────────────────────

type TrainedModel = LogisticModel | DecisionTreeModel;

let currentModel: TrainedModel | null = null;

export function trainModel(
  featureData: UserFeatureRow[],
  config: TrainingConfig
): TrainingResult {
  const startTime = performance.now();

  // Prepare X and y
  const X: number[][] = [];
  const y: string[] = [];

  for (const row of featureData) {
    const featureVec = config.features.map((f) => {
      const val = row[f];
      return typeof val === "number" ? val : parseFloat(String(val)) || 0;
    });
    X.push(featureVec);
    y.push(String(row[config.targetVariable]));
  }

  // Train/test split
  const splitIdx = Math.floor(X.length * (1 - config.testSplit));
  const indices = Array.from({ length: X.length }, (_, i) => i);
  // Shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const trainIndices = indices.slice(0, splitIdx);
  const testIndices = indices.slice(splitIdx);
  const trainX = trainIndices.map((i) => X[i]);
  const trainY = trainIndices.map((i) => y[i]);
  const testX = testIndices.map((i) => X[i]);
  const testY = testIndices.map((i) => y[i]);
  const trainUserIds = trainIndices.map((i) => String(featureData[i].user_id));
  const testUserIds = testIndices.map((i) => String(featureData[i].user_id));

  let predictions: string[];
  let trainPredictions: string[];
  let losses: number[] = [];
  let featureImportance: number[];

  if (config.modelType === "logistic_regression") {
    const { model, losses: trainLosses } = trainLogisticRegression(
      trainX,
      trainY,
      config.learningRate,
      config.epochs,
      config.features
    );
    currentModel = model;
    predictions = predictLogistic(model, testX);
    trainPredictions = predictLogistic(model, trainX);
    losses = trainLosses;
    featureImportance = model.weights[0].map((w) => Math.abs(w));
    const maxImp = Math.max(...featureImportance) || 1;
    featureImportance = featureImportance.map(
      (v) => Math.round((v / maxImp) * 1000) / 1000
    );
  } else {
    const { normalized, means, stds } = normalize(trainX);
    const root = buildTree(normalized, trainY, 0, config.maxDepth);
    const dtModel: DecisionTreeModel = {
      type: "decision_tree",
      root,
      classes: [...new Set(y)].sort(),
      means,
      stds,
      featureNames: config.features,
    };
    currentModel = dtModel;

    const { normalized: testNorm } = normalize(testX, { means, stds });
    predictions = testNorm.map((row) => predictTree(root, row));
    trainPredictions = normalized.map((row) => predictTree(root, row));
    featureImportance = getFeatureImportanceTree(root, config.features.length);

    // Simulated loss curve for tree
    for (let i = 0; i < 20; i++) {
      losses.push(Math.max(0.05, 0.8 * Math.exp(-i * 0.3) + Math.random() * 0.05));
    }
  }

  // Compute metrics
  const classes = [...new Set([...testY, ...predictions])].sort();
  const cm = classes.map(() => classes.map(() => 0));
  for (let i = 0; i < testY.length; i++) {
    const actual = classes.indexOf(testY[i]);
    const pred = classes.indexOf(predictions[i]);
    if (actual >= 0 && pred >= 0) cm[actual][pred]++;
  }

  const correct = testY.filter((v, i) => v === predictions[i]).length;
  const accuracy = Math.round((correct / testY.length) * 10000) / 10000;

  // Train accuracy (for overfitting detection)
  const trainCorrect = trainY.filter((v, i) => v === trainPredictions[i]).length;
  const trainAccuracy = Math.round((trainCorrect / trainY.length) * 10000) / 10000;

  // Per-class precision/recall/specificity, then macro average
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalSpecificity = 0;
  const totalSamples = testY.length;
  for (let c = 0; c < classes.length; c++) {
    const tp = cm[c][c];
    const fpPlusTp = classes.reduce((sum, _, r) => sum + cm[r][c], 0);
    const fnPlusTp = cm[c].reduce((a, b) => a + b, 0);
    const fp = fpPlusTp - tp;
    const fn = fnPlusTp - tp;
    const tn = totalSamples - tp - fp - fn;
    totalPrecision += fpPlusTp > 0 ? tp / fpPlusTp : 0;
    totalRecall += fnPlusTp > 0 ? tp / fnPlusTp : 0;
    totalSpecificity += (tn + fp) > 0 ? tn / (tn + fp) : 0;
  }
  const precision = Math.round((totalPrecision / classes.length) * 10000) / 10000;
  const recall = Math.round((totalRecall / classes.length) * 10000) / 10000;
  const specificity = Math.round((totalSpecificity / classes.length) * 10000) / 10000;
  const f1 =
    precision + recall > 0
      ? Math.round(((2 * precision * recall) / (precision + recall)) * 10000) /
        10000
      : 0;

  // Log Loss (cross-entropy on test set, approximated from accuracy)
  const logLossVal = (() => {
    let ll = 0;
    for (let i = 0; i < testY.length; i++) {
      const isCorrect = testY[i] === predictions[i] ? 1 : 0;
      // Approximate probability from confusion matrix
      const actual = classes.indexOf(testY[i]);
      const rowTotal = cm[actual].reduce((a, b) => a + b, 0);
      const prob = rowTotal > 0 ? Math.max(cm[actual][classes.indexOf(predictions[i])] / rowTotal, 1e-10) : 1e-10;
      ll -= isCorrect ? Math.log(Math.max(prob, 1e-10)) : Math.log(Math.max(1 - prob, 1e-10));
    }
    return Math.round((ll / testY.length) * 10000) / 10000;
  })();

  // Matthews Correlation Coefficient (MCC) — macro-averaged for multi-class
  const mccVal = (() => {
    if (classes.length === 2) {
      const tp = cm[0][0];
      const tn = cm[1][1];
      const fp = cm[1][0];
      const fn = cm[0][1];
      const denom = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
      return denom > 0 ? Math.round(((tp * tn - fp * fn) / denom) * 10000) / 10000 : 0;
    }
    // Multi-class: compute from confusion matrix
    let cov_xy = 0, cov_xz = 0, cov_yz = 0;
    for (let k = 0; k < classes.length; k++) {
      for (let l = 0; l < classes.length; l++) {
        for (let m = 0; m < classes.length; m++) {
          cov_xy += cm[k][k] * cm[l][m] - cm[k][l] * cm[m][k];
        }
      }
    }
    for (let k = 0; k < classes.length; k++) {
      let rowSum = 0, colSum = 0;
      for (let l = 0; l < classes.length; l++) { rowSum += cm[k][l]; colSum += cm[l][k]; }
      cov_xz += rowSum * rowSum;
      cov_yz += colSum * colSum;
    }
    const n = totalSamples;
    cov_xz = n * n - cov_xz;
    cov_yz = n * n - cov_yz;
    const denom = Math.sqrt(cov_xz * cov_yz);
    return denom > 0 ? Math.round((cov_xy / denom) * 10000) / 10000 : 0;
  })();

  const trainingDurationMs = Math.round(performance.now() - startTime);

  const result: TrainingResult = {
    modelId: `model_${Date.now()}`,
    modelType: config.modelType,
    accuracy,
    precision,
    recall,
    f1Score: f1,
    logLoss: logLossVal,
    specificity,
    mcc: mccVal,
    trainAccuracy,
    trainingDurationMs,
    confusionMatrix: cm,
    classLabels: classes,
    featureImportance: config.features.map((f, i) => ({
      feature: f,
      importance: featureImportance[i] || 0,
    })),
    trainingLoss: losses,
    trainSize: trainX.length,
    testSize: testX.length,
    trainUserIds,
    testUserIds,
    timestamp: new Date().toISOString(),
    config,
    serializedModel: serializeModel(currentModel!),
  };

  return result;
}

export function predict(input: PredictionInput): PredictionResult | null {
  if (!currentModel) return null;

  const featureVec = currentModel.featureNames.map((f) => {
    const val = input[f];
    return typeof val === "number" ? val : parseFloat(String(val)) || 0;
  });

  if (currentModel.type === "logistic_regression") {
    const model = currentModel as LogisticModel;
    const probas = predictLogisticProba(model, featureVec);
    const pred = probas.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );
    return {
      prediction: pred.label,
      probabilities: probas,
      inputFeatures: input,
    };
  } else {
    const model = currentModel as DecisionTreeModel;
    const { normalized } = normalize([featureVec], {
      means: model.means,
      stds: model.stds,
    });
    const prediction = predictTree(model.root, normalized[0]);
    const probabilities = model.classes.map((cls) => ({
      label: cls,
      probability: cls === prediction ? 0.85 : 0.15 / (model.classes.length - 1),
    }));
    return {
      prediction,
      probabilities,
      inputFeatures: input,
    };
  }
}

// ─── Persona Pipeline: K-Means Clustering ────────────────────────────────────

export const PERSONA_FEATURE_NAMES = [
  "total_events_30d",
  "unique_dashboards_viewed",
  "mobile_ratio",
  "realtime_ratio",
  "repeat_view_ratio",
  "games_touched",
  "navigation_entropy",
  "active_hour_std",
];

export interface PersonaFeatureMeta {
  name: string;
  label: string;
  type: "count" | "ratio" | "entropy" | "std";
  recommendLog: boolean;
  description: string;
  sql: string;
}

export const PERSONA_FEATURE_META: PersonaFeatureMeta[] = [
  {
    name: "total_events_30d", label: "Total Events (30d)", type: "count", recommendLog: true,
    description: "Raw event count per user over 30 days. Heavy-tail distribution — power users dominate. Log-transform recommended.",
    sql: "SELECT user_id, COUNT(*) AS total_events_30d\nFROM events\nWHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
  {
    name: "unique_dashboards_viewed", label: "Unique Dashboards Viewed", type: "count", recommendLog: true,
    description: "Count of distinct dashboards a user viewed. Measures breadth of exploration. Skewed — log-transform recommended.",
    sql: "SELECT user_id,\n  COUNT(DISTINCT resource_name) AS unique_dashboards_viewed\nFROM events\nWHERE resource_type IN ('dashboard','realtime')\n  AND timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
  {
    name: "mobile_ratio", label: "Mobile Ratio", type: "ratio", recommendLog: false,
    description: "Fraction of events from mobile devices. Already 0–1, no transform needed. High values indicate mobile-first users.",
    sql: "SELECT user_id,\n  SUM(CASE WHEN device_type = 'mobile' THEN 1 ELSE 0 END)::FLOAT\n    / COUNT(*) AS mobile_ratio\nFROM events\nWHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
  {
    name: "realtime_ratio", label: "Realtime Dashboard Ratio", type: "ratio", recommendLog: false,
    description: "Fraction of views on realtime dashboards — special dashboards game operators use to monitor live game health. Already 0–1.",
    sql: "SELECT user_id,\n  SUM(CASE WHEN resource_type = 'realtime' THEN 1 ELSE 0 END)::FLOAT\n    / COUNT(*) AS realtime_ratio\nFROM events\nWHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
  {
    name: "repeat_view_ratio", label: "Repeat View Ratio", type: "ratio", recommendLog: false,
    description: "Ratio of repeated dashboard visits to total sessions. High values indicate users who monitor the same dashboards repeatedly (e.g., LiveOps operators).",
    sql: "SELECT user_id,\n  1.0 - (COUNT(DISTINCT resource_name)::FLOAT / COUNT(*))\n    AS repeat_view_ratio\nFROM events\nWHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
  {
    name: "games_touched", label: "Games Touched", type: "count", recommendLog: true,
    description: "Number of unique games/titles the user interacted with. Measures cross-game exploration. Skewed — log-transform recommended.",
    sql: "SELECT user_id,\n  COUNT(DISTINCT resource_name) AS games_touched\nFROM events\nWHERE resource_type IN ('game','tableau')\n  AND timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
  {
    name: "navigation_entropy", label: "Navigation Entropy", type: "entropy", recommendLog: false,
    description: "Shannon entropy of dashboard visit distribution. High entropy = random/exploratory navigation. Low entropy = focused/repetitive pattern. Range depends on unique dashboards.",
    sql: "-- Shannon entropy: H = -Σ p(x) * log2(p(x))\nWITH visit_probs AS (\n  SELECT user_id, resource_name,\n    COUNT(*)::FLOAT / SUM(COUNT(*)) OVER (PARTITION BY user_id) AS p\n  FROM events\n  WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'\n  GROUP BY user_id, resource_name\n)\nSELECT user_id,\n  -SUM(p * LOG(2, p)) AS navigation_entropy\nFROM visit_probs\nGROUP BY user_id",
  },
  {
    name: "active_hour_std", label: "Active Hour Std Dev", type: "std", recommendLog: false,
    description: "Standard deviation of the hour-of-day when user is active. Low std = consistent schedule (e.g., daily 9am checks). High std = irregular activity patterns.",
    sql: "SELECT user_id,\n  STDDEV(EXTRACT(HOUR FROM timestamp)) AS active_hour_std\nFROM events\nWHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'\nGROUP BY user_id",
  },
];

export interface ClusterConfig {
  selectedFeatures: string[];
  logTransformFeatures: string[];
}

export function cleanLogs(rawLogs: RawLogEntry[]): CleanedLog[] {
  return rawLogs.map((log) => {
    let resourceName = log.resource_name || "";
    // Simplify game names: remove prefix codes like "A49 - ", "661 - "
    resourceName = resourceName.replace(/^[A-Z0-9,]+\s*-\s*/, "");
    const hour = new Date(log.timestamp).getHours();
    return {
      user_id: log.user_id,
      resource_type: log.resource_type,
      resource_name: resourceName,
      hour: isNaN(hour) ? 12 : hour,
      device: log.device_type || "unknown",
      source: log.source_item || "unknown",
    };
  });
}

export function aggregateToPersonaFeatures(
  cleanedLogs: CleanedLog[]
): PersonaFeatureRow[] {
  const userMap = new Map<string, CleanedLog[]>();
  for (const log of cleanedLogs) {
    if (!userMap.has(log.user_id)) userMap.set(log.user_id, []);
    userMap.get(log.user_id)!.push(log);
  }

  const rows: PersonaFeatureRow[] = [];
  for (const [userId, logs] of userMap) {
    const totalEvents = logs.length;

    // unique_dashboards_viewed: distinct dashboard/realtime resource names
    const dashboardNames = new Set(
      logs
        .filter((l) => l.resource_type === "dashboard" || l.resource_type === "realtime")
        .map((l) => l.resource_name)
    );

    // mobile_ratio: fraction of mobile events
    const mobileEvents = logs.filter((l) => l.device === "mobile").length;

    // realtime_ratio: fraction of realtime dashboard views
    const realtimeEvents = logs.filter((l) => l.resource_type === "realtime").length;

    // repeat_view_ratio: 1 - (unique resources / total events)
    const uniqueResources = new Set(logs.map((l) => l.resource_name)).size;
    const repeatViewRatio = totalEvents > 1
      ? Math.round((1 - uniqueResources / totalEvents) * 1000) / 1000
      : 0;

    // games_touched: distinct game/tableau resource names
    const gameFolders = new Set(
      logs
        .filter((l) => l.resource_type === "game" || l.resource_type === "tableau")
        .map((l) => l.resource_name)
    );

    // navigation_entropy: Shannon entropy of resource visit distribution
    const resourceCounts = new Map<string, number>();
    for (const log of logs) {
      resourceCounts.set(log.resource_name, (resourceCounts.get(log.resource_name) || 0) + 1);
    }
    let entropy = 0;
    for (const count of resourceCounts.values()) {
      const p = count / totalEvents;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    // active_hour_std: standard deviation of activity hours
    const hours = logs.map((l) => l.hour);
    const meanHour = hours.length > 0
      ? hours.reduce((a, b) => a + b, 0) / hours.length
      : 12;
    const hourVariance = hours.length > 1
      ? hours.reduce((a, h) => a + (h - meanHour) ** 2, 0) / hours.length
      : 0;
    const hourStd = Math.sqrt(hourVariance);

    rows.push({
      user_id: userId,
      total_events_30d: totalEvents,
      unique_dashboards_viewed: dashboardNames.size,
      mobile_ratio: Math.round((mobileEvents / totalEvents) * 1000) / 1000,
      realtime_ratio: Math.round((realtimeEvents / totalEvents) * 1000) / 1000,
      repeat_view_ratio: repeatViewRatio,
      games_touched: gameFolders.size,
      navigation_entropy: Math.round(entropy * 1000) / 1000,
      active_hour_std: Math.round(hourStd * 100) / 100,
    });
  }
  return rows;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function kMeans(
  data: number[][],
  k: number,
  maxIter: number = 50
): { centroids: number[][]; labels: number[]; inertia: number; iterations: number } {
  const n = data.length;
  const d = data[0].length;

  // K-Means++ initialization
  const centroids: number[][] = [];
  const usedIdx = new Set<number>();
  // Pick first centroid randomly
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...data[firstIdx]]);
  usedIdx.add(firstIdx);

  for (let c = 1; c < k; c++) {
    // Compute distances to nearest centroid
    const dists = data.map((point, i) => {
      if (usedIdx.has(i)) return 0;
      let minDist = Infinity;
      for (const centroid of centroids) {
        minDist = Math.min(minDist, euclideanDistance(point, centroid));
      }
      return minDist * minDist;
    });
    const totalDist = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalDist;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) {
        centroids.push([...data[i]]);
        usedIdx.add(i);
        break;
      }
    }
    if (centroids.length < c + 1) {
      // fallback
      const idx = Math.floor(Math.random() * n);
      centroids.push([...data[idx]]);
    }
  }

  let labels = new Array(n).fill(0);
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    // Assign step
    const newLabels = data.map((point) => {
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(point, centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      return bestCluster;
    });

    // Check convergence
    const changed = newLabels.some((l, i) => l !== labels[i]);
    labels = newLabels;

    // Update step
    for (let c = 0; c < k; c++) {
      const members = data.filter((_, i) => labels[i] === c);
      if (members.length === 0) continue;
      for (let j = 0; j < d; j++) {
        centroids[c][j] =
          members.reduce((sum, m) => sum + m[j], 0) / members.length;
      }
    }

    if (!changed) break;
  }

  // Compute inertia (sum of squared distances)
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += euclideanDistance(data[i], centroids[labels[i]]) ** 2;
  }

  return { centroids, labels, inertia: Math.round(inertia * 100) / 100, iterations };
}

// ─── Model Validation & Diagnosis Engine ──────────────────────────────────────

export interface ExperimentRun {
  id: number;
  k: number;
  features: string[];
  logTransforms: string[];
  silhouette: number;
  inertia: number;
  iterations: number;
  clusterSizes: number[];
  timestamp: number;
}

export interface FeatureImportanceResult {
  feature: string;
  label: string;
  baselineSilhouette: number;
  silhouetteWithout: number;
  delta: number; // positive = feature helps (removing it hurts)
  verdict: "critical" | "helpful" | "neutral" | "harmful";
}

export interface ClusterProfile {
  clusterId: number;
  suggestedName: string;
  description: string;
  dominantFeatures: { feature: string; value: number; level: "high" | "low" | "medium" }[];
  userCount: number;
  percentOfTotal: number;
}

export interface FeatureComboSuggestion {
  features: string[];
  logTransforms: string[];
  silhouette: number;
  delta: number; // vs current
  reason: string;
}

export interface ModelDiagnosis {
  overallQuality: "good" | "weak" | "poor";
  silhouette: number;
  bestK: number;
  bestKSilhouette: number;
  isKOptimal: boolean;
  allKWeak: boolean;
  featureImportance: FeatureImportanceResult[];
  suggestedCombos: FeatureComboSuggestion[];
  clusterProfiles: ClusterProfile[];
  recommendations: { action: string; type: "k" | "feature" | "algo" | "accept"; priority: "high" | "medium" | "low" }[];
}

/** Fast silhouette: run K-Means with given features, return silhouette score */
function quickSilhouette(
  personaFeatures: PersonaFeatureRow[],
  k: number,
  features: string[],
  logTransforms: string[]
): number {
  if (features.length < 2) return -1;
  const logSet = new Set(logTransforms);
  const X = personaFeatures.map((row) =>
    features.map((f) => {
      const val = (row as unknown as Record<string, number>)[f] || 0;
      return logSet.has(f) ? Math.log1p(val) : val;
    })
  );
  const { normalized } = normalize(X);
  // Single run for speed
  const { labels } = kMeans(normalized, k, 30);
  const n = normalized.length;
  let silTotal = 0;
  for (let i = 0; i < n; i++) {
    const ci = labels[i];
    const sameCluster = normalized.filter((_, j) => j !== i && labels[j] === ci);
    const a = sameCluster.length > 0
      ? sameCluster.reduce((sum, p) => sum + euclideanDistance(normalized[i], p), 0) / sameCluster.length
      : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci) continue;
      const other = normalized.filter((_, j) => labels[j] === c);
      if (other.length === 0) continue;
      const md = other.reduce((sum, p) => sum + euclideanDistance(normalized[i], p), 0) / other.length;
      b = Math.min(b, md);
    }
    if (b === Infinity) b = 0;
    silTotal += Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
  }
  return Math.round((silTotal / n) * 1000) / 1000;
}

/** Analyze each feature's contribution by leave-one-out silhouette comparison */
export function analyzeFeatureImportance(
  personaFeatures: PersonaFeatureRow[],
  k: number,
  currentFeatures: string[],
  logTransforms: string[]
): FeatureImportanceResult[] {
  if (currentFeatures.length <= 2) return []; // can't leave-one-out with only 2

  const baseline = quickSilhouette(personaFeatures, k, currentFeatures, logTransforms);

  // Also test adding features not currently selected
  const allFeatures = PERSONA_FEATURE_NAMES;
  const notSelected = allFeatures.filter((f) => !currentFeatures.includes(f));

  const results: FeatureImportanceResult[] = [];

  // Leave-one-out for selected features
  for (const feat of currentFeatures) {
    const without = currentFeatures.filter((f) => f !== feat);
    const silWithout = quickSilhouette(personaFeatures, k, without, logTransforms);
    const delta = baseline - silWithout; // positive = removing hurts = feature helps
    const meta = PERSONA_FEATURE_META.find((m) => m.name === feat);
    let verdict: FeatureImportanceResult["verdict"] = "neutral";
    if (delta > 0.05) verdict = "critical";
    else if (delta > 0.01) verdict = "helpful";
    else if (delta < -0.03) verdict = "harmful";
    results.push({
      feature: feat,
      label: meta?.label || feat,
      baselineSilhouette: baseline,
      silhouetteWithout: silWithout,
      delta,
      verdict,
    });
  }

  // Add-one-in for unselected features
  for (const feat of notSelected) {
    const withFeat = [...currentFeatures, feat];
    const recLog = PERSONA_FEATURE_META.find((m) => m.name === feat)?.recommendLog
      ? [...logTransforms, feat] : logTransforms;
    const silWith = quickSilhouette(personaFeatures, k, withFeat, recLog);
    const delta = silWith - baseline; // positive = adding helps
    const meta = PERSONA_FEATURE_META.find((m) => m.name === feat);
    let verdict: FeatureImportanceResult["verdict"] = "neutral";
    if (delta > 0.05) verdict = "critical";
    else if (delta > 0.01) verdict = "helpful";
    else if (delta < -0.03) verdict = "harmful";
    results.push({
      feature: feat,
      label: meta?.label || feat,
      baselineSilhouette: baseline,
      silhouetteWithout: silWith, // repurpose: silhouette when added
      delta,
      verdict,
    });
  }

  // Sort: critical first, then by absolute delta
  results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return results;
}

/** Auto-interpret cluster centroids into business-readable profiles */
export function interpretClusterProfiles(
  result: ClusteringResult
): ClusterProfile[] {
  const totalUsers = result.assignments.length;
  return result.personas.map((persona) => {
    const centroid = result.centroids[persona.id];
    const userCount = result.assignments.filter((a) => a.persona_id === persona.id).length;

    // Classify each feature as high/medium/low relative to other centroids
    const dominantFeatures = result.featureNames.map((feat, fi) => {
      const val = centroid?.[fi] ?? 0;
      const allVals = result.centroids.map((c) => c[fi]);
      const maxVal = Math.max(...allVals);
      const minVal = Math.min(...allVals);
      const range = maxVal - minVal;
      let level: "high" | "low" | "medium" = "medium";
      if (range > 0) {
        const normalized = (val - minVal) / range;
        if (normalized > 0.7) level = "high";
        else if (normalized < 0.3) level = "low";
      }
      return { feature: feat, value: val, level };
    });

    // Generate description from dominant features
    const highs = dominantFeatures.filter((d) => d.level === "high").map((d) => d.feature.replace(/_/g, " "));
    const lows = dominantFeatures.filter((d) => d.level === "low").map((d) => d.feature.replace(/_/g, " "));
    let description = "";
    if (highs.length > 0) description += `High ${highs.join(", ")}`;
    if (highs.length > 0 && lows.length > 0) description += "; ";
    if (lows.length > 0) description += `Low ${lows.join(", ")}`;
    if (!description) description = "Average across all features";

    return {
      clusterId: persona.id,
      suggestedName: persona.name,
      description,
      dominantFeatures,
      userCount,
      percentOfTotal: Math.round((userCount / totalUsers) * 100),
    };
  });
}

/** Suggest alternative feature combos to try */
export function suggestFeatureCombos(
  personaFeatures: PersonaFeatureRow[],
  k: number,
  currentFeatures: string[],
  logTransforms: string[]
): FeatureComboSuggestion[] {
  const baseline = quickSilhouette(personaFeatures, k, currentFeatures, logTransforms);
  const suggestions: FeatureComboSuggestion[] = [];

  // Strategy 1: Try with all features
  if (currentFeatures.length < PERSONA_FEATURE_NAMES.length) {
    const allLog = PERSONA_FEATURE_META.filter((m) => m.recommendLog).map((m) => m.name);
    const sil = quickSilhouette(personaFeatures, k, [...PERSONA_FEATURE_NAMES], allLog);
    suggestions.push({
      features: [...PERSONA_FEATURE_NAMES],
      logTransforms: allLog,
      silhouette: sil,
      delta: sil - baseline,
      reason: "All features — maximum information",
    });
  }

  // Strategy 2: Ratios-only (no count features)
  const ratioFeatures = PERSONA_FEATURE_META.filter((m) => m.type === "ratio" || m.type === "entropy" || m.type === "std").map((m) => m.name);
  if (ratioFeatures.length >= 2 && JSON.stringify(ratioFeatures.sort()) !== JSON.stringify([...currentFeatures].sort())) {
    const sil = quickSilhouette(personaFeatures, k, ratioFeatures, []);
    suggestions.push({
      features: ratioFeatures,
      logTransforms: [],
      silhouette: sil,
      delta: sil - baseline,
      reason: "Ratios + entropy + std only — removes count-dominated variance",
    });
  }

  // Strategy 3: Behavioral focus (realtime, repeat, entropy, hour_std)
  const behavioral = ["realtime_ratio", "repeat_view_ratio", "navigation_entropy", "active_hour_std", "mobile_ratio"]
    .filter((f) => PERSONA_FEATURE_NAMES.includes(f));
  if (behavioral.length >= 2 && JSON.stringify(behavioral.sort()) !== JSON.stringify([...currentFeatures].sort())) {
    const sil = quickSilhouette(personaFeatures, k, behavioral, []);
    suggestions.push({
      features: behavioral,
      logTransforms: [],
      silhouette: sil,
      delta: sil - baseline,
      reason: "Behavioral signals only — focused on usage patterns, not volume",
    });
  }

  // Strategy 4: Volume + diversity (events, dashboards, games)
  const volume = ["total_events_30d", "unique_dashboards_viewed", "games_touched"]
    .filter((f) => PERSONA_FEATURE_NAMES.includes(f));
  if (volume.length >= 2 && JSON.stringify(volume.sort()) !== JSON.stringify([...currentFeatures].sort())) {
    const volLog = PERSONA_FEATURE_META.filter((m) => volume.includes(m.name) && m.recommendLog).map((m) => m.name);
    const sil = quickSilhouette(personaFeatures, k, volume, volLog);
    suggestions.push({
      features: volume,
      logTransforms: volLog,
      silhouette: sil,
      delta: sil - baseline,
      reason: "Volume & diversity only — separates power users from casual",
    });
  }

  // Sort by silhouette descending
  suggestions.sort((a, b) => b.silhouette - a.silhouette);
  return suggestions;
}

/** Full model diagnosis: combines all analyses into actionable recommendations */
export function diagnoseModel(
  personaFeatures: PersonaFeatureRow[],
  result: ClusteringResult,
  elbowData: { k: number; silhouette: number; inertia: number }[],
  currentFeatures: string[],
  logTransforms: string[]
): ModelDiagnosis {
  const currentElbow = elbowData.find((e) => e.k === result.k);
  const sil = currentElbow?.silhouette ?? 0;
  const bestKEntry = elbowData.reduce((best, e) => e.silhouette > best.silhouette ? e : best, elbowData[0]);
  const allKWeak = elbowData.every((e) => e.silhouette < 0.5);

  const overallQuality: ModelDiagnosis["overallQuality"] =
    sil >= 0.5 ? "good" : sil >= 0.25 ? "weak" : "poor";

  const featureImportance = analyzeFeatureImportance(personaFeatures, result.k, currentFeatures, logTransforms);
  const suggestedCombos = suggestFeatureCombos(personaFeatures, result.k, currentFeatures, logTransforms);
  const clusterProfiles = interpretClusterProfiles(result);

  // Build recommendations
  const recommendations: ModelDiagnosis["recommendations"] = [];

  if (bestKEntry.k !== result.k && bestKEntry.silhouette > sil + 0.02) {
    recommendations.push({
      action: `Switch to K=${bestKEntry.k} (silhouette ${bestKEntry.silhouette} vs current ${sil})`,
      type: "k",
      priority: "high",
    });
  }

  const harmful = featureImportance.filter((f) => f.verdict === "harmful" && currentFeatures.includes(f.feature));
  for (const h of harmful) {
    recommendations.push({
      action: `Drop ${h.label} — removing it improves silhouette by ${Math.abs(h.delta).toFixed(3)}`,
      type: "feature",
      priority: "high",
    });
  }

  const helpful = featureImportance.filter((f) => (f.verdict === "critical" || f.verdict === "helpful") && !currentFeatures.includes(f.feature));
  for (const h of helpful) {
    recommendations.push({
      action: `Add ${h.label} — expected to improve silhouette by ${h.delta.toFixed(3)}`,
      type: "feature",
      priority: h.verdict === "critical" ? "high" : "medium",
    });
  }

  const bestCombo = suggestedCombos.find((c) => c.silhouette > sil + 0.02);
  if (bestCombo) {
    recommendations.push({
      action: `Try "${bestCombo.reason}" combo (expected silhouette ${bestCombo.silhouette})`,
      type: "feature",
      priority: "medium",
    });
  }

  if (allKWeak) {
    recommendations.push({
      action: "Consider soft clustering (GMM) — no K produces strong clusters with current features",
      type: "algo",
      priority: "medium",
    });
  }

  if (overallQuality === "good" || (overallQuality === "weak" && recommendations.length === 0)) {
    recommendations.push({
      action: "Proceed to cluster interpretation — inspect centroid profiles and map to business personas",
      type: "accept",
      priority: overallQuality === "good" ? "high" : "medium",
    });
  }

  return {
    overallQuality,
    silhouette: sil,
    bestK: bestKEntry.k,
    bestKSilhouette: bestKEntry.silhouette,
    isKOptimal: bestKEntry.k === result.k,
    allKWeak,
    featureImportance,
    suggestedCombos,
    clusterProfiles,
    recommendations,
  };
}

export const DEFAULT_PERSONAS: Omit<PersonaDefinition, "id">[] = [
  {
    name: "New / Casual User",
    color: "#f59e0b",
    icon: "sun",
    definingSignals: [
      "Low total_events_30d — minimal platform activity",
      "Low unique_dashboards_viewed — hasn't explored",
      "High mobile_ratio — mobile-first access pattern",
      "Low navigation_entropy — visits only 1–2 resources",
      "High active_hour_std — irregular usage schedule",
    ],
    onboardingType: "guided_basic",
    onboardingTitle: "Welcome! Start with 1 dashboard",
    onboardingActions: [
      "Guided tour of key features",
      "Big buttons, simple navigation",
      "Hide advanced filters",
      "Suggest default game dashboard",
    ],
  },
  {
    name: "LiveOps Monitor",
    color: "#22c55e",
    icon: "activity",
    definingSignals: [
      "High realtime_ratio — focused on live game dashboards",
      "High repeat_view_ratio — monitors same dashboards repeatedly",
      "Low active_hour_std — consistent daily schedule",
      "Low games_touched — focused on specific game(s)",
      "Low navigation_entropy — repetitive, focused pattern",
    ],
    onboardingType: "skip_tutorial_realtime",
    onboardingTitle: "Realtime dashboards updated every 60s",
    onboardingActions: [
      "Skip tutorial entirely",
      "Ask: Which realtime dashboard to pin?",
      "Emphasize alerts & data freshness",
      "Offer notification setup",
    ],
  },
  {
    name: "Exploratory Analyst",
    color: "#3b82f6",
    icon: "compass",
    definingSignals: [
      "High unique_dashboards_viewed — broad exploration",
      "High games_touched — cross-game analysis",
      "High navigation_entropy — varied, exploratory navigation",
      "Low mobile_ratio — desktop/laptop power user",
      "Low repeat_view_ratio — rarely revisits same view",
    ],
    onboardingType: "advanced_shortcuts",
    onboardingTitle: "Explore cross-game performance dashboards",
    onboardingActions: [
      "No tutorial needed",
      "Show advanced navigation & filters",
      "Suggest cross-game comparison views",
      "Offer saved views & keyboard shortcuts",
    ],
  },
];

function interpretClusters(
  centroids: number[][],
  featureNames: string[]
): number[] {
  // Heuristic: match each centroid to a persona template based on feature patterns
  const k = centroids.length;
  const assignments = new Array(k).fill(-1);
  const used = new Set<number>();

  // Helper to safely read a feature value (0 if feature not selected)
  const f = (featureMap: Record<string, number>, name: string) => featureMap[name] ?? 0;

  // Score each centroid against each persona template
  const scores: number[][] = centroids.map((centroid) => {
    const featureMap: Record<string, number> = {};
    featureNames.forEach((feat, i) => (featureMap[feat] = centroid[i]));

    // Score for "New / Casual" (persona 0):
    // low events, low dashboards, high mobile, low entropy, high hour_std
    const casualScore =
      (1 / (1 + f(featureMap, "total_events_30d"))) * 2 +
      (1 / (1 + f(featureMap, "unique_dashboards_viewed"))) * 2 +
      f(featureMap, "mobile_ratio") * 3 +
      (1 / (1 + f(featureMap, "navigation_entropy"))) * 1.5 +
      f(featureMap, "active_hour_std") * 0.5;

    // Score for "LiveOps Monitor" (persona 1):
    // high realtime, high repeat_view, low hour_std, low games, low entropy
    const liveopsScore =
      f(featureMap, "realtime_ratio") * 4 +
      f(featureMap, "repeat_view_ratio") * 3 +
      (1 / (1 + f(featureMap, "active_hour_std"))) * 2 +
      (1 / (1 + f(featureMap, "games_touched"))) * 1 +
      (1 / (1 + f(featureMap, "navigation_entropy"))) * 1;

    // Score for "Exploratory Analyst" (persona 2):
    // high dashboards, high games, high entropy, low mobile, low repeat_view
    const analystScore =
      f(featureMap, "unique_dashboards_viewed") * 2 +
      f(featureMap, "games_touched") * 2 +
      f(featureMap, "navigation_entropy") * 2 +
      (1 - f(featureMap, "mobile_ratio")) * 1.5 +
      (1 - f(featureMap, "repeat_view_ratio")) * 1;

    return [casualScore, liveopsScore, analystScore];
  });

  // Greedy assignment: pick best match iteratively
  for (let round = 0; round < Math.min(k, 3); round++) {
    let bestCentroid = -1;
    let bestPersona = -1;
    let bestScore = -Infinity;
    for (let c = 0; c < k; c++) {
      if (assignments[c] !== -1) continue;
      for (let p = 0; p < 3; p++) {
        if (used.has(p)) continue;
        if (scores[c][p] > bestScore) {
          bestScore = scores[c][p];
          bestCentroid = c;
          bestPersona = p;
        }
      }
    }
    if (bestCentroid >= 0) {
      assignments[bestCentroid] = bestPersona;
      used.add(bestPersona);
    }
  }

  // Assign remaining (if k > 3) to nearest persona
  for (let c = 0; c < k; c++) {
    if (assignments[c] === -1) {
      let best = 0;
      let bestS = -Infinity;
      for (let p = 0; p < 3; p++) {
        if (scores[c][p] > bestS) {
          bestS = scores[c][p];
          best = p;
        }
      }
      assignments[c] = best;
    }
  }

  return assignments;
}

export function runPersonaClustering(
  personaFeatures: PersonaFeatureRow[],
  k: number = 3,
  config?: ClusterConfig
): ClusteringResult {
  const featureNames = config?.selectedFeatures ?? PERSONA_FEATURE_NAMES;
  const logFeatures = new Set(config?.logTransformFeatures ?? []);

  // Build feature matrix with optional log-transform for heavy-tail features
  const X = personaFeatures.map((row) =>
    featureNames.map((f) => {
      const val = (row as unknown as Record<string, number>)[f] || 0;
      return logFeatures.has(f) ? Math.log1p(val) : val;
    })
  );

  // Normalize (z-score)
  const { normalized, means, stds } = normalize(X);

  // Run K-Means multiple times, pick best (lowest inertia) for stability
  let best = kMeans(normalized, k);
  for (let run = 1; run < 5; run++) {
    const candidate = kMeans(normalized, k);
    if (candidate.inertia < best.inertia) best = candidate;
  }
  const { centroids, labels, inertia, iterations } = best;

  // Denormalize centroids BEFORE interpretation (scoring needs raw values, not z-scores)
  const denormCentroids = centroids.map((c) =>
    c.map((val, j) => {
      let raw = val * stds[j] + means[j];
      // Reverse log-transform for display
      if (logFeatures.has(featureNames[j])) raw = Math.expm1(raw);
      return Math.round(raw * 100) / 100;
    })
  );

  // Interpret clusters → persona mapping (using raw-scale centroids)
  const clusterToPersona = interpretClusters(denormCentroids, featureNames);

  // Build persona definitions
  const personas: PersonaDefinition[] = [];
  for (let c = 0; c < k; c++) {
    const templateIdx = clusterToPersona[c];
    const template = DEFAULT_PERSONAS[templateIdx] || DEFAULT_PERSONAS[0];
    personas.push({ ...template, id: c });
  }

  // Compute distance stats for edge-case detection
  const distances = personaFeatures.map((_, i) =>
    euclideanDistance(normalized[i], centroids[labels[i]])
  );
  const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const stdDist = Math.sqrt(distances.reduce((a, b) => a + (b - meanDist) ** 2, 0) / distances.length);
  const edgeThreshold = meanDist + 1.5 * stdDist;

  // Build assignments
  const assignments: UserPersonaAssignment[] = personaFeatures.map(
    (row, i) => {
      const clusterId = labels[i];
      const dist = distances[i];
      const persona = personas[clusterId];
      return {
        user_id: row.user_id,
        persona_id: clusterId,
        persona_name: persona.name,
        distance_to_centroid: Math.round(dist * 1000) / 1000,
        is_edge_case: dist > edgeThreshold,
        recommended_onboarding_type: persona.onboardingType,
        features: row,
      };
    }
  );

  return {
    centroids: denormCentroids,
    assignments,
    personas,
    inertia,
    iterations,
    k,
    featureNames,
  };
}

export function computeElbowData(
  personaFeatures: PersonaFeatureRow[],
  kRange: number[] = [2, 3, 4, 5, 6, 7, 8],
  config?: ClusterConfig
): { k: number; inertia: number; silhouette: number }[] {
  const featureNames = config?.selectedFeatures ?? PERSONA_FEATURE_NAMES;
  const logFeatures = new Set(config?.logTransformFeatures ?? []);

  const X = personaFeatures.map((row) =>
    featureNames.map((f) => {
      const val = (row as unknown as Record<string, number>)[f] || 0;
      return logFeatures.has(f) ? Math.log1p(val) : val;
    })
  );
  const { normalized } = normalize(X);

  return kRange.map((k) => {
    // Run K-Means 3 times, pick best
    let best = kMeans(normalized, k);
    for (let run = 1; run < 3; run++) {
      const candidate = kMeans(normalized, k);
      if (candidate.inertia < best.inertia) best = candidate;
    }

    // Compute silhouette score
    const n = normalized.length;
    let silTotal = 0;
    for (let i = 0; i < n; i++) {
      const ci = best.labels[i];
      // a(i): mean distance to same-cluster points
      const sameCluster = normalized.filter((_, j) => j !== i && best.labels[j] === ci);
      const a = sameCluster.length > 0
        ? sameCluster.reduce((sum, p) => sum + euclideanDistance(normalized[i], p), 0) / sameCluster.length
        : 0;
      // b(i): min mean distance to other-cluster points
      let b = Infinity;
      for (let c = 0; c < k; c++) {
        if (c === ci) continue;
        const otherCluster = normalized.filter((_, j) => best.labels[j] === c);
        if (otherCluster.length === 0) continue;
        const meanDist = otherCluster.reduce((sum, p) => sum + euclideanDistance(normalized[i], p), 0) / otherCluster.length;
        b = Math.min(b, meanDist);
      }
      if (b === Infinity) b = 0;
      const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
      silTotal += s;
    }
    const silhouette = Math.round((silTotal / n) * 1000) / 1000;

    return { k, inertia: best.inertia, silhouette };
  });
}

export function inferPersona(
  userFeatures: PersonaFeatureRow,
  clusteringResult: ClusteringResult
): UserPersonaAssignment {
  const featureVec = PERSONA_FEATURE_NAMES.map(
    (f) => (userFeatures as unknown as Record<string, number>)[f] || 0
  );

  // Find nearest centroid (using raw values, centroids are already denormalized)
  let bestCluster = 0;
  let bestDist = Infinity;
  for (let c = 0; c < clusteringResult.k; c++) {
    const dist = euclideanDistance(featureVec, clusteringResult.centroids[c]);
    if (dist < bestDist) {
      bestDist = dist;
      bestCluster = c;
    }
  }

  const persona = clusteringResult.personas[bestCluster];
  return {
    user_id: userFeatures.user_id,
    persona_id: bestCluster,
    persona_name: persona.name,
    distance_to_centroid: Math.round(bestDist * 1000) / 1000,
    recommended_onboarding_type: persona.onboardingType,
    features: userFeatures,
  };
}

export function getFeatureStats(
  featureData: UserFeatureRow[],
  featureName: string
): { min: number; max: number; mean: number; median: number; std: number } {
  const values = featureData
    .map((r) => {
      const v = r[featureName];
      return typeof v === "number" ? v : parseFloat(String(v));
    })
    .filter((v) => !isNaN(v))
    .sort((a, b) => a - b);

  if (values.length === 0) return { min: 0, max: 0, mean: 0, median: 0, std: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median =
    values.length % 2 === 0
      ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
      : values[Math.floor(values.length / 2)];
  const std = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  );

  return {
    min: Math.round(values[0] * 100) / 100,
    max: Math.round(values[values.length - 1] * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    std: Math.round(std * 100) / 100,
  };
}
