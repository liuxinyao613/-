import { WriteReportInputSchema } from "@/lib/ai/contracts";
import { getServerAIProvider, providerErrorResponse } from "@/lib/ai/server";

export async function POST(request: Request) {
  try {
    const input = WriteReportInputSchema.parse(await request.json());
    const result = await getServerAIProvider().writeReport(input);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
