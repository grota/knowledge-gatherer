import { useState, useRef, useCallback } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Wrap a single text line into segments of at most `maxWidth` characters.
// Returns at least one element (empty string becomes [" "]).
function wrapLine(line: string, maxWidth: number): string[] {
  if (!line) return [" "];
  const segments: string[] = [];
  let remaining = line;
  while (remaining.length > maxWidth) {
    const slice = remaining.slice(0, maxWidth);
    const lastSpace = slice.lastIndexOf(" ");
    const breakAt = lastSpace > 0 ? lastSpace : maxWidth;
    segments.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt === lastSpace ? lastSpace + 1 : breakAt);
  }
  if (remaining.length > 0) segments.push(remaining);
  return segments;
}

type Props = {
  // Lines of text in the scratchpad
  lines: string[];
  onChange: (lines: string[]) => void;
  // Called after a successful save to file
  onSaved?: () => void;
  // Whether the panel is focused (receives j/k scroll)
  focused: boolean;
  onFocus: () => void;
};

export function Scratchpad({ lines, onChange, onSaved, focused, onFocus }: Props) {
  const renderer = useRenderer();
  const { width } = useTerminalDimensions();
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // Pre-wrap all logical lines for display. Each logical line may produce
  // multiple display rows. We track display-row → logical-line mapping so
  // j/k scroll moves by display rows.
  // -2 for left/right borders, -2 for paddingLeft={1} on each text element (both sides)
  const textWidth = Math.max(20, width - 4);
  const displayRows: string[] = [];
  for (const line of lines) {
    for (const seg of wrapLine(line, textWidth)) {
      displayRows.push(seg);
    }
  }
  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;

  // Track last-seen lines.length so we can detect when new content is appended
  // and snap scroll to the bottom in the same render pass (no useEffect / second render).
  const prevLinesLengthRef = useRef(lines.length);
  const [scrollTop, setScrollTop] = useState(() => Math.max(0, displayRows.length - 1));
  const scrollTopRef = useRef(scrollTop);

  // Synchronously snap to bottom when new content is appended.
  // Done inline (not in useEffect) so the first render of new content already
  // uses the correct scrollTop — avoiding the double-render that caused
  // Yoga to assign stale Y positions to row boxes in the live renderer.
  let effectiveScrollTop = scrollTop;
  if (lines.length !== prevLinesLengthRef.current) {
    prevLinesLengthRef.current = lines.length;
    effectiveScrollTop = Math.max(0, displayRows.length - 1);
    // Schedule the state update so future j/k operations see the right base position
    if (effectiveScrollTop !== scrollTop) {
      setScrollTop(effectiveScrollTop);
    }
  }
  scrollTopRef.current = effectiveScrollTop;

  const saveToFile = useCallback(() => {
    try {
      // Prompt user for a filename via a simple temp-file approach:
      // we write to ./scratch-<timestamp>.txt
      const filename = join(process.cwd(), `scratch-${Date.now()}.txt`);
      writeFileSync(filename, linesRef.current.join("\n") + "\n", "utf8");
      // Brief visual feedback via console
      console.log(`[Scratchpad] Saved to ${filename}`);
      onSaved?.();
      return filename;
    } catch (e) {
      console.log(`[Scratchpad] Save failed: ${e}`);
      return null;
    }
  }, [onSaved]);

  const openInEditor = useCallback(() => {
    const editor = process.env.EDITOR ?? "nano";
    try {
      // Write current content to a temp file
      const dir = mkdtempSync(join(tmpdir(), "kg-scratch-"));
      const tmpFile = join(dir, "scratchpad.md");
      writeFileSync(tmpFile, linesRef.current.join("\n") + "\n", "utf8");

      // Suspend renderer, spawn editor, resume
      renderer.suspend();
      const result = spawnSync(editor, [tmpFile], {
        stdio: "inherit",
        env: process.env,
      });
      renderer.resume();

      if (result.error) {
        console.log(`[Scratchpad] Editor error: ${result.error.message}`);
        return;
      }

      // Reload content from temp file
      const newContent = readFileSync(tmpFile, "utf8");
      onChange(newContent.split("\n"));
    } catch (e) {
      renderer.resume();
      console.log(`[Scratchpad] Editor failed: ${e}`);
    }
  }, [renderer, onChange]);

  useKeyboard((key) => {
    if (!focused) return;

    // ctrl+s: save to file
    if (key.ctrl && key.name === "s") {
      saveToFile();
      return;
    }

    // o: open in $EDITOR
    if (key.name === "o") {
      openInEditor();
      return;
    }

    // j/k: line scroll (over display rows)
    const total = displayRowsRef.current.length;
    if (key.name === "j") {
      setScrollTop((t) => Math.min(Math.max(0, total - 1), t + 1));
      return;
    }
    if (key.name === "k") {
      setScrollTop((t) => Math.max(0, t - 1));
      return;
    }
    if (key.name === "g" && !key.shift) {
      setScrollTop(0);
      return;
    }
    if (key.shift && key.name === "g") {
      setScrollTop(Math.max(0, total - 1));
      return;
    }

    // Click to focus (any other key while unfocused → focus)
    if (!focused) {
      onFocus();
    }
  });

  const borderColor = focused ? "#e0af68" : "#414868";
  // VISIBLE is the number of content rows shown. The outer box has a fixed height:
  //   2 (border) + 1 (header) + VISIBLE (content rows) = VISIBLE + 3
  const VISIBLE = 10; // lines visible in scratchpad panel

  const visStart = Math.max(0, Math.min(effectiveScrollTop, Math.max(0, displayRows.length - VISIBLE)));
  const aboveCount = visStart;
  const belowCount = Math.max(0, displayRows.length - (visStart + VISIBLE));

  // Build exactly VISIBLE display rows, replacing first/last with scroll indicators
  // when content is scrolled. This keeps the panel height fixed.
  // Each slot is padded to textWidth so that when content changes (e.g. on scroll),
  // the trailing spaces actively overwrite stale terminal cells from the previous render.
  // Without padding, shorter lines leave old characters visible in the right portion of
  // the row — the OpenTUI renderer only paints non-space characters, so old cells persist.
  const slots: string[] = [];
  for (let i = 0; i < VISIBLE; i++) {
    const rowIdx = visStart + i;
    const raw = displayRows[rowIdx] ?? "";
    slots.push(raw.padEnd(textWidth));
  }

  return (
    <box
      flexDirection="column"
      border
      borderColor={borderColor}
      // Fixed height: 2 (border) + 1 (header) + VISIBLE (content)
      height={VISIBLE + 3}
      onMouseDown={onFocus}
    >
      {/* Header — explicit height keeps Yoga layout stable */}
      <box flexDirection="row" height={1} paddingX={1} backgroundColor="#1a1b26">
        <text fg="#e0af68">
          <strong>Scratchpad</strong>
        </text>
        <text fg="#565f89">
          {focused
            ? "  [j/k: scroll  Ctrl+S: save  o: edit  Space: hide]"
            : "  [Tab: focus  Space: hide]"}
        </text>
        <text fg="#565f89">  {lines.length} line{lines.length !== 1 ? "s" : ""}</text>
      </box>

      {/* Content — flexDirection="column" with height={1} on each row.
          Each slot is padded to textWidth so that when content changes (e.g. on scroll),
          trailing spaces actively overwrite stale terminal cells from the previous render.
          Without padding, shorter lines leave old characters visible at the right edge. */}
      <box
        key={lines.length === 0 ? "empty" : "content"}
        flexDirection="column"
        height={VISIBLE}
        overflow="hidden"
      >
        {lines.length === 0 ? (
          <box height={1}>
            <text fg="#414868">(empty — press y on a message to yank it here)</text>
          </box>
        ) : (
          slots.map((row, i) => {
            const isFirst = i === 0 && aboveCount > 0;
            const isLast = i === VISIBLE - 1 && belowCount > 0;
            const key = `${i}`;
            return (
              // backgroundColor forces OpenTUI to paint every cell in the row,
              // clearing stale characters from previous renders at this Y position.
              <box key={key} height={1} overflow="hidden" backgroundColor="#1a1b26">
                {isFirst ? (
                  <text fg="#565f89"> ↑ {aboveCount} more</text>
                ) : isLast ? (
                  <text fg="#565f89"> ↓ {belowCount} more</text>
                ) : (
                  <text fg={focused ? "#c0caf5" : "#787c99"}> {row}</text>
                )}
              </box>
            );
          })
        )}
      </box>
    </box>
  );
}
