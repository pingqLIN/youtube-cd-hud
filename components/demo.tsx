"use client"

import React, { useState } from "react"
import { ShaderBackground } from "@/components/ui/mesh-drift-shader"
import { Mic, Search, Sparkles } from "lucide-react"

export default function ShaderBackgroundDemo() {
  const [preset, setPreset] = useState<"optionA" | "default">("optionA")
  const [query, setQuery] = useState("")

  return (
    <div className="relative h-screen w-full overflow-hidden select-none bg-slate-950 font-sans">
      {/* Dynamic Mesh Drift WebGL Shader Background */}
      <ShaderBackground 
        className="absolute inset-0 h-full w-full" 
        preset={preset} 
        cursorEnabled={true}
      />

      {/* Preset Switcher Badge (Top Right) */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-md px-3 py-1.5 shadow-md border border-white/40 text-xs text-slate-700">
        <Sparkles className="w-3.5 h-3.5 text-orange-500" />
        <span className="font-medium">樣式切換:</span>
        <button
          onClick={() => setPreset("optionA")}
          className={`px-2.5 py-0.5 rounded-full transition-all text-xs font-semibold ${
            preset === "optionA"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          選項 A (日出晨曦暖陽)
        </button>
        <button
          onClick={() => setPreset("default")}
          className={`px-2.5 py-0.5 rounded-full transition-all text-xs font-semibold ${
            preset === "default"
              ? "bg-cyan-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          預設 (深藍青色)
        </button>
      </div>

      {/* Centered Floating Interaction Pill (Option A Style) */}
      <div className="relative z-10 flex h-full w-full items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="group relative flex items-center justify-between rounded-full bg-white/95 px-5 py-3.5 shadow-xl shadow-orange-950/5 ring-1 ring-black/5 backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] focus-within:ring-2 focus-within:ring-orange-400">
            <div className="flex flex-1 items-center gap-3">
              <Search className="h-4 w-4 text-slate-400 group-hover:text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything..."
                className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
              />
            </div>

            {/* Microphone button */}
            <button
              type="button"
              aria-label="Voice input"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white transition-transform hover:scale-105 active:scale-95"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>

          {/* Subtitle description */}
          <div className="mt-4 text-center">
            <p className="text-xs font-medium text-slate-600/80 drop-shadow-sm">
              背景設計選擇 A · 流動漸層與 WebGL 幾何微光效果
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
