import type { AITelemetry } from "@/lib/domain/schemas";
import type {
  GenerateQuestionInput,
  GenerateQuestionOutput,
  InterpretAnswerInput,
  InterpretAnswerOutput,
  PlanProbeInput,
  PlanProbeOutput,
  WriteReportInput,
  WriteReportOutput,
} from "./contracts";

export type AIProviderResult<T> = {
  data: T;
  telemetry: AITelemetry;
};

export interface AIProvider {
  interpretAnswer(input: InterpretAnswerInput): Promise<AIProviderResult<InterpretAnswerOutput>>;
  planProbe(input: PlanProbeInput): Promise<AIProviderResult<PlanProbeOutput>>;
  generateQuestion(input: GenerateQuestionInput): Promise<AIProviderResult<GenerateQuestionOutput>>;
  writeReport(input: WriteReportInput): Promise<AIProviderResult<WriteReportOutput>>;
}

export class ProviderCallError extends Error {
  telemetry?: AITelemetry;
  errorType: string;

  constructor(message: string, errorType: string, telemetry?: AITelemetry) {
    super(message);
    this.name = "ProviderCallError";
    this.errorType = errorType;
    this.telemetry = telemetry;
  }
}
