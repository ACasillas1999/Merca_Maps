import { mapDefaults } from './state.js';

export function initMap(mapState, { onReady, onClick } = {}) {
  mapState.map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: mapDefaults.center,
    zoom: mapDefaults.zoom,
  });
  mapState.map.addControl(new mapboxgl.NavigationControl());

  mapState.map.on('load', () => {
    mapState.mapReady = true;
    onReady?.(mapState.map);
  });

  mapState.map.on('click', (e) => {
    const { lng, lat } = e.lngLat;
    onClick?.({ lng, lat });
  });
}

export function highlightDraftLocation(mapState, lat, lng) {
  if (mapState.clickMarker) mapState.clickMarker.remove();
  const el = document.createElement('span');
  el.className = 'marker';
  el.style.setProperty('--color', '#38bdf8');
  mapState.clickMarker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(mapState.map);
}

export function renderMarkers(mapState, locations, { typeColor, getTypeKey, getTypeLabel }) {
  if (!mapState.mapReady) return;
  mapState.markers.forEach((m) => m.remove());
  mapState.markers = [];
  locations.forEach((loc) => {
    const key = getTypeKey(loc.type);
    const el = document.createElement('span');
    el.className = 'marker';
    el.dataset.type = key;
    el.style.setProperty('--color', typeColor[key] || '#38bdf8');
    const marker = new mapboxgl.Marker(el)
      .setLngLat([loc.lng, loc.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 16 }).setHTML(
          `<strong>${loc.name}</strong><br>${getTypeLabel(loc.type)}<br>${loc.notes || ''}`
        )
      )
      .addTo(mapState.map);
    mapState.markers.push(marker);
  });
}

export function clearRouteLayers(mapState) {
  if (!mapState.mapReady) return;
  const routeId = mapState.layerIds.route;
  if (mapState.map.getLayer(routeId)) mapState.map.removeLayer(routeId);
  if (mapState.map.getSource(routeId)) mapState.map.removeSource(routeId);
  mapState.routeMarkers.forEach((m) => m.remove());
  mapState.routeMarkers = [];
}

export function drawRoute(mapState, route, locations) {
  if (!mapState.mapReady) return;
  clearRouteLayers(mapState);
  if (!route) return;
  const latlngs = [];
  route.stops.forEach((id, idx) => {
    const loc = locations.find((l) => l.id === id);
    if (!loc) return;
    latlngs.push([loc.lng, loc.lat]);
    const pinEl = document.createElement('span');
    pinEl.className = 'route-pin';
    pinEl.textContent = idx + 1;
    const marker = new mapboxgl.Marker(pinEl).setLngLat([loc.lng, loc.lat]).addTo(mapState.map);
    mapState.routeMarkers.push(marker);
  });
  if (latlngs.length) {
    mapState.map.addSource(mapState.layerIds.route, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: latlngs } },
    });
    mapState.map.addLayer({
      id: mapState.layerIds.route,
      type: 'line',
      source: mapState.layerIds.route,
      paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-opacity': 0.8 },
    });
    fitToCoordinates(mapState, latlngs, 40);
  }
}

export function drawNavPoint(mapState, lng, lat, label) {
  mapState.navMarkers.forEach((m) => m.remove());
  mapState.navMarkers = [];
  const el = document.createElement('span');
  el.className = 'marker';
  el.style.setProperty('--color', '#38bdf8');
  const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(mapState.map);
  if (label) marker.getElement().setAttribute('title', label);
  mapState.navMarkers.push(marker);
}

export function clearNavLayers(mapState) {
  if (!mapState.mapReady) return;
  const navRouteId = mapState.layerIds.navRoute;
  const trafficId = mapState.layerIds.navTraffic;
  if (mapState.map.getLayer(navRouteId)) mapState.map.removeLayer(navRouteId);
  if (mapState.map.getSource(navRouteId)) mapState.map.removeSource(navRouteId);
  if (mapState.map.getLayer(trafficId)) mapState.map.removeLayer(trafficId);
  if (mapState.map.getSource(trafficId)) mapState.map.removeSource(trafficId);
  mapState.navMarkers.forEach((m) => m.remove());
  mapState.navMarkers = [];
}

export function drawNavRoute(mapState, routeData, origin, destination, trafficOn) {
  if (!mapState.mapReady || !routeData?.coordinates?.length) return;
  clearNavLayers(mapState);
  mapState.map.addSource(mapState.layerIds.navRoute, {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeData.coordinates } },
  });
  mapState.map.addLayer({
    id: mapState.layerIds.navRoute,
    type: 'line',
    source: mapState.layerIds.navRoute,
    paint: {
      'line-color': '#0ea5e9',
      'line-width': 4,
      'line-opacity': trafficOn ? 0.2 : 0.9,
    },
  });
  if (trafficOn && routeData.congestion?.length) {
    addTrafficSegments(mapState, routeData);
  }
  const originEl = document.createElement('span');
  originEl.className = 'marker';
  originEl.style.setProperty('--color', '#22d3ee');
  mapState.navMarkers.push(new mapboxgl.Marker(originEl).setLngLat([origin.lng, origin.lat]).addTo(mapState.map));
  const destEl = document.createElement('span');
  destEl.className = 'marker';
  destEl.style.setProperty('--color', '#f472b6');
  mapState.navMarkers.push(new mapboxgl.Marker(destEl).setLngLat([destination.lng, destination.lat]).addTo(mapState.map));
  fitToCoordinates(mapState, routeData.coordinates, 60);
}

function addTrafficSegments(mapState, routeData) {
  const coords = routeData.coordinates;
  const congestion = routeData.congestion || [];
  if (!coords?.length || !congestion.length) return;
  const features = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const color = congestionColor(congestion[i]);
    features.push({
      type: 'Feature',
      properties: { color },
      geometry: { type: 'LineString', coordinates: [coords[i], coords[i + 1]] },
    });
  }
  mapState.map.addSource(mapState.layerIds.navTraffic, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });
  mapState.map.addLayer({
    id: mapState.layerIds.navTraffic,
    type: 'line',
    source: mapState.layerIds.navTraffic,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 5,
      'line-opacity': 0.9,
    },
  });
}

function congestionColor(level) {
  switch (level) {
    case 'low': return '#22c55e';
    case 'moderate': return '#f59e0b';
    case 'heavy': return '#ef4444';
    case 'severe': return '#991b1b';
    default: return '#38bdf8';
  }
}

function fitToCoordinates(mapState, coords, padding = 60) {
  const bounds = coords.reduce(
    (b, coord) => b.extend(coord),
    new mapboxgl.LngLatBounds(coords[0], coords[0])
  );
  mapState.map.fitBounds(bounds, { padding });
}
