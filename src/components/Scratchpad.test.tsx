import { test, expect, afterEach } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Scratchpad } from "./Scratchpad";

let testSetup: Awaited<ReturnType<typeof testRender>>;

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy();
  }
});

// Minimal inline component to test row layout without all the Scratchpad complexity
function TestRows({ rows }: { rows: string[] }) {
  const VISIBLE = rows.length;
  return (
    <box flexDirection="column" border height={VISIBLE + 3}>
      <box flexDirection="row" height={1} paddingX={1} backgroundColor="#1a1b26">
        <text fg="#e0af68">Header</text>
      </box>
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {rows.map((row, i) => (
          <box key={i} height={1} paddingLeft={1} overflow="hidden">
            <text fg="#c0caf5">{row}</text>
          </box>
        ))}
      </box>
    </box>
  );
}

test("rows render without interleaving at width=80", async () => {
  const rows = [
    "Line one: short",
    "Line two: also short",
    "Line three: medium length text here",
    "Line four: **Fix:** bind the node with context",
    "Line five: Verified with a full test matrix",
  ];

  testSetup = await testRender(<TestRows rows={rows} />, { width: 80, height: 10 });
  await testSetup.renderOnce();
  const frame = testSetup.captureCharFrame();
  console.log("Frame w=80:\n" + frame);

  for (const row of rows) {
    expect(frame).toContain(row.slice(0, 15));
  }
});

test("rows render without interleaving at width=220", async () => {
  const rows = [
    "Line one: short",
    "Line two: also short",
    "Line three: medium length text here",
    "Line four: **Fix:** bind the node with context, substitution: lots of text here to make it longer than 80 chars yes indeed it is very long now okay",
    "Line five: Verified with a full test matrix including many items yes this one is also long to ensure we test properly",
  ];

  testSetup = await testRender(<TestRows rows={rows} />, { width: 220, height: 10 });
  await testSetup.renderOnce();
  const frame = testSetup.captureCharFrame();
  console.log("Frame w=220:\n" + frame);

  for (const row of rows) {
    expect(frame).toContain(row.slice(0, 20));
  }
});

// Simulate the actual live app layout: Scratchpad embedded in detail view
function DetailViewWithScratchpad({ lines }: { lines: string[] }) {
  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Simulate SessionDetail - takes most space */}
      <box flexDirection="column" flexGrow={1} border>
        <text>SessionDetail placeholder</text>
      </box>
      {/* Actual Scratchpad */}
      <Scratchpad
        lines={lines}
        onChange={() => {}}
        focused={false}
        onFocus={() => {}}
      />
    </box>
  );
}

test("Scratchpad renders without interleaving in detail view at 220x50", async () => {
  const lines = [
    "All good. Here is the full summary of what was found and fixed:",
    "",
    "---",
    "",
    "## What was wrong and what was fixed",
    "",
    "### GraphQL call itself",
    "The call was correct. It works and returns the right shape.",
    "",
    "### The jq post-processing (the actual bug)",
    "The expression had two problems:",
    "",
    "1. Lost object context — inside select(), the sub-expression pipes a string into test(), then tries to access .pattern on that string, which fails.",
    "",
    "2. Incorrect glob-to-regex translation.",
    "",
    "Fix: bind the node with node as $node to preserve context, then do a two-pass substitution.",
    "Verified with a full test matrix including main, release/*, feature/**, and non-matching branches.",
    "",
    "### On the exit 0 question",
    "An exit 0 inside a run block only exits that shell script — the next step runs regardless.",
  ];

  testSetup = await testRender(<DetailViewWithScratchpad lines={lines} />, { width: 220, height: 50 });
  await testSetup.renderOnce();
  const frame = testSetup.captureCharFrame();
  const frameLines = frame.split("\n");
  // The scratchpad panel is the last 13 lines (VISIBLE=10 + 2 border + 1 header)
  const scratchArea = frameLines.slice(-13).join("\n");
  console.log("Scratchpad area:\n" + scratchArea);

  // At least some of the last lines should appear
  expect(scratchArea).toContain("exit 0");
});
