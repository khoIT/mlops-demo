"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Database,
  Layers,
  FlaskConical,
  Play,
  Users,
  Brain,
  Rocket,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  BarChart3,
  Target,
  Shuffle,
  TrendingDown,
  Grid3X3,
  Settings2,
  Compass,
  Activity,
  Sun,
  Lightbulb,
  GitBranch,
  RefreshCw,
} from "lucide-react";

type Section =
  | "overview"
  | "supervised"
  | "unsupervised"
  | "evaluation"
  | "production"
  | "glossary";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BookOpen size={16} /> },
  { id: "supervised", label: "Supervised Pipeline", icon: <FlaskConical size={16} /> },
  { id: "unsupervised", label: "Unsupervised Pipeline", icon: <Users size={16} /> },
  { id: "evaluation", label: "Evaluation & Testing", icon: <Target size={16} /> },
  { id: "production", label: "Production & Monitoring", icon: <Rocket size={16} /> },
  { id: "glossary", label: "Glossary", icon: <BookOpen size={16} /> },
];

interface LearnPageProps {
  onBack: () => void;
}

function SectionCard({
  title,
  children,
  color = "blue",
}: {
  title: string;
  children: React.ReactNode;
  color?: "blue" | "green" | "amber" | "purple" | "cyan" | "red";
}) {
  const borderMap = {
    blue: "border-blue-500/20",
    green: "border-green-500/20",
    amber: "border-amber-500/20",
    purple: "border-purple-500/20",
    cyan: "border-cyan-500/20",
    red: "border-red-500/20",
  };
  const titleMap = {
    blue: "text-blue-400",
    green: "text-green-400",
    amber: "text-amber-400",
    purple: "text-purple-400",
    cyan: "text-cyan-400",
    red: "text-red-400",
  };
  return (
    <div className={`bg-zinc-900 border ${borderMap[color]} rounded-xl p-5`}>
      <h3 className={`text-sm font-bold ${titleMap[color]} mb-3`}>{title}</h3>
      <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px]">
      <span className="text-zinc-500 shrink-0 w-36 font-medium">{label}</span>
      <span className="text-zinc-300">{children}</span>
    </div>
  );
}

