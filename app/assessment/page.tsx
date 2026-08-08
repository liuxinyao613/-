import type { Metadata } from "next";
import { AssessmentExperience } from "./assessment-experience";

export const metadata: Metadata = {
  title: "个人关系边界测试",
  description: "Core-24 与固定 Mock Adaptive 追问。",
};

export default function AssessmentPage() {
  return <AssessmentExperience />;
}
