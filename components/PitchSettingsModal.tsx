"use client";

import React, { useState } from "react";
import { RotateCcw, Sparkles, X } from "lucide-react";
import { setApiKey, clearApiKey } from "@/lib/aiPitches";
import { DEFAULT_PITCH_SETTINGS } from "@/lib/pitchTemplates";
import { PitchSettings } from "@/lib/types";

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
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => {
          e.stopPropagation();
          handleSubmit(e);
        }}
        className="w-full max-w-lg rounded-3xl border border-white/10 dark:border-obsidian-800 bg-white dark:bg-obsidian-950 shadow-2xl overflow-y-auto max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 dark:border-obsidian-800 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Customize 5-Day Build Offer
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          <p className="text-xs text-slate-500 leading-relaxed">
            Leave fields blank to auto-tailor each pitch based on the startup&apos;s
            industry & open roles, or set your signature offer below.
          </p>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
              Your Name / Sign-off (for emails)
            </label>
            <input
              type="text"
              value={draft.senderName}
              onChange={(e) =>
                setDraft({ ...draft, senderName: e.target.value })
              }
              placeholder="e.g. Pawan"
              className="input-field"
            />
          </div>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
              Custom Tool Idea Override
            </label>
            <p className="text-[10px] text-slate-500 mb-2">
              Blank = smart auto-detect based on each startup&apos;s industry
            </p>
            <input
              type="text"
              value={draft.customToolIdea}
              onChange={(e) =>
                setDraft({ ...draft, customToolIdea: e.target.value })
              }
              placeholder="e.g. AI onboarding agent / ROI calculator"
              className="input-field"
            />
          </div>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
              Proof Anchor (Similar Company)
            </label>
            <input
              type="text"
              value={draft.similarCompanyProof}
              onChange={(e) =>
                setDraft({ ...draft, similarCompanyProof: e.target.value })
              }
              placeholder="e.g. a YC W26 seed startup"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
                Delivery (Days)
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
                className="input-field font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
                Low-Friction CTA Hook
              </label>
              <input
                type="text"
                value={draft.demoOffer}
                onChange={(e) =>
                  setDraft({ ...draft, demoOffer: e.target.value })
                }
                placeholder="45 sec Loom demo"
                className="input-field"
              />
            </div>
          </div>

          {/* AI Keys (BYOK) */}
          <div className="pt-4 border-t border-white/10 dark:border-obsidian-800 shrink-0">
            <p className="text-xs font-medium text-slate-900 dark:text-white mb-3">
              AI Provider Keys (Bring Your Own Key)
            </p>

            <div className="space-y-3">
              <div>
                <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span>🔑</span>
                  Gemini API Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={draft.geminiApiKey ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, geminiApiKey: e.target.value })
                    }
                    placeholder="sk-... Gemini key"
                    className="flex-1 input-field font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft({ ...draft, geminiApiKey: "" });
                      clearApiKey("gemini");
                    }}
                    disabled={!draft.geminiApiKey}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    Clear
                  </button>
                </div>
                {draft.geminiApiKey && (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Saved locally ✓
                  </p>
                )}
              </div>

              <div>
                <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <span>🔑</span>
                  OpenRouter API Key
                </label>
                <p className="text-[10px] text-slate-500 mb-2">
                  Access Gemini, Claude, GPT, Llama models
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={draft.openrouterApiKey ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, openrouterApiKey: e.target.value })
                    }
                    placeholder="sk-or-... OpenRouter key"
                    className="flex-1 input-field font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft({ ...draft, openrouterApiKey: "" });
                      clearApiKey("openrouter");
                    }}
                    disabled={!draft.openrouterApiKey}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    Clear
                  </button>
                </div>
                {draft.openrouterApiKey && (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Saved locally ✓
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-obsidian-950/80 border-t border-white/10 dark:border-obsidian-800 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(DEFAULT_PITCH_SETTINGS);
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white dark:bg-obsidian-900 text-slate-500 hover:bg-white/10 dark:hover:bg-obsidian-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
