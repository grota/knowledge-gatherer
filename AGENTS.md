# AGENTS.md — knowledge-gatherer

Guidelines for agentic coding agents working in this repository.

## Project Overview

`knowledge-gatherer` is a terminal user interface (TUI) application built with:
- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode, ESNext)
- **UI Framework**: OpenTUI (`@opentui/react` + `@opentui/core`) — renders React components to the terminal, not a browser
- **CLI Framework**: oclif — exposes the CLI binary as `kg`
- **AI SDK**: `@opencode-ai/sdk`

## Commands

### Development

```bash
# Run in watch mode (hot reload)
bun run dev
# equivalent: bun run --watch src/index.tsx
```

### Testing

```bash
# Run all tests
bun test

# Run a single test file
bun test src/components/Button.test.tsx

# Run tests matching a name pattern
bun test --filter "Button renders"

# Watch mode
bun test --watch

# Update snapshots
bun test --update-snapshots

# Verbose output
bun test --verbose
```

There are no separate build or lint scripts. No eslint/prettier configs exist — rely on TypeScript compiler strictness instead.

## TypeScript Configuration

Key `tsconfig.json` settings:
- `strict: true` — all strict checks enabled
- `noUncheckedIndexedAccess: true` — array/index access returns `T | undefined`
- `noImplicitOverride: true` — `override` keyword required when overriding class members
- `noFallthroughCasesInSwitch: true`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `jsxImportSource: "@opentui/react"` — JSX targets the terminal, not the DOM
- `moduleResolution: "bundler"` — Bun bundler resolution
- `noUnusedLocals: false`, `noUnusedParameters: false` — unused vars are allowed

## Code Style

### Imports

```typescript
// Named imports preferred
import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot } from "@opentui/react";

// Type-only imports must use `import type` (verbatimModuleSyntax)
import type { Renderer } from "@opentui/core";

// React hooks come from "react"; OpenTUI hooks from "@opentui/react"
import { useState, useEffect } from "react";
import { useKeypress } from "@opentui/react";
```

- No file extensions in import paths (even though `allowImportingTsExtensions` is enabled)
- ESM only (`"type": "module"` in package.json); no CommonJS

### Components

```typescript
// Function declarations, not arrow function assignments
function App() {
  return (
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <text>Hello</text>
    </box>
  );
}

// Explicit typed props inline
function Greeting({ name }: { name: string }) {
  return <text>Hello, {name}!</text>;
}
```

- Use function declarations (not `const Foo = () => ...`) for components
- JSX elements are OpenTUI intrinsics (`<box>`, `<text>`, `<ascii-font>`) — never HTML elements
- Layout uses flexbox-style props directly on `<box>`: `alignItems`, `justifyContent`, `flexGrow`, `flexDirection`

### Types

```typescript
// Prefer `type` aliases over `interface`
type Action =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "reset"; payload: number };

// Use discriminated unions for state machines
type State =
  | { status: "loading" }
  | { status: "success"; data: string[] }
  | { status: "error"; message: string };
```

- Avoid `any`; use `unknown` and narrow with type guards
- `noUncheckedIndexedAccess` means array access yields `T | undefined` — always guard

### Naming Conventions

- **Components**: PascalCase function declarations
- **Hooks**: camelCase prefixed with `use` (e.g., `useTheme`, `useKeypress`)
- **Files**: `ComponentName.tsx` for components, `ComponentName.test.tsx` for tests
- **Variables/functions**: camelCase
- **Types/interfaces**: PascalCase
- **Constants**: camelCase (not SCREAMING_SNAKE_CASE unless truly global constants)

### Code Comments

Only comment code that needs clarification. Specifically, **always add a comment** when:

- A workaround is used because of an external SDK or OS limitation (explain *why*, not just *what*).
- Process-management tricks are used (e.g. `pgrep` + `kill` instead of the SDK's own `.close()` method — see `src/commands/opencode.tsx` for the pattern and the reason).
- Non-obvious framework quirks are worked around (e.g. using `useKeyboard` exclusively instead of `<input>` + `useKeyboard` together, because the two compete for keystrokes in OpenTUI).

Do **not** comment self-evident code.

### Error Handling

```typescript
// Standard error handling pattern
try {
  const result = await fetchData();
  setData(result);
} catch (e) {
  setError(e instanceof Error ? e.message : "Unknown error");
}

// Custom hook that throws if used outside provider
function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

### Top-level await

Top-level `await` is valid and used in this codebase (ESM + Bun):

```typescript
const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
```

## OpenTUI-Specific Rules

**Critical**: These rules differ from standard React/DOM development.

1. **NEVER call `process.exit()`** — always call `renderer.destroy()` to clean up and exit gracefully
2. **No DOM APIs** — `document`, `window`, `localStorage`, etc. do not exist in the terminal
3. **Layout is flexbox** — use `<box>` with flex props; no CSS, no className
4. **Text must be in `<text>`** — bare string children may not render; wrap in `<text>`
5. **Keyboard handling** — use `useKeypress` from `@opentui/react` or listen to `renderer.keyInput`

## Testing Patterns

Tests use Bun's built-in test runner (`bun:test`) and OpenTUI's headless test renderer.

### React component test template

```tsx
import { test, expect, afterEach } from "bun:test";
import { testRender } from "@opentui/react/test-utils";

let testSetup: Awaited<ReturnType<typeof testRender>>;

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy(); // Always clean up
  }
});

test("MyComponent renders correctly", async () => {
  testSetup = await testRender(<MyComponent />, { width: 80, height: 24 });
  await testSetup.renderOnce(); // Required before capturing
  const frame = testSetup.captureCharFrame();
  expect(frame).toContain("expected text");
});
```

### Test file placement

```
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx    # co-located with source
├── hooks/
│   ├── useCounter.ts
│   └── useCounter.test.ts
```

### Key testing gotchas

- Always call `await testSetup.renderOnce()` before `captureCharFrame()` — rendering is async
- Always destroy the renderer in `afterEach` — failure to do so leaks resources across tests
- Use consistent dimensions (e.g., `{ width: 80, height: 24 }`) for stable snapshots

## Repository Structure

```
knowledge-gatherer/
├── src/
│   └── index.tsx          # Main app entry point
├── bin/
│   ├── run.js             # Production CLI entry (kg binary)
│   └── dev.js             # Dev CLI entry (ts-node/esm)
├── .agents/
│   └── skills/
│       └── opentui/
│           ├── SKILL.md               # Full OpenTUI agent skill — load with the skill tool
│           └── references/            # Detailed API references
│               ├── react/
│               ├── core/
│               ├── layout/
│               ├── components/
│               ├── keyboard/
│               ├── animation/
│               └── testing/
│                   └── REFERENCE.md
├── package.json
├── tsconfig.json
└── bun.lock
```

## Agent Skills

This repo has a registered OpenTUI skill at `.agents/skills/opentui/SKILL.md`.
When working on TUI components, layout, keyboard handling, animation, or testing,
**load the skill** using the skill tool before writing code:

```
skill("opentui")
```

The skill contains critical rules, decision trees, and detailed API references that
are required to write correct OpenTUI code.
