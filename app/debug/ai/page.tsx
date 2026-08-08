import { notFound } from "next/navigation";
import { AITelemetryPanel } from "./telemetry-panel";

export default function AIDebugPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AITelemetryPanel />;
}
