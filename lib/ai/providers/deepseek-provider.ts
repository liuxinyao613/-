import { OpenAIProvider } from "./openai-provider";

export class DeepSeekProvider extends OpenAIProvider {
  constructor() {
    super({ providerName: "deepseek-compatible" });
  }
}
