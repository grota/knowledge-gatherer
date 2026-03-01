import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { Project } from "@opencode-ai/sdk/client";

type ProjectOption =
  | { id: "all"; label: string }
  | { id: string; label: string; project: Project };

type Props = {
  projects: Project[];
  selectedId: string;
  focused: boolean;
  onSelect: (id: string) => void;
};

export function ProjectSelect({ projects, selectedId, focused, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const options: ProjectOption[] = [
    { id: "all", label: "All projects" },
    ...projects.map((p) => ({
      id: p.id,
      label: p.worktree,
      project: p,
    })),
  ];

  const selectedOption = options.find((o) => o.id === selectedId) ?? options[0]!;

  useKeyboard((key) => {
    if (!focused) return;

    if (!expanded) {
      if (key.name === "enter" || key.name === "space" || key.name === "down") {
        const currentIndex = options.findIndex((o) => o.id === selectedId);
        setHighlightIndex(currentIndex >= 0 ? currentIndex : 0);
        setExpanded(true);
      }
      return;
    }

    // Expanded mode
    switch (key.name) {
      case "up":
      case "k":
        setHighlightIndex((i) => Math.max(0, i - 1));
        break;
      case "down":
      case "j":
        setHighlightIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "enter":
      case "space": {
        const opt = options[highlightIndex];
        if (opt) {
          onSelect(opt.id);
        }
        setExpanded(false);
        break;
      }
      case "escape":
        setExpanded(false);
        break;
    }
  });

  const borderColor = focused ? "#7aa2f7" : "#414868";

  if (!expanded) {
    // Collapsed: show only the selected item as a single-line selector
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
          <strong>{selectedOption?.label ?? "All projects"}</strong>
        </text>
        <text fg="#565f89"> {focused ? "[↓ expand]" : "[Tab to focus]"}</text>
      </box>
    );
  }

  // Expanded: show dropdown list
  return (
    <box flexDirection="column" border borderColor={borderColor}>
      <box paddingX={1} paddingY={0}>
        <text fg="#a9b1d6">Select project:</text>
      </box>
      {options.map((opt, i) => {
        const isHighlighted = i === highlightIndex;
        const isSelected = opt.id === selectedId;
        return (
          <box
            key={opt.id}
            paddingX={2}
            backgroundColor={isHighlighted ? "#283457" : undefined}
          >
            <text fg={isSelected ? "#7dcfff" : isHighlighted ? "#c0caf5" : "#a9b1d6"}>
              {isSelected ? "● " : "  "}
              {opt.label}
            </text>
          </box>
        );
      })}
      <box paddingX={1}>
        <text fg="#565f89">↑↓ navigate  Enter select  Esc cancel</text>
      </box>
    </box>
  );
}
