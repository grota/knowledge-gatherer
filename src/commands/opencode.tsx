import { Command } from "@oclif/core";
import { createCliRenderer, ConsolePosition } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk/v2";
import { OpencodeApp } from "../components/OpencodeApp";

const BASE_URL = "http://127.0.0.1:4096";

export default class Opencode extends Command {
  static override description = "Browse opencode projects and sessions";
  static override aliases = ["oc"];
  static override examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse();

    const client = createOpencodeClient({ baseUrl: BASE_URL });

    // Try connecting to an existing server first
    let serverClose: (() => void) | undefined;
    const health = await client.global.health().catch(() => null);
    if (!health?.data) {
      const server = await createOpencodeServer({
        hostname: "127.0.0.1",
        port: 4096,
        timeout: 5000,
      });
      serverClose = server.close;

      // Confirm the newly started server is reachable
      const retry = await client.global.health().catch(() => null);
      if (!retry?.data) {
        serverClose();
        throw new Error("Could not connect to opencode server after starting it");
      }
    }

    const renderer = await createCliRenderer({ exitOnCtrlC: false, consoleOptions: {position: ConsolePosition.BOTTOM, sizePercent: 30 } });
    renderer.keyInput.on("keypress", (key) => {
      // Toggle with backtick key
      if (key.name === "`") {
        renderer.console.toggle()
      }
    })

    // Ensure the server we started is always closed when the renderer exits
    if (serverClose) {
      renderer.on("destroy", serverClose);
    }

    createRoot(renderer).render(<OpencodeApp client={client} />);
  }
}
