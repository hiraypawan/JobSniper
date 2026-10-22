"use client";

import React, { useEffect, useState, useRef } from "react";
import { RotateCcw, Sparkles, X, Eye, EyeOff } from "lucide-react";
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
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenRouter, setShowOpenRouter] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Sync draft when modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setDraft({ ...DEFAULT_PITCH_SETTINGS, ...settings });
    }
  }, [isOpen, settings]);

  // Body scroll lock when open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const scrollY = window.scrollY;

    document.body.style.overflow = "hidden";
    // Prevent layout shift from scrollbar disappearance
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    // iOS fix: prevent background scroll bounce
    document.documentElement.style.overscrollBehavior = "contain";

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.paddingRight = "";
      document.documentElement.style.overscrollBehavior = "";
      // Restore scroll position if we had fixed body
      if (prevPosition === "fixed") {
        window.scrollTo(0, scrollY);
      }
    };
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Autofocus first input when opened
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => firstInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Persist API keys to dedicated localStorage slots for AI features
    if (draft.geminiApiKey !== undefined) {
      if (draft.geminiApiKey) {
        setApiKey("gemini", draft.geminiApiKey);
      } else {
        clearApiKey("gemini");
      }
    }
    if (draft.openrouterApiKey !== undefined) {
      if (draft.openrouterApiKey) {
        setApiKey("openrouter", draft.openrouterApiKey);
      } else {
        clearApiKey("openrouter");
      }
    }
    onSave(draft);
    onClose();
  };

  const handleBackdropClick = () => {
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto overscroll-contain"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pitch-settings-title"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-3xl border border-white/10 dark:border-obsidian-800 bg-white dark:bg-obsidian-950 shadow-2xl overflow-hidden flex flex-col my-4 sm:my-0 max-h-[90dvh] sm:max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 dark:border-obsidian-800 shrink-0 bg-white dark:bg-obsidian-950">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <h2
              id="pitch-settings-title"
              className="text-sm font-bold text-slate-900 dark:text-white"
            >
              Customize 5-Day Build Offer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 dark:hover:bg-obsidian-800 transition-all"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0 overscroll-contain [-webkit-overflow-scrolling:touch]">
          <p className="text-xs text-slate-500 leading-relaxed">
            Leave fields blank to auto-tailor each pitch based on the startup&apos;s
            industry & open roles, or set your signature offer below.
          </p>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
              Your Name / Sign-off (for emails)
            </label>
            <input
              ref={firstInputRef}
              type="text"
              autoComplete="name"
              inputMode="text"
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
              inputMode="text"
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
              inputMode="text"
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
                inputMode="numeric"
                pattern="[0-9]*"
                min={1}
                max={14}
                value={draft.deliveryDays}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Allow empty during typing, default to 5 only on blur/submit
                  if (raw === "") {
                    setDraft({ ...draft, deliveryDays: 5 });
                    return;
                  }
                  const num = parseInt(raw, 10);
                  if (!Number.isNaN(num)) {
                    setDraft({
                      ...draft,
                      deliveryDays: Math.min(14, Math.max(1, num)),
                    });
                  }
                }}
                onBlur={(e) => {
                  const num = parseInt(e.target.value, 10);
                  if (Number.isNaN(num) || num < 1) {
                    setDraft({ ...draft, deliveryDays: 5 });
                  }
                }}
                className="input-field font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
                Low-Friction CTA Hook
              </label>
              <input
                type="text"
                inputMode="text"
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
                  <div className="flex-1 relative">
                    <input
                      type={showGemini ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={draft.geminiApiKey ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, geminiApiKey: e.target.value })
                      }
                      placeholder="AIza... Gemini key"
                      className="w-full pr-10 input-field font-mono text-xs"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowGemini((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      aria-label={showGemini ? "Hide key" : "Show key"}
                    >
                      {showGemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, geminiApiKey: "" });
                      // Don't clear storage until Save — just update draft
                    }}
                    disabled={!draft.geminiApiKey}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    Clear
                  </button>
                </div>
                {draft.geminiApiKey ? (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Will be saved locally on Save ✓
                  </p>
                ) : null}
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
                  <div className="flex-1 relative">
                    <input
                      type={showOpenRouter ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={draft.openrouterApiKey ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, openrouterApiKey: e.target.value })
                      }
                      placeholder="sk-or-... OpenRouter key"
                      className="w-full pr-10 input-field font-mono text-xs"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowOpenRouter((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      aria-label={showOpenRouter ? "Hide key" : "Show key"}
                    >
                      {showOpenRouter ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, openrouterApiKey: "" });
                    }}
                    disabled={!draft.openrouterApiKey}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    Clear
                  </button>
                </div>
                {draft.openrouterApiKey ? (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Will be saved locally on Save ✓
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 dark:bg-obsidian-950/80 border-t border-white/10 dark:border-obsidian-800 shrink-0">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_PITCH_SETTINGS)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
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
