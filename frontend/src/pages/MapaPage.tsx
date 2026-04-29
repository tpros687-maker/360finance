/// <reference types="vite/client" />
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import turfArea from "@turf/area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { List } from "lucide-react";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import { useMapaStore } from "@/store/mapaStore";
import { getPotreros, createPotrero } from "@/lib/potrerosApi";
import { getPuntos, createPunto, deletePunto } from "@/lib/puntosApi";
import { getMovimientos } from "@/lib/movimientosApi";
import { PanelLateral } from "@/components/mapa/PanelLateral";
import { ModalMovimiento } from "@/components/mapa/ModalMovimiento";
import { PuntosToolbar } from "@/components/mapa/PuntosToolbar";
import { MovimientosPanel } from "@/components/mapa/MovimientosPanel";
import { ElementosPanel } from "@/components/mapa/ElementosPanel";
import type { Potrero, TipoPunto, GeoJSONPoint } from "@/types/mapa";
import { toast } from "@/hooks/useToast";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

const PASTO_COLORS: Record<string, string> = {
  bueno: "#22c55e",
  regular: "#eab308",
  malo: "#ef4444",
};

const PUNTO_EMOJIS: Record<TipoPunto, string> = {
  bebedero: "💧",
  casa: "🏠",
  sombra: "🌳",
  comedero: "🍽️",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcHectareas(geometry: GeoJSON.Geometry): number {
  const m2 = turfArea({ type: "Feature", geometry, properties: {} } as GeoJSON.Feature);
  return Math.round((m2 / 10000) * 100) / 100; // 2 decimals
}

function diasDescanso(fechaDescanso: string): number {
  const from = new Date(fechaDescanso + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function polygonCenter(coords: number[][][]): [number, number] {
  const ring = coords[0];
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return [lng, lat];
}

function buildPotreroFeatures(potreros: Potrero[]) {
  return {
    type: "FeatureCollection" as const,
    features: potreros.map((p) => ({
      type: "Feature" as const,
      id: p.id,
      geometry: p.geometria,
      properties: {
        id: p.id,
        nombre: p.nombre,
        tipo: p.tipo,
        estado_pasto: p.estado_pasto,
        en_descanso: p.en_descanso,
        dias_descanso: p.en_descanso && p.fecha_descanso ? diasDescanso(p.fecha_descanso) : 0,
        color: p.en_descanso ? "#6b7280" : (PASTO_COLORS[p.estado_pasto] ?? "#6b7280"),
      },
    })),
  };
}

export default function MapaPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markersRef = useRef<Record<number, mapboxgl.Marker>>({});
  const descansoMarkersRef = useRef<Record<number, mapboxgl.Marker>>({});
  const tooltipRef = useRef<mapboxgl.Popup | null>(null);
  const mapReadyRef = useRef(false);
  const potrerosRef = useRef<Potrero[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState(0);

  const qc = useQueryClient();
  const {
    potreros,
    puntos,
    movimientos,
    setPotreros,
    setPuntos,
    setMovimientos,
    addPotrero,
    selectPotrero,
    activePuntoTool,
    setActivePuntoTool,
    addPunto,
    removePunto,
    movimientosPanelOpen,
    setMovimientosPanelOpen,
  } = useMapaStore();

  useEffect(() => {
    potrerosRef.current = potreros;
  }, [potreros]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useQuery({
    queryKey: ["potreros"],
    queryFn: async () => {
      const data = await getPotreros();
      setPotreros(data);
      return data;
    },
  });

  useQuery({
    queryKey: ["puntos"],
    queryFn: async () => {
      const data = await getPuntos();
      setPuntos(data);
      return data;
    },
  });

  useQuery({
    queryKey: ["movimientos"],
    queryFn: async () => {
      const data = await getMovimientos();
      setMovimientos(data);
      return data;
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createPotreroMutation = useMutation({
    mutationFn: createPotrero,
    onSuccess: (potrero) => {
      addPotrero(potrero);
      selectPotrero(potrero.id);
      qc.invalidateQueries({ queryKey: ["potreros"] });
    },
    onError: () => toast({ title: "Error al crear potrero", variant: "destructive" }),
  });

  const createPuntoMutation = useMutation({
    mutationFn: createPunto,
    onSuccess: (punto) => {
      addPunto(punto);
      setActivePuntoTool(null);
      qc.invalidateQueries({ queryKey: ["puntos"] });
    },
    onError: () => toast({ title: "Error al crear punto", variant: "destructive" }),
  });

  const deletePuntoMutation = useMutation({
    mutationFn: deletePunto,
    onSuccess: (_, id) => {
      removePunto(id);
      qc.invalidateQueries({ queryKey: ["puntos"] });
    },
  });

  // ── Map initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    if (!MAPBOX_TOKEN) {
      console.error("VITE_MAPBOX_TOKEN is not set");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-63.5, -34.5],
      zoom: 6,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: "simple_select",
      styles: [
        {
          id: "gl-draw-polygon-fill",
          type: "fill",
          filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
          paint: { "fill-color": "#22c55e", "fill-opacity": 0.2 },
        },
        {
          id: "gl-draw-polygon-stroke",
          type: "line",
          filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
          paint: { "line-color": "#22c55e", "line-width": 2, "line-dasharray": [2, 2] },
        },
      ],
    });

    map.addControl(draw, "top-left");
    drawRef.current = draw;

    tooltipRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "mapa-tooltip",
    });

    map.on("load", () => {
      map.addSource("potreros", {
        type: "geojson",
        data: buildPotreroFeatures(potrerosRef.current),
      });

      map.addLayer({
        id: "potreros-fill",
        type: "fill",
        source: "potreros",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.25,
        },
      });

      map.addLayer({
        id: "potreros-line",
        type: "line",
        source: "potreros",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
        },
      });

      map.addLayer({
        id: "potreros-label",
        type: "symbol",
        source: "potreros",
        layout: {
          "text-field": ["get", "nombre"],
          "text-size": 13,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-anchor": "center",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      });

      // Hover tooltip
      map.on("mouseenter", "potreros-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;
        const { nombre, tipo, estado_pasto, en_descanso, dias_descanso } = feature.properties as Record<string, any>;
        tooltipRef.current
          ?.setLngLat(e.lngLat)
          .setHTML(
            `<div style="background:#1e293b;color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.6;border:1px solid #334155">
              <strong>${nombre}</strong><br/>
              Tipo: ${tipo}<br/>
              ${en_descanso
                ? `<span style="color:#9ca3af">💤 En descanso hace ${dias_descanso} día${dias_descanso !== 1 ? "s" : ""}</span>`
                : `Pasto: <span style="color:${PASTO_COLORS[estado_pasto]}">${estado_pasto}</span>`
              }
            </div>`
          )
          .addTo(map);
      });

      map.on("mouseleave", "potreros-fill", () => {
        map.getCanvas().style.cursor = "";
        tooltipRef.current?.remove();
      });

      map.on("click", "potreros-fill", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        selectPotrero(Number(feature.properties?.id));
      });

      mapReadyRef.current = true;
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Draw event: polygon created ────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map || !draw) return;

    const onDrawCreate = (e: any) => {
      const feature = e.features[0];
      if (!feature || feature.geometry.type !== "Polygon") return;

      draw.delete(feature.id as string);

      const hectareas = calcHectareas(feature.geometry);

      createPotreroMutation.mutate({
        nombre: "Nuevo potrero",
        geometria: feature.geometry,
        tipo: "mixto",
        estado_pasto: "bueno",
        hectareas,
      });
    };

    map.on("draw.create", onDrawCreate);
    return () => {
      map.off("draw.create", onDrawCreate);
    };
  }, [createPotreroMutation]);

  // ── Track drawing mode for mobile confirm button ───────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onModeChange = (e: any) => {
      setIsDrawing(e.mode === "draw_polygon");
      setDrawnPoints(0);
    };

    map.on("draw.modechange", onModeChange);
    return () => { map.off("draw.modechange", onModeChange); };
  }, []);

  // Count vertices added while in draw_polygon mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isDrawing) return;

    const onVertexClick = () => setDrawnPoints((n) => n + 1);
    map.on("click", onVertexClick);
    return () => { map.off("click", onVertexClick); };
  }, [isDrawing]);

  // ── Point-of-interest click handler ───────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (!activePuntoTool) return;

      const geom: GeoJSONPoint = {
        type: "Point",
        coordinates: [e.lngLat.lng, e.lngLat.lat],
      };

      const nombre = `${PUNTO_EMOJIS[activePuntoTool]} ${activePuntoTool.charAt(0).toUpperCase() + activePuntoTool.slice(1)}`;

      createPuntoMutation.mutate({
        nombre,
        tipo: activePuntoTool,
        geometria: geom,
      });
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [activePuntoTool, createPuntoMutation]);

  // ── Update cursor when punto tool is active ────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = activePuntoTool ? "crosshair" : "";
  }, [activePuntoTool]);

  // ── Sync potreros layer ────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const source = map.getSource("potreros") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildPotreroFeatures(potreros));
  }, [potreros]);

  // ── Sync descanso HTML markers ─────────────────────────────────────────────
  // Emoji markers for potreros in descanso, positioned at polygon center.

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove markers for potreros no longer in descanso
    const descansoIds = new Set(
      potreros.filter((p) => p.en_descanso && p.fecha_descanso).map((p) => p.id)
    );
    Object.keys(descansoMarkersRef.current).forEach((idStr) => {
      const id = Number(idStr);
      if (!descansoIds.has(id)) {
        descansoMarkersRef.current[id].remove();
        delete descansoMarkersRef.current[id];
      }
    });

    // Add / update markers
    potreros.forEach((p) => {
      if (!p.en_descanso || !p.fecha_descanso) return;

      const dias = diasDescanso(p.fecha_descanso);
      const label = `💤 ${dias}d`;
      const center = polygonCenter(p.geometria.coordinates);

      if (descansoMarkersRef.current[p.id]) {
        // Update label text
        const el = descansoMarkersRef.current[p.id].getElement();
        el.textContent = label;
        descansoMarkersRef.current[p.id].setLngLat(center);
        return;
      }

      const el = document.createElement("div");
      el.textContent = label;
      el.style.cssText = [
        "background:rgba(30,41,59,0.85)",
        "color:#fff",
        "border:1px solid #475569",
        "border-radius:9999px",
        "font-size:11px",
        "font-weight:600",
        "padding:2px 7px",
        "pointer-events:none",
        "white-space:nowrap",
        "box-shadow:0 2px 6px rgba(0,0,0,0.4)",
        "margin-top:20px",
      ].join(";");

      const marker = new mapboxgl.Marker({ element: el, anchor: "top" })
        .setLngLat(center)
        .addTo(map);

      descansoMarkersRef.current[p.id] = marker;
    });
  }, [potreros]);

  // ── Sync punto markers ─────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(puntos.map((p) => p.id));
    Object.keys(markersRef.current).forEach((idStr) => {
      const id = Number(idStr);
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    puntos.forEach((punto) => {
      if (markersRef.current[punto.id]) return;

      const el = document.createElement("div");
      el.className = "punto-marker";
      el.textContent = PUNTO_EMOJIS[punto.tipo as TipoPunto];
      el.style.cssText =
        "font-size:22px;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));line-height:1;";

      const popup = new mapboxgl.Popup({ offset: 25, className: "mapa-popup" }).setHTML(
        `<div style="background:#1e293b;color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;border:1px solid #334155">
          <strong>${punto.nombre}</strong><br/>
          <button id="del-punto-${punto.id}" style="margin-top:6px;color:#ef4444;font-size:11px;cursor:pointer;background:none;border:none;padding:0">
            🗑 Eliminar
          </button>
        </div>`
      );

      popup.on("open", () => {
        setTimeout(() => {
          const btn = document.getElementById(`del-punto-${punto.id}`);
          btn?.addEventListener("click", () => {
            deletePuntoMutation.mutate(punto.id);
            popup.remove();
          });
        }, 50);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(punto.geometria.coordinates as [number, number])
        .setPopup(popup)
        .addTo(map);

      markersRef.current[punto.id] = marker;
    });
  }, [puntos, deletePuntoMutation]);

  return (
    <div className="page-fade relative w-full overflow-hidden" style={{ height: "100vh" }}>
      {/* Map container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* No token warning */}
      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-20">
          <div className="bg-slate-900 border border-red-500/50 rounded-xl p-6 max-w-sm text-center">
            <p className="text-red-400 font-semibold">Token de Mapbox no configurado</p>
            <p className="text-slate-400 text-sm mt-2">
              Agregá <code className="bg-slate-800 px-1 rounded">VITE_MAPBOX_TOKEN</code> a tu{" "}
              <code className="bg-slate-800 px-1 rounded">.env</code>
            </p>
          </div>
        </div>
      )}

      {/* Mobile confirm button — appears after 3 vertices in draw mode */}
      {isDrawing && drawnPoints >= 3 && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            drawRef.current?.changeMode("simple_select");
          }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-agro-primary text-white font-semibold py-3 px-8 rounded-full shadow-xl hover:bg-agro-primary/90 active:scale-95 transition-all text-base"
        >
          ✓ Confirmar potrero
        </button>
      )}

      {/* Movimientos panel toggle button */}
      <button
        onClick={() => setMovimientosPanelOpen(!movimientosPanelOpen)}
        className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg px-3 py-2 text-white text-sm flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg"
        style={{ display: movimientosPanelOpen ? "none" : "flex" }}
      >
        <List className="w-4 h-4" />
        Movimientos
        {movimientos.filter((m) => m.estado === "programado").length > 0 && (
          <span className="bg-yellow-500 text-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {movimientos.filter((m) => m.estado === "programado").length}
          </span>
        )}
      </button>

      {/* Overlays */}
      <ElementosPanel
        onFlyTo={(center, zoom) => mapRef.current?.flyTo({ center, zoom, duration: 800 })}
      />
      <MovimientosPanel />
      <PuntosToolbar />
      <PanelLateral />
      <ModalMovimiento />
    </div>
  );
}
