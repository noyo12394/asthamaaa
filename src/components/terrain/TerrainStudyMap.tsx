"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Popup as MlPopup } from "maplibre-gl";
import type { TerrainSmokeAnalysis } from "@/lib/terrain-smoke";

const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  analysis: TerrainSmokeAnalysis | null;
  visible: { terrain: boolean; pm25: boolean; smoke: boolean };
}

function cellsGeoJson(analysis: TerrainSmokeAnalysis): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: analysis.cells.map((cell) => ({
      type: "Feature",
      properties: {
        id: cell.id,
        terrainClass: cell.terrainClass,
        elevationM: cell.elevationM,
        relativeElevationM: cell.relativeElevationM,
        tpiM: cell.tpiM,
        pm25: cell.currentPm25,
        aqi: cell.currentAqi,
        smokeDensity: cell.smokeDensity,
      },
      geometry: { type: "Polygon", coordinates: [cell.polygon] },
    })),
  };
}

function pointsGeoJson(analysis: TerrainSmokeAnalysis): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: analysis.cells.map((cell) => ({
      type: "Feature",
      properties: {
        terrainClass: cell.terrainClass,
        elevationM: cell.elevationM,
        pm25: cell.currentPm25,
        aqi: cell.currentAqi,
        smokeDensity: cell.smokeDensity,
      },
      geometry: { type: "Point", coordinates: [cell.lng, cell.lat] },
    })),
  };
}

function smokeGeoJson(analysis: TerrainSmokeAnalysis): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: analysis.smokePlumes.map((plume, index) => ({
      type: "Feature",
      properties: { density: plume.density, id: index },
      geometry: { type: "Polygon", coordinates: [plume.coordinates] },
    })),
  };
}

