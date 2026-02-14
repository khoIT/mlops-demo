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

export type Playbook = "supervised" | "persona" | "pltv";

// ─── pLTV Pipeline Types ────────────────────────────────────────────────────

export type PLTVStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ─── Decision Intelligence Types ─────────────────────────────────────────────

export type ModelCategory = "value" | "risk" | "responsiveness" | "intent";

export interface DecisionProblem {
  id: string;
  category: "UA" | "LiveOps";
  question: string;
  shortLabel: string;
  modelFamily: ModelCategory[];
  coreFeatures: string[];
  activationUsecases: string[];
}

export interface DecisionSegment {
  id: string;
  name: string;
  color: string;
  rules: DecisionRule[];
  userCount: number;
  avgScore: number;
  avgActualLTV: number;
  action: string;
}

export interface DecisionRule {
  field: string;        // "pltv_score" | "pltv_decile" | feature name
  operator: ">=" | "<=" | ">" | "<" | "==" | "!=";
  value: number | string;
}

export interface DecisionVersion {
  id: number;
  problemId: string;
  segments: DecisionSegment[];
  abSplit: number;       // 0-100 % for test group
  author: string;
  note: string;
  timestamp: number;
}

export interface GamePlayer {
  game_user_id: string;
  install_id: string;
  install_time: string;
  campaign_id: string;
  adset_id: string;
  creative_id: string;
  channel: string;
  country: string;
  os: string;
  device_model: string;
  device_tier: "low" | "mid" | "high";
  consent_tracking: boolean;
  consent_marketing: boolean;
}

export interface GameEvent {
  game_user_id: string;
  event_time: string;
  event_name: string;
  session_id: string;
  params: Record<string, string | number>;
}

export interface PaymentTxn {
  game_user_id: string;
  txn_time: string;
  amount_usd: number;
  product_sku: string;
  payment_channel: string;
  is_refund: boolean;
}

export interface UACost {
  campaign_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
}

export interface PLTVFeatureRow {
  game_user_id: string;
  // Block 1 — Sessions
  sessions_cnt_w1d: number;
  sessions_cnt_w3d: number;
  sessions_cnt_w7d: number;
  total_session_time_w7d: number;
  avg_session_length_w7d: number;
  active_days_w7d: number;
  night_play_ratio: number;
  // Block 2 — Progression
  max_level_w7d: number;
  level_gain_rate: number;
  main_quest_steps_w7d: number;
  pvp_matches_w7d: number;
  pve_runs_w7d: number;
  hours_to_first_dungeon: number;
  // Block 3 — Economy
  soft_currency_earned_w7d: number;
  soft_currency_spent_w7d: number;
  hard_currency_earned_w7d: number;
  hard_currency_spent_w7d: number;
  gacha_opens_w7d: number;
  shop_views_w7d: number;
  iap_offer_views_w7d: number;
  // Block 4 — Social
  joined_guild_by_d3: number;
  time_to_guild_join_hours: number;
  guild_activity_events_w7d: number;
  friends_added_w7d: number;
  chat_messages_w7d: number;
  // Block 5 — Early monetization
  is_payer_by_d3: number;
  is_payer_by_d7: number;
  num_txn_d7: number;
  revenue_d7: number;
  first_purchase_time_hours: number;
  sku_category_first_purchase: string;
  // Block 6 — Acquisition context
  channel: string;
  country: string;
  os: string;
  device_tier: string;
  install_date: string;
  install_hour: number;
  install_day_of_week: number;
  // Labels
  ltv_d3: number;
  ltv_d7: number;
  ltv_d30: number;
  ltv_d60: number;
  ltv_d90: number;
  is_churned_d14: number;
  payer_by_d3: number;
  payer_by_d7: number;
}

export interface PLTVScoredUser {
  game_user_id: string;
  pltv_pred: number;
  pltv_decile: number;
  is_top_1pct: boolean;
  actual_ltv_d60: number;
  segment: string;
  features: PLTVFeatureRow;
}

export interface PLTVModelResult {
  modelId: string;
  modelType: string;
  mae: number;
  rmse: number;
  r2: number;
  topDecileLift: number;
  topDecileCapture: number;
  featureImportance: { feature: string; importance: number }[];
  calibration: { bucket: string; predicted: number; actual: number }[];
  decileChart: { decile: number; avgPredicted: number; avgActual: number; userCount: number }[];
  scoredUsers: PLTVScoredUser[];
  trainingDurationMs: number;
  trainSize: number;
  testSize: number;
}

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
  unique_dashboards_viewed: number;
  mobile_ratio: number;
  realtime_ratio: number;
  repeat_view_ratio: number;
  games_touched: number;
  navigation_entropy: number;
  active_hour_std: number;
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
