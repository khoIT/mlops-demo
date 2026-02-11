export interface RawLogEntry {
  resource_type: string;
  resource_name: string;
  user_id: string;
  timestamp: string;
  metadata: string;
  // parsed metadata fields
  device_type?: string;
  source_item?: string;
  folder?: string;
}

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  type: "numeric" | "categorical";
  source: "raw" | "engineered";
  expression?: string;
  enabled: boolean;
}

export interface UserFeatureRow {
  user_id: string;
  [key: string]: string | number;
}

export interface TrainingConfig {
  targetVariable: string;
  features: string[];
  modelType: "logistic_regression" | "decision_tree";
  testSplit: number;
  learningRate: number;
  epochs: number;
  maxDepth: number;
}

export interface TrainingResult {
  modelId: string;
  modelType: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  logLoss: number;
  specificity: number;
  mcc: number;
  trainAccuracy: number;
  trainingDurationMs: number;
  confusionMatrix: number[][];
  classLabels: string[];
  featureImportance: { feature: string; importance: number }[];
  trainingLoss: number[];
  trainSize: number;
  testSize: number;
  trainUserIds: string[];
  testUserIds: string[];
  timestamp: string;
  config: TrainingConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serializedModel?: any;
}

export interface PredictionInput {
  [key: string]: string | number;
}

export interface PredictionResult {
  prediction: string;
  probabilities: { label: string; probability: number }[];
  inputFeatures: PredictionInput;
}

export type PipelineStep = "data_explorer" | "eda" | "feature_training" | "model_testing" | "persona_pipeline";

export interface ExperimentRun {
  id: string;
  name: string;
  result: TrainingResult;
  status: "completed" | "failed";
  createdAt: string;
}

// ─── Persona Pipeline Types ──────────────────────────────────────────────────

export interface CleanedLog {
  user_id: string;
  resource_type: string;
  resource_name: string;
  hour: number;
  device: string;
  source: string;
}

export interface PersonaFeatureRow {
  user_id: string;
  total_events_30d: number;
  realtime_ratio: number;
  dashboards_viewed: number;
  games_touched: number;
  mobile_ratio: number;
  avg_active_hour: number;
}

export interface PersonaDefinition {
  id: number;
  name: string;
  color: string;
  icon: string;
  definingSignals: string[];
  onboardingType: string;
  onboardingTitle: string;
  onboardingActions: string[];
}

export interface UserPersonaAssignment {
  user_id: string;
  persona_id: number;
  persona_name: string;
  distance_to_centroid: number;
  is_edge_case?: boolean;
  recommended_onboarding_type: string;
  features: PersonaFeatureRow;
}

export interface ClusteringResult {
  centroids: number[][];
  assignments: UserPersonaAssignment[];
  personas: PersonaDefinition[];
  inertia: number;
  iterations: number;
  k: number;
  featureNames: string[];
}

export type PersonaPipelineStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
