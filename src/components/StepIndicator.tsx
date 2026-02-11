"use client";

import { PipelineStep } from "@/lib/types";
import { Database, Search, FlaskConical, Play, Users } from "lucide-react";

const STEPS: { id: PipelineStep; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "data_explorer",
    label: "Data Explorer",
    icon: <Database size={18} />,
    description: "Explore raw logs & Feature Store",
  },
  {
    id: "eda",
    label: "EDA",
    icon: <Search size={18} />,
    description: "Exploratory Data Analysis",
  },
  {
    id: "feature_training",
    label: "Experiments",
    icon: <FlaskConical size={18} />,
    description: "Select features & train models",
  },
  {
    id: "model_testing",
    label: "Model Registry",
    icon: <Play size={18} />,
    description: "Test & deploy models",
  },
  {
    id: "persona_pipeline",
    label: "Persona Pipeline",
    icon: <Users size={18} />,
    description: "Discover personas → onboarding",
  },
];

interface StepIndicatorProps {
  currentStep: PipelineStep;
  onStepChange: (step: PipelineStep) => void;
  hasModel: boolean;
}

export default function StepIndicator({ currentStep, onStepChange, hasModel }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-2 border border-zinc-800">
      {STEPS.map((step, idx) => {
        const isActive = step.id === currentStep;
        const isDisabled = step.id === "model_testing" && !hasModel;

        return (
          <div key={step.id} className="flex items-center flex-1">
            <button
              onClick={() => !isDisabled && onStepChange(step.id)}
              disabled={isDisabled}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all w-full ${
                isActive
                  ? step.id === "persona_pipeline"
                    ? "bg-purple-600/20 border border-purple-500/40 text-purple-400"
                    : "bg-blue-600/20 border border-blue-500/40 text-blue-400"
                  : isDisabled
                  ? "text-zinc-600 cursor-not-allowed"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                  isActive
                    ? step.id === "persona_pipeline"
                      ? "bg-purple-600 text-white"
                      : "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-400"
                }`}
              >
                {step.icon}
              </div>
              <div className="text-left min-w-0">
                <div className="text-sm font-semibold truncate">{step.label}</div>
                <div className="text-[11px] text-zinc-500 truncate">{step.description}</div>
              </div>
            </button>
            {idx < STEPS.length - 1 && (
              <div className="w-6 h-0.5 mx-0.5 bg-zinc-700 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
