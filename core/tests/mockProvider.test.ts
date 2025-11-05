import { describe, expect, it } from "vitest";
import { MockProvider } from "../src/ai/mockProvider.js";

describe("MockProvider", () => {
  it("returns echoed message", async () => {
    const provider = new MockProvider();
    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: "user", content: "Hej" }])) {
      chunks.push(chunk);
    }
    expect(chunks[0]).toEqual({ type: "text", data: "Mock response to: Hej" });
  });
});