export default function TerrainStudyMap({ analysis, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<MlPopup | null>(null);
  const analysisRef = useRef<TerrainSmokeAnalysis | null>(analysis);
  const [ready, setReady] = useState(false);
  const [terrainAvailable, setTerrainAvailable] = useState(true);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [-75.4714, 40.6023],
        zoom: 8.7,
        pitch: 54,
        bearing: -12,
        maxPitch: 75,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

      map.on("error", (event) => {
        const message = (event as { error?: { message?: string } }).error?.message ?? "";
        if (/terrarium|elevation-tiles|raster-dem/i.test(message)) setTerrainAvailable(false);
      });

      map.on("load", () => {
        if (!map) return;
        try {
          map.addSource("pass-dem", {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            tileSize: 256,
            encoding: "terrarium",
            maxzoom: 15,
          });
          map.addSource("pass-dem-hillshade", {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            tileSize: 256,
            encoding: "terrarium",
            maxzoom: 15,
          });
          map.addLayer({
            id: "pass-hillshade",
            type: "hillshade",
            source: "pass-dem-hillshade",
            paint: {
              "hillshade-shadow-color": "#3d4956",
              "hillshade-highlight-color": "#f5f1df",
              "hillshade-accent-color": "#718370",
              "hillshade-exaggeration": 0.38,
            },
          });
          map.setTerrain({ source: "pass-dem", exaggeration: 1.35 });
        } catch {
          setTerrainAvailable(false);
        }

        map.addSource("terrain-cells", { type: "geojson", data: EMPTY });
        map.addSource("terrain-points", { type: "geojson", data: EMPTY });
        map.addSource("smoke-plumes", { type: "geojson", data: EMPTY });

        map.addLayer({
          id: "smoke-fill",
          type: "fill",
          source: "smoke-plumes",
          paint: {
            "fill-color": [
              "match",
              ["get", "density"],
              "heavy", "#d94736",
              "medium", "#ed8a2d",
              "light", "#f0c94a",
              "#d6d8d9",
            ],
            "fill-opacity": 0.24,
            "fill-outline-color": "#ad6320",
          },
        });
        map.addLayer({
          id: "terrain-fill",
          type: "fill-extrusion",
          source: "terrain-cells",
          paint: {
            "fill-extrusion-color": [
              "match",
              ["get", "terrainClass"],
              "lowland", "#1f9d8a",
              "transition", "#d7a62d",
              "highland", "#d9654b",
              "#a9b0ba",
            ],
            "fill-extrusion-height": ["*", ["max", 4, ["get", "elevationM"]], 1.8],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.42,
          },
        });
        map.addLayer({
          id: "terrain-outline",
          type: "line",
          source: "terrain-cells",
          paint: { "line-color": "#172033", "line-width": 0.7, "line-opacity": 0.4 },
        });
        map.addLayer({
          id: "pm25-points",
          type: "circle",
          source: "terrain-points",
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["coalesce", ["get", "pm25"], 0],
              0, 4,
              12, 7,
              35, 12,
              60, 17,
            ],
            "circle-color": [
              "step", ["coalesce", ["get", "aqi"], -1],
              "#a8afb9",
              0, "#39a85a",
              51, "#e7c92f",
              101, "#ef8b2c",
              151, "#dc4b47",
              201, "#9252a0",
              301, "#7e263e",
            ],
            "circle-opacity": 0.92,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });

        const showPopup = (event: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const properties = feature.properties as Record<string, string | number | null>;
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 10 })
            .setLngLat(event.lngLat)
            .setHTML(
              `<strong>${properties.terrainClass ?? "Terrain cell"}</strong><br>` +
                `${properties.elevationM ?? "?"} m elevation<br>` +
                `PM2.5 ${properties.pm25 ?? "?"} µg/m³ · AQI ${properties.aqi ?? "?"}<br>` +
                `NOAA smoke: ${properties.smokeDensity ?? "unavailable"}`
            )
            .addTo(map);
        };
        map.on("mouseenter", "pm25-points", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pm25-points", () => {
          if (map) map.getCanvas().style.cursor = "";
          popupRef.current?.remove();
        });
        map.on("mousemove", "pm25-points", showPopup);

        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!analysis) {
      popupRef.current?.remove();
      (map.getSource("terrain-cells") as maplibregl.GeoJSONSource)?.setData(EMPTY);
      (map.getSource("terrain-points") as maplibregl.GeoJSONSource)?.setData(EMPTY);
      (map.getSource("smoke-plumes") as maplibregl.GeoJSONSource)?.setData(EMPTY);
      return;
    }
    (map.getSource("terrain-cells") as maplibregl.GeoJSONSource)?.setData(cellsGeoJson(analysis));
    (map.getSource("terrain-points") as maplibregl.GeoJSONSource)?.setData(pointsGeoJson(analysis));
    (map.getSource("smoke-plumes") as maplibregl.GeoJSONSource)?.setData(smokeGeoJson(analysis));
    const latPad = analysis.radiusKm / 111.32;
    const lngPad = analysis.radiusKm / (111.32 * Math.cos((analysis.center.lat * Math.PI) / 180));
    map.fitBounds(
      [
        [analysis.center.lng - lngPad, analysis.center.lat - latPad],
        [analysis.center.lng + lngPad, analysis.center.lat + latPad],
      ],
      { padding: 54, pitch: 54, bearing: -12, duration: 900 }
    );
  }, [analysis, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of ["terrain-fill", "terrain-outline"]) {
      map.setLayoutProperty(id, "visibility", visible.terrain ? "visible" : "none");
    }
    map.setLayoutProperty("pm25-points", "visibility", visible.pm25 ? "visible" : "none");
    map.setLayoutProperty("smoke-fill", "visibility", visible.smoke ? "visible" : "none");
  }, [ready, visible]);

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden bg-surface-2">
      <div ref={containerRef} className="h-full min-h-[520px] w-full" aria-label="Interactive 3D terrain, smoke, and air-quality map" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 text-sm text-ink-3">
          Preparing terrain surface…
        </div>
      )}
      {!terrainAvailable && (
        <div className="absolute right-3 bottom-3 rounded-sm border border-hairline bg-surface/95 px-2 py-1 text-[10px] text-ink-3 shadow-sm">
          DEM tiles unavailable · flat grid shown
        </div>
      )}
    </div>
  );
}
