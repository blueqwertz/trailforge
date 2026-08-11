'use client';

import {
  AttributionControl,
  type GeoJSONSource,
  MapLibreMap,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  type RasterTileSource,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import {
  BASE_STYLES,
  HILLSHADE_LAYER_ID,
  INITIAL_VIEW,
  ROUTE_SOURCE_ID,
  TERRAIN_SOURCE_ID,
  WAYMARKED_LAYER_ID,
  WAYMARKED_SOURCE_ID,
  terrainSource,
  waymarkedSource,
  waymarkedTilesFor,
} from '@/lib/map-style';
import { usePlanner } from '@/lib/planner-store';
import {
  distanceAtIndex,
  insertIndexFor,
  nearestPointIndex,
  pointAtDistance,
  routeBounds,
  routeToGeoJson,
} from '@/lib/route-geometry';

import 'maplibre-gl/dist/maplibre-gl.css';

const ROUTE_CASING_LAYER = 'trailforge-route-casing';
const ROUTE_LINE_LAYER = 'trailforge-route-line';
const ROUTE_HIT_LAYER = 'trailforge-route-hit';

const EMPTY_LINE = {
  type: 'FeatureCollection' as const,
  features: [],
};

/**
 * MapLibre bestimmt die Adresse seines Workers aus `import.meta.url` und sucht
 * ihn nach dem Bündeln im Chunk-Verzeichnis, wo er nicht liegt. Ohne Worker
 * lädt die Karte keine einzige Kachel — sichtbar nur daran, dass die Fläche
 * leer bleibt. `scripts/copy-maplibre-worker.mjs` legt ihn unter `public/` ab.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export function MapView() {
  const { state, dispatch } = usePlanner();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hoverMarkerRef = useRef<Marker | null>(null);

  // Der Kartenzustand lebt außerhalb von React. Damit die Ereignisbehandlung
  // trotzdem den aktuellen Zustand sieht, ohne die Karte bei jeder Änderung neu
  // aufzubauen, liegt er zusätzlich in einer Referenz.
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // --- Karte aufbauen ------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const map = new MapLibreMap({
      container,
      style: prefersDark ? BASE_STYLES.dark : BASE_STYLES.light,
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      attributionControl: false,
      // Die Karte trägt die Fläche; eine gekippte Ansicht hilft beim Planen nicht.
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: [] }),
      'bottom-right',
    );

    map.on('load', () => addCustomLayers(map, stateRef.current.sport));

    if (process.env.NODE_ENV === 'development') {
      // Zugriff auf die Karteninstanz in der Konsole, um Stil und Ebenen zu prüfen.
      (window as unknown as { __trailforgeMap?: MapLibreMap }).__trailforgeMap = map;
      map.on('error', (event) => console.error('[maplibre]', event.error));
    }

    // Ein Klick ins Leere setzt den nächsten Wegpunkt.
    map.on('click', (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: [ROUTE_HIT_LAYER] });
      if (features.length > 0) return;

      dispatchRef.current({
        type: 'addWaypoint',
        point: { lng: event.lngLat.lng, lat: event.lngLat.lat },
      });
    });

    mapRef.current = map;

    // Die Karte wird nachgeladen und startet deshalb gelegentlich, bevor ihr
    // Behälter vermessen ist — sie bleibt dann auf der Notgröße 400×300 stehen.
    // Der Beobachter greift außerdem, wenn sich das Fenster oder das
    // Bedienfeld ändert.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- Route zeichnen ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(state.route ? routeToGeoJson(state.route) : EMPTY_LINE);
    };

    if (map.isStyleLoaded()) draw();
    else map.once('idle', draw);
  }, [state.route]);

  // --- Ausschnitt an neue Routen anpassen ----------------------------------
  const fittedRouteId = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !state.route) return;

    // Nur bei einer wirklich neuen Route, nicht bei jedem Wechsel der Auswahl.
    const key = `${state.route.waypoints.map((w) => `${w.lng},${w.lat}`).join('|')}`;
    if (fittedRouteId.current === key) return;
    fittedRouteId.current = key;

    const bounds = routeBounds(state.route);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 140, left: 360, right: 60 },
        speed: 1.6,
      });
    }
  }, [state.route]);

  // --- Wege-Überlagerung an die Sportart anpassen --------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
      const source = map.getSource(WAYMARKED_SOURCE_ID) as RasterTileSource | undefined;
      if (!source) return;
      source.setTiles(waymarkedTilesFor(state.sport));
    };

    if (map.isStyleLoaded()) update();
    else map.once('idle', update);
  }, [state.sport]);

  // --- Wegpunkt-Marker -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current) marker.remove();

    markersRef.current = state.waypoints.map((waypoint, index) => {
      const element = createWaypointElement(index, state.waypoints.length);

      const marker = new Marker({ element, draggable: true, anchor: 'center' })
        .setLngLat([waypoint.lng, waypoint.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        dispatchRef.current({ type: 'moveWaypoint', index, point: { lng, lat } });
      });

      element.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        dispatchRef.current({ type: 'removeWaypoint', index });
      });

      return marker;
    });

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [state.waypoints]);

  // --- Klick und Zeiger auf der Route --------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onRouteClick = (event: MapMouseEvent) => {
      const route = stateRef.current.route;
      if (!route) return;

      const index = nearestPointIndex(route.points, {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      });

      dispatchRef.current({
        type: 'insertWaypoint',
        index: insertIndexFor(route, index),
        point: { lng: event.lngLat.lng, lat: event.lngLat.lat },
      });
    };

    const onRouteMove = (event: MapMouseEvent) => {
      const route = stateRef.current.route;
      if (!route) return;

      map.getCanvas().style.cursor = 'copy';
      const index = nearestPointIndex(route.points, {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      });
      dispatchRef.current({ type: 'setHoverDistance', distance: distanceAtIndex(route, index) });
    };

    const onRouteLeave = () => {
      map.getCanvas().style.cursor = '';
      dispatchRef.current({ type: 'setHoverDistance', distance: null });
    };

    map.on('click', ROUTE_HIT_LAYER, onRouteClick);
    map.on('mousemove', ROUTE_HIT_LAYER, onRouteMove);
    map.on('mouseleave', ROUTE_HIT_LAYER, onRouteLeave);

    return () => {
      map.off('click', ROUTE_HIT_LAYER, onRouteClick);
      map.off('mousemove', ROUTE_HIT_LAYER, onRouteMove);
      map.off('mouseleave', ROUTE_HIT_LAYER, onRouteLeave);
    };
  }, []);

  // --- Zeigerposition aus dem Höhenprofil ----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const position =
      state.route && state.hoverDistance !== null
        ? pointAtDistance(state.route, state.hoverDistance)
        : null;

    if (!position) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }

    if (!hoverMarkerRef.current) {
      hoverMarkerRef.current = new Marker({
        element: createHoverElement(),
        anchor: 'center',
      }).addTo(map);
    }

    hoverMarkerRef.current.setLngLat([position.point.lng, position.point.lat]);
  }, [state.hoverDistance, state.route]);

  return <div ref={containerRef} className="h-full w-full" data-testid="map" />;
}

/**
 * Eigene Ebenen über den Stil legen.
 *
 * Die Schummerung kommt unter die Beschriftungen, damit Ortsnamen lesbar
 * bleiben; die Route liegt über allem, weil sie das eigentliche Ergebnis ist.
 */
function addCustomLayers(map: MapLibreMap, sport: Parameters<typeof waymarkedSource>[0]) {
  const firstSymbolLayer = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;

  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, terrainSource());
    map.addLayer(
      {
        id: HILLSHADE_LAYER_ID,
        type: 'hillshade',
        source: TERRAIN_SOURCE_ID,
        paint: {
          'hillshade-exaggeration': 0.35,
          'hillshade-shadow-color': '#4a4a48',
          'hillshade-accent-color': '#6b6b66',
        },
      },
      firstSymbolLayer,
    );
  }

  if (!map.getSource(WAYMARKED_SOURCE_ID)) {
    map.addSource(WAYMARKED_SOURCE_ID, waymarkedSource(sport));
    map.addLayer(
      {
        id: WAYMARKED_LAYER_ID,
        type: 'raster',
        source: WAYMARKED_SOURCE_ID,
        paint: { 'raster-opacity': 0.55 },
      },
      firstSymbolLayer,
    );
  }

  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: EMPTY_LINE });

    map.addLayer({
      id: ROUTE_CASING_LAYER,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 9],
        'line-opacity': 0.9,
      },
    });

    map.addLayer({
      id: ROUTE_LINE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeColor(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5],
      },
    });

    // Unsichtbare, breite Ebene: eine 3 Pixel schmale Linie exakt zu treffen
    // wäre eine Zumutung.
    map.addLayer({
      id: ROUTE_HIT_LAYER,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 },
    });
  }
}

/** Die Akzentfarbe der Sportart steht als CSS-Variable am Wurzelelement. */
function routeColor(): string {
  if (typeof window === 'undefined') return '#b91c1c';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return value.length > 0 ? value : '#b91c1c';
}

function createWaypointElement(index: number, total: number): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  const isEnd = index === 0 || index === total - 1;

  element.className = [
    'grid place-items-center rounded-full border-2 border-white',
    'text-[11px] font-semibold text-white tabular-nums',
    'shadow-[0_1px_4px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing',
    isEnd ? 'h-6 w-6' : 'h-4 w-4',
  ].join(' ');

  element.style.backgroundColor = isEnd ? 'var(--accent)' : 'var(--color-base-700)';
  element.textContent = isEnd ? String(index + 1) : '';
  element.setAttribute('aria-label', `Wegpunkt ${index + 1}`);

  return element;
}

function createHoverElement(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'h-3 w-3 rounded-full border-2 border-white bg-[var(--accent)]';
  element.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
  element.style.pointerEvents = 'none';
  return element;
}
