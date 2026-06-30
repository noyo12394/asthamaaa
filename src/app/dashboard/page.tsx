"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import {
  assessRisk,
  AGE_GROUPS,
  PA_COUNTIES,
  type ExposureAlert,
  type HealthOutcome,
  type RiskAssessment,
} from "@/lib/data";

function statusColor(status: ExposureAlert["status"]) {
  switch (status) {
    case "good":
      return { bg: "bg-green-50", border: "border-green-300", text: "text-green-800", badge: "bg-green-600" };
    case "moderate":
      return { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", badge: "bg-yellow-500" };
    case "unhealthy-sensitive":
      return { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", badge: "bg-orange-500" };
    case "unhealthy":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", badge: "bg-red-600" };
    case "hazardous":
      return { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800", badge: "bg-purple-700" };
  }
}

function statusLabel(status: ExposureAlert["status"]) {
  switch (status) {
    case "good": return "Good";
    case "moderate": return "Moderate";
    case "unhealthy-sensitive": return "Alert: Sensitive Groups";
    case "unhealthy": return "Unhealthy";
    case "hazardous": return "Hazardous";
  }
}

function riskColor(level: HealthOutcome["riskLevel"]) {
  switch (level) {
    case "low":
      return { bg: "bg-green-50", border: "border-green-300", text: "text-green-800", badge: "bg-green-600" };
    case "moderate":
      return { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", badge: "bg-yellow-500" };
    case "elevated":
      return { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", badge: "bg-orange-500" };
    case "high":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", badge: "bg-red-600" };
  }
}

function overallRiskDisplay(risk: RiskAssessment["overallRisk"]) {
  switch (risk) {
    case "low":
      return { color: "bg-green-600", label: "Low Risk", description: "Your combined exposure and health profile suggests low overall risk." };
    case "moderate":
      return { color: "bg-yellow-500", label: "Moderate Risk", description: "Some factors warrant attention. Review the details below and consider preventive measures." };
    case "high":
      return { color: "bg-orange-500", label: "High Risk", description: "Multiple risk factors are elevated. Review recommendations and consider consulting your healthcare provider." };
    case "very-high":
      return { color: "bg-red-600", label: "Very High Risk", description: "Significant health and exposure risks identified. We recommend discussing these findings with your healthcare provider." };
  }
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const age = searchParams.get("age") ?? "";
  const conditionsStr = searchParams.get("conditions") ?? "";
  const county = searchParams.get("county") ?? "";

  if (!age || !conditionsStr || !county) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-600 text-lg">No profile data provided.</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
          Go back and enter your information
        </Link>
      </div>
    );
  }

  const profile = {
    ageGroup: age,
    conditions: conditionsStr.split(","),
    county,
  };

  const assessment = assessRisk(profile);
  const overall = overallRiskDisplay(assessment.overallRisk);
  const ageLabel = AGE_GROUPS.find((g) => g.value === age)?.label ?? age;
  const countyLabel = PA_COUNTIES.find((c) => c.value === county)?.label ?? county;
  const isSusceptible = assessment.susceptibilityScore > 1.2;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Profile Summary & Overall Risk */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Your Profile</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Age Group</dt>
              <dd className="font-medium text-gray-900">{ageLabel}</dd>
            </div>
            <div>
              <dt className="text-gray-500">County</dt>
              <dd className="font-medium text-gray-900">{countyLabel}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Health Conditions</dt>
              <dd className="font-medium text-gray-900">
                {profile.conditions.includes("none")
                  ? "None reported"
                  : profile.conditions
                      .map((c) => c.replace(/_/g, " "))
                      .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
                      .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Susceptibility Level</dt>
              <dd>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-white text-xs font-semibold ${
                    isSusceptible ? "bg-orange-500" : "bg-green-600"
                  }`}
                >
                  {isSusceptible ? "Elevated Susceptibility" : "Standard"}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className={`rounded-xl shadow p-6 border ${
          assessment.overallRisk === "low" ? "bg-green-50 border-green-200" :
          assessment.overallRisk === "moderate" ? "bg-yellow-50 border-yellow-200" :
          assessment.overallRisk === "high" ? "bg-orange-50 border-orange-200" :
          "bg-red-50 border-red-200"
        }`}>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Overall Assessment</h2>
          <div className="flex items-center gap-3 mb-4">
            <span className={`inline-block w-4 h-4 rounded-full ${overall.color}`} />
            <span className="text-2xl font-bold">{overall.label}</span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{overall.description}</p>
          {isSusceptible && (
            <p className="mt-3 text-sm text-gray-700 leading-relaxed">
              Your health profile indicates <strong>elevated susceptibility</strong> to
              air pollution effects. The thresholds shown below have been adjusted
              to reflect your personal risk factors.
            </p>
          )}
        </div>
      </div>

      {/* Monitor Coverage */}
      <div className={`rounded-xl shadow p-6 border ${
        assessment.monitorCoverage.coverageGap
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-gray-100"
      }`}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          EPA Monitor Coverage
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block">Nearest EPA Monitor</span>
            <span className="text-xl font-bold text-gray-900">
              {assessment.monitorCoverage.nearestMonitorMiles.toFixed(1)} miles
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Monitor Type</span>
            <span className="font-medium text-gray-900">
              {assessment.monitorCoverage.monitorType}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Coverage Status</span>
            <span
              className={`inline-block px-3 py-1 rounded-full text-white text-xs font-semibold ${
                assessment.monitorCoverage.coverageGap
                  ? "bg-amber-500"
                  : "bg-green-600"
              }`}
            >
              {assessment.monitorCoverage.coverageGap
                ? "Monitoring Gap"
                : "Within Coverage (15.5 mi)"}
            </span>
          </div>
        </div>
        {assessment.monitorCoverage.coverageGap && (
          <p className="mt-4 text-sm text-amber-800">
            Your area falls outside the 15.5-mile EPA monitor coverage zone.
            Exposure estimates may be less precise due to the distance from the
            nearest EPA-vetted monitor. Additional monitoring infrastructure
            would improve exposure assessment in your area.
          </p>
        )}
      </div>

      {/* Exposure Alerts */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Air Quality Exposure Levels
        </h2>
        {isSusceptible && (
          <p className="text-sm text-gray-600 mb-4">
            Thresholds adjusted for your susceptibility profile. Standard
            population thresholds may differ.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assessment.exposureAlerts.map((alert) => {
            const colors = statusColor(alert.status);
            return (
              <div
                key={alert.pollutant}
                className={`rounded-xl p-5 border ${colors.bg} ${colors.border}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className={`font-semibold ${colors.text}`}>
                    {alert.pollutant}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-white text-xs font-semibold ${colors.badge}`}
                  >
                    {statusLabel(alert.status)}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${colors.text} mb-2`}>
                  {alert.level}{" "}
                  <span className="text-sm font-normal">{alert.unit}</span>
                </p>
                <p className={`text-sm ${colors.text} leading-relaxed`}>
                  {alert.message}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Health Outcomes */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Local Health Outcomes
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          County-level prevalence rates for conditions linked to environmental
          exposures. Risk levels reflect the intersection of local health data
          and your personal susceptibility.
        </p>
        <div className="space-y-3">
          {assessment.healthOutcomes.map((outcome) => {
            const colors = riskColor(outcome.riskLevel);
            return (
              <div
                key={outcome.condition}
                className={`rounded-xl p-5 border ${colors.bg} ${colors.border}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-semibold ${colors.text}`}>
                    {outcome.condition}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      Prevalence: {outcome.prevalenceRate}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-white text-xs font-semibold ${colors.badge}`}
                    >
                      {outcome.riskLevel.charAt(0).toUpperCase() +
                        outcome.riskLevel.slice(1)}
                    </span>
                  </div>
                </div>
                <p className={`text-sm ${colors.text} leading-relaxed`}>
                  {outcome.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h2 className="text-xl font-bold text-blue-900 mb-4">
          Personalized Recommendations
        </h2>
        <ul className="space-y-3">
          {assessment.recommendations.map((rec, i) => (
            <li key={i} className="flex gap-3 text-sm text-blue-900 leading-relaxed">
              <span className="text-blue-500 mt-0.5 shrink-0">&#9679;</span>
              {rec}
            </li>
          ))}
        </ul>
        <div className="mt-6 p-4 bg-white rounded-lg border border-blue-100">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong>Disclaimer:</strong> This assessment is for informational
            purposes only and does not constitute medical advice. The data
            presented reflects county-level averages from EPA monitors and public
            health datasets. Individual exposure may vary. If you have concerns
            about your health, please consult a qualified healthcare provider.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/"
          className="flex-1 text-center py-3 px-6 rounded-lg bg-[#1e3a5f] text-white font-semibold hover:bg-[#163050] transition"
        >
          Update My Profile
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-[#1e3a5f] text-white py-6 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="hover:opacity-90 transition">
              <h1 className="text-2xl font-bold tracking-tight">
                PASS Equity Atlas
              </h1>
            </Link>
            <p className="mt-1 text-blue-200 text-sm">
              Your Personalized Exposure &amp; Health Assessment
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-blue-200 hover:text-white transition"
          >
            ← New Assessment
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <Suspense
          fallback={
            <div className="max-w-5xl mx-auto px-4 py-20 text-center text-gray-500">
              Loading your assessment...
            </div>
          }
        >
          <DashboardContent />
        </Suspense>
      </main>

      <footer className="bg-gray-100 border-t border-gray-200 py-6 px-4 mt-auto">
        <div className="max-w-5xl mx-auto text-center text-sm text-gray-500">
          <p>
            PASS Equity Atlas — Lehigh University | Environmental Health Equity
            Research
          </p>
          <p className="mt-1">
            Data sources: EPA AQS Monitors, CDC PLACES, U.S. Census Bureau
          </p>
        </div>
      </footer>
    </div>
  );
}
