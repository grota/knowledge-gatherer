import { useState, useEffect, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { OpencodeClient, GlobalSession, Part } from "@opencode-ai/sdk/v2";

type MessageRole = "user" | "assistant";

type DisplayMessage = {
  id: string;
  role: MessageRole;
  created: number;
  lines: string[];  // pre-split lines of text content
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// Extract readable text from parts (text parts only; skip tool/reasoning/etc.)
// Returns null if no meaningful text content.
function extractText(parts: Part[]): string | null {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "text" && !part.synthetic && !part.ignored) {
      const t = part.text.trim();
      if (t) texts.push(t);
    }
  }
  if (texts.length === 0) return null;
  return texts.join("\n");
}

type LoadingState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; messages: DisplayMessage[] };

type Props = {
  session: GlobalSession;
  client: OpencodeClient;
  onBack: () => void;
  onAppendToScratchpad: (text: string) => void;
  onToggleScratchpad: () => void;
  focused?: boolean; // if false, keyboard input is suppressed (scratchpad has focus)
};

export function SessionDetail({ session, client, onBack, onAppendToScratchpad, onToggleScratchpad, focused = true }: Props) {
  const { width } = useTerminalDimensions();
  const [state, setState] = useState<LoadingState>({ status: "loading" });

  // msgIndex: which message is "selected" (j/k)
  const [msgIndex, setMsgIndex] = useState(0);
  // lineOffset: how many lines we've scrolled within the visible window (alt+j/k)
  const [lineOffset, setLineOffset] = useState(0);

  // Keep refs for keyboard handler freshness
  const stateRef = useRef(state);
  stateRef.current = state;
  const msgIndexRef = useRef(msgIndex);
  msgIndexRef.current = msgIndex;
  const lineOffsetRef = useRef(lineOffset);
  lineOffsetRef.current = lineOffset;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const resp = await client.session.messages({ sessionID: session.id });
        if (cancelled) return;

        if (resp.error) {
          setState({ status: "error", message: String(resp.error) });
          return;
        }

        const displayMessages: DisplayMessage[] = [];
        for (const entry of resp.data ?? []) {
          const { info, parts } = entry;
          if (info.role !== "user" && info.role !== "assistant") continue;

          const text = extractText(parts);
          // Skip messages with no meaningful content
          if (text === null) continue;

          displayMessages.push({
            id: info.id,
            role: info.role as MessageRole,
            created: info.time.created,
            lines: text.split("\n"),
          });
        }

        // Sort by created time ascending
        displayMessages.sort((a, b) => a.created - b.created);

        setState({ status: "done", messages: displayMessages });
        // Start at last message
        if (displayMessages.length > 0) {
          setMsgIndex(displayMessages.length - 1);
        }
        setLineOffset(0);
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [session.id]);

  useKeyboard((key) => {
    const s = stateRef.current;

    // Esc/q always work (back) and Space always toggles scratchpad regardless of focus
    if (key.name === "escape" || key.name === "q") {
      onBack();
      return;
    }

    if (key.name === "space") {
      onToggleScratchpad();
      return;
    }

    // All other keys require this pane to be focused
    if (!focusedRef.current) return;

    if (s.status !== "done") return;
    const total = s.messages.length;
    if (total === 0) return;

    // y: append selected message to scratchpad
    if (key.name === "y") {
      const msg = s.messages[msgIndexRef.current];
      if (msg) {
        const label = msg.role === "user" ? "You" : "Agent";
        const header = `--- ${label} (${formatDate(msg.created)}) ---`;
        onAppendToScratchpad(`${header}\n${msg.lines.join("\n")}\n`);
      }
      return;
    }

    // j/k: message-granularity navigation
    if (!key.meta && key.name === "j") {
      setMsgIndex((i) => Math.min(total - 1, i + 1));
      setLineOffset(0);
      return;
    }
    if (!key.meta && key.name === "k") {
      setMsgIndex((i) => Math.max(0, i - 1));
      setLineOffset(0);
      return;
    }

    // alt+j / alt+k: line scroll within the window
    if (key.meta && key.name === "j") {
      setLineOffset((o) => o + 1);
      return;
    }
    if (key.meta && key.name === "k") {
      setLineOffset((o) => Math.max(0, o - 1));
      return;
    }

    // g/G: jump to first/last message
    if (!key.shift && key.name === "g") {
      setMsgIndex(0);
      setLineOffset(0);
      return;
    }
    if ((key.shift && key.name === "g") || key.name === "end") {
      setMsgIndex(total - 1);
      setLineOffset(0);
      return;
    }
    if (key.name === "home") {
      setMsgIndex(0);
      setLineOffset(0);
      return;
    }

    // pageup/pagedown: jump by 5 messages
    if (key.name === "pageup") {
      setMsgIndex((i) => Math.max(0, i - 5));
      setLineOffset(0);
      return;
    }
    if (key.name === "pagedown") {
      setMsgIndex((i) => Math.min(total - 1, i + 5));
      setLineOffset(0);
      return;
    }
  });

  // Available height for the message pane (rough estimate: terminal height minus header/footer rows)
  const paneHeight = Math.max(10, (useTerminalDimensions().height) - 6);
  const contentWidth = Math.max(40, width - 4);

  return (
    <box flexDirection="column" flexGrow={1} border borderColor="#7aa2f7">
      {/* Header */}
      <box flexDirection="row" paddingX={1} backgroundColor="#1a1b26">
        <text fg="#7dcfff">
          <strong>{session.title || "(untitled)"}</strong>
        </text>
        <text fg="#565f89">  [Esc/q: back  j/k: msg  Alt+j/k: scroll  g/G: first/last  y: yank  Space: scratchpad]</text>
      </box>

      <box paddingX={1}>
        <text fg="#414868">{"─".repeat(Math.max(10, contentWidth))}</text>
      </box>

      {/* Content */}
      {state.status === "loading" && (
        <box paddingX={2} paddingY={1}>
          <text fg="#565f89">Loading messages…</text>
        </box>
      )}

      {state.status === "error" && (
        <box paddingX={2} paddingY={1}>
          <text fg="#f7768e">Error: {state.message}</text>
        </box>
      )}

      {state.status === "done" && (
        <box flexDirection="column" flexGrow={1}>
          {state.messages.length === 0 ? (
            <box paddingX={2} paddingY={1}>
              <text fg="#565f89">No messages in this session.</text>
            </box>
          ) : (
            <MessagePane
              messages={state.messages}
              selectedIndex={msgIndex}
              lineOffset={lineOffset}
              paneHeight={paneHeight}
              contentWidth={contentWidth}
            />
          )}
        </box>
      )}

      {/* Footer */}
      {state.status === "done" && state.messages.length > 0 && (
        <box paddingX={1}>
          <text fg="#565f89">
            {`Msg ${msgIndex + 1}/${state.messages.length}`}
          </text>
        </box>
      )}
    </box>
  );
}

