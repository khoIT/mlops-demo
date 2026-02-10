"use client";

import { useRef, useState } from "react";
import { Upload, FileUp, CheckCircle2, AlertTriangle, X } from "lucide-react";

interface CsvUploadProps {
  onUpload: (csvText: string) => void;
  currentRowCount: number;
}

export default function CsvUpload({ onUpload, currentRowCount }: CsvUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [uploadInfo, setUploadInfo] = useState<string>("");

  const processFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadStatus("error");
      setUploadInfo("Please upload a .csv file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setUploadStatus("error");
        setUploadInfo("File is empty");
        return;
      }

      const firstLine = text.split("\n")[0]?.toLowerCase() || "";
      const requiredCols = ["resource_type", "resource_name", "user_id", "timestamp"];
      const hasRequired = requiredCols.every((col) => firstLine.includes(col));

      if (!hasRequired) {
        setUploadStatus("error");
        setUploadInfo(
          `Missing required columns. Expected: ${requiredCols.join(", ")}. Got: ${firstLine.substring(0, 100)}...`
        );
        return;
      }

      const rowCount = text.split("\n").filter((l) => l.trim()).length - 1;
      onUpload(text);
      setUploadStatus("success");
      setUploadInfo(`Loaded ${rowCount.toLocaleString()} rows from ${file.name}`);
    };
    reader.onerror = () => {
      setUploadStatus("error");
      setUploadInfo("Failed to read file");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-blue-500 bg-blue-500/10"
            : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/30"
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDragging ? "bg-blue-500/20" : "bg-zinc-800"}`}>
            {isDragging ? (
              <FileUp size={20} className="text-blue-400" />
            ) : (
              <Upload size={20} className="text-zinc-500" />
            )}
          </div>
          <div>
            <p className="text-sm text-zinc-300 font-medium">
              {isDragging ? "Drop CSV here" : "Upload a larger dataset"}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Drop a .csv file or click to browse. Must have columns: resource_type, resource_name, user_id, timestamp
            </p>
          </div>
          <div className="text-[10px] text-zinc-600">
            Currently loaded: {currentRowCount.toLocaleString()} events
          </div>
        </div>
      </div>

      {uploadStatus !== "idle" && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            uploadStatus === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {uploadStatus === "success" ? (
            <CheckCircle2 size={14} />
          ) : (
            <AlertTriangle size={14} />
          )}
          <span className="flex-1">{uploadInfo}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setUploadStatus("idle");
              setUploadInfo("");
            }}
            className="hover:text-zinc-200"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
