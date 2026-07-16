"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";

export type PulseMode = "explore" | "understand" | "simulate";

export type PulseLocation = {
  lat: number;
  lng: number;
  label: string;
};

type Props = {
  location: PulseLocation;
  mode: PulseMode;
  timeline: number;
  bridgeClosed: boolean;
  showFog: boolean;
  onMapPick: (lat: number, lng: number) => void;
};

const DARK_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const EMPTY = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;

const FACILITIES = [
  { id: "hospital", name: "St. Luke’s University Hospital", kind: "Hospital", coordinates: [-75.3928, 40.6084] },
  { id: "pharmacy", name: "CVS Pharmacy · 4th St", kind: "Pharmacy", coordinates: [-75.3818, 40.6102] },
  { id: "school", name: "Broughal Middle School", kind: "School", coordinates: [-75.3785, 40.6123] },
  { id: "fire", name: "Bethlehem Fire Station 1", kind: "Fire", coordinates: [-75.3747, 40.6171] },
] as const;

const BASE_ROUTES: Record<string, [number, number][]> = {
  hospital: [[-75.3783, 40.6068], [-75.383, 40.6052], [-75.388, 40.606], [-75.3928, 40.6084]],
  pharmacy: [[-75.3783, 40.6068], [-75.3796, 40.6084], [-75.3818, 40.6102]],
  school: [[-75.3783, 40.6068], [-75.378, 40.6096], [-75.3785, 40.6123]],
  fire: [[-75.3783, 40.6068], [-75.3764, 40.611], [-75.3747, 40.6171]],
};

const HOSPITAL_DETOUR: [number, number][] = [
  [-75.3783, 40.6068], [-75.3745, 40.6042], [-75.381, 40.6005],
  [-75.3915, 40.601], [-75.396, 40.6045], [-75.3928, 40.6084],
];

function circlePolygon(lng: number, lat: number, radiusKm: number, steps = 64) {
  const coordinates: [number, number][] = [];
  const latScale = radiusKm / 110.574;
  const lngScale = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    coordinates.push([lng + Math.cos(angle) * lngScale, lat + Math.sin(angle) * latScale]);
  }
  return coordinates;
}

function lineData(timeline: number, bridgeClosed: boolean): GeoJSON.FeatureCollection {
  const phase = timeline < 33 ? "stable" : timeline < 68 ? "stressed" : "compromised";
  return {
    type: "FeatureCollection",
    features: FACILITIES.map((facility, index) => {
      const isHospital = facility.id === "hospital";
      const status = bridgeClosed && isHospital ? "rerouted" : index === 2 && phase === "compromised" ? "compromised" : phase;
      return {
        type: "Feature",
        properties: { id: facility.id, name: facility.name, status },
        geometry: {
          type: "LineString",
          coordinates: bridgeClosed && isHospital ? HOSPITAL_DETOUR : BASE_ROUTES[facility.id],
        },
      } as GeoJSON.Feature;
    }),
  };
}

function futureLineData(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: FACILITIES.map((facility) => ({
      type: "Feature",
      properties: { id: facility.id },
      geometry: {
        type: "LineString",
        coordinates: [...BASE_ROUTES[facility.id]].map(([lng, lat], index) => [lng + index * 0.0005, lat + index * 0.00035]),
      },
    } as GeoJSON.Feature)),
  };
}

