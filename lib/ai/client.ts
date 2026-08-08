"use client";

import { z } from "zod";
import {
  AIErrorEnvelopeSchema,
  AIResponseEnvelopeSchema,
} from "./contracts";
import type { AITelemetry } from "@/lib/domain/schemas";

export class AIClientError extends Error {
  telemetry?: AITelemetry;
  errorType: string;

  constructor(message: string, errorType: string, telemetry?: AITelemetry) {
    super(message);
    this.name = "AIClientError";
    this.errorType = errorType;
    this.telemetry = telemetry;
  }
}

export async function postAI<T>(
  path: string,
  input: unknown,
  schema: z.ZodType<T>,
): Promise<{ data: T; telemetry: AITelemetry }> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const raw = await response.json();
  const success = AIResponseEnvelopeSchema(schema).safeParse(raw);
  if (success.success) return success.data;
  const failure = AIErrorEnvelopeSchema.safeParse(raw);
  if (failure.success) {
    throw new AIClientError(
      failure.data.error.message,
      failure.data.error.type,
      failure.data.telemetry,
    );
  }
  throw new AIClientError("AI route returned an invalid envelope.", "INVALID_ENVELOPE");
}
