import type { Metadata } from "next";
import { ReportExperience } from "./report-experience";

export const metadata: Metadata = {
  title: "你的关系边界地图",
  description: "基于本次原始回答生成的 Phase 1 Mock 边界报告。",
};

export default function ReportPage() {
  return <ReportExperience />;
}
