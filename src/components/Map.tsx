"use client";

import { useEffect, useRef, useState } from "react";
import { EPA_MONITORS } from "@/lib/data";
import { COUNTIES, type MonitorLocation } from "@/lib/counties";

export interface MapLayers {
  monitors: boolean;
  coverage: boolean;
  pm25: boolean;
  no2: boolean;
  ozone: boolean;
  vulnerability: boolean;
}

interface MapProps {
  selectedCounty: string;
  onCountySelect?: (county: string) => void;
  layers: MapLayers;
}

const COVERAGE_RADIUS_METERS = 24945; // 15.5 miles

// 0–100 → green→yellow→orange→red
function riskColor(v: number): string {
  if (v < 25) return "#16a34a";
  if (v < 45) return "#eab308";
  if (v < 65) return "#f97316";
  return "#dc2626";
}

function metricValue(layer: keyof MapLayers, m: (typeof COUNTIES)[number]["metrics"]): number | null {
  switch (layer) {
    case "pm25":
      return Math.max(0, Math.min(100, ((m.pm25 - 5) / 10) * 100));
    case "no2":
      return m.no2Index;
    case "ozone":
      return m.ozoneIndex;
    case "vulnerability":
      return m.vulnerabilityIndex;
    default:
      return null;
  }
}

