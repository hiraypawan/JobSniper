"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { RotateCcw, Sparkles, X, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import {
  setApiKey,
  clearApiKey,
  validateApiKey,
  testApiKey,
  GEMINI_KEY_REGEX,
  OPENROUTER_KEY_REGEX,
} from "@/lib/aiPitches";
import { DEFAULT_PITCH_SETTINGS } from "@/lib/pitchSettings";
import { PitchSettings } from "@/lib/types";

interface Props {
  isOpen: boolean;
  settings: PitchSettings;
  onSave: (next: PitchSettings) => void;
  onClose: () => void;
}

type TestStatus = "idle" | "testing" | "ok" | "fail";

interface KeyTestState {
  status: TestStatus;
  message: string;
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
  const [keyErrors, setKeyErrors] = useState<{
    gemini?: string;
    openrouter?: string;
  }>({});
  const [testStatus, setTestStatus] = useState<{
    gemini?: KeyTestState;
    openrouter?: KeyTestState;
  }>({});
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

  const validateDraft = useCallback(() => {
    const next: { gemini?: string; openrouter?: string } = {};
    if (draft.geminiApiKey) {
      const result = validateApiKey("gemini", draft.geminiApiKey);
      if (!result.valid) next.gemini = result.hint;
    }
    if (draft.openrouterApiKey) {
      const result = validateApiKey("openrouter", draft.openrouterApiKey);
      if (!result.valid) next.openrouter = result.hint;
    }
    setKeyErrors(next);
    return Object.keys(next).length === 0;
  }, [draft]);

  if (!isOpen) return null;

