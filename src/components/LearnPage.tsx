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
  Wrench,
  Clock,
  Search,
  Lock,
  Server,
  FileText,
  Eye,
  Cpu,
  Monitor,
  ChevronDown,
} from "lucide-react";

type Section =
  | "overview"
  | "supervised"
  | "unsupervised"
  | "feature_engineering"
  | "evaluation"
  | "production"
  | "data_drift"
  | "compute"
  | "glossary";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BookOpen size={16} /> },
  { id: "supervised", label: "Supervised Pipeline", icon: <FlaskConical size={16} /> },
  { id: "unsupervised", label: "Unsupervised Pipeline", icon: <Users size={16} /> },
  { id: "feature_engineering", label: "Feature Engineering IRL", icon: <Wrench size={16} /> },
  { id: "evaluation", label: "Evaluation & Testing", icon: <Target size={16} /> },
  { id: "production", label: "Production & Monitoring", icon: <Rocket size={16} /> },
  { id: "data_drift", label: "Data Drift Deep Dive", icon: <AlertTriangle size={16} /> },
  { id: "compute", label: "Compute & Infrastructure", icon: <Cpu size={16} /> },
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
  const [expandedDrift, setExpandedDrift] = useState<string | null>(null);

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

          {/* ═══════════════════ FEATURE ENGINEERING IRL ═══════════════════ */}
          {activeSection === "feature_engineering" && (
            <>
              <SectionCard title="What a Data Scientist Actually Does" color="amber">
                <p>
                  The demo app simplifies feature engineering into a few clicks. In reality, turning raw data
                  into production-ready features is <strong className="text-zinc-200">the hardest and most
                  time-consuming part of ML</strong>. Here&apos;s the real 9-step workflow, mapped to the
                  two pipelines in this app.
                </p>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-2 border border-zinc-700">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <strong className="text-zinc-300">Why this matters:</strong> Most ML tutorials
                      jump straight to &quot;fit the model.&quot; But in production, 80% of the work is in
                      steps 1-6 below. If you get these wrong, no model architecture can save you.
                    </p>
                  </div>
                </div>
              </SectionCard>

              {/* Step 1 */}
              <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center text-xs font-bold text-amber-400">1</div>
                  <h3 className="text-sm font-bold text-amber-400">Define the Entity + Label Time</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Before writing any code, decide: <strong className="text-zinc-200">who are you predicting
                    for</strong>, and <strong className="text-zinc-200">at what point in time</strong>?
                  </p>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Entity</div>
                      <div className="text-[11px] text-zinc-500">The unit you&apos;re predicting about. Usually <code className="text-amber-300">user_id</code>, but could be session, device, team, etc.</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Observation Time</div>
                      <div className="text-[11px] text-zinc-500">The timestamp at which you want to predict. Examples: end of day, after first 30 minutes, after 3 sessions.</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Label</div>
                      <div className="text-[11px] text-zinc-500">What you&apos;re predicting, measured <strong className="text-zinc-300">after</strong> the observation time. Churn label, persona, activation success.</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1.5">
                        <FlaskConical size={12} />
                        In this app: Supervised
                      </div>
                      <div className="text-[11px] text-zinc-500">Entity = <code className="text-blue-300">user_id</code>. Label = <code className="text-blue-300">is_power_user</code> (top 25% by sessions AND resource diversity). Observation time: end of the data window.</div>
                    </div>
                    <div className="bg-purple-500/5 rounded-lg p-3 border border-purple-500/20">
                      <div className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1.5">
                        <Users size={12} />
                        In this app: Unsupervised
                      </div>
                      <div className="text-[11px] text-zinc-500">Entity = <code className="text-purple-300">user_id</code>. No label — the algorithm discovers persona clusters. Observation time: end of the data window.</div>
                    </div>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-2.5 flex items-start gap-2 mt-1">
                    <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-zinc-400"><strong className="text-zinc-300">This is the part most demos skip, but it&apos;s the key to avoiding leakage.</strong> If you compute features using data from <em>after</em> the label event, you&apos;re cheating — the model sees the future.</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center text-xs font-bold text-blue-400">2</div>
                  <h3 className="text-sm font-bold text-blue-400">Specify Feature Definitions (Contract)</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Write formal specs for each feature <strong className="text-zinc-200">before</strong> coding. This is the &quot;contract&quot; between
                    data engineering and data science.
                  </p>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 font-mono text-xs text-zinc-400 space-y-1">
                    <div className="text-zinc-300 font-semibold font-sans mb-1.5">Example Feature Spec:</div>
                    <div><span className="text-cyan-400">name:</span> total_events_30d</div>
                    <div><span className="text-cyan-400">inputs:</span> raw_logs table</div>
                    <div><span className="text-cyan-400">time_window:</span> 30 days before observation time</div>
                    <div><span className="text-cyan-400">aggregation:</span> COUNT(*) WHERE user_id = entity</div>
                    <div><span className="text-cyan-400">freshness:</span> batch daily at 6am UTC</div>
                    <div><span className="text-cyan-400">owner:</span> data-eng-team</div>
                    <div><span className="text-cyan-400">SLA:</span> available by 7am UTC, &lt;1% null rate</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1.5">
                        <FlaskConical size={12} />
                        In this app: Supervised
                      </div>
                      <div className="text-[11px] text-zinc-500">Features like <code className="text-blue-300">session_count</code>, <code className="text-blue-300">mobile_ratio</code>, <code className="text-blue-300">export_count</code> are defined in the Feature Store tab. In production, each would have a formal spec like above.</div>
                    </div>
                    <div className="bg-purple-500/5 rounded-lg p-3 border border-purple-500/20">
                      <div className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1.5">
                        <Users size={12} />
                        In this app: Unsupervised
                      </div>
                      <div className="text-[11px] text-zinc-500">Persona features like <code className="text-purple-300">realtime_ratio</code>, <code className="text-purple-300">mobile_ratio</code>, <code className="text-purple-300">avg_active_hour</code> use the same raw data but are aggregated differently for clustering.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/15 flex items-center justify-center text-xs font-bold text-cyan-400">3</div>
                  <h3 className="text-sm font-bold text-cyan-400">Build Transformation Code (Repeatable, Testable)</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Implement features with production-grade tooling. The code must be <strong className="text-zinc-200">repeatable and testable</strong>, not a one-off notebook.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1.5">Common Tools</div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- <strong className="text-zinc-300">SQL</strong> (warehouse / lakehouse)</li>
                        <li>- <strong className="text-zinc-300">PySpark</strong> (dataframe code at scale)</li>
                        <li>- <strong className="text-zinc-300">Streaming</strong> (Kafka/Flink for real-time)</li>
                        <li>- <strong className="text-zinc-300">dbt</strong> (SQL transformation framework)</li>
                      </ul>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1.5">Must Be</div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- <strong className="text-zinc-300">Idempotent:</strong> reruns don&apos;t create duplicates</li>
                        <li>- <strong className="text-zinc-300">Backfillable:</strong> can compute history</li>
                        <li>- <strong className="text-zinc-300">Partitioned:</strong> by date/time</li>
                        <li>- <strong className="text-zinc-300">Unit-tested:</strong> on small samples</li>
                      </ul>
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 mt-1">
                    <div className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                      <Wrench size={12} className="text-cyan-400" />
                      In this app
                    </div>
                    <div className="text-[11px] text-zinc-500">The <code className="text-cyan-300">computeUserFeatures()</code> and <code className="text-cyan-300">cleanLogs()</code> functions in <code className="text-cyan-300">ml-engine.ts</code> are the transformation code. In production, these would be SQL/Spark jobs running on a schedule, not browser JavaScript.</div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center text-xs font-bold text-green-400">4</div>
                  <h3 className="text-sm font-bold text-green-400">Validate Data Quality + Drift</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Before publishing features, run automated checks. <strong className="text-zinc-200">Bad features
                    silently produce bad predictions</strong> — there&apos;s no error message.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: "Schema checks", desc: "Correct types, expected null rates. Is session_count always a number? Is mobile_ratio between 0 and 1?", icon: <FileText size={12} /> },
                      { name: "Constraint checks", desc: "Ratios between 0–1, counts >= 0, no negative activity spans. Business rules that features must satisfy.", icon: <Shield size={12} /> },
                      { name: "Freshness checks", desc: "Did yesterday's partition land? Is the data current? Stale features = stale predictions.", icon: <Clock size={12} /> },
                      { name: "Drift checks", desc: "Has the distribution of any feature changed significantly over time? Could indicate a data pipeline bug or a real behavioral shift.", icon: <TrendingDown size={12} /> },
                    ].map((c) => (
                      <div key={c.name} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <div className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                          {c.icon}
                          {c.name}
                        </div>
                        <div className="text-[11px] text-zinc-500">{c.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 mt-1">
                    <div className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                      <Eye size={12} className="text-green-400" />
                      In this app
                    </div>
                    <div className="text-[11px] text-zinc-500">The Data Profile tab shows distributions and stats. In production, these checks would be automated with tools like <strong className="text-zinc-300">Great Expectations</strong>, <strong className="text-zinc-300">Soda</strong>, or <strong className="text-zinc-300">dbt tests</strong>, and would block the pipeline if they fail.</div>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center text-xs font-bold text-purple-400">5</div>
                  <h3 className="text-sm font-bold text-purple-400">Publish to a Feature Store</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    A Feature Store is where features become <strong className="text-zinc-200">discoverable,
                    reusable, and governed</strong>. This is the bridge between data engineering and ML.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { prop: "Discoverable", desc: "Searchable catalog — other teams can find and reuse features instead of rebuilding them." },
                      { prop: "Reusable", desc: "Shared definitions across models. The same mobile_ratio feature can power 10 different models." },
                      { prop: "Governable", desc: "ACLs, lineage tracking. Know who created a feature, what data it depends on, who uses it." },
                      { prop: "Consistent", desc: "Same computation for training and serving. This is how you prevent training/serving skew." },
                    ].map((p) => (
                      <div key={p.prop} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <div className="text-xs font-semibold text-zinc-300 mb-1">{p.prop}</div>
                        <div className="text-[11px] text-zinc-500">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-2.5 flex items-start gap-2 mt-1">
                    <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-zinc-400"><strong className="text-zinc-300">Point-in-time correctness</strong> is critical. When creating training sets, you must join features <em>as they existed at the observation time</em>, not their current values. Tools like <strong className="text-zinc-300">Feast</strong> explicitly support this with point-in-time joins. Without it, you&apos;re training on &quot;future&quot; feature values = data leakage.</span>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 mt-1">
                    <div className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                      <Database size={12} className="text-purple-400" />
                      In this app
                    </div>
                    <div className="text-[11px] text-zinc-500">The Feature Store tab in Data Explorer is a simplified version. In production, you&apos;d use <strong className="text-zinc-300">Feast</strong>, <strong className="text-zinc-300">Databricks Feature Store</strong>, <strong className="text-zinc-300">Vertex AI Feature Store</strong>, or <strong className="text-zinc-300">Tecton</strong> — with versioning, lineage, and access control.</div>
                  </div>
                </div>
              </div>

              {/* Step 6 */}
              <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center text-xs font-bold text-blue-400">6</div>
                  <h3 className="text-sm font-bold text-blue-400">Create Training Datasets (Joins at Observation Time)</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Generate a training dataset by joining the <strong className="text-zinc-200">entity table</strong> (user_id + timestamps + label) with <strong className="text-zinc-200">feature tables</strong> using as-of joins / time-travel joins.
                  </p>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 font-mono text-xs text-zinc-400 space-y-0.5">
                    <div className="text-zinc-300 font-semibold font-sans mb-1.5">Conceptual Join:</div>
                    <div><span className="text-cyan-400">SELECT</span> e.user_id, e.label,</div>
                    <div>&nbsp;&nbsp;f.session_count, f.mobile_ratio, f.export_count</div>
                    <div><span className="text-cyan-400">FROM</span> entity_table e</div>
                    <div><span className="text-cyan-400">LEFT JOIN</span> feature_table f</div>
                    <div>&nbsp;&nbsp;<span className="text-cyan-400">ON</span> e.user_id = f.user_id</div>
                    <div>&nbsp;&nbsp;<span className="text-cyan-400">AND</span> f.feature_timestamp &lt;= e.observation_time</div>
                    <div>&nbsp;&nbsp;<span className="text-zinc-600">-- point-in-time: only features known BEFORE the label event</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1.5">
                        <FlaskConical size={12} />
                        In this app: Supervised
                      </div>
                      <div className="text-[11px] text-zinc-500">The app computes features and labels in one pass from all data. In production, Databricks frames this as &quot;create a training dataset that defines features and how to join them&quot; — and the model keeps references to those feature versions.</div>
                    </div>
                    <div className="bg-purple-500/5 rounded-lg p-3 border border-purple-500/20">
                      <div className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1.5">
                        <Users size={12} />
                        In this app: Unsupervised
                      </div>
                      <div className="text-[11px] text-zinc-500">No labels to join, but the same point-in-time logic applies to features. You don&apos;t want to cluster on features computed from data that includes future behavior.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 7 */}
              <div className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/15 flex items-center justify-center text-xs font-bold text-cyan-400">7</div>
                  <h3 className="text-sm font-bold text-cyan-400">Train + Track Experiments + Register Model</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Now you finally train. But training without tracking is a recipe for &quot;which model was that again?&quot;
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Log Everything</div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- Params (learning rate, K, depth)</li>
                        <li>- Metrics (accuracy, F1, inertia)</li>
                        <li>- Artifacts (model file, plots)</li>
                      </ul>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Register Model</div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- Version the model</li>
                        <li>- Stage: dev → staging → prod</li>
                        <li>- Approval workflow</li>
                      </ul>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1">Link Lineage</div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- Model ↔ feature versions</li>
                        <li>- Model ↔ data versions</li>
                        <li>- Model ↔ code commit</li>
                      </ul>
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 mt-1">
                    <div className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                      <GitBranch size={12} className="text-cyan-400" />
                      In this app
                    </div>
                    <div className="text-[11px] text-zinc-500">The Experiments tab logs params and metrics. The Model Registry stores the active model. In production, you&apos;d use <strong className="text-zinc-300">MLflow</strong>, <strong className="text-zinc-300">Databricks Unity Catalog</strong>, or <strong className="text-zinc-300">Vertex AI Model Registry</strong> — with full lineage back to training data and feature versions.</div>
                  </div>
                </div>
              </div>

              {/* Step 8 */}
              <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center text-xs font-bold text-green-400">8</div>
                  <h3 className="text-sm font-bold text-green-400">Serve Features for Inference (Batch or Online)</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Two fundamentally different serving modes, chosen by your use case:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                        <Database size={12} className="text-blue-400" />
                        Offline / Batch Serving
                      </div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- Score many users nightly</li>
                        <li>- Write results to a table</li>
                        <li>- Good for: email campaigns, dashboards, weekly reports</li>
                        <li>- Latency: minutes to hours is fine</li>
                      </ul>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                      <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                        <Server size={12} className="text-green-400" />
                        Online / Real-time Serving
                      </div>
                      <ul className="text-[11px] text-zinc-500 space-y-0.5">
                        <li>- Fetch latest features at low latency</li>
                        <li>- Score one user on demand</li>
                        <li>- Good for: onboarding, recommendations, fraud detection</li>
                        <li>- Latency: &lt;100ms required</li>
                      </ul>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center gap-1.5">
                        <FlaskConical size={12} />
                        In this app: Supervised
                      </div>
                      <div className="text-[11px] text-zinc-500">Model Registry does online-style inference — you load a user, it computes features and predicts instantly. In production, this might be a REST API behind a load balancer.</div>
                    </div>
                    <div className="bg-purple-500/5 rounded-lg p-3 border border-purple-500/20">
                      <div className="text-xs font-semibold text-purple-400 mb-1 flex items-center gap-1.5">
                        <Users size={12} />
                        In this app: Unsupervised
                      </div>
                      <div className="text-[11px] text-zinc-500">The Inference Pipeline (Step 7) is online serving — user logs in → compute features → nearest centroid → personalized onboarding. Databricks also supports &quot;on-demand&quot; features computed at inference time via UDFs.</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 9 */}
              <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center text-xs font-bold text-red-400">9</div>
                  <h3 className="text-sm font-bold text-red-400">Monitor in Production</h3>
                </div>
                <div className="text-[13px] text-zinc-400 leading-relaxed space-y-2">
                  <p>
                    Deploying a model is not the end — it&apos;s where the <strong className="text-zinc-200">real work begins</strong>. Models degrade silently.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { title: "Feature Freshness", desc: "Are features being computed on schedule? A stale feature table means predictions are based on old data.", icon: <Clock size={12} /> },
                      { title: "Distribution Drift", desc: "Have feature distributions shifted from training? If mobile_ratio was 0.3 avg in training and now it's 0.7, the model is out of distribution.", icon: <TrendingDown size={12} /> },
                      { title: "Prediction Drift", desc: "Is the model predicting differently over time? A sudden shift in class distribution indicates something changed.", icon: <BarChart3 size={12} /> },
                      { title: "Model Performance", desc: "When ground truth labels eventually arrive, compare to predictions. This is the gold standard but has delay.", icon: <Target size={12} /> },
                      { title: "Latency & Errors", desc: "Is the inference endpoint meeting SLAs? Are there timeout errors? Feature fetch failures?", icon: <Activity size={12} /> },
                      { title: "Alerting", desc: "Route alerts to Slack, PagerDuty, etc. Define thresholds for each metric that trigger investigation.", icon: <AlertTriangle size={12} /> },
                    ].map((m) => (
                      <div key={m.title} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <div className="text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                          {m.icon}
                          {m.title}
                        </div>
                        <div className="text-[11px] text-zinc-500">{m.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary flow */}
              <SectionCard title="The Full Picture: Demo vs Reality" color="amber">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-3 text-zinc-400 font-semibold w-8">#</th>
                        <th className="text-left py-2 pr-3 text-zinc-400 font-semibold">Step</th>
                        <th className="text-left py-2 pr-3 text-amber-400 font-semibold">In This Demo</th>
                        <th className="text-left py-2 text-cyan-400 font-semibold">In Production</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {[
                        { n: "1", step: "Entity + Label Time", demo: "Implicit — all data, one snapshot", prod: "Explicit entity table with timestamps, careful label definition" },
                        { n: "2", step: "Feature Specs", demo: "Hardcoded in ml-engine.ts", prod: "Formal contracts with owners, SLAs, freshness requirements" },
                        { n: "3", step: "Transformation Code", demo: "JavaScript in the browser", prod: "SQL/Spark jobs, dbt models, CI/CD, unit tests" },
                        { n: "4", step: "Data Quality", demo: "Visual inspection in Data Profile", prod: "Automated checks (Great Expectations, Soda) that block pipelines" },
                        { n: "5", step: "Feature Store", demo: "In-memory feature table", prod: "Feast, Databricks, Vertex AI — versioned, governed, discoverable" },
                        { n: "6", step: "Training Dataset", demo: "Direct array from feature table", prod: "Point-in-time joins, time-travel queries, dataset versioning" },
                        { n: "7", step: "Train + Register", demo: "Button click, results in UI", prod: "MLflow/W&B tracking, model registry, approval workflows" },
                        { n: "8", step: "Serve", demo: "In-browser prediction", prod: "REST APIs, batch scoring, feature serving with <100ms latency" },
                        { n: "9", step: "Monitor", demo: "Not implemented", prod: "Drift detection, alerting, retraining triggers, A/B tests" },
                      ].map((r) => (
                        <tr key={r.n}>
                          <td className="py-2 pr-3 text-zinc-500 font-mono">{r.n}</td>
                          <td className="py-2 pr-3 text-zinc-300 font-medium">{r.step}</td>
                          <td className="py-2 pr-3 text-zinc-500">{r.demo}</td>
                          <td className="py-2 text-zinc-500">{r.prod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
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

          {/* ═══════════════════ DATA DRIFT DEEP DIVE ═══════════════════ */}
          {activeSection === "data_drift" && (
            <>
              {/* Card 1: Training Assumptions */}
              <SectionCard title="Your Model's Hidden Assumptions" color="red">
                <p>
                  Every trained model <strong className="text-zinc-200">implicitly assumes</strong> that the world
                  at inference time looks like the world at training time. Drift happens when that assumption breaks.
                </p>
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {[
                    { icon: <Activity size={13} />, label: "User behavior is stable over time" },
                    { icon: <Database size={13} />, label: "Event logging is consistent" },
                    { icon: <Layers size={13} />, label: "Product structure is fixed" },
                    { icon: <Monitor size={13} />, label: "Device mix doesn't shift" },
                    { icon: <Compass size={13} />, label: "Ratios reflect true intent" },
                  ].map((a) => (
                    <div key={a.label} className="bg-zinc-800/50 rounded-lg p-2.5 border border-red-500/10 text-center">
                      <div className="text-red-400 flex justify-center mb-1">{a.icon}</div>
                      <div className="text-[10px] text-zinc-500 leading-tight">{a.label}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Card 2: Visual Drift Flow Diagram */}
              <SectionCard title="How Live Data Drifts" color="amber">
                <div className="flex items-center gap-2 justify-center py-3">
                  {/* Training */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-center min-w-[130px]">
                    <Database size={16} className="text-green-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-green-300">Training Data</div>
                    <div className="text-[10px] text-zinc-500">Historical, stable</div>
                  </div>
                  <ChevronRight size={16} className="text-zinc-600 shrink-0" />
                  {/* Model */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-center min-w-[130px]">
                    <Brain size={16} className="text-blue-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-blue-300">Trained Model</div>
                    <div className="text-[10px] text-zinc-500">Frozen weights</div>
                  </div>
                  <ChevronRight size={16} className="text-zinc-600 shrink-0" />
                  {/* Production */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-center min-w-[130px]">
                    <Rocket size={16} className="text-amber-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-amber-300">Production</div>
                    <div className="text-[10px] text-zinc-500">Live user data</div>
                  </div>
                </div>
                {/* Arrow down to drift */}
                <div className="flex justify-center">
                  <div className="w-px h-6 bg-zinc-700" />
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center max-w-md mx-auto">
                  <AlertTriangle size={16} className="text-red-400 mx-auto mb-1" />
                  <div className="text-xs font-semibold text-red-300 mb-2">Features no longer match training distribution</div>
                  <div className="flex justify-center gap-3">
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">User behavior</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">Product change</span>
                    <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">Logging issue</span>
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-3 border border-zinc-700">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <strong className="text-zinc-200">Most &quot;data drift&quot; is not ML drift — it&apos;s product evolution.</strong> Drift
                      detection is not &quot;auto retrain&quot;. It&apos;s a feedback loop between ML, product, and data engineering.
                    </p>
                  </div>
                </div>
              </SectionCard>

              {/* Card 3: Feature Drift Guide (interactive, expandable) */}
              <SectionCard title="Feature-by-Feature Drift Guide (click to expand)" color="blue">
                <p className="mb-3">Every feature in this demo has specific drift risks. Click any feature to see details.</p>
                <div className="space-y-1.5">
                  {([
                    { id: "session_count", name: "Session Count", tier: 1, severity: "yellow" as const, metric: "p99 ↑ 2.5×", causeType: "logging" as const, causeLabel: "Logging duplication", action: "Investigate", risks: ["Logging bug (duplicate events, retries, auto-refresh)", "Tracking blocked by browser / adblock / CSP change", "New SDK version or frontend event missing"], looksLike: "Mean ↑ suddenly, p95/p99 explodes, distribution becomes heavy-tailed", insight: "This drift is often a data bug, not user behavior.", checks: ["Mean change > ±30%", "p99 change > 2×", "Zero-rate > 10%"] },
                    { id: "unique_resource_types", name: "Unique Resource Types", tier: 2, severity: "yellow" as const, metric: "Mean ↑ 1+", causeType: "product" as const, causeLabel: "Product expansion", action: "Monitor", risks: ["New resource types added (ai, insight, alert)", "Old types deprecated or merged", "Mislabeling (frontend sends wrong resource_type)"], looksLike: "Mean ↑ (more types per user), new category appears, entropy jumps", insight: "Model learned 'many types = power user' but now everyone touches many types because UI changed.", checks: ["Mean ↑ > 1", "New category appears", "Retrain only if persists >14 days"] },
                    { id: "unique_resources", name: "Unique Resources", tier: 2, severity: "yellow" as const, metric: "Mean ↑ 40%", causeType: "product" as const, causeLabel: "Taxonomy churn", action: "Investigate", risks: ["Dashboard renaming or splitting/cloning", "Folder re-org (same dashboard, new name)", "Cross-game dashboards introduced"], looksLike: "Mean ↑ without session_count ↑, ratio unique_resources/session_count spikes", insight: "Looks like exploration behavior, but it's actually product taxonomy churn.", checks: ["Mean ↑ > 40%", "Ratio to session_count ↑", "Avoid retrain unless behavior confirmed"] },
                    { id: "mobile_ratio", name: "Mobile Ratio", tier: 1, severity: "yellow" as const, metric: "Mean ↑ 0.25", causeType: "user" as const, causeLabel: "Mobile adoption", action: "Accept", risks: ["Mobile app launch / redesign", "Mobile traffic campaign", "Tablet classified as mobile", "Device detection logic change"], looksLike: "Mean jumps (e.g. 0.3 → 0.7), distribution becomes bimodal", insight: "Your persona model may implicitly encode 'mobile-heavy = casual'. If everyone goes mobile → persona predictions collapse.", checks: ["Mean shift > 0.2", "Distribution becomes bimodal", "Retrain if correlated with persona shift"] },
                    { id: "realtime_ratio", name: "Realtime Ratio", tier: 1, severity: "red" as const, metric: "PSI = 0.31", causeType: "product" as const, causeLabel: "Navigation change", action: "Retrain", risks: ["Realtime dashboard promoted on homepage", "Realtime becomes default landing page", "Realtime renamed / reclassified"], looksLike: "Mean ↑ sharply, correlation with home_visit_ratio changes", insight: "This is product-driven drift, not user-driven. Model learned behavior under old navigation.", checks: ["PSI > 0.25", "Mean ↑ > 50%", "Version feature after retrain"] },
                    { id: "tableau_count", name: "Tableau Count", tier: 2, severity: "yellow" as const, metric: "Zero-rate ↑ 30%", causeType: "product" as const, causeLabel: "Tool migration", action: "Deprecate?", risks: ["Migration away from Tableau", "Tableau dashboards embedded elsewhere", "Resource_type mis-tagged"], looksLike: "Long-term downward trend, zero-inflation (many users suddenly have 0)", insight: "Model thinks 'low tableau = low engagement' but product reality changed.", checks: ["Zero-rate ↑ > 30%", "Long-term downward trend", "Replace with tool-agnostic feature"] },
                    { id: "export_count", name: "Export Count", tier: 2, severity: "red" as const, metric: "Mean → ~0", causeType: "product" as const, causeLabel: "Permission/UI change", action: "Disable feature", risks: ["Export button moved", "Permission change (exports disabled)", "New export formats added"], looksLike: "Sharp drop to near-zero, or spike after bulk-export feature launch", insight: "Very sensitive feature — should have tight thresholds.", checks: ["Mean drops to ~0 → disable feature", "Spike after launch → monitor", "Tight thresholds required"] },
                    { id: "search_count", name: "Search Count", tier: 2, severity: "yellow" as const, metric: "Ratio ↑ to sessions", causeType: "product" as const, causeLabel: "UX discoverability", action: "Accept", risks: ["Search bar made more visible", "Default focus on search", "Search auto-suggestions generating events"], looksLike: "Mean ↑ without session_count ↑, ratio search_count/session_count spikes", insight: "Model might treat search-heavy users as 'lost/struggling' → suddenly everyone looks lost.", checks: ["Ratio to session_count ↑", "Mean ↑ > 2×", "Accept unless correlated with churn"] },
                    { id: "unique_games", name: "Unique Games", tier: 3, severity: "red" as const, metric: "Missing rate ↑", causeType: "logging" as const, causeLabel: "Schema drift", action: "Fix schema", risks: ["Folder naming changes", "New games added", "Cross-game dashboards introduced", "Folder missing in metadata"], looksLike: "Missing rate ↑, mean ↑ because shared dashboards touch multiple games", insight: "Classic schema drift hidden as data drift. Do NOT retrain — fix the schema.", checks: ["Missing rate > 15%", "Mean ↑ unexpectedly", "Fix schema, do not retrain"] },
                    { id: "home_visit_ratio", name: "Home Visit Ratio", tier: 1, severity: "red" as const, metric: "Mean ↓ 80%", causeType: "product" as const, causeLabel: "Homepage bypass", action: "Retrain", risks: ["Home page removed", "Deep linking introduced", "Homepage auto-redirect"], looksLike: "Mean collapses to near zero, distribution mass at 0", insight: "Ratios are extremely fragile to navigation changes. Consider retiring this feature.", checks: ["Mean ↓ > 70%", "Mass at 0", "Retrain, possibly retire feature"] },
                    { id: "avg_hour", name: "Avg Hour", tier: 3, severity: "red" as const, metric: "Mean ± 7hrs", causeType: "logging" as const, causeLabel: "Timezone bug", action: "Investigate!", risks: ["Timezone handling bug", "Backend timezone change", "International users onboarded"], looksLike: "Mean shifts by ±7 hours, multimodal distribution", insight: "This drift can destroy the model silently — values are 'valid' but semantically wrong.", checks: ["Mean shift > 3 hours", "New peaks at odd hours", "Block inference if timezone bug"] },
                    { id: "activity_span_hours", name: "Activity Span", tier: 3, severity: "yellow" as const, metric: "Median ↑ 3×", causeType: "logging" as const, causeLabel: "Sessionization change", action: "Investigate", risks: ["Sessionization logic change", "Background pings extend sessions", "Sparse events due to logging gaps"], looksLike: "Median ↑ massively, long tail explodes", insight: "Model thinks 'long span = high engagement' but it's actually background noise.", checks: ["Median ↑ > 3×", "Tail explosion", "Recompute logic if needed"] },
                  ] as const).map((feat) => (
                    <div key={feat.id} className="border border-zinc-800 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedDrift(expandedDrift === feat.id ? null : feat.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors text-left"
                      >
                        {/* Severity dot */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${feat.severity === "red" ? "bg-red-400" : feat.severity === "yellow" ? "bg-amber-400" : "bg-green-400"}`} />
                        {/* Feature name */}
                        <span className="text-xs font-semibold text-zinc-200 w-40 shrink-0">{feat.name}</span>
                        {/* Tier badge */}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${feat.tier === 1 ? "bg-blue-500/20 text-blue-300" : feat.tier === 2 ? "bg-zinc-700 text-zinc-400" : "bg-amber-500/20 text-amber-300"}`}>
                          Tier {feat.tier}
                        </span>
                        {/* Cause badge */}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${feat.causeType === "user" ? "bg-blue-500/15 text-blue-300" : feat.causeType === "product" ? "bg-purple-500/15 text-purple-300" : "bg-orange-500/15 text-orange-300"}`}>
                          {feat.causeType === "user" ? "User behavior" : feat.causeType === "product" ? "Product change" : "Logging issue"}
                        </span>
                        {/* Metric */}
                        <span className="text-[10px] text-zinc-500 flex-1">{feat.metric}</span>
                        {/* Action */}
                        <span className={`text-[10px] font-medium shrink-0 ${feat.severity === "red" ? "text-red-400" : "text-amber-400"}`}>{feat.action}</span>
                        {/* Chevron */}
                        <ChevronDown size={12} className={`text-zinc-600 shrink-0 transition-transform ${expandedDrift === feat.id ? "rotate-180" : ""}`} />
                      </button>
                      {expandedDrift === feat.id && (
                        <div className="px-4 pb-3 border-t border-zinc-800/50 bg-zinc-800/20">
                          <div className="grid grid-cols-3 gap-3 pt-3">
                            <div>
                              <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">Drift Risks</div>
                              <ul className="text-[11px] text-zinc-400 space-y-0.5">
                                {feat.risks.map((r) => <li key={r}>- {r}</li>)}
                              </ul>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">What Drift Looks Like</div>
                              <p className="text-[11px] text-zinc-400">{feat.looksLike}</p>
                              <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1 mt-2">Checks / Thresholds</div>
                              <ul className="text-[11px] text-zinc-400 space-y-0.5">
                                {feat.checks.map((c) => <li key={c}>- {c}</li>)}
                              </ul>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">Key Insight</div>
                              <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                                <p className="text-[11px] text-amber-300/90">{feat.insight}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Card 4: Cross-Feature Drift */}
              <SectionCard title="Cross-Feature Drift — The Sneaky Ones" color="purple">
                <p className="mb-3">Single-feature monitoring misses these. They&apos;re the most dangerous and hardest to spot.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-purple-500/10">
                    <div className="text-xs font-semibold text-purple-300 mb-2 flex items-center gap-1.5">
                      <TrendingDown size={12} /> Ratio Denominator Drift
                    </div>
                    <p className="text-[11px] text-zinc-400 mb-2">
                      <code className="text-zinc-300">mobile_ratio</code>, <code className="text-zinc-300">realtime_ratio</code>, and
                      <code className="text-zinc-300"> home_visit_ratio</code> all depend on <code className="text-zinc-300">session_count</code>.
                    </p>
                    <p className="text-[11px] text-amber-400">If session_count drifts, ALL ratios drift — even if behavior doesn&apos;t change.</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-purple-500/10">
                    <div className="text-xs font-semibold text-purple-300 mb-2 flex items-center gap-1.5">
                      <GitBranch size={12} /> Correlation Drift
                    </div>
                    <p className="text-[11px] text-zinc-400 mb-2">
                      Previously: <code className="text-zinc-300">realtime_ratio ↑ → export_count ↑</code><br />
                      Now: realtime dashboards don&apos;t support export.
                    </p>
                    <p className="text-[11px] text-amber-400">Model assumptions break without any single feature alarming.</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-purple-500/10">
                    <div className="text-xs font-semibold text-purple-300 mb-2 flex items-center gap-1.5">
                      <Users size={12} /> Cold-Start Inflation
                    </div>
                    <p className="text-[11px] text-zinc-400 mb-2">
                      New users: low <code className="text-zinc-300">session_count</code>, low <code className="text-zinc-300">unique_resources</code>, unstable ratios (0/1 extremes).
                    </p>
                    <p className="text-[11px] text-amber-400">If onboarding flow changes → cold-start share increases → global drift.</p>
                  </div>
                </div>
              </SectionCard>

              {/* Card 5: Drift Risk Ranking */}
              <SectionCard title="Most Likely Drift Sources (Ranked)" color="amber">
                <div className="space-y-2">
                  {[
                    { rank: 1, label: "Navigation / UI change drift", features: "home_visit_ratio, realtime_ratio, tableau_count", severity: "red" },
                    { rank: 2, label: "Logging / duplication drift", features: "session_count, activity_span_hours", severity: "red" },
                    { rank: 3, label: "Taxonomy drift", features: "resource_type, resource_name, folder", severity: "yellow" },
                    { rank: 4, label: "Device mix drift", features: "mobile_ratio", severity: "yellow" },
                    { rank: 5, label: "Timezone / ingestion drift", features: "avg_hour", severity: "yellow" },
                  ].map((r) => (
                    <div key={r.rank} className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-3 py-2">
                      <span className={`text-sm font-bold w-6 text-center ${r.severity === "red" ? "text-red-400" : "text-amber-400"}`}>#{r.rank}</span>
                      <span className="text-xs font-semibold text-zinc-200 w-56">{r.label}</span>
                      <span className="text-[10px] text-zinc-500">{r.features}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Card 6: Drift Dashboard Design (mockup) */}
              <SectionCard title="Drift Dashboard Design (What Monitoring Looks Like)" color="cyan">
                {/* Summary header */}
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700 mb-3">
                  <div className="text-xs font-semibold text-cyan-300 mb-2">Feature Drift Overview (Last 7 days)</div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Features monitored", value: "12", color: "text-zinc-200" },
                      { label: "With drift", value: "5", color: "text-amber-400" },
                      { label: "Critical drift", value: "2", color: "text-red-400" },
                      { label: "Data issues", value: "1", color: "text-orange-400" },
                    ].map((m) => (
                      <div key={m.label} className="text-center">
                        <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                        <div className="text-[10px] text-zinc-500">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Breakdown table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-2 text-zinc-400 font-semibold">Feature</th>
                        <th className="text-left py-2 pr-2 text-zinc-400 font-semibold">Status</th>
                        <th className="text-left py-2 pr-2 text-zinc-400 font-semibold">Metric</th>
                        <th className="text-left py-2 pr-2 text-zinc-400 font-semibold">Likely Cause</th>
                        <th className="text-left py-2 text-zinc-400 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {[
                        { feat: "realtime_ratio", status: "red", statusLabel: "Severe", metric: "PSI = 0.31", cause: "Product nav change", action: "Retrain" },
                        { feat: "home_visit_ratio", status: "red", statusLabel: "Severe", metric: "Mean ↓ 80%", cause: "Homepage bypass", action: "Retrain" },
                        { feat: "session_count", status: "yellow", statusLabel: "Moderate", metric: "p99 ↑ 2.5×", cause: "Logging duplication", action: "Investigate" },
                        { feat: "mobile_ratio", status: "yellow", statusLabel: "Moderate", metric: "Mean ↑ 0.25", cause: "Mobile adoption", action: "Accept" },
                        { feat: "export_count", status: "yellow", statusLabel: "Moderate", metric: "Mean ↓ 60%", cause: "UI change", action: "Monitor" },
                        { feat: "avg_hour", status: "green", statusLabel: "Stable", metric: "—", cause: "—", action: "—" },
                        { feat: "search_count", status: "green", statusLabel: "Stable", metric: "—", cause: "—", action: "—" },
                      ].map((r) => (
                        <tr key={r.feat}>
                          <td className="py-2 pr-2 text-zinc-300 font-medium">{r.feat}</td>
                          <td className="py-2 pr-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${r.status === "red" ? "bg-red-500/20 text-red-300" : r.status === "yellow" ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.status === "red" ? "bg-red-400" : r.status === "yellow" ? "bg-amber-400" : "bg-green-400"}`} />
                              {r.statusLabel}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-zinc-500">{r.metric}</td>
                          <td className="py-2 pr-2 text-zinc-500">{r.cause}</td>
                          <td className={`py-2 font-medium ${r.status === "red" ? "text-red-400" : r.status === "yellow" ? "text-amber-400" : "text-zinc-600"}`}>{r.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Feature detail example */}
                <div className="mt-3 bg-zinc-800/30 rounded-lg p-3 border border-cyan-500/10">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-2">Feature Detail Example: realtime_ratio</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1">Description</div>
                      <div className="text-[11px] text-zinc-400">Ratio feature, depends on session_count and resource_type</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1">Stats</div>
                      <div className="grid grid-cols-3 gap-1 text-[10px]">
                        <span className="text-zinc-500">Metric</span><span className="text-zinc-500">Ref</span><span className="text-zinc-500">Current</span>
                        <span className="text-zinc-400">Mean</span><span className="text-zinc-300">0.28</span><span className="text-red-300">0.61</span>
                        <span className="text-zinc-400">p90</span><span className="text-zinc-300">0.52</span><span className="text-red-300">0.89</span>
                        <span className="text-zinc-400">PSI</span><span className="text-zinc-300">—</span><span className="text-red-300">0.31</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1">Annotation</div>
                      <div className="text-[11px] text-zinc-400 italic">&quot;Realtime dashboard promoted to homepage on Feb 9&quot;</div>
                      <div className="text-[11px] text-green-400 mt-1 font-medium">Retrain with post-change data</div>
                    </div>
                  </div>
                </div>
                {/* Cross-feature drift panel */}
                <div className="mt-3 bg-zinc-800/30 rounded-lg p-3 border border-cyan-500/10">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-2">Correlated Drift Signals</div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                      <span className="text-zinc-400">realtime_ratio</span> <span className="text-red-400">↔</span> <span className="text-zinc-400">home_visit_ratio</span>
                      <div className="text-[10px] text-amber-400 mt-0.5">Inverted</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                      <span className="text-zinc-400">session_count</span> <span className="text-red-400">↔</span> <span className="text-zinc-400">activity_span</span>
                      <div className="text-[10px] text-amber-400 mt-0.5">Both ↑</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
                      <span className="text-zinc-400">mobile_ratio</span> <span className="text-red-400">↔</span> <span className="text-zinc-400">avg_hour</span>
                      <div className="text-[10px] text-amber-400 mt-0.5">New bimodality</div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Card 7: Per-Feature Drift Thresholds */}
              <SectionCard title="Feature Tiers & Alert Rules" color="green">
                <p className="mb-3">Not all features are equal. Tier-1 features trigger critical alerts; Tier-3 features need investigation before action.</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <div className="text-xs font-semibold text-blue-300 mb-1.5">Tier 1 — Core Behavior</div>
                    <div className="text-[10px] text-zinc-400 space-y-0.5">
                      <div><code className="text-blue-300">session_count</code> — activity volume</div>
                      <div><code className="text-blue-300">realtime_ratio</code> — content preference</div>
                      <div><code className="text-blue-300">home_visit_ratio</code> — navigation pattern</div>
                      <div><code className="text-blue-300">mobile_ratio</code> — device mix</div>
                    </div>
                    <div className="text-[10px] text-red-400 mt-2 font-medium">Severe drift → block or retrain</div>
                  </div>
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                    <div className="text-xs font-semibold text-zinc-300 mb-1.5">Tier 2 — Supporting</div>
                    <div className="text-[10px] text-zinc-400 space-y-0.5">
                      <div><code className="text-zinc-300">unique_resources</code></div>
                      <div><code className="text-zinc-300">unique_resource_types</code></div>
                      <div><code className="text-zinc-300">tableau_count</code></div>
                      <div><code className="text-zinc-300">search_count</code> / <code className="text-zinc-300">export_count</code></div>
                    </div>
                    <div className="text-[10px] text-amber-400 mt-2 font-medium">Drift → monitor & investigate</div>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <div className="text-xs font-semibold text-amber-300 mb-1.5">Tier 3 — Fragile / Contextual</div>
                    <div className="text-[10px] text-zinc-400 space-y-0.5">
                      <div><code className="text-amber-300">avg_hour</code> — timezone-sensitive</div>
                      <div><code className="text-amber-300">activity_span_hours</code> — session-dependent</div>
                      <div><code className="text-amber-300">unique_games</code> — schema-dependent</div>
                    </div>
                    <div className="text-[10px] text-amber-400 mt-2 font-medium">Drift → fix pipeline first</div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <div className="text-xs font-semibold text-red-300 mb-1">Aggregate Alert Rule</div>
                  <div className="text-[11px] text-zinc-400">
                    Trigger <strong className="text-red-300">Critical Drift Alert</strong> if:
                    <span className="block mt-1">- Any <strong className="text-blue-300">Tier-1</strong> feature has severe drift, OR</span>
                    <span className="block">- ≥30% of all features have moderate drift</span>
                  </div>
                </div>
              </SectionCard>

              {/* Card 8: Feature Hygiene Plan */}
              <SectionCard title="Feature Hygiene: Keep, Guard, Version, Replace, Retire" color="green">
                <p className="mb-3">The most mature ML insight: managing features like a product, not just a model input.</p>
                <div className="space-y-3">
                  {/* Keep */}
                  <div className="flex gap-3 items-start">
                    <span className="text-xs font-bold bg-green-500/20 text-green-300 px-2 py-0.5 rounded shrink-0 w-20 text-center mt-0.5">Keep</span>
                    <div className="text-[11px] text-zinc-400">
                      <code className="text-green-300">session_count</code> (with caps), <code className="text-green-300">mobile_ratio</code>, <code className="text-green-300">search_count</code>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Stable, valuable, low drift risk when monitored.</div>
                    </div>
                  </div>
                  {/* Guard */}
                  <div className="flex gap-3 items-start">
                    <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded shrink-0 w-20 text-center mt-0.5">Guard</span>
                    <div className="text-[11px] text-zinc-400">
                      <code className="text-amber-300">realtime_ratio</code>, <code className="text-amber-300">home_visit_ratio</code>, <code className="text-amber-300">unique_resources</code>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Product-dependent features. Version + monitor heavily.</div>
                    </div>
                  </div>
                  {/* Version */}
                  <div className="flex gap-3 items-start">
                    <span className="text-xs font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded shrink-0 w-20 text-center mt-0.5">Version</span>
                    <div className="text-[11px] text-zinc-400">
                      Example: <code className="text-blue-300">realtime_ratio_v1</code> (pre-homepage redesign) → <code className="text-blue-300">realtime_ratio_v2</code> (post-redesign).
                      <div className="text-[10px] text-zinc-500 mt-0.5">Feature versioning as a first-class concept in your feature store.</div>
                    </div>
                  </div>
                  {/* Replace */}
                  <div className="flex gap-3 items-start">
                    <span className="text-xs font-bold bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded shrink-0 w-20 text-center mt-0.5">Replace</span>
                    <div className="text-[11px] text-zinc-400">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        <span><code className="text-zinc-500">tableau_count</code> →</span><span><code className="text-purple-300">dashboard_views_by_tool</code></span>
                        <span><code className="text-zinc-500">unique_resources</code> →</span><span><code className="text-purple-300">resource_usage_entropy</code></span>
                        <span><code className="text-zinc-500">home_visit_ratio</code> →</span><span><code className="text-purple-300">first_page_type</code></span>
                      </div>
                    </div>
                  </div>
                  {/* Retire */}
                  <div className="flex gap-3 items-start">
                    <span className="text-xs font-bold bg-red-500/20 text-red-300 px-2 py-0.5 rounded shrink-0 w-20 text-center mt-0.5">Retire</span>
                    <div className="text-[11px] text-zinc-400">
                      <code className="text-red-300">avg_hour</code> (timezone fragile), <code className="text-red-300">activity_span_hours</code> (sessionization fragile)
                      <div className="text-[10px] text-zinc-500 mt-0.5">Unless you control ingestion &amp; timezone strictly, these will burn you.</div>
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-3 border border-zinc-700">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <strong className="text-zinc-200">Models don&apos;t fail because of bad algorithms. They fail because features silently change meaning.</strong> If your
                      monitoring shows drift → diagnosis → action (not auto-retrain), you&apos;re ahead of 90% of production ML systems.
                    </p>
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {/* ═══════════════════ COMPUTE & INFRASTRUCTURE ═══════════════════ */}
          {activeSection === "compute" && (
            <>
              <SectionCard title="How Training Works Without a GPU" color="cyan">
                <p>
                  This entire ML pipeline runs <strong className="text-zinc-200">in the browser using plain
                  TypeScript</strong> — no Python, no TensorFlow, no GPU. Everything is CPU-based,
                  executed in the browser&apos;s main thread.
                </p>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-2 border border-zinc-700">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <strong className="text-zinc-300">Key insight:</strong> GPUs are only needed for
                      deep learning (neural networks with millions/billions of parameters). Classical ML
                      algorithms like the ones in this demo run perfectly fine on CPU — even at production scale.
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="What This App Implements From Scratch" color="blue">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-4 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <FlaskConical size={14} className="text-blue-400" />
                      <span className="text-xs font-semibold text-blue-300">Logistic Regression</span>
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-1">
                      <li>- Manual gradient descent with sigmoid/softmax</li>
                      <li>- Z-score normalization (simple array math)</li>
                      <li>- L2 regularization to prevent weight concentration</li>
                      <li>- Forward pass: nested loops over samples × features</li>
                      <li>- Backward pass: compute gradients, update weights</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <GitBranch size={14} className="text-green-400" />
                      <span className="text-xs font-semibold text-green-300">Decision Tree</span>
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-1">
                      <li>- Recursive tree building with Gini impurity splits</li>
                      <li>- No matrix math needed — conditional logic + counting</li>
                      <li>- Configurable max depth to prevent overfitting</li>
                      <li>- Feature importance via split frequency</li>
                      <li>- Prediction: simple tree traversal</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={14} className="text-purple-400" />
                      <span className="text-xs font-semibold text-purple-300">K-Means Clustering</span>
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-1">
                      <li>- K-Means++ initialization (spread centroids apart)</li>
                      <li>- Iterative assign → update centroid loop</li>
                      <li>- Euclidean distance calculations</li>
                      <li>- Convergence detection (labels stop changing)</li>
                      <li>- Inertia computation for evaluation</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-4 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings2 size={14} className="text-amber-400" />
                      <span className="text-xs font-semibold text-amber-300">Supporting Utilities</span>
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-1">
                      <li>- Feature engineering (raw logs → user features)</li>
                      <li>- Z-score normalization &amp; label encoding</li>
                      <li>- Fisher-Yates shuffle for train/test split</li>
                      <li>- Percentile-based target variable labeling</li>
                      <li>- Confusion matrix &amp; metric computation</li>
                    </ul>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="When Do You Actually Need a GPU?" color="amber">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-4 text-zinc-400 font-semibold">Scenario</th>
                        <th className="text-left py-2 pr-4 text-zinc-400 font-semibold">GPU?</th>
                        <th className="text-left py-2 text-zinc-400 font-semibold">Why</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {[
                        { scenario: "Logistic regression on 168 rows", gpu: "No", why: "Milliseconds on CPU. This is what the demo does." },
                        { scenario: "Random forest on 1M rows", gpu: "Probably not", why: "CPU is fine — XGBoost/LightGBM handle this easily." },
                        { scenario: "K-Means on 168 rows × 6 features", gpu: "No", why: "Trivial for CPU. Even 1M points works on CPU." },
                        { scenario: "Training a CNN (image classification)", gpu: "Yes", why: "Convolution operations are massively parallelizable on GPU." },
                        { scenario: "Training a transformer (NLP)", gpu: "Yes", why: "Attention mechanisms involve huge matrix multiplications." },
                        { scenario: "LLM fine-tuning (billions of params)", gpu: "Absolutely", why: "Would take weeks on CPU. Hours on multiple GPUs/TPUs." },
                        { scenario: "Real-time inference (REST API)", gpu: "Depends", why: "Classical ML → CPU. Deep learning → often GPU for throughput." },
                      ].map((r) => (
                        <tr key={r.scenario}>
                          <td className="py-2 pr-4 text-zinc-300 font-medium">{r.scenario}</td>
                          <td className={`py-2 pr-4 font-semibold ${r.gpu === "No" ? "text-green-400" : r.gpu === "Yes" || r.gpu === "Absolutely" ? "text-red-400" : "text-amber-400"}`}>{r.gpu}</td>
                          <td className="py-2 text-zinc-500">{r.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Production Compute: What Teams Actually Use" color="green">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                    <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <Cpu size={12} className="text-blue-400" />
                      CPU
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-0.5">
                      <li>- Classical ML (scikit-learn, XGBoost)</li>
                      <li>- Feature engineering (Spark, SQL)</li>
                      <li>- Data preprocessing pipelines</li>
                      <li>- Low-latency inference APIs</li>
                      <li>- Most production workloads</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                    <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <Monitor size={12} className="text-green-400" />
                      GPU
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-0.5">
                      <li>- Deep learning (PyTorch, TensorFlow)</li>
                      <li>- Image/video/audio models</li>
                      <li>- NLP transformers (BERT, GPT)</li>
                      <li>- Embedding generation at scale</li>
                      <li>- NVIDIA A100, H100, etc.</li>
                    </ul>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                    <div className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <Rocket size={12} className="text-purple-400" />
                      TPU / Custom
                    </div>
                    <ul className="text-[11px] text-zinc-500 space-y-0.5">
                      <li>- Google TPUs for large-scale training</li>
                      <li>- AWS Inferentia for inference</li>
                      <li>- Apple Neural Engine (on-device)</li>
                      <li>- Training LLMs, foundation models</li>
                      <li>- Specialized matrix operations</li>
                    </ul>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="This App vs Production Stack" color="purple">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 pr-4 text-zinc-400 font-semibold w-36">Component</th>
                        <th className="text-left py-2 pr-4 text-purple-400 font-semibold">In This Demo</th>
                        <th className="text-left py-2 text-cyan-400 font-semibold">Production Equivalent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {[
                        { comp: "Runtime", demo: "Browser (V8 JS engine)", prod: "Python on cloud VMs / containers" },
                        { comp: "ML library", demo: "Custom TypeScript (ml-engine.ts)", prod: "scikit-learn, XGBoost, PyTorch" },
                        { comp: "Data processing", demo: "In-memory arrays", prod: "Spark, Pandas, Polars on clusters" },
                        { comp: "Compute", demo: "Your laptop CPU", prod: "Cloud CPUs (or GPUs for deep learning)" },
                        { comp: "Training time", demo: "< 1 second", prod: "Seconds (classical) to days (LLMs)" },
                        { comp: "Dataset size", demo: "~168 rows", prod: "Millions to billions of rows" },
                        { comp: "Model serving", demo: "In-browser function call", prod: "REST API, gRPC, batch Spark jobs" },
                      ].map((r) => (
                        <tr key={r.comp}>
                          <td className="py-2 pr-4 text-zinc-300 font-medium">{r.comp}</td>
                          <td className="py-2 pr-4 text-zinc-500">{r.demo}</td>
                          <td className="py-2 text-zinc-500">{r.prod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3 mt-3 border border-zinc-700">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <strong className="text-zinc-300">The algorithms are identical</strong> — logistic regression
                      is logistic regression whether you implement it in TypeScript or Python. The difference is
                      scale, tooling, and ecosystem. Production systems use Python because of its rich ML ecosystem
                      (NumPy, pandas, scikit-learn, PyTorch), not because the math is different.
                    </p>
                  </div>
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
                    { term: "Entity", def: "The unit you're predicting about (e.g. user_id, session_id). Defines the granularity of your feature table." },
                    { term: "Observation Time", def: "The point-in-time at which you make a prediction. Features must only use data from before this time." },
                    { term: "Point-in-Time Join", def: "Joining feature values as they existed at a specific timestamp, preventing data leakage from future values." },
                    { term: "Feature Contract", def: "A formal spec for a feature: inputs, time window, aggregation logic, freshness SLA, and owner." },
                    { term: "Idempotent", def: "A transformation that produces the same output regardless of how many times it runs. Critical for reliable data pipelines." },
                    { term: "Backfill", def: "Computing historical feature values retroactively. Needed when adding new features or fixing computation bugs." },
                    { term: "Feature Drift", def: "When the statistical distribution of a feature changes over time, potentially degrading model performance." },
                    { term: "MLflow", def: "Open-source platform for ML lifecycle management: experiment tracking, model registry, and deployment." },
                    { term: "Feast", def: "Open-source feature store that manages feature computation, storage, and serving with point-in-time correctness." },
                    { term: "Online Serving", def: "Real-time inference where features are fetched and predictions made in <100ms for a single request." },
                    { term: "Batch Serving", def: "Offline inference where many predictions are computed at once (e.g. nightly), written to a table for later use." },
                    { term: "GPU", def: "Graphics Processing Unit. Excels at parallel matrix operations needed for deep learning. Not required for classical ML." },
                    { term: "TPU", def: "Tensor Processing Unit. Google's custom hardware optimized for large-scale neural network training." },
                    { term: "L2 Regularization", def: "A penalty on large weights during training. Prevents the model from concentrating signal on a single feature, improving generalization." },
                    { term: "Gradient Descent", def: "Optimization algorithm that iteratively adjusts model weights in the direction that reduces the loss function." },
                    { term: "Data Drift", def: "When the statistical distribution of input features changes between training and production, potentially degrading model accuracy." },
                    { term: "PSI (Population Stability Index)", def: "A metric measuring how much a feature's distribution has shifted. PSI > 0.25 typically signals significant drift requiring action." },
                    { term: "Training/Serving Skew", def: "When feature computation in production differs from training. The #1 cause of silent ML failures in production." },
                    { term: "Feature Tier", def: "A classification of features by impact: Tier 1 (core behavior) triggers alerts, Tier 2 (supporting) needs monitoring, Tier 3 (fragile) needs pipeline fixes first." },
                    { term: "Feature Versioning", def: "Tracking feature definitions over time (e.g. realtime_ratio_v1 vs v2) to handle product changes without breaking model assumptions." },
                    { term: "Schema Drift", def: "When the structure of source data changes (new columns, renamed fields, type changes), often disguised as data drift." },
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
