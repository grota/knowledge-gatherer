import { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { OpencodeClient, Session, Part } from "@opencode-ai/sdk/client";

type MessageRole = "user" | "assistant";

type DisplayMessage = {
  id: string;
  role: MessageRole;
  created: number;
  textContent: string;
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
function extractText(parts: Part[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.type === "text" && !part.synthetic && !part.ignored) {
      texts.push(part.text.trim());
    }
  }
  return texts.join("\n") || "(no text content)";
}

type LoadingState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; messages: DisplayMessage[] };

type Props = {
  session: Session;
  client: OpencodeClient;
  onBack: () => void;
};

export function SessionDetail({ session, client, onBack }: Props) {
  const [state, setState] = useState<LoadingState>({ status: "loading" });
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const resp = await client.session.messages({ path: { id: session.id } });
        if (cancelled) return;

        if (resp.error) {
          setState({ status: "error", message: String(resp.error) });
          return;
        }

        const displayMessages: DisplayMessage[] = [];
        for (const entry of resp.data ?? []) {
          const { info, parts } = entry;
          // Only user and assistant roles
          if (info.role !== "user" && info.role !== "assistant") continue;

          const text = extractText(parts);
          displayMessages.push({
            id: info.id,
            role: info.role as MessageRole,
            created: info.time.created,
            textContent: text,
          });
        }

        // Sort by created time ascending
        displayMessages.sort((a, b) => a.created - b.created);

        setState({ status: "done", messages: displayMessages });
        // Scroll to bottom on load
        setScrollOffset(Math.max(0, displayMessages.length - 1));
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
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      onBack();
      return;
    }

    if (state.status !== "done") return;

    const total = state.messages.length;
    switch (key.name) {
      case "up":
      case "k":
        setScrollOffset((o) => Math.max(0, o - 1));
        break;
      case "down":
      case "j":
        setScrollOffset((o) => Math.min(Math.max(0, total - 1), o + 1));
        break;
      case "pageup":
        setScrollOffset((o) => Math.max(0, o - 5));
        break;
      case "pagedown":
        setScrollOffset((o) => Math.min(Math.max(0, total - 1), o + 5));
        break;
      case "home":
      case "g":
        setScrollOffset(0);
        break;
      case "end":
        setScrollOffset(Math.max(0, total - 1));
        break;
    }
    // Shift+G = go to end (vim-style)
    if (key.shift && key.name === "g") {
      setScrollOffset(Math.max(0, total - 1));
    }
  });

  const VISIBLE_MESSAGES = 15;

  return (
    <box flexDirection="column" flexGrow={1} border borderColor="#7aa2f7">
      {/* Header */}
      <box flexDirection="row" paddingX={1} backgroundColor="#1a1b26">
        <text fg="#7dcfff">
          <strong>{session.title || "(untitled)"}</strong>
        </text>
        <text fg="#565f89">  [Esc/q to go back  ↑↓/j/k scroll  g/G top/bottom]</text>
      </box>

      <box paddingX={1}>
        <text fg="#414868">{"─".repeat(60)}</text>
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
            <>
              {/* Show a window of messages around scrollOffset */}
              {(() => {
                const total = state.messages.length;
                const windowStart = Math.max(
                  0,
                  Math.min(scrollOffset, total - VISIBLE_MESSAGES)
                );
                const windowEnd = Math.min(total, windowStart + VISIBLE_MESSAGES);
                const visible = state.messages.slice(windowStart, windowEnd);

                return (
                  <box flexDirection="column" flexGrow={1} paddingX={1}>
                    {windowStart > 0 && (
                      <box>
                        <text fg="#565f89">
                          ↑ {windowStart} more message{windowStart !== 1 ? "s" : ""} above
                        </text>
                      </box>
                    )}
                    {visible.map((msg) => {
                      const isUser = msg.role === "user";
                      const labelColor = isUser ? "#9ece6a" : "#7aa2f7";
                      const label = isUser ? "You" : "Agent";
                      // Wrap long lines at ~terminal width - some padding
                      const lines = msg.textContent.split("\n");
                      return (
                        <box key={msg.id} flexDirection="column" marginBottom={1}>
                          <box flexDirection="row">
                            <text fg={labelColor}>
                              <strong>{label}</strong>
                            </text>
                            <text fg="#565f89">  {formatDate(msg.created)}</text>
                          </box>
                          {lines.map((line, li) => (
                            <box key={li} paddingLeft={2}>
                              <text fg={isUser ? "#c0caf5" : "#a9b1d6"}>
                                {line || " "}
                              </text>
                            </box>
                          ))}
                        </box>
                      );
                    })}
                    {windowEnd < total && (
                      <box>
                        <text fg="#565f89">
                          ↓ {total - windowEnd} more message
                          {total - windowEnd !== 1 ? "s" : ""} below
                        </text>
                      </box>
                    )}
                  </box>
                );
              })()}

              {/* Scroll position indicator */}
              <box paddingX={1}>
                <text fg="#565f89">
                  Message {Math.min(scrollOffset + 1, state.messages.length)}/
                  {state.messages.length}
                </text>
              </box>
            </>
          )}
        </box>
      )}
    </box>
  );
}