type MessagePaneProps = {
  messages: DisplayMessage[];
  selectedIndex: number;
  lineOffset: number;
  paneHeight: number;
  contentWidth: number;
};

function MessagePane({ messages, selectedIndex, lineOffset, paneHeight, contentWidth }: MessagePaneProps) {
  // Build a flat list of renderable "rows": each message has a header row + its lines
  type Row =
    | { kind: "header"; msgIndex: number; role: MessageRole; created: number }
    | { kind: "line"; msgIndex: number; text: string }
    | { kind: "gap" };

  const rows: Row[] = [];
  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi];
    if (!msg) continue;
    if (mi > 0) rows.push({ kind: "gap" });
    rows.push({ kind: "header", msgIndex: mi, role: msg.role, created: msg.created });
    for (const line of msg.lines) {
      rows.push({ kind: "line", msgIndex: mi, text: line });
    }
  }

  // Find the first row index belonging to the selected message
  const selectedFirstRow = rows.findIndex(
    (r) => r.kind !== "gap" && r.msgIndex === selectedIndex
  );

  // Compute visible window: anchor on selectedFirstRow, then apply lineOffset
  const rawStart = Math.max(0, selectedFirstRow + lineOffset);
  // Don't scroll past end
  const maxStart = Math.max(0, rows.length - paneHeight);
  const windowStart = Math.min(rawStart, maxStart);
  const windowEnd = Math.min(rows.length, windowStart + paneHeight);
  const visibleRows = rows.slice(windowStart, windowEnd);

  const aboveCount = windowStart;
  const belowCount = rows.length - windowEnd;

  return (
    <box flexDirection="column" flexGrow={1} paddingX={1}>
      {aboveCount > 0 && (
        <box>
          <text fg="#565f89">↑ {aboveCount} row{aboveCount !== 1 ? "s" : ""} above</text>
        </box>
      )}

      {visibleRows.map((row, vi) => {
        if (row.kind === "gap") {
          return (
            <box key={`gap-${windowStart + vi}`}>
              <text fg="#414868"> </text>
            </box>
          );
        }

        const isSelected = row.msgIndex === selectedIndex;
        const bg = isSelected ? "#1e2030" : undefined;

        if (row.kind === "header") {
          const isUser = row.role === "user";
          const label = isUser ? "You" : "Agent";
          const labelColor = isSelected
            ? (isUser ? "#9ece6a" : "#7aa2f7")
            : (isUser ? "#546e00" : "#3d59a1");
          return (
            <box key={`hdr-${row.msgIndex}`} flexDirection="row" backgroundColor={bg}>
              <text fg={isSelected ? "#7dcfff" : "#565f89"}>{isSelected ? "▶ " : "  "}</text>
              <text fg={labelColor}>
                <strong>{label}</strong>
              </text>
              <text fg={isSelected ? "#a9b1d6" : "#414868"}>
                {"  " + formatDate(row.created)}
              </text>
            </box>
          );
        }

        // row.kind === "line"
        return (
          <box key={`line-${row.msgIndex}-${windowStart + vi}`} paddingLeft={2} backgroundColor={bg}>
            <text fg={isSelected ? "#c0caf5" : "#787c99"} width={contentWidth - 2}>
              {row.text || " "}
            </text>
          </box>
        );
      })}

      {belowCount > 0 && (
        <box>
          <text fg="#565f89">↓ {belowCount} row{belowCount !== 1 ? "s" : ""} below</text>
        </box>
      )}
    </box>
  );
}
