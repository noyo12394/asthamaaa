"use client";

/**
 * Simulator map: shows existing monitor coverage (10/25 km rings + pins) and
 * lets the user click to drop up to three hypothetical sensor candidates.
 */
import { useEffect, useRef } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { circlePolygon } from "@/lib/geo";

const STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: "bg", type: "background" as const, paint: { "background-color": "#e8e7e2" } }],
};
const EMPTY = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
const CAND_COLORS = ["#1c5cab", "#b97b00", "#6f5cc3"];

export interface SimCandidate {
  lat: number;
  lng: number;
  label: string;
}

export default function SimMap({
  candidates,
  onAdd,
  center,
}: {
  candidates: SimCandidate[];
  onAdd: (lat: number, lng: number) => void;
  center: [number, number] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const onAddRef = useRef(onAdd);
  useEffect(() => {
    onAddRef.current = onAdd;
  }, [onAdd]);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [-76.5, 40.9],
        zoom: 6.6,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.on("error", (e) => {
        const msg = (e as { error?: { message?: string } }).error?.message ?? "";
        if (!readyRef.current && /style|fetch|403|404/i.test(msg)) {
          map?.setStyle(FALLBACK_STYLE as unknown as maplibregl.StyleSpecification);
        }
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      const setup = () => {
        if (!map || readyRef.current) return;
        readyRef.current = true;
        for (const id of ["coverage", "monitors", "candidates", "cand-rings"]) {
          map.addSource(id, { type: "geojson", data: EMPTY });
        }
        map.addLayer({
          id: "coverage-fill",
          type: "fill",
          source: "coverage",
          paint: {
            "fill-color": "#2d8888",
            "fill-opacity": ["case", ["==", ["get", "band"], "good"], 0.14, 0.06] as maplibregl.ExpressionSpecification,
          },
        });
        map.addLayer({
          id: "monitor-pin",
          type: "circle",
          source: "monitors",
          paint: {
            "circle-radius": 3.5,
            "circle-color": "#125858",
            "circle-stroke-color": "#fcfcfb",
            "circle-stroke-width": 1,
          },
        });
        map.addLayer({
          id: "cand-ring",
          type: "line",
          source: "cand-rings",
          paint: {
            "line-color": ["get", "color"] as maplibregl.ExpressionSpecification,
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
        map.addLayer({
          id: "cand-pt",
          type: "circle",
          source: "candidates",
          paint: {
            "circle-radius": 7,
            "circle-color": ["get", "color"] as maplibregl.ExpressionSpecification,
            "circle-stroke-color": "#fcfcfb",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "cand-label",
          type: "symbol",
          source: "candidates",
          layout: {
            "text-field": ["get", "letter"] as maplibregl.ExpressionSpecification,
            "text-size": 10,
            "text-offset": [0, 0.05],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: { "text-color": "#ffffff" },
        });

        map.on("click", (e) => onAddRef.current(e.lngLat.lat, e.lngLat.lng));
        map.getCanvas().style.cursor = "crosshair";

        const refresh = async () => {
          if (!map) return;
          const b = map.getBounds();
          const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
            .map((n) => n.toFixed(3))
            .join(",");
          for (const layer of ["coverage", "monitors"] as const) {
            try {
              const res = await fetch(`/api/map/cells?bbox=${bbox}&layer=${layer}`);
              const body = await res.json();
              if (body.ok && map) {
                (map.getSource(layer) as maplibregl.GeoJSONSource | undefined)?.setData(body.data);
              }
            } catch {
              /* shown in freshness panel */
            }
          }
        };
        let t: ReturnType<typeof setTimeout>;
        map.on("moveend", () => {
          clearTimeout(t);
          t = setTimeout(refresh, 300);
        });
        void refresh();
      };
      map.on("load", setup);
      map.on("styledata", () => {
        if (!readyRef.current && map?.isStyleLoaded()) setup();
      });
    })();
    return () => {
      cancelled = true;
      readyRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // candidates + their 25 km rings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const pts: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: candidates.map((c, i) => ({
        type: "Feature",
        properties: { color: CAND_COLORS[i], letter: String.fromCharCode(65 + i) },
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      })),
    };
    const rings: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: candidates.map((c, i) => ({
        type: "Feature",
        properties: { color: CAND_COLORS[i] },
        geometry: { type: "Polygon", coordinates: [circlePolygon({ lat: c.lat, lng: c.lng }, 25)] },
      })),
    };
    (map.getSource("candidates") as maplibregl.GeoJSONSource | undefined)?.setData(pts);
    (map.getSource("cand-rings") as maplibregl.GeoJSONSource | undefined)?.setData(rings);
  }, [candidates]);

  useEffect(() => {
    if (center && mapRef.current) {
      mapRef.current.flyTo({ center, zoom: 8, duration: 1200 });
    }
  }, [center]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Sensor placement map" />;
}
