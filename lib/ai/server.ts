import { OpenAIProvider } from "./providers/openai-provider";
import { ProviderCallError } from "./provider";

export function getServerAIProvider() {
  return new OpenAIProvider();
}

export function providerErrorResponse(error: unknown): Response {
  const providerError =
    error instanceof ProviderCallError
      ? error
      : new ProviderCallError(
          error instanceof Error ? error.message : "Unknown AI route error.",
          "ROUTE_ERROR",
        );
  return Response.json(
    {
      ok: false,
      error: { type: providerError.errorType, message: providerError.message },
      telemetry: providerError.telemetry,
    },
    { status: providerError.errorType === "CONFIGURATION" ? 503 : 502 },
  );
}
