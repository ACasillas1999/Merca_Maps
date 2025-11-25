import { MAPBOX_TOKEN } from './state.js';

export async function fetchCurrentUser() {
  const res = await fetch('api/auth.php');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'No autenticado');
  }
  return data.user;
}

export async function fetchLocations() {
  const res = await fetch('api/locations.php');
  const raw = await res.text();
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
  return (data.locations || []).map((loc) => ({
    ...loc,
    id: String(loc.id),
    lat: Number(loc.lat),
    lng: Number(loc.lng),
  }));
}

export async function createLocation(payload) {
  const res = await fetch('api/locations.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
  return data.location;
}

export async function deleteLocation(id) {
  const res = await fetch(`api/locations.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const raw = await res.text();
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
  return true;
}

export async function fetchNavRoute(origin, destination) {
  const oLng = Number(origin.lng);
  const oLat = Number(origin.lat);
  const dLng = Number(destination?.lng);
  const dLat = Number(destination?.lat);
  if (!Number.isFinite(oLng) || !Number.isFinite(oLat) || !Number.isFinite(dLng) || !Number.isFinite(dLat)) {
    throw new Error('Coordenadas invalidas');
  }
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${oLng},${oLat};${dLng},${dLat}?geometries=geojson&overview=full&language=es&annotations=congestion&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.routes?.length) {
    throw new Error(data.message || 'No route');
  }
  const best = data.routes[0];
  const coords = best.geometry.coordinates;
  const congestion = best.legs?.[0]?.annotation?.congestion || [];
  return { coordinates: coords, congestion, origin };
}

export async function geocodePlace(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&language=es&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature?.center) throw new Error('No geocode');
  return { lng: feature.center[0], lat: feature.center[1], name: feature.place_name };
}

export async function reverseGeocode(origin) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${origin.lng},${origin.lat}.json?limit=1&language=es&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  const feature = data.features?.[0];
  return feature?.place_name || '';
}

export async function fetchUsers() {
  const res = await fetch('api/users.php');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'No autorizado');
  }
  return data.users || [];
}

export async function saveUser(payload) {
  const method = payload.id ? 'PUT' : 'POST';
  const res = await fetch('api/users.php', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error al guardar');
  }
  return data.user;
}

export async function deleteUser(id) {
  const res = await fetch(`api/users.php?id=${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'No se pudo eliminar');
  }
  return true;
}
