import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { OpencodeClient, GlobalSession } from "@opencode-ai/sdk/v2";
import { ProjectSelect } from "./ProjectSelect";
import { SessionTable } from "./SessionTable";
import { SessionDetail } from "./SessionDetail";
import { Scratchpad } from "./Scratchpad";

// Focus order for Tab cycling
type FocusArea = "project" | "table" | "scratchpad";

type View = "main" | "detail";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: T };

// Unsaved-changes confirmation dialog
type ExitPrompt = "none" | "asking";

type Props = {
  client: OpencodeClient;
};

export function OpencodeApp({ client }: Props) {
  const renderer = useRenderer();

  const [sessions, setSessions] = useState<LoadState<GlobalSession[]>>({ status: "loading" });
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});

  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusArea>("table");
  const [view, setView] = useState<View>("main");
  const [selectedSession, setSelectedSession] = useState<GlobalSession | null>(null);

  // Scratchpad state — persists for the whole program lifetime
  const [scratchLines, setScratchLines] = useState<string[]>([]);
  const [scratchVisible, setScratchVisible] = useState(false);
  const [scratchSaved, setScratchSaved] = useState(true); // true = no unsaved changes
  const [exitPrompt, setExitPrompt] = useState<ExitPrompt>("none");

  // Refs for keyboard handlers
  const scratchLinesRef = useRef(scratchLines);
  scratchLinesRef.current = scratchLines;
  const scratchSavedRef = useRef(scratchSaved);
  scratchSavedRef.current = scratchSaved;
  const exitPromptRef = useRef(exitPrompt);
  exitPromptRef.current = exitPrompt;

  const loadSessions = useCallback(async () => {
    setSessions({ status: "loading" });
    try {
      const resp = await client.experimental.session.list();
      if (resp.error) {
        setSessions({ status: "error", message: String(resp.error) });
        return;
      }
      const allSessions = resp.data ?? [];
      setSessions({ status: "done", data: allSessions });

      const counts: Record<string, number> = {};
      await Promise.all(
        allSessions.map(async (s) => {
          try {
            const mResp = await client.session.messages({ sessionID: s.id });
            if (!mResp.error && mResp.data) {
              counts[s.id] = mResp.data.filter(
                (m) => m.info.role === "user" || m.info.role === "assistant"
              ).length;
            }
          } catch {
            counts[s.id] = 0;
          }
        })
      );
      setMessageCounts(counts);
    } catch (e) {
      setSessions({
        status: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }, [client]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Scratchpad callbacks
  const handleAppendToScratchpad = useCallback((text: string) => {
    setScratchLines((prev) => {
      const newLines = prev.length > 0 ? [...prev, "", ...text.split("\n")] : text.split("\n");
      return newLines;
    });
    setScratchSaved(false);
    setScratchVisible(true);
  }, []);

  const handleToggleScratchpad = useCallback(() => {
    setScratchVisible((v) => !v);
  }, []);

  const handleScratchpadChange = useCallback((lines: string[]) => {
    setScratchLines(lines);
    setScratchSaved(false);
  }, []);

  const handleScratchpadSaved = useCallback(() => {
    setScratchSaved(true);
  }, []);

  // Attempt to quit — show dialog if scratchpad has unsaved content
  const tryQuit = useCallback(() => {
    if (!scratchSavedRef.current && scratchLinesRef.current.length > 0) {
      setExitPrompt("asking");
    } else {
      renderer.destroy();
    }
  }, [renderer]);

  // Global keyboard
  useKeyboard((key) => {
    // Handle unsaved-changes exit dialog first
    if (exitPromptRef.current === "asking") {
      if (key.name === "y" || key.name === "return" || key.name === "enter") {
        // Save then quit
        try {
          const home = process.env.HOME ?? ".";
          const { join } = require("path") as typeof import("path");
          const { writeFileSync } = require("fs") as typeof import("fs");
          const filename = join(home, `scratch-${Date.now()}.txt`);
          writeFileSync(filename, scratchLinesRef.current.join("\n") + "\n", "utf8");
        } catch { /* ignore */ }
        renderer.destroy();
      } else if (key.name === "n" || key.name === "escape") {
        // Discard and quit
        renderer.destroy();
      } else if (key.name === "c") {
        // Cancel — stay in the app
        setExitPrompt("none");
      }
      return;
    }

    if (view === "detail") {
      // In detail view: Tab cycles between session detail and scratchpad (when visible)
      // Ctrl+C quits (with unsaved-changes check)
      if (key.ctrl && key.name === "c") {
        tryQuit();
        return;
      }
      if (key.name === "tab" && !key.shift) {
        if (scratchVisible) {
          setFocus((f) => (f === "scratchpad" ? "table" : "scratchpad"));
        }
        return;
      }
      if (key.shift && key.name === "tab") {
        if (scratchVisible) {
          setFocus((f) => (f === "scratchpad" ? "table" : "scratchpad"));
        }
        return;
      }
      return; // SessionDetail handles all other keys
    }

    if ((key.ctrl && key.name === "c") || key.name === "escape") {
      tryQuit();
      return;
    }

    if (key.name === "tab" && !key.shift) {
      if (scratchVisible) {
        setFocus((f) => {
          if (f === "project") return "table";
          if (f === "table") return "scratchpad";
          return "project";
        });
      } else {
        setFocus((f) => (f === "project" ? "table" : "project"));
      }
      return;
    }

    if (key.shift && key.name === "tab") {
      if (scratchVisible) {
        setFocus((f) => {
          if (f === "project") return "scratchpad";
          if (f === "table") return "project";
          return "table";
        });
      } else {
        setFocus((f) => (f === "table" ? "project" : "table"));
      }
      return;
    }

    if (key.shift && key.name === "r") {
      loadSessions();
    }
  });

  const handleOpenSession = useCallback((session: GlobalSession) => {
    setSelectedSession(session);
    setView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setView("main");
    setSelectedSession(null);
    setFocus("table");
  }, []);

  const handleDirSelect = useCallback((dir: string | null) => {
    setSelectedDir(dir);
    setFocus("table");
  }, []);

  const allSessions = sessions.status === "done" ? sessions.data : [];

  const dirCounts: Map<string, number> = new Map();
  for (const s of allSessions) {
    dirCounts.set(s.directory, (dirCounts.get(s.directory) ?? 0) + 1);
  }

  const displaySessions = selectedDir
    ? allSessions.filter((s) => s.directory === selectedDir)
    : allSessions;

  // Unsaved-changes exit dialog overlay
  if (exitPrompt === "asking") {
    return (
      <box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
        <box flexDirection="column" border borderColor="#e0af68" padding={2}>
          <box paddingBottom={1}>
            <text fg="#e0af68">
              <strong>Unsaved scratchpad content</strong>
            </text>
          </box>
          <text fg="#a9b1d6">The scratchpad has unsaved changes.</text>
          <text fg="#a9b1d6">Save before quitting?</text>
          <box paddingTop={1}>
            <text fg="#9ece6a">[y] Save and quit  </text>
            <text fg="#f7768e">[n] Discard and quit  </text>
            <text fg="#7aa2f7">[c] Cancel</text>
          </box>
        </box>
      </box>
    );
  }

  // Detail view with scratchpad
  if (view === "detail" && selectedSession) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <SessionDetail
          session={selectedSession}
          client={client}
          onBack={handleBack}
          onAppendToScratchpad={handleAppendToScratchpad}
          onToggleScratchpad={handleToggleScratchpad}
          focused={focus !== "scratchpad"}
        />
        {scratchVisible && (
          <Scratchpad
            lines={scratchLines}
            onChange={handleScratchpadChange}
            onSaved={handleScratchpadSaved}
            focused={focus === "scratchpad"}
            onFocus={() => setFocus("scratchpad")}
          />
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Title bar */}
      <box
        flexDirection="row"
        paddingX={2}
        paddingY={0}
        backgroundColor="#1a1b26"
      >
        <text fg="#7dcfff">
          <strong>OpenCode Sessions</strong>
        </text>
        <text fg="#565f89">  Tab: cycle focus  Shift+R: reload  Esc/Ctrl+C: quit</text>
        {!scratchSaved && scratchLines.length > 0 && (
          <text fg="#e0af68">  ● scratchpad unsaved</text>
        )}
      </box>

      {/* Project selector */}
      {sessions.status === "loading" ? (
        <box paddingX={2}>
          <text fg="#565f89">Loading…</text>
        </box>
      ) : sessions.status === "error" ? (
        <box paddingX={2}>
          <text fg="#f7768e">Error: {sessions.message}</text>
        </box>
      ) : (
        <ProjectSelect
          dirCounts={dirCounts}
          selectedDir={selectedDir}
          focused={focus === "project"}
          onSelect={handleDirSelect}
        />
      )}

      {/* Session table */}
      {sessions.status === "loading" ? (
        <box paddingX={2} paddingY={1} flexGrow={1}>
          <text fg="#565f89">Loading sessions…</text>
        </box>
      ) : sessions.status === "error" ? (
        <box paddingX={2} paddingY={1} flexGrow={1}>
          <text fg="#f7768e">Sessions error: {sessions.message}</text>
        </box>
      ) : (
        <SessionTable
          sessions={displaySessions}
          messageCounts={messageCounts}
          focused={focus === "table"}
          onOpenSession={handleOpenSession}
        />
      )}
    </box>
  );
}
