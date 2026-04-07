import { useEffect, useRef, useState } from "react";
import { streamLogs } from "../lib/api";
import type { LogLine } from "../lib/types";
import { Spinner } from "./Spinner";

type Props = {
  runId: string;
  /** Run is still executing — enables reconnect on SSE blips and live chrome */
  isLive: boolean;
};

/**
 * Server-sent log stream with live styling (GH Actions–style console).
 */
function lineKey(line: LogLine): string {
  return `${line.ts}\0${line.stage ?? ""}\0${line.step ?? ""}\0${line.line}`;
}

export function LiveLogPanel({ runId, isLive }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [streamEnded, setStreamEnded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const isLiveRef = useRef(isLive);
  const seenLines = useRef<Set<string>>(new Set());
  isLiveRef.current = isLive;

  useEffect(() => {
    setLines([]);
    setStreamEnded(false);
    seenLines.current = new Set();
    const cleanup = streamLogs(
      runId,
      (line) => {
        const k = lineKey(line);
        if (seenLines.current.has(k)) return;
        seenLines.current.add(k);
        setLines((prev) => [...prev, line]);
      },
      () => setStreamEnded(true),
      {
        reconnectWhile: () => isLiveRef.current,
        reconnectDelayMs: 1000,
      }
    );
    return cleanup;
  }, [runId]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: lines.length < 3 ? "auto" : "smooth" });
    }
  }, [lines.length, autoScroll]);

  const showLiveChrome = isLive && !streamEnded;

  return (
    <div
      className={`rounded-xl overflow-hidden border bg-surface-0/95 shadow-ky transition-[border-color] duration-300 ${
        showLiveChrome
          ? "border-success/35 ring-1 ring-success/15"
          : "border-surface-3"
      }`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-surface-3/90 bg-surface-1/80">
        <div className="flex items-center gap-2 min-w-0">
          {showLiveChrome ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/12 border border-success/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Live
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted shrink-0">
              {streamEnded ? "Log output" : "Connecting…"}
            </span>
          )}
          <span className="text-[11px] text-muted tabular-nums truncate">
            {lines.length} line{lines.length !== 1 ? "s" : ""}
            {showLiveChrome && lines.length === 0 && (
              <span className="text-accent/90 ml-1">· fetching…</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showLiveChrome && (
            <span className="hidden sm:inline text-[10px] text-muted font-mono">SSE</span>
          )}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[11px] px-2 py-1 rounded border transition-colors ${
              autoScroll
                ? "border-accent/50 text-accent"
                : "border-surface-3 text-muted hover:border-surface-3/50"
            }`}
            title="Toggle auto-scroll to bottom"
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Console body */}
      <div className="relative flex">
        {showLiveChrome && (
          <div
            className="w-1 shrink-0 bg-gradient-to-b from-success/50 via-success/25 to-transparent"
            aria-hidden
          />
        )}
        <div
          className="flex-1 min-w-0 p-3 h-[min(28rem,70vh)] overflow-y-auto font-mono text-[11px] leading-relaxed scroll-smooth"
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
            setAutoScroll(atBottom);
          }}
        >
          {lines.length === 0 && !streamEnded && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted">
              {showLiveChrome ? (
                <>
                  <Spinner className="w-6 h-6 text-success" />
                  <p className="text-xs text-center max-w-md leading-relaxed px-2">
                    <span className="text-gray-700">Connecting to log stream…</span>
                    <br />
                    <span className="text-[11px] text-muted mt-2 inline-block">
                      Lines appear as the engine records them (run start, each step, and step stdout/stderr).
                    </span>
                  </p>
                </>
              ) : (
                <span>Loading logs…</span>
              )}
            </div>
          )}

          {lines.length === 0 && streamEnded && (
            <span className="text-muted">No log lines were recorded for this run.</span>
          )}

          {lines.map((line, i) => (
            <LogLineRow key={`${line.ts}-${i}`} line={line} isLatest={i === lines.length - 1 && showLiveChrome} />
          ))}

          {streamEnded && lines.length > 0 && (
            <div className="mt-3 pt-2 border-t border-surface-3 text-muted text-[10px]">
              — End of log stream —
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function LogLineRow({
  line,
  isLatest,
}: {
  line: LogLine;
  isLatest: boolean;
}) {
  const ts = new Date(line.ts).toLocaleTimeString("en-US", { hour12: false });
  return (
    <div
      className={`flex gap-2 sm:gap-3 leading-5 py-0.5 rounded px-1 -mx-1 ${
        isLatest ? "bg-success/5" : "hover:bg-surface-1/40"
      }`}
    >
      <span className="text-muted/90 shrink-0 select-none w-[4.5rem] sm:w-[5.25rem] text-right tabular-nums">
        {ts}
      </span>
      {(line.stage || line.step) && (
        <span
          className="text-[10px] text-accent/70 shrink-0 max-w-[40%] truncate font-mono"
          title={`${line.stage}${line.stage && line.step ? " · " : ""}${line.step}`}
        >
          {line.stage}
          {line.stage && line.step ? " › " : ""}
          {line.step}
        </span>
      )}
      <span className="text-gray-800 whitespace-pre-wrap break-all min-w-0 flex-1">{line.line}</span>
    </div>
  );
}
