import { useState, useRef } from "react";
import { useKeyboard } from "@opentui/react";

type Props = {
  dirCounts: Map<string, number>;
  selectedDir: string | null;
  focused: boolean;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onSelect: (dir: string | null) => void;
};

type Option = { label: string; value: string | null };

function fuzzyMatch(query: string, target: string): boolean {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function ProjectSelect({ dirCounts, selectedDir, focused, expanded, onExpand, onCollapse, onSelect }: Props) {
  const allOptions: Option[] = [
    { label: `All projects (${[...dirCounts.values()].reduce((a, b) => a + b, 0)})`, value: null },
    ...[...dirCounts.entries()].map(([dir, count]) => ({ label: `${dir} (${count})`, value: dir })),
  ];

  const selectedLabel = selectedDir
    ? `${selectedDir} (${dirCounts.get(selectedDir) ?? 0})`
    : allOptions[0]?.label ?? "All projects";

  const [query, setQuery] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);

  const filteredOptions = allOptions.filter((o) => fuzzyMatch(query, o.label));
  const clampedCursor = Math.min(cursorIndex, Math.max(0, filteredOptions.length - 1));

  const filteredRef = useRef(filteredOptions);
  filteredRef.current = filteredOptions;
  const cursorRef = useRef(clampedCursor);
  cursorRef.current = clampedCursor;

  // ─── Scroll window ────────────────────────────────────────────────────────
  // We maintain a ref-based scrollOffset (not state) so it updates
  // synchronously during render without causing an extra re-render cycle.
  const MAX_VISIBLE = 10;
  const totalFiltered = filteredOptions.length;
  const listHeight = Math.min(totalFiltered, MAX_VISIBLE);

  const scrollOffsetRef = useRef(0);
  // Minimal scroll: only move window when cursor goes out of view
  let scrollOffset = scrollOffsetRef.current;
  if (clampedCursor < scrollOffset) scrollOffset = clampedCursor;
  if (listHeight > 0 && clampedCursor >= scrollOffset + listHeight) scrollOffset = clampedCursor - listHeight + 1;
  scrollOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, totalFiltered - listHeight)));
  scrollOffsetRef.current = scrollOffset;

  const visibleOptions = filteredOptions.slice(scrollOffset, scrollOffset + listHeight);
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, totalFiltered - scrollOffset - listHeight);
  const showAbove = aboveCount > 0;
  const showBelow = belowCount > 0;
  const indicatorRows = (showAbove ? 1 : 0) + (showBelow ? 1 : 0);
  // border-top(1) + hint(1) + search(1) + items + indicators + border-bottom(1)
  const expandedHeight = totalFiltered === 0 ? 5 : listHeight + 4 + indicatorRows;

  useKeyboard((key) => {
    if (!focused) return;
    if (!expanded) {
      if (key.name === "enter" || key.name === "return" || key.name === "space" || key.name === "down") {
        onExpand();
      }
      return;
    }

    // Cancel / collapse
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      setQuery(""); setCursorIndex(0); onCollapse();
      return;
    }
    if (key.name === "up") {
      setCursorIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setCursorIndex((i) => Math.min(filteredRef.current.length - 1, i + 1));
      return;
    }
    if (key.name === "enter" || key.name === "return") {
      const opt = filteredRef.current[cursorRef.current];
      if (opt) { onSelect(opt.value); setQuery(""); setCursorIndex(0); onCollapse(); }
      return;
    }
    if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1)); setCursorIndex(0);
      return;
    }
    // Readline: Ctrl+U — clear entire query
    if (key.ctrl && key.name === "u") {
      setQuery(""); setCursorIndex(0);
      return;
    }
    // Readline: Ctrl+W — delete last word backward
    if (key.ctrl && key.name === "w") {
      setQuery((q) => {
        const trimmed = q.trimEnd();
        const lastSpace = trimmed.lastIndexOf(" ");
        return lastSpace === -1 ? "" : trimmed.slice(0, lastSpace + 1);
      });
      setCursorIndex(0);
      return;
    }
    // Printable single character
    if (!key.ctrl && !key.meta && key.name && key.name.length === 1) {
      setQuery((q) => q + key.name!); setCursorIndex(0);
      return;
    }
    // Space
    if (!key.ctrl && !key.meta && key.name === "space") {
      setQuery((q) => q + " "); setCursorIndex(0);
    }
  });

  const borderColor = focused ? "#7aa2f7" : "#414868";

  if (!expanded) {
    return (
      <box flexDirection="row" border borderColor={borderColor} paddingX={1} height={3} alignItems="center">
        <text fg="#a9b1d6">Project: </text>
        <text fg="#7dcfff"><strong>{selectedLabel}</strong></text>
        <text fg="#565f89"> {focused ? "[↓/Enter expand]" : "[Tab to focus]"}</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" border borderColor={borderColor} height={expandedHeight}>
      <box paddingX={1}>
        <text fg="#a9b1d6">↑↓: navigate  Enter: confirm  Esc/^C: cancel  ^U: clear  ^W: del word</text>
      </box>
      <box paddingX={1} flexDirection="row">
        <text fg="#565f89">Search: </text>
        <text fg="#7dcfff">{query}<span fg="#a9b1d6">▌</span></text>
      </box>
      {showAbove && (
        <box paddingX={1}>
          <text fg="#565f89">{`  ↑ ${aboveCount} more`}</text>
        </box>
      )}
      {visibleOptions.length === 0 ? (
        <box paddingX={1}>
          <text fg="#565f89">  no matches</text>
        </box>
      ) : (
        visibleOptions.map((opt, i) => {
          const actualIndex = scrollOffset + i;
          return (
            <box key={opt.label} paddingX={1}>
              <text fg={actualIndex === clampedCursor ? "#7dcfff" : "#a9b1d6"}>
                {actualIndex === clampedCursor ? <strong>{`▶ ${opt.label}`}</strong> : `  ${opt.label}`}
              </text>
            </box>
          );
        })
      )}
      {showBelow && (
        <box paddingX={1}>
          <text fg="#565f89">{`  ↓ ${belowCount} more`}</text>
        </box>
      )}
    </box>
  );
}
