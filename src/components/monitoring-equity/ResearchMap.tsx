"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { TractFeature, Tract, Station } from "./stats";
import {
  distanceBin,
  bivariateBin,
  DISTANCE_COLORS,
  BIVARIATE_COLORS,
} from "./stats";
interface Props {
  features: TractFeature[];
  monitors: Station[];
  mode: string;
  selected: Tract | null;
  onSelect: (id: string) => void;
  state: string;
}
export default function ResearchMap({
  features,
  monitors,
  mode,
  selected,
  onSelect,
  state,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MLMap | null>(null),
    select = useRef(onSelect);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl")
      .then((ml) => {
        if (!container.current || disposed) return;
        const m = new ml.Map({
          container: container.current,
          style:
            "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
          center: [-75.8, 41],
          zoom: 5.35,
          attributionControl: { compact: true },
          maxZoom: 13,
          minZoom: 4,
        });
        map.current = m;
        m.addControl(
          new ml.NavigationControl({ showCompass: false }),
          "top-left",
        );
        m.on("load", () => {
          m.addSource("communities", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            promoteId: "id",
          });
          m.addLayer({
            id: "communities-fill",
            type: "fill",
            source: "communities",
            paint: { "fill-color": ["get", "shade"], "fill-opacity": 0.78 },
          });
          m.addLayer({
            id: "communities-line",
            type: "line",
            source: "communities",
            paint: {
              "line-color": "#102d39",
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                0.15,
                10,
                0.7,
              ],
              "line-opacity": 0.55,
            },
          });
          m.addLayer({
            id: "selected-outline",
            type: "line",
            source: "communities",
            filter: ["==", ["get", "id"], ""],
            paint: { "line-color": "#fff3cb", "line-width": 2.5 },
          });
          m.addSource("stations", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: monitors.map((s) => ({
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [s.lng, s.lat],
                },
                properties: { name: s.name, id: s.id },
              })),
            },
          });
          m.addSource("connection", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          m.addLayer({
            id: "connection",
            type: "line",
            source: "connection",
            paint: {
              "line-color": "#fff3cb",
              "line-width": 2,
              "line-dasharray": [3, 2],
            },
          });
          m.addLayer({
            id: "station-halo",
            type: "circle",
            source: "stations",
            paint: {
              "circle-radius": 7,
              "circle-color": "#ffffff",
              "circle-opacity": 0.16,
            },
          });
          m.addLayer({
            id: "stations",
            type: "circle",
            source: "stations",
            paint: {
              "circle-radius": 3,
              "circle-color": "#0d2331",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });
          m.on("click", "communities-fill", (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (id) select.current(String(id));
          });
          m.on("mouseenter", "communities-fill", () => {
            m.getCanvas().style.cursor = "pointer";
          });
          m.on("mouseleave", "communities-fill", () => {
            m.getCanvas().style.cursor = "";
          });
          setReady(true);
        });
        m.on("error", (e) => {
          if (!m.isStyleLoaded())
            setError(e.error?.message || "Basemap unavailable");
        });
      })
      .catch(() =>
        setError(
          "Interactive map could not load. Use the community list below.",
        ),
      );
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // The nationwide station reference is immutable for this research snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const fs = features.map((f) => {
      const t = f.properties;
      const k = bivariateBin(t);
      const shade =
        mode === "double"
          ? k < 0
            ? "#697381"
            : BIVARIATE_COLORS[k]
          : mode === "support"
            ? t.distance <= 10
              ? "#89c7c4"
              : t.distance <= 25
                ? "#c9b87c"
                : "#a187c1"
            : DISTANCE_COLORS[distanceBin(t.distance)];
      return { ...f, properties: { ...t, shade } };
    });
    (m.getSource("communities") as import("maplibre-gl").GeoJSONSource).setData(
      { type: "FeatureCollection", features: fs },
    );
  }, [features, mode, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setFilter("selected-outline", ["==", ["get", "id"], selected?.id || ""]);
    const s = selected ? monitors[selected.monitor] : null;
    (m.getSource("connection") as import("maplibre-gl").GeoJSONSource).setData({
      type: "FeatureCollection",
      features:
        selected && s
          ? [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [selected.lng, selected.lat],
                    [s.lng, s.lat],
                  ],
                },
                properties: {},
              },
            ]
          : [],
    });
    if (selected)
      m.easeTo({
        center: [selected.lng, selected.lat],
        zoom: Math.max(m.getZoom(), 8),
        duration: 700,
        padding: {
          left: 30,
          right: window.innerWidth > 900 ? 330 : 30,
          top: 30,
          bottom: 30,
        },
      });
  }, [selected, ready, monitors]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const bounds: Record<string, [[number, number], [number, number]]> = {
      ALL: [
        [-80.6, 37.8],
        [-71.7, 45.1],
      ],
      PA: [
        [-80.6, 39.7],
        [-74.7, 42.3],
      ],
      NY: [
        [-79.9, 40.4],
        [-71.8, 45.1],
      ],
      NJ: [
        [-75.6, 38.9],
        [-73.8, 41.4],
      ],
      MD: [
        [-79.5, 37.9],
        [-75, 39.8],
      ],
      DE: [
        [-75.8, 38.4],
        [-75, 39.9],
      ],
    };
    m.fitBounds(bounds[state] || bounds.ALL, {
      padding: {
        top: 50,
        bottom: 60,
        left: 40,
        right: window.innerWidth > 900 ? 350 : 40,
      },
      duration: 700,
    });
  }, [state, ready]);
  return (
    <>
      <div
        className="md-map-canvas"
        ref={container}
        aria-label="Interactive map of census tract distance to EPA PM2.5 monitors"
      />
      {!ready && (
        <div className="md-map-loading">
          {error || "Drawing the monitoring landscape…"}
        </div>
      )}
      {ready && (
        <span className="md-map-hint">
          Click a tract to follow its connection to the nearest monitor
        </span>
      )}
    </>
  );
}
