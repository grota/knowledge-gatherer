import { useState, useEffect, useRef, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(scrollTop);
  scrollTopRef.current = scrollTop;
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // Reset scroll when new content is appended
  useEffect(() => {
    // Scroll to bottom when content grows
    setScrollTop(Math.max(0, lines.length - 1));
  }, [lines.length]);

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

    // j/k: line scroll
    const total = linesRef.current.length;
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
  const VISIBLE = 10; // lines visible in scratchpad panel

  const visStart = Math.max(0, Math.min(scrollTop, Math.max(0, lines.length - VISIBLE)));
  const visLines = lines.slice(visStart, visStart + VISIBLE);
  const aboveCount = visStart;
  const belowCount = Math.max(0, lines.length - (visStart + VISIBLE));

  return (
    <box
      flexDirection="column"
      border
      borderColor={borderColor}
      height={VISIBLE + 4}  // +4 for borders + header + footer
      onMouseDown={onFocus}
    >
      {/* Header */}
      <box flexDirection="row" paddingX={1} backgroundColor="#1a1b26">
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

      {/* Content */}
      <box flexDirection="column" flexGrow={1} paddingX={1}>
        {aboveCount > 0 && (
          <text fg="#565f89">↑ {aboveCount} more</text>
        )}
        {lines.length === 0 ? (
          <text fg="#414868">(empty — press y on a message to yank it here)</text>
        ) : (
          visLines.map((line, i) => (
            <box key={visStart + i}>
              <text fg={focused ? "#c0caf5" : "#787c99"}>{line || " "}</text>
            </box>
          ))
        )}
        {belowCount > 0 && (
          <text fg="#565f89">↓ {belowCount} more</text>
        )}
      </box>
    </box>
  );
}
