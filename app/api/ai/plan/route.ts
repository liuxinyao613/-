import { PlanProbeInputSchema } from "@/lib/ai/contracts";
import { getServerAIProvider, providerErrorResponse } from "@/lib/ai/server";

export async function POST(request: Request) {
  try {
    const input = PlanProbeInputSchema.parse(await request.json());
    const result = await getServerAIProvider().planProbe(input);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
