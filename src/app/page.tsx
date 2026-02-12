"use client";

import { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";
import {
  RawLogEntry,
  UserFeatureRow,
  FeatureDefinition,
  TrainingResult,
  ExperimentRun,
  PipelineStep,
  Playbook,
} from "@/lib/types";
import { parseRawLogs, computeUserFeatures, DEFAULT_FEATURES, restoreModel } from "@/lib/ml-engine";
import StepIndicator from "@/components/StepIndicator";
import DataExplorer from "@/components/DataExplorer";
import FeatureTraining from "@/components/FeatureTraining";
import ModelTesting from "@/components/ModelTesting";
import ExploratoryDataDiscovery from "@/components/ExploratoryDataDiscovery";
import PersonaPipeline from "@/components/PersonaPipeline";
import PLTVPipeline from "@/components/PLTVPipeline";
import LearnPage from "@/components/LearnPage";
import { InfoBanner } from "@/components/InfoTooltip";
import { Database, Cpu, GitBranch, BookOpen, FlaskConical, Users, Swords, ChevronRight } from "lucide-react";

export default function Home() {
  const [currentStep, setCurrentStep] = useState<PipelineStep>("data_explorer");
  const [rawLogs, setRawLogs] = useState<RawLogEntry[]>([]);
  const [featureData, setFeatureData] = useState<UserFeatureRow[]>([]);
  const [features, setFeatures] = useState<FeatureDefinition[]>(DEFAULT_FEATURES);
  const [experiments, setExperiments] = useState<ExperimentRun[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mlops_experiments");
        return saved ? JSON.parse(saved) : [];
      } catch { return []; }
    }
    return [];
  });
  const [activeModel, setActiveModel] = useState<TrainingResult | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mlops_active_model");
        return saved ? JSON.parse(saved) : null;
      } catch { return null; }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showLearn, setShowLearn] = useState(false);
  const [activePlaybook, setActivePlaybook] = useState<Playbook | null>(null);

  // Persist experiments to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("mlops_experiments", JSON.stringify(experiments));
    } catch (e) {
      console.warn("Failed to save experiments to localStorage:", e);
    }
  }, [experiments]);

  // Persist active model to localStorage
  useEffect(() => {
    try {
      if (activeModel) {
        localStorage.setItem("mlops_active_model", JSON.stringify(activeModel));
      } else {
        localStorage.removeItem("mlops_active_model");
      }
    } catch (e) {
      console.warn("Failed to save active model to localStorage:", e);
    }
  }, [activeModel]);

  // Restore in-memory model from serialized weights on mount
  useEffect(() => {
    if (activeModel?.serializedModel) {
      restoreModel(activeModel.serializedModel);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  useEffect(() => {
    fetch("/raw-logs.csv")
      .then((res) => res.text())
      .then((csvText) => {
        const parsed = Papa.parse<RawLogEntry>(csvText, {
          header: true,
          skipEmptyLines: true,
        });
        const logs = parseRawLogs(parsed.data);
        setRawLogs(logs);
        const userData = computeUserFeatures(logs);
        setFeatureData(userData);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load CSV:", err);
        setIsLoading(false);
      });
  }, []);

  const handleExperimentComplete = useCallback((run: ExperimentRun) => {
    setExperiments((prev) => [run, ...prev]);
  }, []);

  const handleModelReady = useCallback((result: TrainingResult) => {
    setActiveModel(result);
  }, []);

  const handleDeleteExperiment = useCallback((experimentId: string) => {
    setExperiments((prev) => {
      const updated = prev.filter((e) => e.id !== experimentId);
      // If we deleted the active model's experiment, clear it
      const deleted = prev.find((e) => e.id === experimentId);
      if (deleted && activeModel && deleted.result.modelId === activeModel.modelId) {
        setActiveModel(null);
      }
      return updated;
    });
  }, [activeModel]);

  const handleDataUpload = useCallback((csvText: string) => {
    const parsed = Papa.parse<RawLogEntry>(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    const logs = parseRawLogs(parsed.data);
    setRawLogs(logs);
    const userData = computeUserFeatures(logs);
    setFeatureData(userData);
    setActiveModel(null);
    setExperiments([]);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading pipeline data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ─── Header ─── */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Cpu size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-zinc-100">MLOps Studio</h1>
              <p className="text-[10px] text-zinc-500">Feature Store → Experiments → Model Registry</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Database size={12} />
              <span>{rawLogs.length} events</span>
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch size={12} />
              <span>{featureData.length} users</span>
            </div>
            {activeModel && (
              <div className="flex items-center gap-1.5 text-green-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span>Model active</span>
              </div>
            )}
            <button
              onClick={() => setShowLearn(!showLearn)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                showLearn
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              <BookOpen size={12} />
              Learn
            </button>
          </div>
        </div>
      </header>

      {showLearn ? (
        <main className="max-w-[1600px] mx-auto px-6 py-6 pb-12">
          <LearnPage onBack={() => setShowLearn(false)} />
        </main>
      ) : !activePlaybook ? (
        /* ─── Playbook Selector ─── */
        <main className="max-w-[1600px] mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-zinc-100 mb-2">Choose a Playbook</h2>
            <p className="text-sm text-zinc-500">Each playbook is a complete end-to-end ML workflow with different goals, data, and techniques.</p>
          </div>
          <div className="grid grid-cols-3 gap-6 max-w-[1200px] mx-auto">
            {/* Supervised Learning */}
            <button
              onClick={() => { setActivePlaybook("supervised"); setCurrentStep("data_explorer"); }}
              className="group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <FlaskConical size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100 group-hover:text-blue-400 transition-colors">Supervised Learning</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Classification</span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-4">Predict binary outcomes from user behavior. Train on labeled data, evaluate with accuracy, precision, recall, F1.</p>
              <div className="space-y-1.5 text-[10px] text-zinc-500">
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />Data Explorer → Feature Store</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />EDA → Feature Selection</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />Logistic Regression / Decision Tree</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-blue-400" />Model Registry → Live Testing</div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-600">Use case: &quot;Is this user a power user?&quot; &quot;Will they export?&quot;</span>
              </div>
            </button>

            {/* Persona Pipeline */}
            <button
              onClick={() => { setActivePlaybook("persona"); setCurrentStep("persona_pipeline"); }}
              className="group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <Users size={20} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100 group-hover:text-purple-400 transition-colors">Persona Pipeline</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">Unsupervised / K-Means</span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-4">Discover user personas from behavioral patterns. No labels needed — the algorithm finds structure on its own.</p>
              <div className="space-y-1.5 text-[10px] text-zinc-500">
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-purple-400" />Raw Logs → Clean → Aggregate</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-purple-400" />Feature Selection + Log-Transforms</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-purple-400" />K-Means Clustering + Elbow/Silhouette</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-purple-400" />Persona → Onboarding Mapping</div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-600">Use case: &quot;Who is this user? What onboarding do they need?&quot;</span>
              </div>
            </button>

            {/* pLTV Pipeline */}
            <button
              onClick={() => setActivePlaybook("pltv")}
              className="group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                  <Swords size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors">pLTV Pipeline</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Game / MMORPG</span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mb-4">Predict player lifetime value for Lineage 2-style MMORPGs. Full end-to-end from telemetry to ad platform integration.</p>
              <div className="space-y-1.5 text-[10px] text-zinc-500">
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" />Bronze → Silver → Gold (Feature Store)</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" />6 Feature Blocks (Session/Progression/Economy/Social/Monetization/UA)</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" />GBT Model → Decile Scoring → Audiences</div>
                <div className="flex items-center gap-1.5"><ChevronRight size={10} className="text-emerald-400" />Ad Platform Push → ROAS → Closed-Loop</div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-600">Use case: &quot;Predict D60 LTV at D7 → optimize UA spend&quot;</span>
              </div>
            </button>
          </div>
        </main>
      ) : activePlaybook === "pltv" ? (
        /* ─── pLTV Pipeline ─── */
        <>
          <div className="max-w-[1600px] mx-auto px-6 pt-4">
            <button
              onClick={() => setActivePlaybook(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3 flex items-center gap-1"
            >
              ← Back to Playbook Selection
            </button>
          </div>
          <main className="max-w-[1600px] mx-auto px-6 pb-12">
            <PLTVPipeline />
          </main>
        </>
      ) : activePlaybook === "persona" ? (
        /* ─── Persona Pipeline (standalone) ─── */
        <>
          <div className="max-w-[1600px] mx-auto px-6 pt-4">
            <button
              onClick={() => setActivePlaybook(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3 flex items-center gap-1"
            >
              ← Back to Playbook Selection
            </button>
          </div>
          <main className="max-w-[1600px] mx-auto px-6 pb-12">
            <PersonaPipeline rawLogs={rawLogs} onDataUpload={handleDataUpload} />
          </main>
        </>
      ) : (
        /* ─── Supervised Learning Pipeline ─── */
        <>
      <div className="max-w-[1600px] mx-auto px-6 py-4 space-y-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => setActivePlaybook(null)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            ← Playbooks
          </button>
          <span className="text-zinc-700">|</span>
          <span className="text-xs text-zinc-400">Supervised Learning</span>
        </div>
        <StepIndicator
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          hasModel={!!activeModel}
        />
      </div>

      <main className="max-w-[1600px] mx-auto px-6 pb-12">
        {currentStep === "data_explorer" && (
          <DataExplorer
            rawLogs={rawLogs}
            featureData={featureData}
            features={features}
            onFeaturesChange={setFeatures}
            onDataUpload={handleDataUpload}
          />
        )}

        {currentStep === "eda" && (
          <ExploratoryDataDiscovery
            featureData={featureData}
            features={features}
          />
        )}

        {currentStep === "feature_training" && (
          <FeatureTraining
            featureData={featureData}
            features={features}
            experiments={experiments}
            onExperimentComplete={handleExperimentComplete}
            onModelReady={handleModelReady}
            onDeleteExperiment={handleDeleteExperiment}
          />
        )}

        {currentStep === "model_testing" && (
          <ModelTesting
            featureData={featureData}
            trainingResult={activeModel}
            experiments={experiments}
            onModelChange={handleModelReady}
          />
        )}
      </main>
        </>
      )}
    </div>
  );
}
