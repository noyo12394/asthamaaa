import type { Metadata } from "next";
import MonitoringDivide from "@/components/monitoring-equity/MonitoringDivide";
export const metadata: Metadata = {
  title: "The Monitoring Divide",
  description:
    "A tract-level study of PM2.5 monitoring proximity, population, and social vulnerability across the five-state PASS region.",
};
export default function MonitoringEquityPage() {
  return <MonitoringDivide />;
}