  const handleTestKey = async (provider: "gemini" | "openrouter") => {
    const key = provider === "gemini" ? draft.geminiApiKey : draft.openrouterApiKey;
    if (!key) return;
    setTestStatus((prev) => ({ ...prev, [provider]: { status: "testing", message: "Testing key…" } }));
    const result = await testApiKey(provider, key);
    if (result.ok) {
      // Testing a provider key is a strong signal that this is the provider the
      // user intends to use for 5-Day pitches; keep the selector in sync.
      setDraft((prev) => ({ ...prev, aiProvider: provider }));
    }
    setTestStatus((prev) => ({
      ...prev,
      [provider]: {
        status: result.ok ? "ok" : "fail",
        message: result.ok
          ? `${result.message} ${provider === "openrouter" ? "OpenRouter" : "Gemini"} selected. Click Save to use it.`
          : result.message,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateDraft()) return; // block save on invalid format (AC4)
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
            Pitches are generated by AI from each company&apos;s product and available job requirements. Add a provider key below, or configure a server key. If AI generation fails, no static pitch is substituted.
          </p>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
              AI provider
            </label>
            <p className="text-[10px] text-slate-500 mb-2">
              5-Day pitches use this provider. A successful key test selects it; click Save to apply the provider and key.
            </p>
            <select
              value={draft.aiProvider || "gemini"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  aiProvider: e.target.value === "openrouter" ? "openrouter" : "gemini",
                })
              }
              className="input-field"
            >
              <option value="gemini">Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>

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
              Your capabilities or offer (optional)
            </label>
            <p className="text-[10px] text-slate-500 mb-2">
              Tell the AI what you can genuinely deliver. It will only suggest work that fits the company evidence.
            </p>
            <input
              type="text"
              inputMode="text"
              value={draft.customToolIdea}
              onChange={(e) =>
                setDraft({ ...draft, customToolIdea: e.target.value })
              }
              placeholder="e.g. TypeScript integrations, data pipelines, product engineering"
              className="input-field"
            />
          </div>

          <div>
            <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
              Verified past-work proof (optional)
            </label>
            <input
              type="text"
              inputMode="text"
              value={draft.similarCompanyProof}
              onChange={(e) =>
                setDraft({ ...draft, similarCompanyProof: e.target.value })
              }
              placeholder="Only add a client or result you can verify"
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1.5 text-xs text-slate-700 dark:text-slate-300">
                Delivery in days
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
                Preferred next step (optional)
              </label>
              <input
                type="text"
                inputMode="text"
                value={draft.demoOffer}
                onChange={(e) =>
                  setDraft({ ...draft, demoOffer: e.target.value })
                }
                placeholder="Let the AI choose a relevant ask"
                className="input-field"
              />
            </div>
          </div>

          {/* AI Keys (BYOK) */}
          <div className="pt-4 border-t border-white/10 dark:border-obsidian-800 shrink-0">
            <p className="text-xs font-medium text-slate-900 dark:text-white mb-3">
              Your own API keys
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
                      onChange={(e) => {
                        setDraft({ ...draft, geminiApiKey: e.target.value });
                        setTestStatus((prev) => ({ ...prev, gemini: undefined }));
                      }}
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
                    onClick={() => handleTestKey("gemini")}
                    disabled={!draft.geminiApiKey || testStatus.gemini?.status === "testing"}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    {testStatus.gemini?.status === "testing" ? "Testing…" : "Test"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, geminiApiKey: "" });
                      setTestStatus((prev) => {
                        const next = { ...prev };
                        delete next.gemini;
                        return next;
                      });
                      // Only the draft changes here. Storage is left alone until Save.
                    }}
                    disabled={!draft.geminiApiKey}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    Clear
                  </button>
                </div>
                {keyErrors.gemini && (
                  <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {keyErrors.gemini}
                  </p>
                )}
                {!keyErrors.gemini && draft.geminiApiKey ? (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Will be saved locally on Save ✓
                  </p>
                ) : null}
                {testStatus.gemini && (
                  <p className={`text-[10px] mt-1 flex items-center gap-1 ${
                    testStatus.gemini.status === "ok"
                      ? "text-emerald-500"
                      : testStatus.gemini.status === "fail"
                        ? "text-red-500"
                        : "text-slate-500"
                  }`}>
                    {testStatus.gemini.status === "ok" ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> {testStatus.gemini.message}
                      </>
                    ) : (
                      <>
                        {testStatus.gemini.status === "testing" ? (
                          <span className="flex items-center gap-1">Testing key…</span>
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {testStatus.gemini.message}
                      </>
                    )}
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
                  <div className="flex-1 relative">
                    <input
                      type={showOpenRouter ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      value={draft.openrouterApiKey ?? ""}
                      onChange={(e) => {
                        setDraft({ ...draft, openrouterApiKey: e.target.value });
                        setTestStatus((prev) => ({ ...prev, openrouter: undefined }));
                      }}
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
                    onClick={() => handleTestKey("openrouter")}
                    disabled={!draft.openrouterApiKey || testStatus.openrouter?.status === "testing"}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    {testStatus.openrouter?.status === "testing" ? "Testing…" : "Test"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, openrouterApiKey: "" });
                      setTestStatus((prev) => {
                        const next = { ...prev };
                        delete next.openrouter;
                        return next;
                      });
                    }}
                    disabled={!draft.openrouterApiKey}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium border border-white/10 dark:border-obsidian-800 bg-white/5 dark:bg-obsidian-900 text-slate-500 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                  >
                    Clear
                  </button>
                </div>
                {keyErrors.openrouter && (
                  <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {keyErrors.openrouter}
                  </p>
                )}
                {!keyErrors.openrouter && draft.openrouterApiKey ? (
                  <p className="text-[10px] text-emerald-500 mt-1">
                    Will be saved locally on Save ✓
                  </p>
                ) : null}
                {testStatus.openrouter && (
                  <p className={`text-[10px] mt-1 flex items-center gap-1 ${
                    testStatus.openrouter.status === "ok"
                      ? "text-emerald-500"
                      : testStatus.openrouter.status === "fail"
                        ? "text-red-500"
                        : "text-slate-500"
                  }`}>
                    {testStatus.openrouter.status === "ok" ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> {testStatus.openrouter.message}
                      </>
                    ) : (
                      <>
                        {testStatus.openrouter.status === "testing" ? (
                          <span className="flex items-center gap-1">Testing key…</span>
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {testStatus.openrouter.message}
                      </>
                    )}
                  </p>
                )}
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
