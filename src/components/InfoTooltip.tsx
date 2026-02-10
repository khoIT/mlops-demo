"use client";

import { useState, useRef, useEffect } from "react";
import { Info, AlertTriangle, Lightbulb } from "lucide-react";

type TooltipVariant = "info" | "warning" | "tip";

interface InfoTooltipProps {
  title: string;
  content: string | React.ReactNode;
  variant?: TooltipVariant;
  wide?: boolean;
}

const VARIANT_STYLES: Record<TooltipVariant, { icon: React.ReactNode; border: string; bg: string; titleColor: string }> = {
  info: {
    icon: <Info size={12} />,
    border: "border-blue-500/30",
    bg: "bg-zinc-950",
    titleColor: "text-blue-400",
  },
  warning: {
    icon: <AlertTriangle size={12} />,
    border: "border-amber-500/30",
    bg: "bg-zinc-950",
    titleColor: "text-amber-400",
  },
  tip: {
    icon: <Lightbulb size={12} />,
    border: "border-green-500/30",
    bg: "bg-zinc-950",
    titleColor: "text-green-400",
  },
};

export default function InfoTooltip({ title, content, variant = "info", wide = false }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const style = VARIANT_STYLES[variant];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full transition-all hover:scale-110 ${
          variant === "info"
            ? "text-blue-500/60 hover:text-blue-400 hover:bg-blue-500/10"
            : variant === "warning"
            ? "text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10"
            : "text-green-500/60 hover:text-green-400 hover:bg-green-500/10"
        }`}
      >
        {style.icon}
      </button>
      {isOpen && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 ${wide ? "w-80" : "w-64"} rounded-lg border ${style.border} ${style.bg} shadow-xl shadow-black/50 p-3`}
        >
          <div className={`text-xs font-semibold ${style.titleColor} mb-1.5 flex items-center gap-1.5`}>
            {style.icon}
            {title}
          </div>
          <div className="text-[11px] text-zinc-400 leading-relaxed">{content}</div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rotate-45 border-r border-b border-zinc-700 bg-zinc-950" />
        </div>
      )}
    </span>
  );
}

export function InfoBanner({
  title,
  children,
  variant = "info",
}: {
  title: string;
  children: React.ReactNode;
  variant?: TooltipVariant;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const style = VARIANT_STYLES[variant];

  return (
    <div
      className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold ${style.titleColor} hover:bg-zinc-900/50 transition-colors`}
      >
        {style.icon}
        {title}
        <span className="ml-auto text-zinc-600 text-[10px]">{collapsed ? "show" : "hide"}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 text-[11px] text-zinc-400 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
