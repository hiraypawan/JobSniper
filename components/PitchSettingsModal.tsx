"use client";

import React, { useState } from "react";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { DEFAULT_PITCH_SETTINGS } from "@/lib/pitchTemplates";
import { PitchSettings } from "@/lib/types";
import { setApiKey, clearApiKey } from "@/lib/aiPitches";

interface Props {
  isOpen: boolean;
  settings: PitchSettings;
  onSave: (next: PitchSettings) => void;
  onClose: () => void;
}

export function PitchSettingsModal({
  isOpen,
  settings,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<PitchSettings>(settings);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.geminiApiKey) {
      setApiKey("gemini", draft.geminiApiKey);
    }
    if (draft.openrouterApiKey) {
      setApiKey("openrouter", draft.openrouterApiKey);
    }
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-obsidian-900 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold">
              Customize Your Global 5-Day Build Offer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            Leave fields blank to let StartupSniper{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              auto-tailor the micro-tool idea
            </strong>{" "}
            based on each startup&apos;s open engineering/growth roles &amp; industry,
            or set your signature offer once below.
          </p>

          <div>
            <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
              Your Name / Sign-off (for emails)
            </label>
            <input
              type="text"
              value={draft.senderName}
              onChange={(e) =>
                setDraft({ ...draft, senderName: e.target.value })
              }
              placeholder="e.g. Pawan"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
              Custom [tool idea] Override (blank = smart role-aware auto-detect)
            </label>
            <input
              type="text"
              value={draft.customToolIdea}
              onChange={(e) =>
                setDraft({ ...draft, customToolIdea: e.target.value })
              }
              placeholder="e.g. AI onboarding agent / interactive ROI calculator"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
              [similar company] Proof Anchor
            </label>
            <input
              type="text"
              value={draft.similarCompanyProof}
              onChange={(e) =>
                setDraft({ ...draft, similarCompanyProof: e.target.value })
              }
              placeholder="e.g. a W26 B2B seed startup"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                Delivery Turnaround (Days)
              </label>
              <input
                type="number"
                min={1}
                max={14}
                value={draft.deliveryDays}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    deliveryDays: Number(e.target.value) || 5,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                Low-Friction CTA Hook
              </label>
              <input
                type="text"
                value={draft.demoOffer}
                onChange={(e) =>
                  setDraft({ ...draft, demoOffer: e.target.value })
                }
                placeholder="45 sec Loom demo"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </div>

        {/* Gemini API Key (BYOK) */}
        <div>
          <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span>🔑</span>
            Gemini API Key (Bring Your Own Key)
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Stored in your browser only. Never sent to any server. Used solely
            for generating AI pitches.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={draft.geminiApiKey ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, geminiApiKey: e.target.value })
              }
              placeholder="sk-... your Gemini API key"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => {
                setDraft({ ...draft, geminiApiKey: "" });
                clearApiKey("gemini");
              }}
              className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
              disabled={!draft.geminiApiKey}
            >
              Clear
            </button>
          </div>
          {draft.geminiApiKey ? (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
              Key saved locally ✓
            </p>
          ) : null}
        </div>

        {/* OpenRouter API Key (BYOK) */}
        <div>
          <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span>🔑</span>
            OpenRouter API Key (Bring Your Own Key)
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Access 100+ models (Gemini, Claude, GPT, Llama). Stored in your
            browser only. Never sent to any server.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={draft.openrouterApiKey ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, openrouterApiKey: e.target.value })
              }
              placeholder="sk-or-... your OpenRouter API key"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => {
                setDraft({ ...draft, openrouterApiKey: "" });
                clearApiKey("openrouter");
              }}
              className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
              disabled={!draft.openrouterApiKey}
            >
              Clear
            </button>
          </div>
          {draft.openrouterApiKey ? (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
              Key saved locally ✓
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_PITCH_SETTINGS)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Auto-Smart
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-obsidian-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition"
            >
              Save Offer Defaults
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
