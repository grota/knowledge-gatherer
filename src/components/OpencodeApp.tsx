import { useState, useEffect, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { OpencodeClient, Project, Session } from "@opencode-ai/sdk/client";
import { ProjectSelect } from "./ProjectSelect";
import { SessionTable } from "./SessionTable";
import { SessionDetail } from "./SessionDetail";

// Focus order for Tab cycling
type FocusArea = "project" | "table";

type View = "main" | "detail";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: T };

type Props = {
  client: OpencodeClient;
};

export function OpencodeApp({ client }: Props) {
  const renderer = useRenderer();

  const [projects, setProjects] = useState<LoadState<Project[]>>({ status: "loading" });
  const [sessions, setSessions] = useState<LoadState<Session[]>>({ status: "loading" });
  // Per-session message counts (user+assistant only)
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [focus, setFocus] = useState<FocusArea>("table");
  const [view, setView] = useState<View>("main");
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Load projects
  useEffect(() => {
    async function load() {
      try {
        const resp = await client.project.list();
        if (resp.error) {
          setProjects({ status: "error", message: String(resp.error) });
          return;
        }
        setProjects({ status: "done", data: resp.data ?? [] });
      } catch (e) {
        setProjects({
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
    load();
  }, []);

  // Load sessions
  const loadSessions = useCallback(async () => {
    setSessions({ status: "loading" });
    try {
      const resp = await client.session.list();
      if (resp.error) {
        setSessions({ status: "error", message: String(resp.error) });
        return;
      }
      const allSessions = resp.data ?? [];
      setSessions({ status: "done", data: allSessions });

      // Load message counts for each session (user+assistant only)
      const counts: Record<string, number> = {};
      await Promise.all(
        allSessions.map(async (s) => {
          try {
            const mResp = await client.session.messages({ path: { id: s.id } });
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

  // Global keyboard: Ctrl+C / Escape (when in main view) to quit, Tab to cycle focus
  useKeyboard((key) => {
    if (view === "detail") return; // SessionDetail handles its own keys

    if ((key.ctrl && key.name === "c") || key.name === "escape") {
      renderer.destroy();
      return;
    }

    if (key.name === "tab") {
      setFocus((f) => (f === "project" ? "table" : "project"));
      return;
    }

    // Shift+Tab goes backwards
    if (key.shift && key.name === "tab") {
      setFocus((f) => (f === "table" ? "project" : "table"));
      return;
    }

    // Reload with 'R'
    if (key.name === "R" || (key.shift && key.name === "r")) {
      loadSessions();
    }
  });

  const handleOpenSession = useCallback((session: Session) => {
    setSelectedSession(session);
    setView("detail");
  }, []);

  const handleBack = useCallback(() => {
    setView("main");
    setSelectedSession(null);
    setFocus("table");
  }, []);

  const handleProjectSelect = useCallback((id: string) => {
    setSelectedProjectId(id);
    setFocus("table");
  }, []);

  // Filter sessions by selected project
  const allSessions =
    sessions.status === "done" ? sessions.data : [];
  const filteredSessions =
    selectedProjectId === "all"
      ? allSessions
      : allSessions.filter((s) => s.projectID === selectedProjectId);

  const projectList =
    projects.status === "done" ? projects.data : [];

  if (view === "detail" && selectedSession) {
    return (
      <box flexDirection="column" flexGrow={1}>
        <SessionDetail
          session={selectedSession}
          client={client}
          onBack={handleBack}
        />
        <box paddingX={1}>
          <text fg="#565f89">Esc/q: back</text>
        </box>
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
        <text fg="#565f89">  Tab: cycle focus  R: reload  Esc/Ctrl+C: quit</text>
      </box>

      {/* Project selector */}
      {projects.status === "loading" ? (
        <box paddingX={2}>
          <text fg="#565f89">Loading projects…</text>
        </box>
      ) : projects.status === "error" ? (
        <box paddingX={2}>
          <text fg="#f7768e">Projects error: {projects.message}</text>
        </box>
      ) : (
        <ProjectSelect
          projects={projectList}
          selectedId={selectedProjectId}
          focused={focus === "project"}
          onSelect={handleProjectSelect}
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
          sessions={filteredSessions}
          messageCounts={messageCounts}
          focused={focus === "table"}
          onOpenSession={handleOpenSession}
        />
      )}
    </box>
  );
}
