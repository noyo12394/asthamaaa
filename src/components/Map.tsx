"use client";

import { useEffect, useRef, useState } from "react";
import { EPA_MONITORS, PA_COUNTIES, type MonitorLocation } from "@/lib/data";

interface MapProps {
  selectedCounty: string;
  onCountySelect?: (county: string) => void;
}

const COVERAGE_RADIUS_METERS = 24945;

export default function Map({ selectedCounty, onCountySelect }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const circlesRef = useRef<L.LayerGroup | null>(null);
  const countyMarkerRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const LRef = useRef<typeof import("leaflet") | null>(null);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    import("leaflet").then((L) => {
      LRef.current = L;
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([40.8781, -77.7996], 7);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const monitorMarkers = L.layerGroup().addTo(map);
      const coverageCircles = L.layerGroup().addTo(map);
      markersRef.current = monitorMarkers;
      circlesRef.current = coverageCircles;

      const monitorIcon = L.divIcon({
        html: `<div style="width:12px;height:12px;background:#1e40af;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        className: "",
      });

      EPA_MONITORS.forEach((monitor: MonitorLocation) => {
        const marker = L.marker([monitor.lat, monitor.lng], { icon: monitorIcon }).addTo(monitorMarkers);
        marker.bindPopup(
          `<div style="min-width:180px">
            <strong style="font-size:13px">${monitor.name}</strong>
            <div style="color:#666;font-size:11px;margin-top:4px">EPA AQS Monitor</div>
            <div style="margin-top:6px;font-size:12px"><strong>Monitors:</strong> ${monitor.pollutants.join(", ")}</div>
          </div>`
        );

        L.circle([monitor.lat, monitor.lng], {
          radius: COVERAGE_RADIUS_METERS,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.06,
          weight: 1,
          dashArray: "4 4",
        }).addTo(coverageCircles);
      });

      PA_COUNTIES.forEach((county) => {
        if (county.value === "other") return;
        const countyIcon = L.divIcon({
          html: `<div style="background:white;border:1px solid #ccc;border-radius:4px;padding:2px 6px;font-size:10px;white-space:nowrap;color:#333;box-shadow:0 1px 2px rgba(0,0,0,0.15);cursor:pointer;">${county.label.replace(" County", "").replace(" (Pittsburgh)", "").replace(" (Harrisburg)", "")}</div>`,
          iconAnchor: [20, 10],
          className: "",
        });
        const m = L.marker([county.lat, county.lng], { icon: countyIcon }).addTo(map);
        m.on("click", () => {
          if (onCountySelect) onCountySelect(county.value);
        });
      });

      mapInstanceRef.current = map;
      setReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [onCountySelect]);

  useEffect(() => {
    if (!ready || !mapInstanceRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapInstanceRef.current;

    if (countyMarkerRef.current) {
      countyMarkerRef.current.remove();
      countyMarkerRef.current = null;
    }

    if (!selectedCounty) {
      map.setView([40.8781, -77.7996], 7);
      return;
    }

    const county = PA_COUNTIES.find((c) => c.value === selectedCounty);
    if (!county) return;

    map.flyTo([county.lat, county.lng], 10, { duration: 1.2 });

    const selectedIcon = L.divIcon({
      html: `<div style="width:20px;height:20px;background:#dc2626;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      className: "",
    });

    const marker = L.marker([county.lat, county.lng], { icon: selectedIcon }).addTo(map);
    marker.bindPopup(
      `<div style="min-width:160px">
        <strong style="font-size:14px">${county.label}</strong>
        <div style="color:#666;font-size:11px;margin-top:2px">${county.region}</div>
        <div style="margin-top:6px;font-size:12px;color:#dc2626;font-weight:600">Selected Location</div>
      </div>`
    ).openPopup();
    countyMarkerRef.current = marker;
  }, [selectedCounty, ready]);

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-[500px] rounded-xl overflow-hidden border border-gray-200 shadow-lg z-0" />
      <div className="absolute bottom-3 left-3 bg-white/95 rounded-lg shadow px-3 py-2 text-xs space-y-1 z-[1000]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-[#1e40af] border border-white shadow-sm" />
          <span>EPA AQS Monitor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-red-600 border-2 border-white shadow-sm" />
          <span>Your Location</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-6 h-3 rounded border border-blue-400 bg-blue-100 opacity-60" />
          <span>15.5 mi Coverage Zone</span>
        </div>
      </div>
    </div>
  );
}
