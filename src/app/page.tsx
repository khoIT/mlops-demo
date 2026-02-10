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
import PersonaPipeline from "@/components/PersonaPipeline";
import { Database, Cpu, GitBranch } from "lucide-react";

export default function Home() {
  const [currentStep, setCurrentStep] = useState<PipelineStep>("data_explorer");
  const [rawLogs, setRawLogs] = useState<RawLogEntry[]>([]);
  const [featureData, setFeatureData] = useState<UserFeatureRow[]>([]);
  const [features, setFeatures] = useState<FeatureDefinition[]>(DEFAULT_FEATURES);
  const [experiments, setExperiments] = useState<ExperimentRun[]>([]);
  const [activeModel, setActiveModel] = useState<TrainingResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          </div>
        </div>
      </header>

      {/* ─── Pipeline Steps ─── */}
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <StepIndicator
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          hasModel={!!activeModel}
        />
      </div>

      {/* ─── Main Content ─── */}
      <main className="max-w-[1600px] mx-auto px-6 pb-12">
        {currentStep === "data_explorer" && (
          <DataExplorer
            rawLogs={rawLogs}
            featureData={featureData}
            features={features}
            onFeaturesChange={setFeatures}
          />
        )}

        {currentStep === "feature_training" && (
          <FeatureTraining
            featureData={featureData}
            features={features}
            experiments={experiments}
            onExperimentComplete={handleExperimentComplete}
            onModelReady={handleModelReady}
          />
        )}

        {currentStep === "model_testing" && (
          <ModelTesting
            featureData={featureData}
            trainingResult={activeModel}
          />
        )}

        {currentStep === "persona_pipeline" && (
          <PersonaPipeline rawLogs={rawLogs} />
        )}
      </main>
    </div>
  );
}