export default function EarthPulseMap({ location, mode, timeline, bridgeClosed, showFog, onMapPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const onMapPickRef = useRef(onMapPick);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    onMapPickRef.current = onMapPick;
  }, [onMapPick]);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: DARK_STYLE,
        center: [location.lng, location.lat],
        zoom: 13.4,
        pitch: 52,
        bearing: -12,
        maxPitch: 70,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

      map.on("load", () => {
        if (!map) return;
        const sourceIds = ["pulse-lines", "future-lines", "facilities", "focus", "bloom", "fog", "bridge"];
        for (const id of sourceIds) map.addSource(id, { type: "geojson", data: EMPTY });

        map.addLayer({
          id: "pulse-halo",
          type: "line",
          source: "pulse-lines",
          paint: { "line-color": ["match", ["get", "status"], "compromised", "#ff5b50", "rerouted", "#ffba4a", "#4ce0c1"], "line-width": 12, "line-opacity": 0.12, "line-blur": 8 },
        });
        map.addLayer({
          id: "pulse-line",
          type: "line",
          source: "pulse-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "status"], "compromised", "#ff5b50", "rerouted", "#ffba4a", "stressed", "#f7c65d", "#4ce0c1"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4.5],
            "line-opacity": 0.88,
          },
        });
        map.addLayer({
          id: "future-line",
          type: "line",
          source: "future-lines",
          layout: { "line-cap": "round" },
          paint: { "line-color": "#bda7ff", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0 },
        });
        map.addLayer({
          id: "bloom-fill",
          type: "fill",
          source: "bloom",
          paint: { "fill-color": "#ff6c55", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "bloom-edge",
          type: "line",
          source: "bloom",
          paint: { "line-color": "#ff9b6b", "line-width": 1.5, "line-opacity": 0.6, "line-dasharray": [3, 2] },
        });
        map.addLayer({
          id: "fog-fill",
          type: "fill",
          source: "fog",
          paint: { "fill-color": "#b8c1d4", "fill-opacity": 0 },
        });
        map.addLayer({
          id: "facility-glow",
          type: "circle",
          source: "facilities",
          paint: { "circle-radius": 11, "circle-color": "#7fffe2", "circle-opacity": 0.13, "circle-blur": 0.6 },
        });
        map.addLayer({
          id: "facility-dot",
          type: "circle",
          source: "facilities",
          paint: { "circle-radius": 5, "circle-color": "#061713", "circle-stroke-color": "#7fffe2", "circle-stroke-width": 2 },
        });
        map.addLayer({
          id: "facility-label",
          type: "symbol",
          source: "facilities",
          layout: { "text-field": ["get", "kind"], "text-size": 11, "text-offset": [0, 1.5], "text-anchor": "top", "text-allow-overlap": false },
          paint: { "text-color": "#e9fff9", "text-halo-color": "#07110f", "text-halo-width": 1.4 },
        });
        map.addLayer({
          id: "bridge-dot",
          type: "circle",
          source: "bridge",
          paint: { "circle-radius": 7, "circle-color": "#ff5b50", "circle-stroke-color": "#fff1d8", "circle-stroke-width": 2, "circle-opacity": 0 },
        });
        map.addLayer({
          id: "focus-halo",
          type: "circle",
          source: "focus",
          paint: { "circle-radius": 18, "circle-color": "#5cf4d4", "circle-opacity": 0.12, "circle-blur": 0.45 },
        });
        map.addLayer({
          id: "focus-dot",
          type: "circle",
          source: "focus",
          paint: { "circle-radius": 5, "circle-color": "#eafff9", "circle-stroke-color": "#4ce0c1", "circle-stroke-width": 2 },
        });

        map.on("click", (event) => onMapPickRef.current(event.lngLat.lat, event.lngLat.lng));
        readyRef.current = true;
        window.dispatchEvent(new Event("earthpulse-map-ready"));

        let time = 0;
        const animate = () => {
          time += 0.018;
          if (map?.getLayer("pulse-halo")) {
            map.setPaintProperty("pulse-halo", "line-opacity", 0.09 + Math.sin(time) * 0.035);
          }
          animationRef.current = requestAnimationFrame(animate);
        };
        animationRef.current = requestAnimationFrame(animate);
      });
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationRef.current);
      readyRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
    // Map is constructed once; state updates are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!readyRef.current || !map.getSource("focus")) return;
      const withinPilot = Math.abs(location.lat - 40.61) < 0.7 && Math.abs(location.lng + 75.38) < 0.8;
      (map.getSource("focus") as maplibregl.GeoJSONSource).setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [location.lng, location.lat] } });
      (map.getSource("facilities") as maplibregl.GeoJSONSource).setData(withinPilot ? {
        type: "FeatureCollection",
        features: FACILITIES.map((facility) => ({ type: "Feature", properties: { id: facility.id, name: facility.name, kind: facility.kind }, geometry: { type: "Point", coordinates: [...facility.coordinates] } })),
      } as GeoJSON.FeatureCollection : EMPTY);
      (map.getSource("pulse-lines") as maplibregl.GeoJSONSource).setData(withinPilot ? lineData(timeline, bridgeClosed) : EMPTY);
      (map.getSource("future-lines") as maplibregl.GeoJSONSource).setData(withinPilot ? futureLineData() : EMPTY);
      (map.getSource("bridge") as maplibregl.GeoJSONSource).setData(bridgeClosed ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-75.3885, 40.606] } } : EMPTY);
      const radius = 0.7 + (timeline / 100) * 4.8;
      (map.getSource("bloom") as maplibregl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [circlePolygon(location.lng, location.lat, radius)] },
      });
      (map.getSource("fog") as maplibregl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [circlePolygon(location.lng + 0.055, location.lat + 0.035, 3.1)] },
      });
      map.setPaintProperty("future-line", "line-opacity", mode === "understand" || timeline > 50 ? 0.55 : 0);
      map.setPaintProperty("fog-fill", "fill-opacity", showFog ? 0.16 : 0);
      map.setPaintProperty("bloom-fill", "fill-opacity", mode === "explore" ? 0.04 : 0.1 + timeline / 1000);
      map.setPaintProperty("bridge-dot", "circle-opacity", bridgeClosed ? 1 : 0);
      map.flyTo({ center: [location.lng, location.lat], zoom: withinPilot ? 13.4 : 10.8, duration: 1400, essential: true });
    };
    if (readyRef.current) apply();
    else window.addEventListener("earthpulse-map-ready", apply, { once: true });
    return () => window.removeEventListener("earthpulse-map-ready", apply);
  }, [location, mode, timeline, bridgeClosed, showFog]);

  return <div ref={containerRef} className="ep-map" aria-label="Interactive EarthPulse hazard and infrastructure map" />;
}
