import { OpenAIProvider } from "./openai-provider";
import type { AIProviderConfig } from "../config";

export class DeepSeekProvider extends OpenAIProvider {
  constructor(overrides: Partial<AIProviderConfig> = {}) {
    super({ ...overrides, providerName: overrides.providerName ?? "deepseek-compatible" });
  }
}
