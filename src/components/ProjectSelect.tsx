import { useState, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { fzf } from "fzf-bun";

type Props = {
  dirCounts: Map<string, number>;
  selectedDir: string | null;
  focused: boolean;
  onSelect: (dir: string | null) => void;
};

type Option = { label: string; value: string | null };

export function ProjectSelect({ dirCounts, selectedDir, focused, onSelect }: Props) {
  const renderer = useRenderer();
  const [isRunning, setIsRunning] = useState(false);

  const allOptions: Option[] = [
    { label: `All projects (${[...dirCounts.values()].reduce((a, b) => a + b, 0)})`, value: null },
    ...[...dirCounts.entries()].map(([dir, count]) => ({ label: `${dir} (${count})`, value: dir })),
  ];

  const selectedLabel = selectedDir
    ? `${selectedDir} (${dirCounts.get(selectedDir) ?? 0})`
    : allOptions[0]?.label ?? "All projects";

  const openFzf = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);

    // fzf takes over the terminal, so suspend the TUI renderer while it runs
    renderer.suspend();
    try {
      const labels = allOptions.map((o) => o.label);
      const chosen = await fzf(labels);
      const match = allOptions.find((o) => o.label === chosen);
      if (match !== undefined) {
        onSelect(match.value);
      }
    } catch {
      // User pressed Esc or fzf returned no selection — no-op
    } finally {
      renderer.resume();
      setIsRunning(false);
    }
  }, [isRunning, renderer, allOptions, onSelect]);

  useKeyboard((key) => {
    if (!focused) return;
    if (key.name === "enter" || key.name === "return" || key.name === "space" || key.name === "down") {
      openFzf();
    }
  });

  const borderColor = focused ? "#7aa2f7" : "#414868";

  return (
    <box flexDirection="row" border borderColor={borderColor} paddingX={1} height={3} alignItems="center">
      <text fg="#a9b1d6">Project: </text>
      <text fg="#7dcfff"><strong>{selectedLabel}</strong></text>
      <text fg="#565f89"> {focused ? "[↓/Enter: open picker]" : "[Tab to focus]"}</text>
    </box>
  );
}
