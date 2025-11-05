import { Flags, Command } from "@oclif/core";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildProvider, MockProvider, type AiMessage } from "@pro-assist/core";
import { fetchProviderConfig } from "../utils/tool-runner";

export default class Chat extends Command {
  static description = "Chatta med agenten";

  static flags = {
    provider: Flags.string({
      description: "Vilken provider som ska användas",
      options: ["mock", "openai", "anthropic", "ollama"],
      default: "mock"
    })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(Chat);
    const providerConfig = (await fetchProviderConfig(flags.provider)) ?? {};
    const provider = this.createProvider(flags.provider, providerConfig);
    const history: AiMessage[] = [];

    this.log(`Startar chat med ${flags.provider}. Skriv 'exit' för att avsluta.`);
    const rl = createInterface({ input, output });

    while (true) {
      const prompt = await rl.question("Du: ");
      if (prompt.trim().toLowerCase() === "exit") {
        break;
      }
      history.push({ role: "user", content: prompt });
      output.write("Pro Assist: ");
      let response = "";
      for await (const chunk of provider.streamChat(history)) {
        if (chunk.type === "text" && chunk.data) {
          response += chunk.data;
          output.write(chunk.data);
        }
      }
      output.write("\n");
      history.push({ role: "assistant", content: response });
    }

    rl.close();
  }

  private createProvider(name: string, config: Record<string, unknown>) {
    if (name === "mock") {
      return new MockProvider();
    }
    return buildProvider({ name, ...(config as Record<string, unknown>) } as any);
  }
}