export default function LearnPage({ onBack }: LearnPageProps) {
  const [activeSection, setActiveSection] = useState<Section>("overview");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Studio
        </button>
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <BookOpen size={20} className="text-blue-400" />
            MLOps Knowledge Base
          </h2>
          <p className="text-xs text-zinc-500">
            Everything you need to understand the pipelines in this demo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar navigation */}
        <div className="col-span-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 sticky top-20 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  activeSection === s.id
                    ? "bg-blue-600/15 text-blue-400 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="col-span-9 space-y-4">
          {/* ═══════════════════ OVERVIEW ═══════════════════ */}
          {activeSection === "overview" && (
            <>
              <SectionCard title="What This App Demonstrates" color="blue">
                <p>
                  This is an <strong className="text-zinc-200">interactive MLOps demo</strong> that
                  shows the complete lifecycle of two different ML approaches, both starting from the
                  same raw analytics logs.
                </p>
                <p>
                  The goal isn&apos;t just to train a model — it&apos;s to show every step of data
                  transformation so you can see <strong className="text-zinc-200">what the model
                  actually learns from</strong> and make better decisions.
                </p>
              </SectionCard>

              <SectionCard title="Two Approaches, Same Data" color="purple">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-800/50 rounded-lg p-4 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <FlaskConical size={16} className="text-blue-400" />
                      <span className="font-semibold text-blue-300">
                        Supervised Learning (Tabs 1-3)
                      </span>
                    </div>
                    <ul className="space-y-1 text-xs text-zinc-500">
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-blue-400 mt-0.5 shrink-0" />
                        You provide a <strong className="text-zinc-300">target variable</strong> with
                        known labels
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-blue-400 mt-0.5 shrink-0" />
                        Model learns from examples: Logistic Regression or Decision Tree
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-blue-400 mt-0.5 shrink-0" />
                        Output: class prediction + probability
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-blue-400 mt-0.5 shrink-0" />
                        Use case: &quot;predict if a user is a power user&quot;
                      </li>
                    </ul>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="text-purple-400" />
                      <span className="font-semibold text-purple-300">
                        Unsupervised Learning (Tab 4)
                      </span>
                    </div>
                    <ul className="space-y-1 text-xs text-zinc-500">
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-purple-400 mt-0.5 shrink-0" />
                        <strong className="text-zinc-300">No labels needed</strong> — algorithm
                        discovers structure
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-purple-400 mt-0.5 shrink-0" />
                        K-Means groups users by behavioral similarity
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-purple-400 mt-0.5 shrink-0" />
                        Output: persona assignment + onboarding recommendation
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ChevronRight size={10} className="text-purple-400 mt-0.5 shrink-0" />
                        Use case: &quot;discover user types → personalize onboarding&quot;
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-2 border border-zinc-700">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <strong className="text-zinc-300">Key insight:</strong> ML isn&apos;t always
                      about prediction accuracy. Sometimes the value is in discovering structure you
                      didn&apos;t know existed and automating a product decision based on it.
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="The Data Pipeline Pattern" color="green">
                <p>Both workflows follow the same fundamental pattern:</p>
                <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                  {[
                    { label: "Raw Events", icon: <Database size={12} /> },
                    { label: "Clean & Parse", icon: <Settings2 size={12} /> },
                    { label: "Aggregate → User-Level", icon: <Layers size={12} /> },
                    { label: "Compute Features", icon: <BarChart3 size={12} /> },
                    { label: "Train Model", icon: <Brain size={12} /> },
                    { label: "Evaluate", icon: <Target size={12} /> },
                    { label: "Serve Predictions", icon: <Rocket size={12} /> },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 rounded-lg text-zinc-300 border border-zinc-700">
                        {step.icon}
                        {step.label}
                      </div>
                      {i < 6 && <ChevronRight size={12} className="text-zinc-600" />}
                    </div>
                  ))}
                </div>
                <p className="mt-3">
                  The quality of each step depends on the previous one. <strong className="text-zinc-200">Garbage in = garbage out</strong> applies at every stage, not just the input.
                </p>
              </SectionCard>
            </>
          )}

          {/* ═══════════════════ SUPERVISED ═══════════════════ */}
          {activeSection === "supervised" && (
            <>
              <SectionCard title="Step 1: Data Explorer" color="blue">
                <div className="flex items-center gap-2 mb-2">
                  <Database size={14} className="text-blue-400" />
                  <span className="font-semibold text-zinc-200">Raw Data → Feature Store</span>
                </div>
                <p>
                  Raw events are click-level logs — one row per action. No model can learn from this
                  directly. The Feature Store transforms raw events into{" "}
                  <strong className="text-zinc-200">one row per user</strong> with computed numeric signals.
                </p>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-2 space-y-1.5">
                  <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    What to check
                  </div>
                  <ul className="text-xs text-zinc-500 space-y-0.5">
                    <li>- <strong className="text-zinc-300">Missing values:</strong> Do any users have null features?</li>
                    <li>- <strong className="text-zinc-300">Outliers:</strong> Any user with 10x the average events? They may distort the model.</li>
                    <li>- <strong className="text-zinc-300">Data leakage:</strong> Does any feature &quot;cheat&quot; by containing the target variable&apos;s answer?</li>
                    <li>- <strong className="text-zinc-300">Feature logic:</strong> Is the computation correct? Off-by-one errors in time windows are common.</li>
                  </ul>
                </div>
              </SectionCard>

              <SectionCard title="Step 2: Experiments" color="cyan">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={14} className="text-amber-400" />
                      <span className="font-semibold text-zinc-200">Target Variable</span>
                    </div>
                    <p>
                      The target is <strong className="text-zinc-200">what the model learns to predict</strong>.
                      This is the most important decision in supervised ML.
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-zinc-500">
                      <div>- <strong className="text-zinc-300">Class balance:</strong> If 95% of users are &quot;not power users&quot;, the model can cheat by always predicting &quot;no&quot; and still be 95% accurate</div>
                      <div>- <strong className="text-zinc-300">Actionability:</strong> Can you do something different based on this prediction? If not, don&apos;t build a model</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shuffle size={14} className="text-purple-400" />
                      <span className="font-semibold text-zinc-200">Feature Selection</span>
                    </div>
                    <p>Not all features help. Some add noise that hurts the model.</p>
                    <div className="mt-2 space-y-1 text-xs text-zinc-500">
                      <div>- Start with <strong className="text-zinc-300">fewer features</strong> and add more only if metrics improve</div>
                      <div>- Remove features <strong className="text-zinc-300">highly correlated</strong> with each other (redundant signal)</div>
                      <div>- After training, check <strong className="text-zinc-300">feature importance</strong> — drop anything near zero</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Settings2 size={14} className="text-cyan-400" />
                      <span className="font-semibold text-zinc-200">Model Type & Hyperparameters</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <div className="text-xs font-semibold text-zinc-300 mb-1">Logistic Regression</div>
                        <ul className="text-xs text-zinc-500 space-y-0.5">
                          <li>- Simple, interpretable, fast</li>
                          <li>- Good baseline — try this first</li>
                          <li>- Tune: learning rate, epochs</li>
                          <li>- Assumes linear decision boundary</li>
                        </ul>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <div className="text-xs font-semibold text-zinc-300 mb-1">Decision Tree</div>
                        <ul className="text-xs text-zinc-500 space-y-0.5">
                          <li>- Handles non-linear patterns</li>
                          <li>- Easy to explain to stakeholders</li>
                          <li>- Tune: max depth (prevents overfitting)</li>
                          <li>- Can overfit easily — keep trees shallow</li>
                        </ul>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      <strong className="text-zinc-300">Test split:</strong> 20-30% is standard. Too small → unreliable metrics. Too large → not enough training data.
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Step 3: Model Registry" color="green">
                <div className="flex items-center gap-2 mb-2">
                  <Play size={14} className="text-green-400" />
                  <span className="font-semibold text-zinc-200">Testing & Deployment</span>
                </div>
                <p>
                  Once trained, test the model with real user data. The goal is to verify predictions
                  match your <strong className="text-zinc-200">intuition for known users</strong> before deploying.
                </p>
                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                  <div>- Test with <strong className="text-zinc-300">extreme values</strong> — does the model handle edge cases?</div>
                  <div>- Test users from <strong className="text-zinc-300">different segments</strong> (new vs veteran, mobile vs desktop)</div>
                  <div>- If predictions feel wrong for users you know well, the model has a problem regardless of metrics</div>
                </div>
              </SectionCard>
            </>
          )}

          {/* ═══════════════════ UNSUPERVISED ═══════════════════ */}
          {activeSection === "unsupervised" && (
            <>
              <SectionCard title="The 8-Step Persona Pipeline" color="purple">
                <p>
                  This pipeline transforms raw click events into{" "}
                  <strong className="text-zinc-200">user personas with personalized onboarding</strong> —
                  without any labels or human categorization.
                </p>
              </SectionCard>

              <div className="space-y-3">
                {[
                  {
                    step: 0,
                    title: "Raw Logs",
                    icon: <Database size={14} />,
                    color: "amber" as const,
                    what: "Click-level events straight from the analytics system. One row per action.",
                    transform: "None — this is the input.",
                    watchFor: "Missing user_ids, malformed timestamps, broken analytics tracking. If the data is bad here, everything downstream is wrong.",
                  },
                  {
                    step: 1,
                    title: "Clean & Normalize",
                    icon: <Settings2 size={14} />,
                    color: "blue" as const,
                    what: "Parse JSON metadata into flat columns. Clean resource names. Extract hour from timestamp.",
                    transform: "JSON metadata → flat columns; name prefixes stripped; timestamp → hour of day.",
                    watchFor: "Every cleaning decision is a modeling decision. Stripping prefixes loses info. Extracting only hour loses day-of-week. Document everything — the inference pipeline must reproduce this exactly.",
                  },
                  {
                    step: 2,
                    title: "Aggregate Features",
                    icon: <Layers size={14} />,
                    color: "purple" as const,
                    what: "Compress many event rows into one row per user with behavioral counts and ratios.",
                    transform: "GROUP BY user_id → count(), count_distinct(), ratio(), avg(). Many rows → one row per user.",
                    watchFor: "Users with very few events have unstable ratios (1/2 = 50%). Consider a minimum event threshold. The 30-day window may be too short for infrequent users.",
                  },
                  {
                    step: 3,
                    title: "Final ML Features",
                    icon: <BarChart3 size={14} />,
                    color: "green" as const,
                    what: "The exact numerical table that K-Means sees. Ratios instead of raw counts make features comparable.",
                    transform: "Internal z-score normalization ensures all features contribute equally to distance calculations.",
                    watchFor: "Without normalization, features with large ranges (total_events: 1-500) dominate over small-range features (realtime_ratio: 0-1). K-Means would effectively ignore the ratios.",
                  },
                  {
                    step: 4,
                    title: "Pattern Discovery",
                    icon: <Brain size={14} />,
                    color: "cyan" as const,
                    what: "Human intuitions about user archetypes, before the algorithm runs.",
                    transform: "No data transformation — this is hypothesis generation.",
                    watchFor: "Always form hypotheses before clustering. If the results don't match any intuition, either the features are wrong or the data reveals something genuinely new. Both are valuable to know.",
                  },
                  {
                    step: 5,
                    title: "Run K-Means",
                    icon: <Users size={14} />,
                    color: "blue" as const,
                    what: "K-Means++ groups users into K clusters based on feature similarity. Each user gets assigned to the nearest centroid.",
                    transform: "Input: normalized feature matrix. Output: cluster labels, centroids, inertia.",
                    watchFor: "K is the most important choice. Too few (K=2) merges distinct types. Too many (K=5+) creates noise. Try the elbow method: plot inertia vs K, pick the bend. Also ask: can the product realistically support K different onboarding flows?",
                  },
                  {
                    step: 6,
                    title: "Interpret Personas",
                    icon: <Compass size={14} />,
                    color: "purple" as const,
                    what: "Translate numeric cluster centroids into named personas with product actions.",
                    transform: "Centroid feature values → heuristic scoring → persona template matching → onboarding mapping.",
                    watchFor: "Interpretation is subjective — validate with stakeholders. If two personas would get identical treatment, merge them. Track persona distribution over time — sudden shifts mean the model is stale.",
                  },
                  {
                    step: 7,
                    title: "Inference Pipeline",
                    icon: <Rocket size={14} />,
                    color: "green" as const,
                    what: "Real-time: when a user logs in, compute their features, find the nearest centroid, serve personalized onboarding.",
                    transform: "User login → fetch 30d logs → compute 6 features → nearest centroid lookup → persona → onboarding screen.",
                    watchFor: "The inference pipeline must use the exact same feature computation as training. Any mismatch = training/serving skew, the #1 cause of ML failures in production. New users with 0 events need a fallback.",
                  },
                ].map((s) => (
                  <div key={s.step} className={`bg-zinc-900 border border-${s.color}-500/20 rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                        {s.step}
                      </div>
                      {s.icon}
                      <span className="text-sm font-bold text-zinc-200">{s.title}</span>
                    </div>
                    <div className="space-y-2 text-[13px]">
                      <KeyValue label="What happens">{s.what}</KeyValue>
                      <KeyValue label="Transformation">{s.transform}</KeyValue>
                      <div className="bg-zinc-800/50 rounded-lg p-2.5 flex items-start gap-2 mt-1">
                        <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                        <span className="text-xs text-zinc-400">{s.watchFor}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══════════════════ EVALUATION ═══════════════════ */}
          {activeSection === "evaluation" && (
            <>
              <SectionCard title="Evaluating the Supervised Pipeline" color="blue">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-green-400" />
                      Metrics Already in the App
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { name: "Accuracy", desc: "% of all predictions correct. Can mislead with imbalanced classes." },
                        { name: "Precision", desc: "When the model says 'yes', how often is it right? High precision = few false alarms." },
                        { name: "Recall", desc: "Of all actual 'yes' cases, how many did the model catch? High recall = few misses." },
                        { name: "F1 Score", desc: "Harmonic mean of precision & recall. Best single metric for imbalanced data." },
                        { name: "Confusion Matrix", desc: "Shows exactly where the model gets confused: which classes it mixes up." },
                        { name: "Loss Curve", desc: "Should decrease and flatten. If it oscillates, learning rate is too high." },
                        { name: "Feature Importance", desc: "Which features the model relies on most. Zero = can remove. One dominates = risky." },
                        { name: "Train/Test Split", desc: "Model is tested on unseen data. Prevents cheating on memorized examples." },
                      ].map((m) => (
                        <div key={m.name} className="bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-700">
                          <div className="text-xs font-semibold text-zinc-300">{m.name}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">{m.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
                      <TrendingDown size={12} className="text-red-400" />
                      Additional Tests a Data Scientist Should Run
                    </div>
                    <div className="space-y-2 text-xs text-zinc-500">
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Cross-validation</span>
                        <span>Run 5 different train/test splits, check if metrics are stable. High variance across folds = the model is overfitting.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Stratified split</span>
                        <span>Ensure the minority class is proportionally represented in both train and test sets.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Holdout set</span>
                        <span>Reserve a completely unseen user cohort, never touched during development. Test only once as a final check.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">A/B test</span>
                        <span>Compare model-driven decisions vs a baseline (random or rule-based) on a real business metric like retention or engagement.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Fairness check</span>
                        <span>Does the model perform equally well for mobile vs desktop users, high vs low activity, different regions?</span>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Evaluating the Unsupervised Pipeline" color="purple">
                <p className="mb-3">
                  Clustering has <strong className="text-zinc-200">no ground truth labels</strong>, so you
                  can&apos;t compute &quot;accuracy&quot;. Evaluation is a mix of quantitative metrics and
                  qualitative judgment.
                </p>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
                      <BarChart3 size={12} className="text-blue-400" />
                      Quantitative Methods
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-2 pr-3 text-zinc-400 font-semibold">Method</th>
                            <th className="text-left py-2 pr-3 text-zinc-400 font-semibold">Measures</th>
                            <th className="text-left py-2 text-zinc-400 font-semibold">How to Interpret</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {[
                            { method: "Inertia (in app)", measures: "Sum of squared distances to centroids", interpret: "Lower = tighter clusters. Plot inertia vs K — the 'elbow' point is a good K." },
                            { method: "Silhouette Score", measures: "How similar a point is to its own cluster vs nearest other", interpret: "Range [-1, 1]. Above 0.5 is good. Negative values = likely misassigned users." },
                            { method: "Cluster Stability", measures: "Consistency across random seeds", interpret: "Re-run K-Means 10 times. If personas change each run, clusters aren't real." },
                            { method: "Between-cluster Distance", measures: "How far apart centroids are", interpret: "Centroids should be well-separated. Overlapping centroids = merge those clusters." },
                          ].map((r) => (
                            <tr key={r.method}>
                              <td className="py-2 pr-3 text-zinc-300 font-medium">{r.method}</td>
                              <td className="py-2 pr-3 text-zinc-500">{r.measures}</td>
                              <td className="py-2 text-zinc-500">{r.interpret}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
                      <Lightbulb size={12} className="text-green-400" />
                      Qualitative Methods (Often More Important)
                    </div>
                    <div className="space-y-2 text-xs text-zinc-500">
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Interpretability</span>
                        <span>Can a product manager name each cluster in plain English? If not, the features may be wrong.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Domain consistency</span>
                        <span>Do discovered personas match what the team already suspects? &quot;Yes&quot; = validation. &quot;No&quot; = either a discovery or a data bug.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Actionability test</span>
                        <span>For each persona, can you design a different product experience? If two personas get identical treatment, merge them.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-300 font-semibold shrink-0 w-36">Edge case review</span>
                        <span>Look at users with high distance_to_centroid. They&apos;re between clusters — do they make sense or are they noise?</span>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Evaluation Philosophy: Supervised vs Unsupervised" color="amber">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-4 text-zinc-400 font-semibold w-40"></th>
                        <th className="text-left py-2 pr-4 text-blue-400 font-semibold">Supervised</th>
                        <th className="text-left py-2 text-purple-400 font-semibold">Unsupervised</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {[
                        { q: "Can compute accuracy?", s: "Yes — you have labels", u: "No — no ground truth" },
                        { q: "Primary metric", s: "F1 score, precision/recall", u: "Silhouette score + human interpretability" },
                        { q: "Gold standard test", s: "Holdout set performance", u: "A/B test on a business outcome" },
                        { q: "Failure mode", s: "Overfitting, class imbalance", u: "Meaningless clusters, unstable assignments" },
                        { q: "When to retrain", s: "When accuracy drops on new data", u: "When persona distribution shifts" },
                      ].map((r) => (
                        <tr key={r.q}>
                          <td className="py-2 pr-4 text-zinc-300 font-medium">{r.q}</td>
                          <td className="py-2 pr-4 text-zinc-500">{r.s}</td>
                          <td className="py-2 text-zinc-500">{r.u}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}

          {/* ═══════════════════ PRODUCTION ═══════════════════ */}
          {activeSection === "production" && (
            <>
              <SectionCard title="From Notebook to Production" color="green">
                <p>
                  A model that works in a demo is only the beginning. Production ML has an entirely
                  different set of challenges.
                </p>
              </SectionCard>

              <SectionCard title="Training / Serving Skew" color="red">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle size={14} className="text-red-400 mt-0.5" />
                  <p>
                    The <strong className="text-zinc-200">#1 cause of ML failures in production</strong>.
                    It happens when the feature computation in the inference pipeline doesn&apos;t exactly match training.
                  </p>
                </div>
                <div className="space-y-2 text-xs text-zinc-500 mt-2">
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-300 font-semibold shrink-0 w-28">Example</span>
                    <span>Training computes &quot;events in last 30 days&quot; using a batch query with precise date math. Inference uses a Redis cache that counts approximate events. Different numbers → different predictions.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-300 font-semibold shrink-0 w-28">Prevention</span>
                    <span>Use a shared feature store. Compute features once, reuse everywhere. Test that training features exactly match inference features for the same user.</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Monitoring in Production" color="amber">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      title: "Prediction Distribution",
                      icon: <BarChart3 size={14} />,
                      desc: "Track the % of predictions for each class over time. If it shifts suddenly, something changed — either the model or the data.",
                    },
                    {
                      title: "Feature Drift",
                      icon: <TrendingDown size={14} />,
                      desc: "Monitor if the distribution of input features changes. If avg_events_30d doubles, the model is seeing data it wasn't trained on.",
                    },
                    {
                      title: "Latency",
                      icon: <Activity size={14} />,
                      desc: "Inference must be fast enough for the use case. Onboarding personalization needs < 100ms. Batch reports can wait minutes.",
                    },
                    {
                      title: "Feedback Loops",
                      icon: <RefreshCw size={14} />,
                      desc: "If the model changes behavior which changes the data it trains on, you get a feedback loop. Monitor for convergence to a single prediction.",
                    },
                  ].map((m) => (
                    <div key={m.title} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-1">
                        {m.icon}
                        {m.title}
                      </div>
                      <div className="text-[11px] text-zinc-500">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="When to Retrain" color="cyan">
                <div className="space-y-2 text-xs text-zinc-500">
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-300 font-semibold shrink-0 w-36">Supervised model</span>
                    <span>When accuracy on a validation set drops below your threshold. Or when feature distributions drift significantly from training data.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-300 font-semibold shrink-0 w-36">Clustering model</span>
                    <span>When persona distribution shifts (e.g. one persona goes from 20% to 60%). Or monthly on a fixed schedule. Compare new centroids to old ones — if they diverge, deploy the new model.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-300 font-semibold shrink-0 w-36">Cold start</span>
                    <span>New users with 0 events need a fallback. Use a default onboarding, then reclassify after they accumulate enough data (e.g. 10+ events).</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="A/B Testing ML Models" color="green">
                <p>
                  The ultimate test: does the model actually improve a <strong className="text-zinc-200">business metric</strong>?
                </p>
                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                  <div>- Show persona-based onboarding to 50% of users, generic onboarding to 50%</div>
                  <div>- Measure day-7 and day-30 retention, engagement, feature adoption</div>
                  <div>- Run for at least 2 weeks with sufficient sample size per persona</div>
                  <div>- Watch for <strong className="text-zinc-300">novelty effects</strong> — new onboarding might perform well initially just because it&apos;s different</div>
                </div>
              </SectionCard>
            </>
          )}

          {/* ═══════════════════ GLOSSARY ═══════════════════ */}
          {activeSection === "glossary" && (
            <>
              <SectionCard title="ML & MLOps Glossary" color="blue">
                <p>Quick reference for terms used throughout this demo.</p>
              </SectionCard>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="divide-y divide-zinc-800/50">
                  {[
                    { term: "Feature", def: "A numeric signal computed from raw data that the model uses as input. Example: total_events_30d." },
                    { term: "Feature Store", def: "A centralized place where features are computed, stored, and shared across training and inference pipelines." },
                    { term: "Target Variable", def: "The column the model is trying to predict. Only exists in supervised learning." },
                    { term: "Training", def: "The process of feeding data to an algorithm so it learns patterns. Output: a model." },
                    { term: "Inference", def: "Using a trained model to make predictions on new, unseen data." },
                    { term: "Train/Test Split", def: "Dividing data into a training set (model learns from this) and test set (model is evaluated on this). Prevents cheating." },
                    { term: "Overfitting", def: "When a model memorizes training data instead of learning general patterns. High training accuracy, low test accuracy." },
                    { term: "Logistic Regression", def: "A linear model for classification. Outputs probabilities. Simple, interpretable, good baseline." },
                    { term: "Decision Tree", def: "A tree-structured model that makes decisions by splitting on feature values. Easy to explain, prone to overfitting." },
                    { term: "K-Means Clustering", def: "An unsupervised algorithm that groups data points into K clusters based on distance to centroids." },
                    { term: "K-Means++", def: "An improved initialization for K-Means that spreads initial centroids apart, leading to better and more stable results." },
                    { term: "Centroid", def: "The center point of a cluster. Represents the 'average' member of that group." },
                    { term: "Inertia", def: "Sum of squared distances from each point to its centroid. Lower = tighter clusters." },
                    { term: "Silhouette Score", def: "Measures how similar a point is to its own cluster vs the nearest other cluster. Range: -1 to 1." },
                    { term: "Confusion Matrix", def: "A table showing correct vs incorrect predictions for each class. Diagonal = correct." },
                    { term: "Precision", def: "Of all positive predictions, how many are correct? TP / (TP + FP)." },
                    { term: "Recall", def: "Of all actual positives, how many did the model find? TP / (TP + FN)." },
                    { term: "F1 Score", def: "Harmonic mean of precision and recall. Balances false positives and false negatives." },
                    { term: "Normalization", def: "Scaling features to a common range (e.g. z-score). Critical for distance-based algorithms like K-Means." },
                    { term: "Data Leakage", def: "When training data contains information that wouldn't be available at prediction time. Causes artificially high metrics." },
                    { term: "Training/Serving Skew", def: "When feature computation in production differs from training. The #1 cause of ML failures." },
                    { term: "Class Imbalance", def: "When one class vastly outnumbers others (e.g. 95% vs 5%). Accuracy becomes misleading." },
                    { term: "Hyperparameters", def: "Settings that control how a model learns (learning rate, max depth, K). Set before training, not learned from data." },
                    { term: "Cross-Validation", def: "Running multiple train/test splits to get a more reliable estimate of model performance." },
                    { term: "Persona", def: "A user archetype discovered through clustering, representing a group with similar behavioral patterns." },
                  ].map((g) => (
                    <div key={g.term} className="flex gap-4 px-5 py-3">
                      <span className="text-sm font-semibold text-zinc-200 shrink-0 w-44">{g.term}</span>
                      <span className="text-[13px] text-zinc-400">{g.def}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
