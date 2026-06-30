"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AGE_GROUPS, HEALTH_CONDITIONS, PA_COUNTIES } from "@/lib/data";

export default function Home() {
  const router = useRouter();
  const [ageGroup, setAgeGroup] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [county, setCounty] = useState("");

  function toggleCondition(value: string) {
    if (value === "none") {
      setConditions(["none"]);
      return;
    }
    setConditions((prev) => {
      const filtered = prev.filter((c) => c !== "none");
      return filtered.includes(value)
        ? filtered.filter((c) => c !== value)
        : [...filtered, value];
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ageGroup || conditions.length === 0 || !county) return;
    const params = new URLSearchParams({
      age: ageGroup,
      conditions: conditions.join(","),
      county,
    });
    router.push(`/dashboard?${params.toString()}`);
  }

  const isValid = ageGroup && conditions.length > 0 && county;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-[#1e3a5f] text-white py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight">
            PASS Equity Atlas
          </h1>
          <p className="mt-2 text-blue-200 text-lg">
            Pennsylvania Air Quality &amp; Health Equity Atlas
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Your Health &amp; Exposure Profile
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Enter your information below to receive a personalized assessment
              of air quality exposure levels and health outcomes in your area.
              This tool is designed to help <strong>susceptible populations</strong> —
              including those with pre-existing conditions, older adults, and
              children — understand their environmental health risks and take
              preventive action.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Age Group */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Age Group
              </label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              >
                <option value="">Select your age group</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Health Conditions */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Pre-existing Health Conditions
              </label>
              <p className="text-sm text-gray-500 mb-3">
                Select all that apply. These conditions may increase your
                susceptibility to air pollution effects.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HEALTH_CONDITIONS.map((c) => (
                  <label
                    key={c.value}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition ${
                      conditions.includes(c.value)
                        ? "bg-blue-50 border-blue-400 text-blue-900"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={conditions.includes(c.value)}
                      onChange={() => toggleCondition(c.value)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* County */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                County (Pennsylvania)
              </label>
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              >
                <option value="">Select your county</option>
                {PA_COUNTIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} — {c.region}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!isValid}
              className={`w-full py-4 px-6 rounded-lg text-white font-semibold text-lg transition ${
                isValid
                  ? "bg-[#1e3a5f] hover:bg-[#163050] cursor-pointer"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              View My Exposure &amp; Health Assessment
            </button>
          </form>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 mb-2">
            About This Tool
          </h3>
          <p className="text-sm text-blue-800 leading-relaxed">
            The PASS Equity Atlas integrates EPA air quality monitor data with
            county-level health outcome data to provide personalized risk
            assessments. This tool uses <strong>EPA-vetted monitor data</strong> (not
            low-cost sensors) as its primary data source. Monitor coverage varies
            significantly across Pennsylvania — areas outside major metropolitan
            regions (Philadelphia, Pittsburgh) often have substantial monitoring
            gaps. Your assessment accounts for both your personal health
            susceptibility and local environmental conditions.
          </p>
        </div>
      </main>

      <footer className="bg-gray-100 border-t border-gray-200 py-6 px-4 mt-auto">
        <div className="max-w-4xl mx-auto text-center text-sm text-gray-500">
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
