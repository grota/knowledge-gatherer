import { Command } from "@oclif/core";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createOpencodeClient } from "@opencode-ai/sdk/client";
import { OpencodeApp } from "../components/OpencodeApp";

export default class Opencode extends Command {
  static override description = "Browse opencode projects and sessions";
  static override aliases = ["oc"];
  static override examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:3000",
    });

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
    });

    createRoot(renderer).render(<OpencodeApp client={client} />);
  }
}