export default function Map({ selectedCounty, onCountySelect, layers }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const monitorLayerRef = useRef<L.LayerGroup | null>(null);
  const coverageLayerRef = useRef<L.LayerGroup | null>(null);
  const dataLayerRef = useRef<L.LayerGroup | null>(null);
  const countyMarkerRef = useRef<L.Marker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);

  // Init map once
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    import("leaflet").then((L) => {
      LRef.current = L;
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView(
        [40.9, -77.6],
        7
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      monitorLayerRef.current = L.layerGroup().addTo(map);
      coverageLayerRef.current = L.layerGroup().addTo(map);
      dataLayerRef.current = L.layerGroup().addTo(map);

      // Leaflet needs a size recalculation once the flex/grid container settles.
      setTimeout(() => map.invalidateSize(), 200);
      const ro = new ResizeObserver(() => map.invalidateSize());
      if (mapRef.current) ro.observe(mapRef.current);
      (map as unknown as { _ro?: ResizeObserver })._ro = ro;

      // County selector labels (always present, faint)
      COUNTIES.forEach((county) => {
        const icon = L.divIcon({
          html: `<div style="background:rgba(255,255,255,0.92);border:1px solid #cbd5e1;border-radius:4px;padding:1px 5px;font-size:10px;white-space:nowrap;color:#475569;box-shadow:0 1px 2px rgba(0,0,0,0.12);cursor:pointer;">${county.places[0]}</div>`,
          iconAnchor: [18, 8],
          className: "",
        });
        const mk = L.marker([county.lat, county.lng], { icon, zIndexOffset: -500 }).addTo(map);
        mk.on("click", () => onCountySelect?.(county.value));
      });

      mapInstanceRef.current = map;
      setReady(true);
    });

    return () => {
      const m = mapInstanceRef.current as unknown as { _ro?: ResizeObserver } | null;
      m?._ro?.disconnect();
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [onCountySelect]);

  // Monitors layer
  useEffect(() => {
    if (!ready || !LRef.current) return;
    const L = LRef.current;
    const group = monitorLayerRef.current!;
    group.clearLayers();
    if (!layers.monitors) return;
    const icon = L.divIcon({
      html: `<div style="width:11px;height:11px;background:#1e40af;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
      iconSize: [11, 11],
      iconAnchor: [5.5, 5.5],
      className: "",
    });
    EPA_MONITORS.forEach((mo: MonitorLocation) => {
      L.marker([mo.lat, mo.lng], { icon })
        .addTo(group)
        .bindPopup(
          `<div style="min-width:170px"><strong style="font-size:13px">${mo.name}</strong><div style="color:#666;font-size:11px;margin-top:3px">EPA AQS Monitor</div><div style="margin-top:5px;font-size:12px"><strong>Measures:</strong> ${mo.pollutants.join(", ")}</div></div>`
        );
    });
  }, [layers.monitors, ready]);

  // Coverage circles layer
  useEffect(() => {
    if (!ready || !LRef.current) return;
    const L = LRef.current;
    const group = coverageLayerRef.current!;
    group.clearLayers();
    if (!layers.coverage) return;
    EPA_MONITORS.forEach((mo) => {
      L.circle([mo.lat, mo.lng], {
        radius: COVERAGE_RADIUS_METERS,
        color: "#3b82f6",
        fillColor: "#3b82f6",
        fillOpacity: 0.05,
        weight: 1,
        dashArray: "4 4",
      }).addTo(group);
    });
  }, [layers.coverage, ready]);

  // Data overlays (PM2.5 / NO2 / Ozone / Vulnerability)
  useEffect(() => {
    if (!ready || !LRef.current) return;
    const L = LRef.current;
    const group = dataLayerRef.current!;
    group.clearLayers();

    const active = (["pm25", "no2", "ozone", "vulnerability"] as const).filter((k) => layers[k]);
    if (!active.length) return;

    COUNTIES.forEach((county) => {
      // Average the active layers for a blended risk shade at the centroid.
      const vals = active.map((k) => metricValue(k, county.metrics)).filter((v): v is number => v !== null);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      L.circleMarker([county.lat, county.lng], {
        radius: 10 + (avg / 100) * 16,
        color: "#ffffff",
        weight: 1.5,
        fillColor: riskColor(avg),
        fillOpacity: 0.55,
      })
        .addTo(group)
        .bindPopup(
          `<div style="min-width:180px"><strong style="font-size:13px">${county.label}</strong>${active
            .map((k) => {
              const labels: Record<string, string> = { pm25: "PM2.5 risk", no2: "NO₂ index", ozone: "Ozone index", vulnerability: "Vulnerability" };
              return `<div style="font-size:12px;margin-top:3px">${labels[k]}: <strong>${Math.round(metricValue(k, county.metrics)!)}</strong></div>`;
            })
            .join("")}</div>`
        )
        .on("click", () => onCountySelect?.(county.value));
    });
  }, [layers.pm25, layers.no2, layers.ozone, layers.vulnerability, ready, onCountySelect]);

  // Selected county marker + fly
  useEffect(() => {
    if (!ready || !mapInstanceRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapInstanceRef.current;

    if (countyMarkerRef.current) {
      countyMarkerRef.current.remove();
      countyMarkerRef.current = null;
    }
    if (!selectedCounty) {
      map.flyTo([40.9, -77.6], 7, { duration: 1 });
      return;
    }
    const county = COUNTIES.find((c) => c.value === selectedCounty);
    if (!county) return;
    map.flyTo([county.lat, county.lng], 10, { duration: 1.2 });

    const icon = L.divIcon({
      html: `<div style="position:relative"><div style="width:22px;height:22px;background:#dc2626;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 22],
      className: "",
    });
    const marker = L.marker([county.lat, county.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    marker
      .bindPopup(
        `<div style="min-width:160px"><strong style="font-size:14px">${county.label}</strong><div style="color:#666;font-size:11px;margin-top:2px">${county.region}</div><div style="margin-top:5px;font-size:12px;color:#dc2626;font-weight:600">Selected location</div></div>`
      )
      .openPopup();
    countyMarkerRef.current = marker;
  }, [selectedCounty, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full min-h-[420px] w-full rounded-xl overflow-hidden border border-slate-200 z-0" />
      <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg shadow-md px-3 py-2 text-[11px] space-y-1 z-[1000] border border-slate-200">
        <div className="font-semibold text-slate-700 mb-1">Legend</div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1e40af] border border-white" /> EPA monitor
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3.5 h-2.5 rounded border border-blue-400 bg-blue-100" /> 15.5 mi coverage
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#dc2626", border: "2px solid white" }} /> Selected place
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#16a34a" }} />
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#eab308" }} />
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#f97316" }} />
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "#dc2626" }} />
          <span className="ml-1">Low → High</span>
        </div>
      </div>
    </div>
  );
}
