import { useEffect, useRef, useState } from "react";
import { Send, SquarePen, Brain, Loader2 } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { MicButton } from "@/components/ui/MicButton";
import { SlowIndicator } from "@/components/ui/SlowIndicator";
import { ActionProposalCard, type ActionType } from "./ActionProposalCard";
import { useClerkExtractBannerBus } from "@/lib/clerkExtractBannerBus";
import { demarrerDictee, type DictationController } from "@/hooks/useDictation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { ApiTimeoutError } from "@/lib/apiClient";
import { createConversation, fetchLatestConversation, fetchMessages, fetchOpenProposals, insertMessage, type MessageRow } from "@/lib/chatRepo";
import { getMorningEvening, timeFr } from "@/lib/dateUtils";
import type { ChatScreenProps } from "./types";

const MOTS_IMPREVU = [
  "malade",
  "annulé",
  "annule",
  "impossible",
  "loupé",
  "loupe",
  "décalé",
  "decale",
  "pas pu",
  "empêch",
  "empech",
  "urgence",
  "imprévu",
  "imprevu",
];
const detecteImprevu = (texte: string) => MOTS_IMPREVU.some((m) => texte.toLowerCase().includes(m));

const SUGGESTIONS: Record<string, string[]> = {
  matin: ["J'ai bien dormi 🙌", "Nuit difficile 😴", "Quels sont mes RDV ?", "Motive-moi"],
  aprem: ["Ça avance bien", "Je suis bloqué sur un projet", "J'ai faim, quoi manger ?", "Besoin de focus"],
  soir: ["Bonne journée", "Journée difficile", "Sport fait ✅", "Fais mon bilan"],
};

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: string;
  actionProposal?: { id: string; actionType: ActionType; proposedFields: Record<string, unknown>; explanation: string; createdAt: string };
  retryText?: string;
  retryKey?: string;
}

function toDisplayMessage(
  row: MessageRow, 
  openProposals?: Map<string, { id: string; action_type: string; proposed_fields: Record<string, unknown>; explanation: string; created_at: string }>
): DisplayMessage {
  const proposalId = (row.metadata as Record<string, unknown> | null)?.action_proposal_id;
  const proposal = typeof proposalId === "string" ? openProposals?.get(proposalId) : undefined;
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    text: row.content,
    time: new Date(row.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    actionProposal: proposal
      ? { 
          id: proposal.id, 
          actionType: proposal.action_type as ActionType, 
          proposedFields: proposal.proposed_fields, 
          explanation: proposal.explanation, 
          createdAt: proposal.created_at 
        }
      : undefined,
  };
}

function FormattedAssistantMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 leading-relaxed text-body text-navy break-words">
      {lines.map((line, lIdx) => {
        if (!line.trim()) return <div key={lIdx} className="h-1" />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={lIdx} className="m-0">
            {parts.map((part, pIdx) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return (
                  <strong key={pIdx} className="font-extrabold text-navy">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={pIdx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

/**
 * ChatSkeleton — Sleek loading state
 */
function ChatSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col bg-bg font-ui" style={{ height: "calc(100dvh - 80px)" }} role="status" aria-label="Chargement de la conversation">
      {/* Sleek Modern Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/80 bg-white/80 px-5 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} className="shrink-0" />
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold text-sm font-black text-navy shadow-xs">
            ◈
          </div>
          <div>
            <p className="font-display text-[15px] font-extrabold text-navy">Claré</p>
            <span className="text-[11px] font-semibold text-gold">Connexion...</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock width={36} height={36} radius="xl" />
          <SkeletonBlock width={36} height={36} radius="xl" />
        </div>
      </div>

      {/* Message Bubbles Skeleton */}
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 overflow-hidden p-5">
        <div className="flex items-end justify-start gap-2.5">
          <SkeletonBlock width={32} height={32} radius="xl" />
          <div className="max-w-[75%] rounded-2xl rounded-tl-sm border border-border/80 bg-white p-4 shadow-sm">
            <SkeletonBlock width={220} height={14} radius="sm" className="mb-2" />
            <SkeletonBlock width={160} height={14} radius="sm" />
          </div>
        </div>

        <div className="flex items-end justify-end gap-2.5">
          <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-navy-800 p-4 shadow-sm">
            <SkeletonBlock width={180} height={14} radius="sm" variant="navy" />
          </div>
        </div>
      </div>

      {/* Input Skeleton */}
      <div className="border-t border-border/80 bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[900px] items-center gap-2.5">
          <SkeletonBlock width={40} height={40} radius="full" />
          <SkeletonBlock height={42} radius="xl" className="flex-1" />
          <SkeletonBlock width={40} height={40} radius="xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * ChatScreen — Lavish, conversational executive assistant interface
 */
export function ChatScreen({ userId, initialMsg = "", onBack }: ChatScreenProps) {
  const { mode } = getMorningEvening();
  const isOnline = useOnlineStatus();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [dicteeActive, setDicteeActive] = useState(false);
  const [sendError, setSendError] = useState("");
  const [brainDumpActive, setBrainDumpActive] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const { publishConfirmed } = useClerkExtractBannerBus();
  const brainDumpTextRef = useRef<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<DictationController | null>(null);
  const mountedRef = useRef(true);
  // Incremented on every mount/unmount cycle of the load-on-mount effect
  // below — lets an in-flight loadOrCreateConversation call detect it's
  // been superseded by a newer one and bail out instead of racing it.
  // Needed because React 18 StrictMode (dev only) double-invokes effects
  // (mount → cleanup → mount again) with NO cleanup function on the
  // load-on-mount effect itself, so without this guard that effect fires
  // loadOrCreateConversation TWICE concurrently — both calls set
  // loadingHistory, fetch/create a conversation, and clear loadingHistory
  // in their own `finally`, and whichever call's `finally` runs LAST wins,
  // non-deterministically. Confirmed via Playwright: this produced a
  // permanently-stuck "Connexion..." screen in dev (one call's
  // setLoadingHistory(true) winning the race against the other's
  // setLoadingHistory(false)). Not present in a production build, since
  // StrictMode's double-invoke is dev-only — but the race is real and
  // would also occur on any genuine rapid remount outside StrictMode.
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const defaultWelcome = initialMsg || "Bonjour ! Je suis Claré, votre assistant personnel d'excellence. Que souhaitez-vous organiser ou planifier aujourd'hui ?";

  const loadOrCreateConversation = async (forceNew: boolean, initial = "") => {
    const myGeneration = ++loadGenerationRef.current;
    const stillCurrent = () => mountedRef.current && loadGenerationRef.current === myGeneration;

    setLoadingHistory(true);

    // Fast timeout safety net so UI never hangs
    const timeoutTimer = setTimeout(() => {
      if (stillCurrent() && loadingHistory) {
        setConversationId((prev) => prev || `local-${userId || "user"}`);
        setMessages((prev) => prev.length ? prev : [{ id: "welcome-local", role: "assistant", text: defaultWelcome, time: timeFr() }]);
        setLoadingHistory(false);
      }
    }, 1500);

    try {
      let conv = forceNew ? null : await fetchLatestConversation(userId).catch(() => null);
      if (!conv && userId) conv = await createConversation(userId).catch(() => null);
      if (!stillCurrent()) {
        clearTimeout(timeoutTimer);
        return;
      }

      const activeConvId = conv?.id || `conv-${userId || "local"}`;
      setConversationId(activeConvId);

      const history = forceNew || !conv ? [] : await fetchMessages(conv.id).catch(() => []);
      if (!stillCurrent()) {
        clearTimeout(timeoutTimer);
        return;
      }

      if (history.length === 0) {
        const welcomeText = initial || defaultWelcome;
        if (conv) {
          // Best-effort persistence of the welcome message — it's already
          // shown locally via setMessages below regardless of whether this
          // write succeeds, so a failure isn't user-facing, but it's logged
          // rather than silently swallowed so a persistent failure is
          // still discoverable.
          insertMessage(conv.id, userId, "assistant", welcomeText).catch((err) =>
            console.error("insertMessage (welcome) failed", err)
          );
        }
        setMessages([{ id: "welcome", role: "assistant", text: welcomeText, time: timeFr() }]);
      } else {
        const proposalIds = history
          .map((m) => (m.metadata as Record<string, unknown> | null)?.action_proposal_id)
          .filter((id): id is string => typeof id === "string");
        const openProposals = await fetchOpenProposals(proposalIds).catch(() => new Map());
        if (!stillCurrent()) {
          clearTimeout(timeoutTimer);
          return;
        }
        setMessages(history.map((m) => toDisplayMessage(m, openProposals)));
      }
    } catch {
      if (stillCurrent()) {
        setConversationId(`local-${userId || "fallback"}`);
        setMessages([{ id: "fallback", role: "assistant", text: defaultWelcome, time: timeFr() }]);
      }
    } finally {
      clearTimeout(timeoutTimer);
      if (stillCurrent()) setLoadingHistory(false);
    }
  };

  useEffect(() => {
    // No cleanup needed here beyond what loadOrCreateConversation already
    // does internally via loadGenerationRef — under StrictMode's double-
    // invoke (dev only), this effect fires twice with no real unmount in
    // between; each call increments loadGenerationRef, so only the LATEST
    // call's async work is allowed to touch state, and the earlier
    // (superseded) call's in-flight fetch simply no-ops when it resolves.
    (async () => {
      await loadOrCreateConversation(false, initialMsg);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const startNewConversation = () => {
    if (loading || loadingHistory) return;
    loadOrCreateConversation(true);
  };

  useEffect(() => {
    // Don't fight a user who has deliberately scrolled up to read history
    // (spec requirement) — only auto-scroll when they're already near the
    // bottom, so a newly-arrived message keeps them pinned to "live" but
    // reading older messages is never interrupted.
    const container = scrollContainerRef.current;
    const NEAR_BOTTOM_PX = 150;
    const isNearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const toggleDictee = () => {
    if (dicteeActive) {
      recognitionRef.current?.arreter();
      return;
    }
    recognitionRef.current = demarrerDictee({
      texteInitial: input,
      onTexte: (t) => {
        setInput(t);
        if (taRef.current) {
          taRef.current.style.height = "auto";
          taRef.current.style.height = `${taRef.current.scrollHeight}px`;
        }
      },
      onEtat: setDicteeActive,
      onErreur: (m) => alert(m),
    });
  };

  const doSend = async (text: string, idempotencyKey: string = crypto.randomUUID()) => {
    if (!text.trim() || loading) return;
    const activeConvId = conversationId || `conv-${userId || "local"}`;
    setSendError("");
    if (!isOnline) {
      setSendError("Connexion internet requise pour échanger avec Claré. Votre message est conservé.");
      return;
    }
    const userMsg: DisplayMessage = { id: `local-${crypto.randomUUID()}`, role: "user", text, time: timeFr() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setSlow(false);
    if (taRef.current) taRef.current.style.height = "auto";

    if (brainDumpActive) {
      brainDumpTextRef.current.push(text);
      try {
        await insertMessage(activeConvId, userId, "user", text);
        const saved = await insertMessage(activeConvId, userId, "assistant", "Bien noté. Autre chose à ajouter ?");
        if (mountedRef.current) {
          setMessages((m) => [...m, toDisplayMessage(saved)]);
          setLoading(false);
        }
      } catch {
        if (mountedRef.current) {
          setMessages((m) => [...m, { id: `assistant-${crypto.randomUUID()}`, role: "assistant", text: "Bien noté. Autre chose à ajouter ?", time: timeFr() }]);
          setLoading(false);
        }
      }
      return;
    }

    try {
      if (detecteImprevu(text)) {
        try {
          const replan = await callEdgeFunction<{ proposal: { id: string; action_type: ActionType; proposed_fields: Record<string, unknown>; explanation: string } }>(
            "disruption-replan",
            { conversation_id: activeConvId, message: text },
            45000,
            () => setSlow(true)
          );
          const saved = await insertMessage(activeConvId, userId, "assistant", replan.proposal.explanation, {
            action_proposal_id: replan.proposal.id,
          });
          if (mountedRef.current) {
            setMessages((m) => [
              ...m,
              {
                ...toDisplayMessage(saved),
                actionProposal: {
                  id: replan.proposal.id,
                  actionType: replan.proposal.action_type,
                  proposedFields: replan.proposal.proposed_fields,
                  explanation: replan.proposal.explanation,
                  createdAt: new Date().toISOString(),
                },
              },
            ]);
            setLoading(false);
          }
          return;
        } catch {
          // Fall through
        }
      }

      const result = await callEdgeFunction<{
        reply_text: string;
        detected_action_proposal?: { action_type: ActionType; proposed_fields: Record<string, unknown>; explanation: string };
        action_proposal_id?: string | null;
      }>("chat-respond", { conversation_id: activeConvId, message: text, idempotency_key: idempotencyKey }, 45000, () => setSlow(true));

      if (!mountedRef.current) return;
      setMessages((m) => [
        ...m,
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          text: result.reply_text,
          time: timeFr(),
          actionProposal:
            result.detected_action_proposal && result.action_proposal_id
              ? {
                  id: result.action_proposal_id,
                  actionType: result.detected_action_proposal.action_type,
                  proposedFields: result.detected_action_proposal.proposed_fields,
                  explanation: result.detected_action_proposal.explanation,
                  createdAt: new Date().toISOString(),
                }
              : undefined,
        },
      ]);
    } catch (err) {
      if (mountedRef.current) {
        // chat-respond sends specific, user-safe French messages for
        // known server-side conditions (daily rate limit, no active
        // subscription) via data.error, which edgeFunctions.ts re-throws
        // as a plain Error — these must reach the user verbatim instead of
        // being collapsed into a generic "network error", which would
        // wrongly suggest retrying fixes it and hide the real reason
        // (CLA-FR — rate-limit/entitlement state must never be confused
        // with a genuine network/server failure).
        const message =
          err instanceof ApiTimeoutError
            ? "Claré met un peu plus de temps à vous répondre..."
            : err instanceof Error && err.message
            ? err.message
            : "Erreur de connexion.";
        setMessages((m) => [...m, { id: `error-${crypto.randomUUID()}`, role: "assistant", text: message, time: timeFr(), retryText: text, retryKey: idempotencyKey }]);
      }
    }
    if (mountedRef.current) setLoading(false);
  };

  const startBrainDump = () => {
    brainDumpTextRef.current = [];
    setBrainDumpActive(true);
  };

  const endBrainDump = async () => {
    setBrainDumpActive(false);
    const fullText = brainDumpTextRef.current.join("\n");
    brainDumpTextRef.current = [];
    const activeConvId = conversationId || `conv-${userId || "local"}`;
    if (!fullText.trim()) return;

    setExtracting(true);
    try {
      const { proposals } = await callEdgeFunction<{ proposals: { id: string; action_type: ActionType; proposed_fields: Record<string, unknown>; explanation: string }[] }>(
        "clerk-extract",
        { conversation_id: activeConvId, text: fullText },
        45000
      );
      if (!mountedRef.current) return;
      if (proposals.length === 0) {
        const text = "J'ai bien tout enregistré dans vos notes. Tout est parfaitement mémorisé 👍";
        const saved = await insertMessage(activeConvId, userId, "assistant", text);
        if (mountedRef.current) setMessages((m) => [...m, toDisplayMessage(saved)]);
        return;
      }
      const savedProposalMsgs = await Promise.all(
        proposals.map((p) => insertMessage(activeConvId, userId, "assistant", p.explanation, { action_proposal_id: p.id }))
      );
      if (!mountedRef.current) return;
      setMessages((m) => [
        ...m,
        ...savedProposalMsgs.map((saved, i) => ({
          ...toDisplayMessage(saved),
          actionProposal: { 
            id: proposals[i].id, 
            actionType: proposals[i].action_type, 
            proposedFields: proposals[i].proposed_fields, 
            explanation: proposals[i].explanation, 
            createdAt: new Date().toISOString() 
          },
        })),
      ]);
    } catch {
      if (mountedRef.current) {
        setMessages((m) => [...m, { id: `error-${crypto.randomUUID()}`, role: "assistant", text: "L'extraction a pris du retard — vos notes restent dans la conversation.", time: timeFr() }]);
      }
    } finally {
      if (mountedRef.current) setExtracting(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend(input);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${taRef.current.scrollHeight}px`;
    }
  };

  if (loadingHistory) {
    return <ChatSkeleton onBack={onBack} />;
  }

  return (
    <div className="flex flex-col bg-bg font-ui" style={{ height: "calc(100dvh - 80px)" }}>
      {/* 1. Sleek Modern Header Bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/80 bg-white/80 px-5 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} className="shrink-0" />
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold via-gold-500 to-gold-700 text-sm font-black text-navy shadow-gold-glow">
            ◈
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-display text-[15px] font-extrabold text-navy">Claré</p>
              <span className="h-2 w-2 rounded-full bg-green shadow-sm" />
            </div>
            <p className="text-[11px] font-semibold text-gold-text">
              ● En ligne · Mode {mode === "matin" ? "Matin" : mode === "aprem" ? "Après-midi" : "Soir"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={brainDumpActive ? endBrainDump : startBrainDump}
            disabled={loading || loadingHistory || extracting}
            aria-label={brainDumpActive ? "Terminer le vide-tête" : "Démarrer un vide-tête"}
            aria-pressed={brainDumpActive}
            title={brainDumpActive ? "Terminer le vide-tête" : "Mode Vide-tête"}
            className={`flex h-8.5 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all cursor-pointer ${
              brainDumpActive 
                ? "border border-gold bg-gold text-navy shadow-gold-glow" 
                : "border border-border bg-white text-navy hover:bg-bg-dark"
            }`}
          >
            <Brain size={14} />
            <span className="hidden sm:inline">{brainDumpActive ? "Terminer" : "Vide-tête"}</span>
          </button>

          <button
            type="button"
            onClick={startNewConversation}
            disabled={loading || loadingHistory}
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-border bg-white text-navy transition-all hover:bg-bg-dark disabled:opacity-50 cursor-pointer"
          >
            <SquarePen size={14} />
          </button>

          <MicButton active={dicteeActive} onClick={toggleDictee} size="sm" variant="light" className="rounded-xl" />
        </div>
      </div>

      {/* 2. Messages List */}
      <div ref={scrollContainerRef} className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex items-end gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-navy text-xs font-black text-gold shadow-xs">
                ◈
              </div>
            )}
            
            <div className="max-w-[85%] sm:max-w-[75%]">
              <div
                className={
                  m.role === "user"
                    ? "rounded-2xl rounded-tr-xs bg-navy p-4 text-body text-white shadow-raised"
                    : "rounded-2xl rounded-tl-xs border border-border/80 bg-white p-4.5 text-body text-navy shadow-[0_2px_12px_rgba(26,31,60,0.04)]"
                }
              >
                {m.role === "assistant" ? (
                  <FormattedAssistantMessage text={m.text} />
                ) : (
                  <p className="m-0 leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                )}
              </div>

              <p className={`mt-1 text-[10px] font-semibold text-meta ${m.role === "user" ? "text-right" : "text-left"}`}>
                {m.time}
              </p>

              {m.retryText && (
                <button
                  type="button"
                  onClick={() => doSend(m.retryText!, m.retryKey)}
                  disabled={loading}
                  className="mt-1 text-xs font-bold text-gold-text underline underline-offset-2 hover:text-navy cursor-pointer"
                >
                  Réessayer l'envoi
                </button>
              )}

              {m.actionProposal && (
                <div className="mt-3">
                  <ActionProposalCard
                    proposalId={m.actionProposal.id}
                    actionType={m.actionProposal.actionType}
                    proposedFields={m.actionProposal.proposedFields}
                    explanation={m.actionProposal.explanation}
                    createdAt={m.actionProposal.createdAt}
                    status="proposed"
                    onResolved={(status) => {
                      if (status === "confirmed" && m.actionProposal) {
                        publishConfirmed({
                          id: m.actionProposal.id,
                          action_type: m.actionProposal.actionType,
                          proposed_fields: m.actionProposal.proposedFields,
                          explanation: m.actionProposal.explanation,
                        });
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing State */}
        {loading && (
          <div className="flex items-end gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-navy text-xs font-black text-gold shadow-xs">
              ◈
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-xs border border-gold/30 bg-gradient-to-r from-gold-soft/50 to-white px-4 py-3 shadow-xs">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 animate-[chat-dot_1.2s_ease-in-out_infinite] rounded-full bg-gold"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
                <span className="ml-2 text-xs font-semibold text-gold-text">Claré réfléchit...</span>
              </div>
              {slow && <SlowIndicator label="Claré met un peu plus de temps que d'habitude..." className="ml-2" />}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 3. Bottom Input Bar & Quick Suggestions */}
      <div className="border-t border-border/80 bg-white/95 px-4 pb-6 pt-3 shadow-[0_-4px_20px_rgba(26,31,60,0.03)] backdrop-blur-xl">
        <div className="mx-auto max-w-[900px]">
          
          {/* Suggestion Chips */}
          {messages.length <= 1 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {SUGGESTIONS[mode].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => doSend(s)}
                  disabled={loading}
                  className="shrink-0 whitespace-nowrap rounded-full border border-gold/30 bg-gold-soft/60 px-3.5 py-1.5 text-xs font-bold text-gold-text transition-all hover:border-gold hover:bg-gold-soft hover:shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Brain Dump Status Banner */}
          {brainDumpActive && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-soft p-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-gold-text shrink-0" />
                <p className="m-0 text-xs font-bold text-gold-text">
                  Mode Vide-tête actif : Exprimez tout librement, Claré enregistre tout en continu.
                </p>
              </div>
              <button
                type="button"
                onClick={endBrainDump}
                disabled={extracting}
                className="shrink-0 rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-navy-800 cursor-pointer"
              >
                Terminer le débrief
              </button>
            </div>
          )}

          {extracting && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-gold/40 bg-gold-soft p-3 shadow-xs">
              <Loader2 size={16} className="animate-spin text-gold-text" />
              <p className="m-0 text-xs font-bold text-gold-text">
                Claré analyse et structure vos notes en actions concrètes...
              </p>
            </div>
          )}

          {dicteeActive && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-red/30 bg-red-soft p-3 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-ping rounded-full bg-red" />
                <p className="m-0 text-xs font-bold text-red-text">Dictée vocale active... Parlez naturellement.</p>
              </div>
              <button
                type="button"
                onClick={toggleDictee}
                aria-label="Arrêter la dictée"
                className="text-xs font-bold text-red-text hover:underline cursor-pointer"
              >
                Arrêter
              </button>
            </div>
          )}

          {sendError && (
            <p className="mb-2 text-xs font-bold text-red-text">{sendError}</p>
          )}

          {/* Input Box */}
          <div className="flex items-end gap-2.5">
            <MicButton active={dicteeActive} onClick={toggleDictee} />
            <textarea
              ref={taRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              placeholder={dicteeActive ? "Écoute en cours..." : "Écrivez ou dictez votre message à Claré..."}
              aria-label="Message pour Claré"
              rows={1}
              className={`max-h-[120px] flex-1 resize-none overflow-y-auto rounded-2xl border bg-bg/50 px-4 py-3 font-ui text-[15px] text-text placeholder:text-text-muted outline-none transition-all ${
                dicteeActive 
                  ? "border-red" 
                  : input 
                  ? "border-navy bg-white shadow-xs" 
                  : "border-border focus:border-navy focus:bg-white"
              }`}
            />
            <button
              type="button"
              onClick={() => doSend(input)}
              disabled={!input.trim() || loading}
              aria-label="Envoyer le message"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all duration-200 ${
                input.trim() && !loading 
                  ? "cursor-pointer bg-navy text-gold shadow-raised hover:bg-navy-800 hover:shadow-floating hover:scale-105" 
                  : "cursor-not-allowed bg-bg-dark text-text-muted"
              }`}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
