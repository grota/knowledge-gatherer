import { Command } from "@oclif/core";
import { createCliRenderer, ConsolePosition } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk/v2";
import { OpencodeApp } from "../components/OpencodeApp";

const BASE_URL = "http://127.0.0.1:4096";

// ─── Server lifecycle helpers ──────────────────────────────────────────────
//
// WHY NOT server.close()?
//   createOpencodeServer() spawns a Node.js wrapper process (e.g.
//   `/usr/bin/node .../opencode serve`) which itself spawns the real binary
//   (`.opencode serve`) as a child.  The SDK's server.close() calls
//   proc.kill() on the wrapper only; the binary child is re-parented to init
//   and keeps running as an orphan.
//
//   Workaround: snapshot pgrep output *before* and *after* the spawn so we
//   know every new PID that appeared (wrapper + binary + any grandchildren).
//   On destroy we send SIGTERM to each PID and, speculatively, to its
//   process-group (process.kill(-pid)) in case the process is a group leader.
//
// Returns the PIDs of all running "opencode serve" processes.
function getOpencodePids(): Set<number> {
  try {
    const result = Bun.spawnSync({ cmd: ["pgrep", "-f", "opencode serve"], stdout: "pipe" });
    const out = result.stdout?.toString().trim() ?? "";
    if (!out) return new Set();
    return new Set(out.split("\n").map(Number).filter((n) => !isNaN(n) && n > 0));
  } catch {
    return new Set();
  }
}

// Sends SIGTERM to each pid and, if it is a process-group leader, to the group.
function killPids(pids: Set<number>): void {
  for (const pid of pids) {
    try { process.kill(-pid, "SIGTERM"); } catch { /* not group leader or already dead */ }
    try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
  }
}

export default class Opencode extends Command {
  static override description = "Browse opencode projects and sessions";
  static override aliases = ["oc"];
  static override examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse();

    const client = createOpencodeClient({ baseUrl: BASE_URL });

    // Try connecting to an existing server first; if none found, spawn one.
    let spawnedPids: Set<number> = new Set();
    const health = await client.global.health().catch(() => null);
    if (!health?.data) {
      const pidsBefore = getOpencodePids();

      await createOpencodeServer({
        hostname: "127.0.0.1",
        port: 4096,
        timeout: 5000,
      });

      spawnedPids = new Set([...getOpencodePids()].filter((p) => !pidsBefore.has(p)));

      // Confirm the newly started server is reachable
      const retry = await client.global.health().catch(() => null);
      if (!retry?.data) {
        killPids(spawnedPids);
        throw new Error("Could not connect to opencode server after starting it");
      }
    }

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      consoleOptions: { position: ConsolePosition.BOTTOM, sizePercent: 30 },
      onDestroy: () => { killPids(spawnedPids); },
    });
    renderer.keyInput.on("keypress", (key) => {
      // Toggle with backtick key
      if (key.name === "`") {
        renderer.console.toggle();
      }
    });

    createRoot(renderer).render(<OpencodeApp client={client} />);
  }
}
