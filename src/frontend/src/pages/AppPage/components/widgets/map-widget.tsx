import type { LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Loading from "@/components/ui/loading";
import type { WidgetContentProps } from "@/types/appPage/widget";
import { useWidgetFileBytes } from "../../utils/file-ref";
import { extractFileRef } from "../../utils/resolve-widget-kind";

/** Loose shape covering the GeoJSON Feature/FeatureCollection/geometry variants this widget needs to walk. */
type GeoJsonLike = {
  type?: string;
  features?: GeoJsonLike[];
  geometry?: { coordinates?: unknown };
  coordinates?: unknown;
};

// Basic OSM raster basemap -- no API key required. tile.openstreetmap.org's
// usage policy disallows heavy/production traffic; fine for this internal
// deployment, but swap to a dedicated tile provider before wider rollout.
// biome-ignore lint/suspicious/noExplicitAny: StyleSpecification isn't re-exported from the maplibre-gl package root
const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function collectCoordinates(coords: unknown, out: [number, number][]): void {
  if (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    out.push([coords[0], coords[1]]);
    return;
  }
  if (Array.isArray(coords)) {
    for (const item of coords) collectCoordinates(item, out);
  }
}

function boundsOf(geojson: GeoJsonLike): LngLatBoundsLike | null {
  const points: [number, number][] = [];
  const features =
    geojson?.type === "FeatureCollection" ? geojson.features : [geojson];
  for (const feature of features ?? []) {
    collectCoordinates(
      feature?.geometry?.coordinates ?? feature?.coordinates,
      points,
    );
  }
  if (points.length === 0) return null;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function MapCanvas({ geojson }: { geojson: GeoJsonLike }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    // Dynamically imported (like mammoth/xlsx in the docx/spreadsheet
    // widgets) so this ~800KB dependency only ships to a client that
    // actually renders a map widget, rather than in the main bundle.
    import("maplibre-gl").then(({ Map: MapLibreMap, AttributionControl }) => {
      if (cancelled || !containerRef.current) return;
      map = new MapLibreMap({
        container: containerRef.current,
        style: OSM_STYLE,
        center: [0, 0],
        zoom: 1,
        attributionControl: false,
      });
      map.addControl(new AttributionControl(), "bottom-right");

      map.on("load", () => {
        if (!map) return;
        // GeoJsonLike is intentionally loose (arbitrary tool output, not a validated
        // GeoJSON.GeoJSON); maplibre only reads .type/.features/.geometry at runtime.
        map.addSource("widget-data", {
          type: "geojson",
          data: geojson as GeoJSON.GeoJSON,
        });
        map.addLayer({
          id: "widget-polygons",
          type: "fill",
          source: "widget-data",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.3 },
        });
        map.addLayer({
          id: "widget-lines",
          type: "line",
          source: "widget-data",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "#3b82f6", "line-width": 2 },
        });
        map.addLayer({
          id: "widget-points",
          type: "circle",
          source: "widget-data",
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": "#3b82f6", "circle-radius": 5 },
        });

        const bounds = boundsOf(geojson);
        if (bounds) {
          map.fitBounds(bounds, { padding: 24, maxZoom: 14, duration: 0 });
        }
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [geojson]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/**
 * Renders a basic 2D vector map for GeoJSON outputs. Deliberately does not
 * handle raster GeoTIFF -- that stays deferred (see SESSION_SUMMARY.md) -- so
 * a bridged .tif never resolves to this widget in the first place.
 */
export function MapWidget({ output }: WidgetContentProps) {
  const { t } = useTranslation();
  const fileRef = extractFileRef(output.message);
  const { data, status } = useWidgetFileBytes(fileRef);
  const [geojson, setGeojson] = useState<GeoJsonLike | null>(
    fileRef ? null : (output.message as GeoJsonLike),
  );
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    if (!fileRef) return;
    if (!data) return;
    try {
      const text = new TextDecoder().decode(data);
      setGeojson(JSON.parse(text));
    } catch {
      setParseError(true);
    }
  }, [fileRef, data]);

  if (fileRef && (status === "loading" || status === "idle")) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading />
      </div>
    );
  }
  if ((fileRef && status === "error") || parseError || !geojson) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("app.widgets.mapUnavailable")}
      </div>
    );
  }

  return <MapCanvas geojson={geojson} />;
}
