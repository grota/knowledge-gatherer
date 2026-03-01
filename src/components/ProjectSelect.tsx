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

export function ProjectSelect({ dirCounts, selectedDir, focused, expanded, onExpand, onCollapse, onSelect }: Props) {

  type Option = { label: string; value: string | null };

  const options: Option[] = [
    { label: `All projects (${[...dirCounts.values()].reduce((a, b) => a + b, 0)})`, value: null },
    ...[...dirCounts.entries()].map(([dir, count]) => ({ label: `${dir} (${count})`, value: dir })),
  ];

  const selectedLabel = selectedDir
    ? `${selectedDir} (${dirCounts.get(selectedDir) ?? 0})`
    : options[0]?.label ?? "All projects";

  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === selectedDir)
  );

  const [cursorIndex, setCursorIndex] = useState(initialIndex);
  // Ref so the keyboard handler always reads the latest cursor index (avoids stale closure)
  const cursorIndexRef = useRef(cursorIndex);
  cursorIndexRef.current = cursorIndex;
  // Ref for options too, since it's rebuilt each render
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useKeyboard((key) => {
    if (!focused) return;
    if (!expanded) {
      if (key.name === "enter" || key.name === "return" || key.name === "space" || key.name === "down") {
        onExpand();
      }
      return;
    }
    switch (key.name) {
      case "escape":
        onCollapse();
        break;
      case "up":
      case "k":
        setCursorIndex((i) => Math.max(0, i - 1));
        break;
      case "down":
      case "j":
        setCursorIndex((i) => Math.min(optionsRef.current.length - 1, i + 1));
        break;
      case "enter":
      case "return": {
        const opt = optionsRef.current[cursorIndexRef.current];
        if (opt) {
          onSelect(opt.value);
          onCollapse();
        }
        break;
      }
    }
  });

  const borderColor = focused ? "#7aa2f7" : "#414868";

  if (!expanded) {
    return (
      <box
        flexDirection="row"
        border
        borderColor={borderColor}
        paddingX={1}
        height={3}
        alignItems="center"
      >
        <text fg="#a9b1d6">Project: </text>
        <text fg="#7dcfff">
          <strong>{selectedLabel}</strong>
        </text>
        <text fg="#565f89"> {focused ? "[↓/Enter expand]" : "[Tab to focus]"}</text>
      </box>
    );
  }

  // +4 = 1 border top + 1 header line + 1 border bottom + 1 padding
  const expandedHeight = options.length + 4;

  return (
    <box flexDirection="column" border borderColor={borderColor} height={expandedHeight}>
      <box paddingX={1}>
        <text fg="#a9b1d6">Select project  ↑↓: navigate  Enter: confirm  Esc: cancel</text>
      </box>
      {options.map((opt, i) => (
        <box key={opt.label} paddingX={1} flexDirection="row">
          <text fg={i === cursorIndex ? "#7dcfff" : "#a9b1d6"}>
            {i === cursorIndex ? <strong>{`▶ ${opt.label}`}</strong> : `  ${opt.label}`}
          </text>
        </box>
      ))}
    </box>
  );
}
