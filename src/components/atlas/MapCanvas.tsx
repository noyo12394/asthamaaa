"use client";

/**
 * MapLibre GL canvas: the primary surface of the command center.
 *
 * Layers (all fed by /api/map/cells so the backend stays the source of truth):
 *   aqi           hex cells, EPA-colored, extruded by AQI in 3D
 *   plume         animated PM2.5 heatmap from cell centers
 *   monitors      monitor pins + extruded towers
 *   coverage      translucent 10/25 km confidence rings
 *   vulnerability county extrusions, blue ramp
 *   equity        county fills, violet ramp
 *   alert         alert-priority hex extrusions, red-orange ramp
 *   reports       community reports (unverified) markers
 *
 * The basemap is Carto Positron (or NEXT_PUBLIC_MAP_STYLE_URL). If style tiles
 * can't load (offline environments) we fall back to a neutral inline style and
 * county outlines still provide geographic context.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MlMap, MapMouseEvent } from "maplibre-gl";
import type { LayerId, SelectedFeature } from "./state";

const DEFAULT_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const FALLBACK_STYLE = {
  version: 8 as const,
  name: "pass-fallback",
  sources: {},
  layers: [{ id: "bg", type: "background" as const, paint: { "background-color": "#e8e7e2" } }],
};

const EMPTY_FC = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;

export interface MapViewRequest {
  center: [number, number];
  zoom: number;
  key: number; // bump to retrigger
}

interface Props {
  activeLayers: LayerId[];
  viewMode: "2d" | "2.5d" | "3d";
  flyTo: MapViewRequest | null;
  selected: { lat: number; lng: number } | null;
  onSelect: (lat: number, lng: number, feature: SelectedFeature | null) => void;
  onLayerMeta: (layer: LayerId, meta: unknown) => void;
  resetKey: number;
}

const INITIAL = { center: [-75.44, 40.63] as [number, number], zoom: 8.6, pitch: 45 };

export default function MapCanvas({
  activeLayers,
  viewMode,
  flyTo,
  selected,
  onSelect,
  onLayerMeta,
  resetKey,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const fetchSeq = useRef<Record<string, number>>({});
  const activeRef = useRef<LayerId[]>(activeLayers);
  const onSelectRef = useRef(onSelect);
  const onLayerMetaRef = useRef(onLayerMeta);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    activeRef.current = activeLayers;
    onSelectRef.current = onSelect;
    onLayerMetaRef.current = onLayerMeta;
  }, [activeLayers, onSelect, onLayerMeta]);

  /** Fetch layer data for the current viewport and push into its source. */
  const refreshLayer = useCallback(async (layer: LayerId) => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      .map((n) => n.toFixed(3))
      .join(",");
    const apiLayer =
      layer === "plume" ? "aqi" : layer === "vulnerability" || layer === "equity" ? layer : layer;
    const seq = (fetchSeq.current[layer] = (fetchSeq.current[layer] ?? 0) + 1);
    try {
      const res = await fetch(`/api/map/cells?bbox=${bbox}&layer=${apiLayer}`);
      const body = await res.json();
      if (!body.ok || fetchSeq.current[layer] !== seq || !mapRef.current) return;
      const fc = body.data as GeoJSON.FeatureCollection & { meta?: unknown };
      onLayerMetaRef.current(layer, fc.meta ?? null);

      if (layer === "plume") {
        // heatmap wants points: use cell centers weighted by pm25
        const pts: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: (fc.features ?? [])
            .filter((f) => (f.properties as { pm25?: number | null })?.pm25 != null)
            .map((f) => {
              const p = f.properties as { pm25: number; centerLng: number; centerLat: number };
              return {
                type: "Feature",
                properties: { pm25: p.pm25 },
                geometry: { type: "Point", coordinates: [p.centerLng, p.centerLat] },
              };
            }),
        };
        (map.getSource("plume") as maplibregl.GeoJSONSource | undefined)?.setData(pts);
        return;
      }
      if (layer === "monitors") {
        (map.getSource("monitors") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
        // Towers: small hexes extruded at each monitor
        const towers: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: (fc.features ?? []).map((f) => {
            const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
            const r = 0.004; // ~350m
            const ring = Array.from({ length: 7 }, (_, k) => {
              const a = (Math.PI / 3) * k;
              return [lng + r * Math.cos(a), lat + r * 0.75 * Math.sin(a)];
            });
            return {
              type: "Feature",
              properties: { ...(f.properties ?? {}), height: 2400 },
              geometry: { type: "Polygon", coordinates: [ring] },
            } as GeoJSON.Feature;
          }),
        };
        (map.getSource("monitor-towers") as maplibregl.GeoJSONSource | undefined)?.setData(towers);
        return;
      }
      const sourceId =
        layer === "vulnerability" || layer === "equity" ? `county-${layer}` : `${layer}-cells`;
      (map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    } catch {
      // network hiccups are surfaced via the freshness panel; keep the map quiet
    }
  }, []);

  /** County outlines double as geographic context if basemap tiles fail. */
  const refreshCountyLines = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !readyRef.current || map.getZoom() < 5) return;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      .map((n) => n.toFixed(3))
      .join(",");
    try {
      const res = await fetch(`/api/map/cells?bbox=${bbox}&layer=vulnerability`);
      const body = await res.json();
      if (body.ok && mapRef.current) {
        (map.getSource("county-lines") as maplibregl.GeoJSONSource | undefined)?.setData(
          body.data as GeoJSON.FeatureCollection
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshActive = useCallback(() => {
    for (const layer of activeRef.current) void refreshLayer(layer);
    void refreshCountyLines();
  }, [refreshLayer, refreshCountyLines]);

  // ---- map construction -----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: DEFAULT_STYLE,
        center: INITIAL.center,
        zoom: INITIAL.zoom,
        pitch: INITIAL.pitch,
        attributionControl: { compact: true },
        maxPitch: 70,
      });
      mapRef.current = map;

      // If the remote style can't load (offline), swap to the inline fallback.
      map.on("error", (e) => {
        const msg = (e as { error?: { message?: string } }).error?.message ?? "";
        if (!readyRef.current && /style|Failed to fetch|NetworkError|403|404/i.test(msg)) {
          map?.setStyle(FALLBACK_STYLE as unknown as maplibregl.StyleSpecification);
        }
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

      const setup = () => {
        if (!map || readyRef.current) return;
        readyRef.current = true;
        setReady(true);

        // ---- sources ----
        const srcs = [
          "aqi-cells",
          "alert-cells",
          "county-vulnerability",
          "county-equity",
          "county-lines",
          "coverage-cells",
          "monitors",
          "monitor-towers",
          "plume",
          "reports-cells",
          "selected-pt",
        ];
        for (const id of srcs) map.addSource(id, { type: "geojson", data: EMPTY_FC });

        // ---- county context lines (always on, subtle) ----
        map.addLayer({
          id: "county-lines-l",
          type: "line",
          source: "county-lines",
          paint: { "line-color": "#b9b7ae", "line-width": 0.6, "line-opacity": 0.7 },
        });

        // ---- AQI hex cells ----
        const aqiColor: unknown = [
          "step",
          ["coalesce", ["get", "aqi"], -1],
          "#c9c8c1",
          0, "#00e400",
          51, "#ffff00",
          101, "#ff7e00",
          151, "#ff0000",
          201, "#8f3f97",
          301, "#7e0023",
        ];
        map.addLayer({
          id: "aqi-fill",
          type: "fill-extrusion",
          source: "aqi-cells",
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": aqiColor as maplibregl.ExpressionSpecification,
            "fill-extrusion-height": 0,
            "fill-extrusion-opacity": 0.45,
          },
        });

        // ---- PM2.5 plume heatmap ----
        map.addLayer({
          id: "plume-heat",
          type: "heatmap",
          source: "plume",
          layout: { visibility: "none" },
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"], ["coalesce", ["get", "pm25"], 0],
              0, 0, 5, 0.25, 15, 0.6, 35, 1,
            ] as maplibregl.ExpressionSpecification,
            "heatmap-intensity": 0.9,
            "heatmap-radius": [
              "interpolate", ["linear"], ["zoom"], 5, 18, 9, 46, 12, 90,
            ] as maplibregl.ExpressionSpecification,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(120,160,220,0)",
              0.3, "rgba(120,170,210,0.25)",
              0.55, "rgba(150,150,120,0.35)",
              0.8, "rgba(200,120,60,0.45)",
              1, "rgba(170,40,40,0.55)",
            ] as maplibregl.ExpressionSpecification,
            "heatmap-opacity": 0.8,
          },
        });

        // ---- coverage rings ----
        map.addLayer({
          id: "coverage-fill",
          type: "fill",
          source: "coverage-cells",
          layout: { visibility: "none" },
          paint: {
            "fill-color": "#2d8888",
            "fill-opacity": ["case", ["==", ["get", "band"], "good"], 0.14, 0.06] as maplibregl.ExpressionSpecification,
          },
        });
        map.addLayer({
          id: "coverage-line",
          type: "line",
          source: "coverage-cells",
          layout: { visibility: "none" },
          paint: {
            "line-color": "#2d8888",
            "line-width": ["case", ["==", ["get", "band"], "good"], 1.2, 0.6] as maplibregl.ExpressionSpecification,
            "line-opacity": 0.5,
            "line-dasharray": [2, 2],
          },
        });

        // ---- county vulnerability extrusions ----
        map.addLayer({
          id: "vuln-fill",
          type: "fill-extrusion",
          source: "county-vulnerability",
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": [
              "step", ["coalesce", ["get", "vulnerability"], -1],
              "#c9c8c1",
              0, "#cde2fb", 20, "#9ec5f4", 40, "#5598e7", 60, "#256abf", 80, "#0d366b",
            ] as maplibregl.ExpressionSpecification,
            "fill-extrusion-height": 0,
            "fill-extrusion-opacity": 0.6,
          },
        });

        // ---- county equity fills ----
        map.addLayer({
          id: "equity-fill",
          type: "fill",
          source: "county-equity",
          layout: { visibility: "none" },
          paint: {
            "fill-color": [
              "step", ["coalesce", ["get", "equity"], -1],
              "#c9c8c1",
              0, "#e5e1f7", 20, "#c5bcee", 40, "#9a8cdc", 60, "#6f5cc3", 80, "#43349b",
            ] as maplibregl.ExpressionSpecification,
            "fill-opacity": 0.55,
          },
        });
        map.addLayer({
          id: "equity-line",
          type: "line",
          source: "county-equity",
          layout: { visibility: "none" },
          paint: { "line-color": "#43349b", "line-width": 0.8, "line-opacity": 0.5 },
        });

        // ---- alert priority hexes ----
        map.addLayer({
          id: "alert-fill",
          type: "fill-extrusion",
          source: "alert-cells",
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": [
              "step", ["coalesce", ["get", "score"], -1],
              "#c9c8c1",
              0, "#fbe3d4", 25, "#f5b898", 45, "#e97f56", 60, "#d0492f", 75, "#9c2317",
            ] as maplibregl.ExpressionSpecification,
            "fill-extrusion-height": 0,
            "fill-extrusion-opacity": 0.5,
          },
        });

        // ---- monitor towers + pins ----
        map.addLayer({
          id: "monitor-towers-l",
          type: "fill-extrusion",
          source: "monitor-towers",
          layout: { visibility: "none" },
          paint: {
            "fill-extrusion-color": "#125858",
            "fill-extrusion-height": ["get", "height"] as maplibregl.ExpressionSpecification,
            "fill-extrusion-opacity": 0.85,
          },
        });
        map.addLayer({
          id: "monitor-glow",
          type: "circle",
          source: "monitors",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 9,
            "circle-color": "#2d8888",
            "circle-opacity": 0.25,
            "circle-blur": 0.6,
          },
        });
        map.addLayer({
          id: "monitor-pin",
          type: "circle",
          source: "monitors",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 4,
            "circle-color": "#125858",
            "circle-stroke-color": "#fcfcfb",
            "circle-stroke-width": 1.5,
          },
        });

        // ---- community reports ----
        map.addLayer({
          id: "report-pin",
          type: "circle",
          source: "reports-cells",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 5,
            "circle-color": "#b97b00",
            "circle-stroke-color": "#fcfcfb",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });

        // ---- selected point ----
        map.addLayer({
          id: "selected-ring",
          type: "circle",
          source: "selected-pt",
          paint: {
            "circle-radius": 10,
            "circle-color": "rgba(28,92,171,0.12)",
            "circle-stroke-color": "#1c5cab",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "selected-dot",
          type: "circle",
          source: "selected-pt",
          paint: { "circle-radius": 3, "circle-color": "#1c5cab" },
        });

        // ---- interactions ----
        const interactive = [
          "monitor-pin",
          "report-pin",
          "alert-fill",
          "aqi-fill",
          "equity-fill",
          "vuln-fill",
        ];
        map.on("click", (e: MapMouseEvent) => {
          const feats = map!.queryRenderedFeatures(e.point, { layers: interactive.filter((l) => map!.getLayer(l)) });
          const f = feats[0];
          let sel: SelectedFeature | null = null;
          if (f) {
            const kind =
              f.layer.id === "monitor-pin"
                ? "monitor"
                : f.layer.id === "report-pin"
                  ? "report"
                  : f.layer.id === "equity-fill" || f.layer.id === "vuln-fill"
                    ? "county"
                    : "cell";
            sel = { kind, properties: (f.properties ?? {}) as Record<string, unknown> };
          }
          onSelectRef.current(e.lngLat.lat, e.lngLat.lng, sel);
        });
        map.on("mousemove", (e: MapMouseEvent) => {
          const feats = map!.queryRenderedFeatures(e.point, {
            layers: ["monitor-pin", "report-pin"].filter((l) => map!.getLayer(l)),
          });
          map!.getCanvas().style.cursor = feats.length ? "pointer" : "";
        });

        let moveTimer: ReturnType<typeof setTimeout> | undefined;
        map.on("moveend", () => {
          clearTimeout(moveTimer);
          moveTimer = setTimeout(refreshActive, 350);
        });

        // gentle plume breathing so the layer feels alive
        let t = 0;
        const animate = () => {
          t += 0.012;
          if (map?.getLayer("plume-heat")) {
            map.setPaintProperty("plume-heat", "heatmap-intensity", 0.85 + 0.25 * Math.sin(t));
          }
          rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);

        refreshActive();
      };

      map.on("load", setup);
      // styledata fires when the fallback style replaces a failed remote style
      map.on("styledata", () => {
        if (!readyRef.current && map?.isStyleLoaded()) setup();
      });
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- layer visibility -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const vis: Record<string, string[]> = {
      aqi: ["aqi-fill"],
      plume: ["plume-heat"],
      monitors: ["monitor-pin", "monitor-glow", "monitor-towers-l"],
      coverage: ["coverage-fill", "coverage-line"],
      vulnerability: ["vuln-fill"],
      equity: ["equity-fill", "equity-line"],
      alert: ["alert-fill"],
      reports: ["report-pin"],
    };
    for (const [layer, ids] of Object.entries(vis)) {
      const on = activeLayers.includes(layer as LayerId);
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      }
      if (on) void refreshLayer(layer as LayerId);
    }
  }, [activeLayers, refreshLayer, ready]);

  // ---- 2D / 2.5D / 3D ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const pitch = viewMode === "2d" ? 0 : viewMode === "2.5d" ? 45 : 62;
    map.easeTo({ pitch, duration: 600 });
    const h3 = viewMode === "3d";
    const h25 = viewMode !== "2d";
    if (map.getLayer("aqi-fill")) {
      map.setPaintProperty(
        "aqi-fill",
        "fill-extrusion-height",
        h25
          ? (["*", ["coalesce", ["get", "aqi"], 0], h3 ? 55 : 25] as unknown as maplibregl.ExpressionSpecification)
          : 0
      );
    }
    if (map.getLayer("vuln-fill")) {
      map.setPaintProperty(
        "vuln-fill",
        "fill-extrusion-height",
        h25
          ? (["*", ["coalesce", ["get", "vulnerability"], 0], h3 ? 220 : 90] as unknown as maplibregl.ExpressionSpecification)
          : 0
      );
    }
    if (map.getLayer("alert-fill")) {
      map.setPaintProperty(
        "alert-fill",
        "fill-extrusion-height",
        h25
          ? (["*", ["coalesce", ["get", "score"], 0], h3 ? 60 : 25] as unknown as maplibregl.ExpressionSpecification)
          : 0
      );
    }
  }, [viewMode, ready]);

  // ---- fly-to ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: flyTo.center, zoom: flyTo.zoom, duration: 1800, essential: true });
  }, [flyTo]);

  // ---- reset view ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || resetKey === 0) return;
    map.flyTo({ center: INITIAL.center, zoom: INITIAL.zoom, pitch: INITIAL.pitch, bearing: 0, duration: 1200 });
  }, [resetKey]);

  // ---- selected marker -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("selected-pt") as maplibregl.GeoJSONSource | undefined;
    src?.setData(
      selected
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: [selected.lng, selected.lat] },
              },
            ],
          }
        : EMPTY_FC
    );
  }, [selected, ready]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Interactive 3D air quality map" />;
}
