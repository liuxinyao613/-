import { InterpretAnswerInputSchema } from "@/lib/ai/contracts";
import { getServerAIProvider, providerErrorResponse } from "@/lib/ai/server";

export async function POST(request: Request) {
  try {
    const input = InterpretAnswerInputSchema.parse(await request.json());
    const result = await getServerAIProvider().interpretAnswer(input);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
