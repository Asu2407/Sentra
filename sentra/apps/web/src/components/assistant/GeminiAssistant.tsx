import { useEffect, useRef, useState } from "react";
import type { ChaosState } from "../ChaosField.tsx";
import { Composer, type ComposerState } from "./Composer.tsx";
import {
  Conversation,
  type ConversationEntry,
  type InboxItemView,
  type ToolCallItem,
} from "./Conversation.tsx";
import {
  EmailLetter,
  type EmailLetterModel,
  type EmailScanData,
} from "./EmailLetter.tsx";
import { QuickChips } from "./QuickChips.tsx";
import "./assistant.css";

const FISHY_SAMPLE = {
  sender: "hr@internship-secure-portal.xyz",
  subject: "Urgent: Internship confirmation - act within 2 hours",
  body: "Act within 2 hours to confirm your spot. Reply with your national ID scan and registration fee.",
  visible_link: "https://portal.university.edu/confirm",
  actual_link: "http://internship-secure-portal.xyz/steal",
};

interface SpeechRecLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop?: () => void;
}

export function GeminiAssistant({
  csrf,
  quarantineCount = 0,
  onChaosChange,
  onMailScanChange,
  onActionComplete,
}: {
  csrf: string;
  quarantineCount?: number;
  onChaosChange?: (state: ChaosState, opts?: { dropWarn?: boolean }) => void;
  onMailScanChange?: (scanning: boolean) => void;
  onActionComplete: () => Promise<void> | void;
}) {
  const [composerState, setComposerState] = useState<ComposerState>("idle");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [letter, setLetter] = useState<EmailLetterModel | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const sortedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micCleanupRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scanRunIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const onVis = () => {
      document.body.classList.toggle("doc-hidden", document.hidden);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      document.body.classList.remove("doc-hidden");
      abortRef.current?.abort();
      micCleanupRef.current?.();
      if (sortedTimerRef.current) clearTimeout(sortedTimerRef.current);
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function scheduleSortedToIdle(dropWarn: boolean) {
    if (sortedTimerRef.current) clearTimeout(sortedTimerRef.current);
    onChaosChange?.("sorted", { dropWarn });
    sortedTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        onChaosChange?.("idle", { dropWarn: false });
      }
    }, 2000);
  }

  function stopVoicePlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (mountedRef.current) setPlayingId(null);
  }

  async function playVoice(id: string, text: string) {
    stopVoicePlayback();
    if (!mountedRef.current) return;
    setPlayingId(id);

    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({ text }),
        signal: abortRef.current?.signal,
      });
      if (r.ok && mountedRef.current) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        await new Promise<void>((resolve) => {
          audio.addEventListener("ended", () => {
            URL.revokeObjectURL(url);
            resolve();
          });
          audio.addEventListener("error", () => {
            URL.revokeObjectURL(url);
            resolve();
          });
          audio.play().catch(() => resolve());
        });
        if (mountedRef.current) setPlayingId(null);
        return;
      }
    } catch {
      // Fall back to Web Speech API
    }

    if (!mountedRef.current) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.onend = () => {
        if (mountedRef.current) setPlayingId(null);
      };
      utter.onerror = () => {
        if (mountedRef.current) setPlayingId(null);
      };
      window.speechSynthesis.speak(utter);
      setTimeout(() => {
        if (mountedRef.current) setPlayingId((cur) => (cur === id ? null : cur));
      }, 4500);
      return;
    }
    setPlayingId(null);
  }

  async function sendGeminiPrompt(promptText: string) {
    const clean = promptText.trim();
    if (!clean || inFlightRef.current || composerState === "thinking") return;

    inFlightRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (sortedTimerRef.current) clearTimeout(sortedTimerRef.current);
    setInput("");
    setError("");
    setComposerState("thinking");
    onChaosChange?.("thinking", { dropWarn: false });

    const userId = `u-${Date.now()}`;
    setEntries((prev) => [...prev, { id: userId, who: "YOU", text: clean }]);

    try {
      const r = await fetch("/api/agent/ask", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({ prompt: clean }),
        signal: ac.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (!mountedRef.current) return;

      if (!r.ok) {
        const msg = String(j.detail || "Gemini request failed");
        setError(msg);
        setAnnouncement(msg);
        setComposerState("idle");
        onChaosChange?.("idle", { dropWarn: false });
        return;
      }

      const replyText = String(j.reply || "");
      const calls: ToolCallItem[] = Array.isArray(j.tool_calls) ? j.tool_calls : [];

      let hadQuarantine = false;
      const scanCall = calls.find((c) => c.name === "scan_email");
      if (scanCall?.result && typeof scanCall.result === "object") {
        const sr = scanCall.result as unknown as EmailScanData;
        const isQuar = sr.risk_level === "LIKELY_SCAM" || sr.risk_level === "SUSPICIOUS";
        hadQuarantine = isQuar;
        setLetter({
          id: `let-${Date.now()}`,
          sender: sr.sender || "",
          subject: sr.subject || "",
          body: sr.plain_warning || "",
          scanning: false,
          scan: sr,
          quarantined: isQuar,
          quarantineId: null,
        });
      }

      const sumCall = calls.find((c) => c.name === "summarize_inbox");
      let inboxItems: InboxItemView[] | undefined;
      if (sumCall?.result && typeof sumCall.result === "object") {
        const sumRes = sumCall.result as {
          items?: Array<InboxItemView & { body?: string; plain_warning?: string; flags?: string[]; spoken_summary?: string; action_recommended?: string }>;
          quarantined_ids?: string[];
        };
        inboxItems = sumRes.items;
        const qIds = Array.isArray(sumRes.quarantined_ids) ? sumRes.quarantined_ids : [];
        if (qIds.length > 0) hadQuarantine = true;
        const top = sumRes.items?.find((it) => it.risk_level === "LIKELY_SCAM") ?? sumRes.items?.[0];
        if (top) {
          setLetter({
            id: `let-${Date.now()}`,
            sender: top.sender,
            subject: top.subject,
            body: top.body || top.tldr || top.plain_warning || "",
            scanning: false,
            scan: {
              sender: top.sender,
              subject: top.subject,
              risk_level: top.risk_level,
              flags: top.flags ?? [],
              plain_warning: top.plain_warning ?? top.tldr,
              spoken_summary: top.spoken_summary ?? top.tldr,
              action_recommended: top.action_recommended ?? "OPEN_SAFELY",
            },
            quarantined: top.risk_level === "LIKELY_SCAM",
            quarantineId: top.risk_level === "LIKELY_SCAM" ? top.id : null,
          });
        }
      }

      setEntries((prev) => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          who: "GEMINI",
          text: replyText,
          toolCalls: calls,
          inboxItems,
          playableText: replyText,
        },
      ]);
      setComposerState("idle");
      setAnnouncement(replyText ? `Reply received: ${replyText}` : "Reply received.");
      scheduleSortedToIdle(hadQuarantine);
      await onActionComplete();
    } catch (err) {
      if (!mountedRef.current || (err instanceof Error && err.name === "AbortError")) return;
      const msg = "Network error reaching Gemini.";
      setError(msg);
      setAnnouncement(msg);
      setComposerState("idle");
      onChaosChange?.("idle", { dropWarn: false });
    } finally {
      inFlightRef.current = false;
    }
  }

  async function runInboxSummarize() {
    if (inFlightRef.current || composerState === "thinking") return;
    inFlightRef.current = true;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (sortedTimerRef.current) clearTimeout(sortedTimerRef.current);
    setError("");
    setComposerState("thinking");
    onMailScanChange?.(true);
    onChaosChange?.("thinking", { dropWarn: false });
    setAnnouncement("Scan started.");

    setEntries((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, who: "YOU", text: "Scan my inbox" },
    ]);

    try {
      const r = await fetch("/api/inbox/summarize", {
        method: "POST",
        credentials: "include",
        headers: { "X-Sentra-CSRF": csrf },
        signal: ac.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (!mountedRef.current) return;

      if (!r.ok) {
        const msg = String(j.detail || "Inbox scan failed");
        setError(msg);
        setAnnouncement(msg);
        onMailScanChange?.(false);
        setComposerState("idle");
        onChaosChange?.("idle", { dropWarn: false });
        return;
      }

      const items = Array.isArray(j.items) ? j.items : [];
      const qIds = Array.isArray(j.quarantined_ids) ? j.quarantined_ids : [];
      const hadQuarantine = qIds.length > 0;
      const top = items.find((it: { risk_level: string }) => it.risk_level === "LIKELY_SCAM") ?? items[0];
      if (top) {
        setLetter({
          id: `sum-${Date.now()}`,
          sender: top.sender,
          subject: top.subject,
          body: top.body || top.tldr || top.plain_warning || "",
          scanning: false,
          scan: top,
          quarantined: top.risk_level === "LIKELY_SCAM",
          quarantineId: top.risk_level === "LIKELY_SCAM" ? top.id : null,
        });
      }

      setEntries((prev) => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          who: "GEMINI",
          text: String(j.digest || "Inbox scan complete."),
          toolCalls: [{ name: "summarize_inbox", result: j }],
          inboxItems: items,
          inboxSource: j.source,
          playableText: String(j.digest || "Inbox scan complete."),
        },
      ]);
      setComposerState("idle");
      onMailScanChange?.(false);
      setAnnouncement(String(j.digest || "Inbox scan complete."));
      scheduleSortedToIdle(hadQuarantine);
      await onActionComplete();
    } catch (err) {
      if (!mountedRef.current || (err instanceof Error && err.name === "AbortError")) return;
      const msg = "Network error scanning inbox.";
      setError(msg);
      setAnnouncement(msg);
      onMailScanChange?.(false);
      setComposerState("idle");
      onChaosChange?.("idle", { dropWarn: false });
    } finally {
      inFlightRef.current = false;
    }
  }

  async function runSampleEmailScan() {
    if (inFlightRef.current || composerState === "thinking") return;
    inFlightRef.current = true;
    const runId = ++scanRunIdRef.current;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (sortedTimerRef.current) clearTimeout(sortedTimerRef.current);
    setError("");
    setComposerState("thinking");
    onMailScanChange?.(true);
    onChaosChange?.("thinking", { dropWarn: false });
    setAnnouncement("Scan started.");

    const letterId = `sample-${runId}`;
    setEntries((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, who: "YOU", text: "Try a sample email" },
    ]);
    setLetter({
      id: letterId,
      sender: FISHY_SAMPLE.sender,
      subject: FISHY_SAMPLE.subject,
      body: FISHY_SAMPLE.body,
      scanning: true,
      scan: null,
      quarantined: false,
      quarantineId: null,
    });

    try {
      const r = await fetch("/api/inbox/ingest", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify(FISHY_SAMPLE),
        signal: ac.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (!mountedRef.current || scanRunIdRef.current !== runId) return;

      if (!r.ok) {
        const msg = String(j.detail || "Email scan failed");
        setError(msg);
        setAnnouncement(msg);
        setLetter((cur) => (cur ? { ...cur, scanning: false } : null));
        onMailScanChange?.(false);
        setComposerState("idle");
        onChaosChange?.("idle", { dropWarn: false });
        return;
      }

      const scan: EmailScanData | null = j.scan ?? null;
      const wasQuarantined = Boolean(j.quarantined);
      setLetter({
        id: letterId,
        sender: FISHY_SAMPLE.sender,
        subject: FISHY_SAMPLE.subject,
        body: FISHY_SAMPLE.body,
        scanning: false,
        scan,
        quarantined: wasQuarantined,
        quarantineId: j.quarantine_id ?? null,
      });

      const flagsCount = scan?.flags?.length ?? 0;
      setAnnouncement(
        wasQuarantined
          ? `Flags found: ${flagsCount}. Quarantined.`
          : `Scan complete: ${scan?.risk_level ?? "SAFE"}.`
      );
      if (!wasQuarantined && scan) {
        setEntries((prev) => [
          ...prev,
          {
            id: `g-safe-${Date.now()}`,
            who: "GEMINI",
            text: `This email looks safe (${scan.risk_level}). ${scan.plain_warning}`,
            playableText: scan.spoken_summary,
          },
        ]);
      }

      setComposerState("idle");
      onMailScanChange?.(false);
      scheduleSortedToIdle(wasQuarantined);
      await onActionComplete();
    } catch (err) {
      if (!mountedRef.current || (err instanceof Error && err.name === "AbortError")) return;
      const msg = "Network error scanning email.";
      setError(msg);
      setAnnouncement(msg);
      setLetter((cur) => (cur ? { ...cur, scanning: false } : null));
      onMailScanChange?.(false);
      setComposerState("idle");
      onChaosChange?.("idle", { dropWarn: false });
    } finally {
      inFlightRef.current = false;
    }
  }

  async function startMicStream() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      setMicAnalyser(analyser);
      micCleanupRef.current = () => {
        setMicAnalyser(null);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
      };
    } catch {
      // Simulated bars run when audio analyser is unavailable
    }
  }

  function handleMicClick() {
    if (composerState === "thinking") return;
    if (composerState === "listening") {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      setComposerState("idle");
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecLike;
      webkitSpeechRecognition?: new () => SpeechRecLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      const msg = "Microphone is not available. Type your request instead.";
      setError(msg);
      setAnnouncement(msg);
      setComposerState("idle");
      return;
    }

    setError("");
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    setComposerState("listening");
    void startMicStream();

    let latestTranscript = "";
    listenTimeoutRef.current = setTimeout(() => {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      rec.stop?.();
      if (mountedRef.current) {
        setComposerState("idle");
        setError("Microphone is not available. Type your request instead.");
      }
    }, 30_000);

    rec.onresult = (e) => {
      latestTranscript = e.results?.[0]?.[0]?.transcript?.trim() ?? "";
      if (latestTranscript && mountedRef.current) {
        setInput(latestTranscript);
      }
    };
    rec.onerror = () => {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      if (mountedRef.current) {
        setComposerState("idle");
        const msg = "Microphone is not available. Type your request instead.";
        setError(msg);
        setAnnouncement(msg);
      }
    };
    rec.onend = () => {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      if (listenTimeoutRef.current) clearTimeout(listenTimeoutRef.current);
      if (!mountedRef.current) return;
      setComposerState("idle");
      if (latestTranscript) {
        void sendGeminiPrompt(latestTranscript);
      }
    };
    rec.start();
  }

  return (
    <div className="gemini-assistant-wrap">
      <section className="gemini-assistant" aria-label="Gemini Voice Assistant">
        <header>
          <h2>Gemini assistant</h2>
          <span className="ga-chip">
            <i aria-hidden="true" />
            Connected to Sentra MCP
          </span>
        </header>

        <p className="ga-sub">
          Ask about your schedule or scan your inbox; writes stay staged for your stamp.
        </p>

        <Composer
          state={composerState}
          value={input}
          error={error}
          micAnalyser={micAnalyser}
          onChange={setInput}
          onMicClick={handleMicClick}
          onSubmit={() => void sendGeminiPrompt(input)}
        />

        <QuickChips
          disabled={composerState === "thinking"}
          onCheckSchedule={() => void sendGeminiPrompt("Check my schedule")}
          onScanInbox={() => void runInboxSummarize()}
          onTrySample={() => void runSampleEmailScan()}
        />

        <div className="out" aria-live="polite">
          {announcement && <span className="sr-only">{announcement}</span>}
          <Conversation
            entries={entries}
            playingId={playingId}
            onPlayVoice={(id, text) => void playVoice(id, text)}
          />
          {letter && (
            <EmailLetter
              letter={letter}
              quarantineCount={quarantineCount}
              playingId={playingId}
              onPlayVoice={(id, text) => void playVoice(id, text)}
            />
          )}
        </div>
      </section>
    </div>
  );
}
