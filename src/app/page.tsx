"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AGE_GROUPS, HEALTH_CONDITIONS, PA_COUNTIES } from "@/lib/data";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

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
  const selectedCountyData = PA_COUNTIES.find((c) => c.value === county);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-[#1e3a5f] text-white py-5 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight">
            PASS Equity Atlas
          </h1>
          <p className="mt-1 text-blue-200">
            Pennsylvania Air Quality &amp; Health Equity Atlas
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left panel — Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 sticky top-4">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                Your Health Profile
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Select your details to see a personalized exposure &amp; health
                assessment for susceptible populations.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* County — search-like */}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Search Your County
                  </label>
                  <select
                    value={county}
                    onChange={(e) => setCounty(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-sm"
                  >
                    <option value="">Select your county...</option>
                    {PA_COUNTIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label} — {c.region}
                      </option>
                    ))}
                  </select>
                  {selectedCountyData && (
                    <p className="mt-1.5 text-xs text-blue-600">
                      Map centered on {selectedCountyData.label}
                    </p>
                  )}
                </div>

                {/* Age Group */}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Age Group
                  </label>
                  <select
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-sm"
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
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Sensitive Population Conditions
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select all that apply. These identify you as part of a
                    susceptible population group.
                  </p>
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                    {HEALTH_CONDITIONS.map((c) => (
                      <label
                        key={c.value}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition text-sm ${
                          conditions.includes(c.value)
                            ? "bg-blue-50 border-blue-400 text-blue-900"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={conditions.includes(c.value)}
                          onChange={() => toggleCondition(c.value)}
                          className="w-4 h-4 text-blue-600 rounded shrink-0"
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!isValid}
                  className={`w-full py-3.5 px-6 rounded-lg text-white font-semibold transition ${
                    isValid
                      ? "bg-[#1e3a5f] hover:bg-[#163050] cursor-pointer"
                      : "bg-gray-300 cursor-not-allowed"
                  }`}
                >
                  View My Assessment
                </button>
              </form>
            </div>
          </div>

          {/* Right panel — Map + Info */}
          <div className="lg:col-span-3 space-y-5">
            <Map
              selectedCounty={county}
              onCountySelect={(val) => setCounty(val)}
            />

            <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-2">
                EPA Monitor Network
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Blue dots show <strong>EPA-vetted AQS monitors</strong> (gold
                standard air quality measurement). Dashed circles show the
                15.5-mile coverage zone around each monitor. Areas outside these
                zones have <strong>monitoring gaps</strong> — exposure estimates
                are less precise. Click a county label on the map or use the
                dropdown to explore.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <h3 className="font-semibold text-blue-900 mb-2">
                About This Tool
              </h3>
              <p className="text-sm text-blue-800 leading-relaxed">
                The PASS Equity Atlas helps <strong>susceptible
                populations</strong> — those with asthma, diabetes,
                hypertension, obesity, and other conditions — understand their
                environmental health risks. Select your health profile and
                county to see personalized air quality alerts, health outcome
                data, and preventive recommendations. This is not medical
                advice — consult your healthcare provider for clinical
                decisions.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-100 border-t border-gray-200 py-5 px-4 mt-auto">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
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
