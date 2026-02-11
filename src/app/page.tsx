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
} from "@/lib/types";
import { parseRawLogs, computeUserFeatures, DEFAULT_FEATURES } from "@/lib/ml-engine";
import StepIndicator from "@/components/StepIndicator";
import DataExplorer from "@/components/DataExplorer";
import FeatureTraining from "@/components/FeatureTraining";
import ModelTesting from "@/components/ModelTesting";
import ExploratoryDataDiscovery from "@/components/ExploratoryDataDiscovery";
import PersonaPipeline from "@/components/PersonaPipeline";
import LearnPage from "@/components/LearnPage";
import { InfoBanner } from "@/components/InfoTooltip";
import { Database, Cpu, GitBranch, BookOpen } from "lucide-react";

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
      ) : (
        <>
      {/* ─── Pipeline Steps ─── */}
      <div className="max-w-[1600px] mx-auto px-6 py-4 space-y-3">
        <StepIndicator
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          hasModel={!!activeModel}
        />
        {/* Workflow comparison banner */}
        <InfoBanner title="Two ML Workflows — What's the difference?" variant="info">
          <div className="grid grid-cols-2 gap-4 mt-1">
            <div>
              <div className="font-semibold text-blue-400 mb-1">Experiments (Tabs 1-3): Supervised Learning</div>
              <ul className="space-y-0.5 text-zinc-500">
                <li>- You pick a <strong className="text-zinc-300">target variable</strong> with known labels (e.g. is_power_user)</li>
                <li>- The model learns from labeled examples (Logistic Regression / Decision Tree)</li>
                <li>- Output: a class prediction + probability</li>
                <li>- Evaluated with accuracy, precision, recall, F1, confusion matrix</li>
                <li>- Use case: &quot;predict any binary outcome from user behavior&quot;</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-purple-400 mb-1">Persona Pipeline (Tab 4): Unsupervised Learning</div>
              <ul className="space-y-0.5 text-zinc-500">
                <li>- <strong className="text-zinc-300">No labels needed</strong> — the algorithm discovers structure on its own</li>
                <li>- K-Means clustering groups users by behavioral similarity</li>
                <li>- Output: a persona assignment + onboarding recommendation</li>
                <li>- Evaluated with inertia, centroid profiles, cluster separation</li>
                <li>- Use case: &quot;who is this user → what onboarding to show them&quot;</li>
              </ul>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-500">
            <strong className="text-zinc-300">Key insight:</strong> ML isn&apos;t always about prediction accuracy. Sometimes the value is in <strong className="text-zinc-300">discovering structure</strong> you didn&apos;t know existed and <strong className="text-zinc-300">automating a product decision</strong> based on it.
          </div>
        </InfoBanner>
      </div>

      {/* ─── Main Content ─── */}
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
          />
        )}

        {currentStep === "persona_pipeline" && (
          <PersonaPipeline rawLogs={rawLogs} onDataUpload={handleDataUpload} />
        )}
      </main>
        </>
      )}
    </div>
  );
}
