import { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { GlobalSession } from "@opencode-ai/sdk/v2";

type SortField = "created" | "updated";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function formatDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

type Props = {
  sessions: GlobalSession[];
  messageCounts: Record<string, number>;
  focused: boolean;
  onOpenSession: (session: GlobalSession) => void;
};

export function SessionTable({ sessions, messageCounts, focused, onOpenSession }: Props) {
  const { width } = useTerminalDimensions();
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);

  const sorted = [...sessions].sort((a, b) => {
    const aVal = sortField === "updated" ? a.time.updated : a.time.created;
    const bVal = sortField === "updated" ? b.time.updated : b.time.created;
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageSessions = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const absoluteIndex = pageStart + rowIndex;

  useKeyboard((key) => {
    if (!focused) return;

    switch (key.name) {
      case "up":
      case "k":
        if (rowIndex > 0) {
          setRowIndex((i) => i - 1);
        } else if (page > 0) {
          setPage((p) => p - 1);
          setRowIndex(PAGE_SIZE - 1);
        }
        break;
      case "down":
      case "j":
        if (rowIndex < pageSessions.length - 1) {
          setRowIndex((i) => i + 1);
        } else if (page < totalPages - 1) {
          setPage((p) => p + 1);
          setRowIndex(0);
        }
        break;
      case "left":
        if (page > 0) {
          setPage((p) => p - 1);
          setRowIndex(0);
        }
        break;
      case "right":
        if (page < totalPages - 1) {
          setPage((p) => p + 1);
          setRowIndex(0);
        }
        break;
      case "enter":
      case "return": {
        const session = pageSessions[rowIndex];
        if (session) onOpenSession(session);
        break;
      }
      case "c":
        setSortField((f) => (f === "created" ? "updated" : "created"));
        setPage(0);
        setRowIndex(0);
        break;
      case "u":
        setSortField("updated");
        setPage(0);
        setRowIndex(0);
        break;
      case "r":
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        setPage(0);
        setRowIndex(0);
        break;
    }
  });

  const borderColor = focused ? "#7aa2f7" : "#414868";

  // Dynamic column widths based on terminal width
  const availWidth = Math.max(80, width);
  // Fixed cols: created(26), updated(26), msgs(6), dir gets remainder alongside title
  const fixedWidth = 26 + 1 + 26 + 1 + 6 + 4; // separators/padding
  const remaining = Math.max(40, availWidth - fixedWidth - 4);
  // Split remaining between title (60%) and dir (40%), min 15 each
  const titleWidth = Math.max(15, Math.floor(remaining * 0.6));
  const dirWidth = Math.max(15, remaining - titleWidth - 1); // -1 for separator

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return " ";
    return sortDir === "desc" ? "↓" : "↑";
  };

  const truncate = (str: string, maxLen: number): string => {
    if (str.length <= maxLen) return str.padEnd(maxLen);
    return str.slice(0, maxLen - 1) + "…";
  };

  const padR = (str: string, len: number): string => str.padEnd(len).slice(0, len);

  // Show only the last two path segments for brevity
  function shortDir(dir: string): string {
    const parts = dir.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length === 0) return dir;
    if (parts.length === 1) return `/${parts[0]}`;
    return `…/${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }

  return (
    <box flexDirection="column" flexGrow={1} border borderColor={borderColor}>
      {/* Header */}
      <box
        flexDirection="row"
        paddingX={1}
        backgroundColor="#1a1b26"
      >
        <text fg="#7aa2f7" width={titleWidth}>
          <strong>{"Title".padEnd(titleWidth)}</strong>
        </text>
        <text fg="#565f89"> </text>
        <text fg="#7aa2f7" width={dirWidth}>
          <strong>{"Dir".padEnd(dirWidth)}</strong>
        </text>
        <text fg="#565f89"> </text>
        <text fg={sortField === "created" ? "#7dcfff" : "#7aa2f7"} width={26}>
          <strong>{`${sortIndicator("created")}Created`.padEnd(26)}</strong>
        </text>
        <text fg="#565f89"> </text>
        <text fg={sortField === "updated" ? "#7dcfff" : "#7aa2f7"} width={26}>
          <strong>{`${sortIndicator("updated")}Updated`.padEnd(26)}</strong>
        </text>
        <text fg="#565f89"> </text>
        <text fg="#7aa2f7" width={6}>
          <strong>{"Msgs".padEnd(6)}</strong>
        </text>
      </box>

      {/* Separator */}
      <box paddingX={1}>
        <text fg="#414868">{"─".repeat(Math.max(10, availWidth - 6))}</text>
      </box>

      {/* Rows */}
      {pageSessions.length === 0 ? (
        <box paddingX={2} paddingY={1}>
          <text fg="#565f89">No sessions found.</text>
        </box>
      ) : (
        pageSessions.map((session, i) => {
          const isHighlighted = focused && i === rowIndex;
          const isGlobalSelected = absoluteIndex === pageStart + i;
          const created = session.time.created;
          const updated = session.time.updated;
          const msgCount = messageCounts[session.id] ?? 0;

          const createdStr = `${formatDate(created)} (${timeAgo(created)})`;
          const updatedStr = `${formatDate(updated)} (${timeAgo(updated)})`;

          return (
            <box
              key={session.id}
              flexDirection="row"
              paddingX={1}
              backgroundColor={isHighlighted ? "#283457" : isGlobalSelected ? "#1e2030" : undefined}
            >
              <text
                fg={isHighlighted ? "#c0caf5" : "#a9b1d6"}
                width={titleWidth}
              >
                {truncate(session.title || "(untitled)", titleWidth)}
              </text>
              <text fg="#565f89"> </text>
              <text
                fg={isHighlighted ? "#bb9af7" : "#565f89"}
                width={dirWidth}
              >
                {truncate(shortDir(session.directory), dirWidth)}
              </text>
              <text fg="#565f89"> </text>
              <text fg={isHighlighted ? "#7dcfff" : "#6d7fa8"} width={26}>
                {padR(createdStr, 26)}
              </text>
              <text fg="#565f89"> </text>
              <text fg={isHighlighted ? "#7dcfff" : "#6d7fa8"} width={26}>
                {padR(updatedStr, 26)}
              </text>
              <text fg="#565f89"> </text>
              <text fg={isHighlighted ? "#9ece6a" : "#565f89"} width={6}>
                {String(msgCount).padStart(4)}
              </text>
            </box>
          );
        })
      )}

      {/* Footer / pagination */}
      <box flexDirection="row" paddingX={1} paddingY={0} marginTop={1}>
        <text fg="#565f89">
          {`Page ${page + 1}/${totalPages}  (${sorted.length} sessions)  `}
          <span fg="#414868">
            {`Sort:${sortField}${sortDir === "desc" ? "↓" : "↑"}  [c]created [u]updated [r]reverse [Enter]open`}
          </span>
        </text>
      </box>
    </box>
  );
}
