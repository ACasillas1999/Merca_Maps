import { STORAGE_KEYS } from './state.js';

export function loadRoutes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.routes);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('No se pudo leer rutas almacenadas', err);
    return [];
  }
}

export function persistRoutes(routes) {
  localStorage.setItem(STORAGE_KEYS.routes, JSON.stringify(routes));
}
