import { MAPBOX_TOKEN, state, mapState, typeColor, typeLabel } from './state.js';
import { loadRoutes, persistRoutes } from './storage.js';
import {
  fetchLocations,
  createLocation,
  deleteLocation,
  fetchNavRoute,
  geocodePlace,
  reverseGeocode,
  fetchCurrentUser,
  fetchUsers,
  saveUser,
  deleteUser as deleteUserApi,
} from './api.js';
import { initMap, highlightDraftLocation, renderMarkers, drawRoute, clearRouteLayers, drawNavPoint, drawNavRoute, clearNavLayers } from './map.js';
import { getTypeKey, getTypeLabel, filterLocations, uid } from './utils.js';
import {
  hydrateUI,
  renderLocationList,
  renderRoutesList,
  renderFilters,
  renderRouteSelector,
  renderStopSelect,
  renderStopsPreview,
  updateMetrics,
  updateNavOrigins,
  updateNavSummary,
  toggleNavCard,
  openModal,
  closeModal,
  openRouteModal,
  closeRouteModal,
} from './ui.js';

mapboxgl.accessToken = MAPBOX_TOKEN;

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await ensureAuth();
    state.routes = loadRoutes();
    hydrateUI();
    initMap(mapState, { onReady: handleMapReady, onClick: handleMapClick });
    bindEvents();
    loadLocations();
    renderAll();
  })();
});

async function ensureAuth() {
  try {
    const user = await fetchCurrentUser();
    state.currentUser = user;
    const adminBtn = document.getElementById('open-users-admin');
    if (adminBtn && user.role === 'admin') adminBtn.hidden = false;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.hidden = false;
  } catch (err) {
    window.location.href = 'login.html';
  }
}

function handleMapReady() {
  renderMarkers(mapState, getFiltered(), mapRenderConfig());
  setupGeocoder();
}

function handleMapClick({ lng, lat }) {
  document.getElementById('loc-lat').value = lat.toFixed(6);
  document.getElementById('loc-lng').value = lng.toFixed(6);
  highlightDraftLocation(mapState, lat, lng);
  state.navDestination = { lng, lat, name: `Punto seleccionado (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
  const status = document.getElementById('nav-status');
  if (status) status.textContent = 'Destino seleccionado desde el mapa.';
  updateNavSummary(state);
}

function bindEvents() {
  const locationForm = document.getElementById('location-form');
  const routeForm = document.getElementById('route-form');
  const addStopBtn = document.getElementById('add-stop');
  const routeSelector = document.getElementById('route-selector');
  const showRouteBtn = document.getElementById('btn-show-route');
  const clearRouteBtn = document.getElementById('btn-clear-route');
  const locationsList = document.getElementById('locations-list');
  const routesList = document.getElementById('routes-list');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const routeModalBackdrop = document.getElementById('route-modal-backdrop');
  const openModalBtn = document.getElementById('open-modal');
  const openModalInline = document.getElementById('open-modal-inline');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const openRouteModalBtn = document.getElementById('open-route-modal-top');
  const routeModalClose = document.getElementById('route-modal-close');
  const routeModalCancel = document.getElementById('route-modal-cancel');
  const btnRouteFromCurrent = document.getElementById('btn-route-from-current');
  const btnRouteFromOrigin = document.getElementById('btn-route-from-origin');
  const btnClearNav = document.getElementById('btn-clear-nav');
  const navOriginSelect = document.getElementById('nav-origin');
  const navOriginText = document.getElementById('nav-origin-text');
  const navToggle = document.getElementById('nav-toggle');
  const trafficToggle = document.getElementById('toggle-traffic');
  const searchInput = document.getElementById('locations-search');
  const adminUsersBtn = document.getElementById('open-users-admin');
  const usersModalBackdrop = document.getElementById('users-modal-backdrop');
  const usersModalClose = document.getElementById('users-modal-close');
  const usersModalCancel = document.getElementById('users-modal-cancel');
  const logoutBtn = document.getElementById('logout-btn');
  const drawerToggle = document.getElementById('menu-toggle');
  const drawerOverlay = document.getElementById('drawer-overlay');

  openModalBtn?.addEventListener('click', openModal);
  openModalInline?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);
  openRouteModalBtn?.addEventListener('click', openRouteModal);
  routeModalClose?.addEventListener('click', closeRouteModal);
  routeModalCancel?.addEventListener('click', closeRouteModal);

  modalBackdrop?.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
  routeModalBackdrop?.addEventListener('click', (e) => { if (e.target === routeModalBackdrop) closeRouteModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modalBackdrop.hidden) closeModal();
      if (!routeModalBackdrop.hidden) closeRouteModal();
    }
  });

  btnRouteFromCurrent?.addEventListener('click', routeFromCurrentPosition);
  btnRouteFromOrigin?.addEventListener('click', routeFromSelectedOrigin);
  btnClearNav?.addEventListener('click', clearNavRoute);

  navOriginSelect?.addEventListener('change', (e) => {
    if (e.target.value) {
      if (navOriginText) navOriginText.value = '';
    }
    state.navOriginId = e.target.value;
    state.navOriginManual = '';
    updateNavSummary(state);
  });
  navOriginText?.addEventListener('input', (e) => {
    if (e.target.value) {
      if (navOriginSelect) navOriginSelect.value = '';
    }
    state.navOriginManual = e.target.value.trim();
    state.navOriginId = '';
    updateNavSummary(state);
  });
  navToggle?.addEventListener('click', toggleNavCard);
  trafficToggle?.addEventListener('change', (e) => {
    state.trafficOn = e.target.checked;
    if (state.navRouteData && state.navDestination) {
      applyNavRoute(state.navRouteData, state.navRouteData.origin || null, state.navDestination);
    }
  });
  searchInput?.addEventListener('input', (e) => {
    state.searchTerm = e.target.value.toLowerCase();
    renderAll();
  });
  adminUsersBtn?.addEventListener('click', openUsersModal);
  usersModalClose?.addEventListener('click', closeUsersModal);
  usersModalCancel?.addEventListener('click', closeUsersModal);
  logoutBtn?.addEventListener('click', handleLogout);
  drawerToggle?.addEventListener('click', toggleDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);

  locationForm?.addEventListener('submit', handleCreateLocation);
  routeForm?.addEventListener('submit', handleCreateRoute);
  bindUserForm();

  addStopBtn?.addEventListener('click', () => {
    const select = document.getElementById('route-stop');
    const stopId = select?.value;
    if (!stopId) return;
    state.currentStops.push(stopId);
    renderStopsPreview(state, { onRemove: removeStopAt });
  });

  routeSelector?.addEventListener('change', (e) => {
    state.selectedRouteId = e.target.value;
  });
  showRouteBtn?.addEventListener('click', () => {
    const route = state.routes.find((r) => r.id === state.selectedRouteId);
    if (route) drawRoute(mapState, route, state.locations);
  });
  clearRouteBtn?.addEventListener('click', () => {
    state.selectedRouteId = '';
    if (routeSelector) routeSelector.value = '';
    clearRouteLayers(mapState);
  });

  locationsList?.addEventListener('click', async (e) => {
    if (e.target.matches('[data-action="remove"]')) {
      const id = e.target.dataset.id;
      if (confirm('Eliminar esta ubicacion?')) {
        await handleDeleteLocation(id);
      }
    }
    if (e.target.matches('[data-action="focus"]')) {
      const id = e.target.dataset.id;
      const loc = state.locations.find((l) => l.id === id);
      if (loc) {
        mapState.map.flyTo({ center: [loc.lng, loc.lat], zoom: 13 });
        new mapboxgl.Popup({ offset: 16 })
          .setLngLat([loc.lng, loc.lat])
          .setHTML(`<strong>${loc.name}</strong><br>${getTypeLabel(loc.type, typeLabel)}<br>${loc.notes || ''}`)
          .addTo(mapState.map);
      }
    }
    if (e.target.matches('[data-action="nav-dest"]')) {
      const id = e.target.dataset.id;
      const loc = state.locations.find((l) => l.id === id);
      if (loc) {
        state.navDestination = { lng: loc.lng, lat: loc.lat, name: loc.name };
        const status = document.getElementById('nav-status');
        if (status) status.textContent = `Destino: ${loc.name}. Elige origen o usa "Desde mi ubicacion".`;
        drawNavPoint(mapState, loc.lng, loc.lat, 'destino');
        updateNavSummary(state);
      }
    }
  });

  routesList?.addEventListener('click', (e) => {
    if (e.target.matches('[data-action="view-route"]')) {
      const id = e.target.dataset.id;
      state.selectedRouteId = id;
      const selector = document.getElementById('route-selector');
      if (selector) selector.value = id;
      const route = state.routes.find((r) => r.id === id);
      if (route) drawRoute(mapState, route, state.locations);
    }
    if (e.target.matches('[data-action="delete-route"]')) {
      const id = e.target.dataset.id;
      if (confirm('Eliminar esta ruta?')) {
        state.routes = state.routes.filter((r) => r.id !== id);
        if (state.selectedRouteId === id) {
          state.selectedRouteId = '';
          clearRouteLayers(mapState);
        }
        persistRoutes(state.routes);
        renderAll();
      }
    }
  });
}

function bindUserForm() {
  const userForm = document.getElementById('user-form-inline');
  if (!userForm) return;
  const submitBtn = document.getElementById('user-submit');
  const statusEl = document.getElementById('users-status');
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: userForm.dataset.editingId ? Number(userForm.dataset.editingId) : undefined,
      name: document.getElementById('user-name').value.trim(),
      email: document.getElementById('user-email').value.trim(),
      password: document.getElementById('user-password').value,
      role: document.getElementById('user-role').value,
    };
    if (!payload.name || !payload.email || (!payload.id && !payload.password)) {
      statusEl.textContent = 'Completa nombre, correo y contraseña.';
      return;
    }
    try {
      submitBtn.disabled = true;
      statusEl.textContent = payload.id ? 'Actualizando...' : 'Creando...';
      if (payload.id && !payload.password) delete payload.password;
      await saveUser(payload);
      statusEl.textContent = payload.id ? 'Usuario actualizado' : 'Usuario creado';
      userForm.reset();
      userForm.dataset.editingId = '';
      submitBtn.textContent = 'Crear usuario';
      await loadUsersAdmin();
    } catch (err) {
      statusEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  const list = document.getElementById('users-list');
  list?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') {
      const user = state.users.find((u) => Number(u.id) === id);
      if (!user) return;
      document.getElementById('user-name').value = user.name;
      document.getElementById('user-email').value = user.email;
      document.getElementById('user-password').value = '';
      document.getElementById('user-role').value = user.role;
      userForm.dataset.editingId = user.id;
      submitBtn.textContent = 'Actualizar usuario';
      statusEl.textContent = `Editando a ${user.name}`;
    } else if (btn.dataset.action === 'delete') {
      if (confirm('Eliminar usuario?')) {
        try {
          statusEl.textContent = 'Eliminando...';
          await deleteUserApi(id);
          statusEl.textContent = 'Usuario eliminado';
          await loadUsersAdmin();
        } catch (err) {
          statusEl.textContent = err.message || 'No se pudo eliminar';
        }
      }
    }
  });
}

async function loadLocations() {
  state.loadingLocations = true;
  renderLocationList(state, [], uiRenderConfig());
  try {
    const locations = await fetchLocations();
    state.locations = locations;
    state.loadingLocations = false;
    renderAll();
  } catch (err) {
    console.error(err);
    const container = document.getElementById('locations-list');
    if (container) container.innerHTML = '<p class="muted">Error al cargar ubicaciones.</p>';
  } finally {
    state.loadingLocations = false;
    renderLocationList(state, getFiltered(), uiRenderConfig());
  }
}

async function handleCreateLocation(e) {
  e.preventDefault();
  const form = e.target;
  const name = document.getElementById('loc-name').value.trim();
  const type = document.getElementById('loc-type').value;
  const lat = parseFloat(document.getElementById('loc-lat').value);
  const lng = parseFloat(document.getElementById('loc-lng').value);
  const notes = document.getElementById('loc-notes').value.trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert('Agrega una latitud y longitud validas.');
    return;
  }
  try {
    form.querySelector('button[type="submit"]').disabled = true;
    await createLocation({ name, type, lat, lng, notes });
    form.reset();
    state.currentStops = [];
    renderStopsPreview(state, { onRemove: removeStopAt });
    closeModal();
    mapState.map.flyTo({ center: [lng, lat], zoom: 12 });
    await loadLocations();
  } catch (err) {
    console.error(err);
    alert('No se pudo guardar la ubicacion.');
  } finally {
    form.querySelector('button[type="submit"]').disabled = false;
  }
}

async function handleDeleteLocation(id) {
  try {
    await deleteLocation(id);
    state.routes = state.routes.map((r) => ({ ...r, stops: r.stops.filter((stopId) => stopId !== id) }));
    persistRoutes(state.routes);
    await loadLocations();
  } catch (err) {
    console.error(err);
    alert('No se pudo eliminar la ubicacion.');
  }
}

function handleCreateRoute(e) {
  e.preventDefault();
  const form = e.target;
  const routeName = document.getElementById('route-name').value.trim();
  const user = document.getElementById('route-user').value.trim();
  if (!routeName || !user) return;
  if (!state.currentStops.length) {
    alert('Agrega al menos una parada a la ruta.');
    return;
  }
  const route = { id: uid('route'), name: routeName, user, stops: [...state.currentStops], createdAt: Date.now() };
  state.routes.push(route);
  state.currentStops = [];
  state.selectedRouteId = route.id;
  persistRoutes(state.routes);
  form.reset();
  renderAll();
  drawRoute(mapState, route, state.locations);
  closeRouteModal();
}

function removeStopAt(index) {
  state.currentStops.splice(index, 1);
  renderStopsPreview(state, { onRemove: removeStopAt });
}

function setupGeocoder() {
  const geocoderContainer = document.getElementById('geocoder');
  if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
  mapState.geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl,
    marker: false,
    placeholder: 'Buscar direccion',
    language: 'es',
    countries: 'mx',
    limit: 5,
  });
  mapState.geocoder.addTo(geocoderContainer);
  mapState.geocoder.on('result', (e) => {
    if (!e.result?.center) return;
    const [lng, lat] = e.result.center;
    state.navDestination = { lng, lat, name: e.result.place_name };
    const status = document.getElementById('nav-status');
    if (status) status.textContent = 'Destino seleccionado. Elige origen o usa "Desde mi ubicacion".';
    const originSelect = document.getElementById('nav-origin');
    if (originSelect && !originSelect.value && state.locations.length) {
      originSelect.selectedIndex = 1;
    }
    drawNavPoint(mapState, lng, lat, 'destino');
    updateNavSummary(state);
  });
}

async function routeFromCurrentPosition() {
  if (!state.navDestination) {
    alert('Primero selecciona una direccion destino.');
    return;
  }
  if (!navigator.geolocation) {
    alert('Tu navegador no permite geolocalizacion.');
    return;
  }
  const status = document.getElementById('nav-status');
  if (status) status.textContent = 'Obteniendo ubicacion actual...';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const origin = { lng: pos.coords.longitude, lat: pos.coords.latitude };
      setOriginFromCoords(origin, 'Mi ubicacion');
      try {
        reverseGeocode(origin).then((name) => { if (name) setOriginFromCoords(origin, name); }).catch(() => {});
        if (status) status.textContent = 'Calculando ruta...';
        const routeData = await fetchNavRoute(origin, state.navDestination);
        applyNavRoute(routeData, origin, state.navDestination);
        if (status) status.textContent = 'Ruta trazada desde tu ubicacion.';
      } catch (err) {
        console.error(err);
        if (status) status.textContent = `No se pudo trazar la ruta: ${err.message || ''}`;
        alert(`No se pudo trazar la ruta: ${err.message || ''}`);
      }
    },
    (err) => {
      console.error(err);
      if (status) status.textContent = 'No se pudo obtener tu ubicacion. Habilita permisos de GPS.';
      alert('No se pudo obtener tu ubicacion. Habilita permisos de GPS.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function routeFromSelectedOrigin() {
  if (!state.navDestination) {
    alert('Primero selecciona una direccion destino.');
    return;
  }
  const originSelect = document.getElementById('nav-origin');
  const originText = document.getElementById('nav-origin-text');
  const originId = originSelect?.value;
  const originManual = originText?.value.trim();
  const status = document.getElementById('nav-status');
  if (!originId && !originManual) {
    alert('Elige una ubicacion de origen o escribe una direccion.');
    return;
  }
  if (originManual) {
    if (status) status.textContent = 'Buscando origen...';
    geocodePlace(originManual)
      .then((place) => {
        if (status) status.textContent = 'Calculando ruta...';
        return fetchNavRoute(place, state.navDestination).then((routeData) => ({ routeData, place }));
      })
      .then(({ routeData, place }) => {
        applyNavRoute(routeData, place, state.navDestination);
        if (status) status.textContent = `Ruta trazada desde ${place.name}.`;
      })
      .catch((err) => {
        console.error(err);
        if (status) status.textContent = `No se pudo trazar la ruta: ${err.message || ''}`;
        alert(`No se pudo trazar la ruta: ${err.message || ''}`);
      });
    return;
  }
  const origin = state.locations.find((l) => l.id === originId);
  if (!origin) {
    alert('Origen invalido.');
    return;
  }
  state.navOriginId = originId;
  if (status) status.textContent = 'Calculando ruta...';
  fetchNavRoute({ lng: origin.lng, lat: origin.lat, name: origin.name }, state.navDestination)
    .then((routeData) => {
      applyNavRoute(routeData, { lng: origin.lng, lat: origin.lat, name: origin.name }, state.navDestination);
      if (status) status.textContent = `Ruta trazada desde ${origin.name}.`;
    })
    .catch((err) => {
      console.error(err);
      if (status) status.textContent = `No se pudo trazar la ruta: ${err.message || ''}`;
      alert(`No se pudo trazar la ruta: ${err.message || ''}`);
    });
}

function applyNavRoute(routeData, origin, destination) {
  state.navRouteData = { ...routeData, origin };
  drawNavRoute(mapState, state.navRouteData, origin, destination, state.trafficOn);
  updateNavSummary(state);
}

function clearNavRoute() {
  clearNavLayers(mapState);
  state.navDestination = null;
  state.navOriginId = '';
  state.navOriginManual = '';
  state.navRouteData = null;
  const status = document.getElementById('nav-status');
  if (status) status.textContent = 'Selecciona una direccion para trazar.';
  mapState.geocoder?.clear();
  const originSelect = document.getElementById('nav-origin');
  if (originSelect) originSelect.value = '';
  const originText = document.getElementById('nav-origin-text');
  if (originText) originText.value = '';
  updateNavSummary(state);
}

function setOriginFromCoords(origin, label) {
  const originSelect = document.getElementById('nav-origin');
  const originText = document.getElementById('nav-origin-text');
  if (originSelect) originSelect.value = '';
  if (originText && label) originText.value = label;
  state.navOriginId = '';
  state.navOriginManual = label || '';
  updateNavSummary(state);
}

function renderAll() {
  const filtered = getFiltered();
  updateMetrics(state, uiMetricConfig());
  renderMarkers(mapState, filtered, mapRenderConfig());
  renderLocationList(state, filtered, uiRenderConfig());
  renderStopSelect(state, uiSelectConfig());
  renderStopsPreview(state, { onRemove: removeStopAt });
  renderRouteSelector(state);
  renderRoutesList(state);
  renderFilters(state, { getTypeLabel: (t) => getTypeLabel(t, typeLabel), getTypeKey, onChange: handleFilterChange });
  updateNavOrigins(state);
  updateNavSummary(state);
  renderUsersAdmin();
}

function handleFilterChange(value) {
  state.filter = value;
  renderAll();
}

function getFiltered() {
  return filterLocations(state.locations, state.filter, state.searchTerm);
}

function uiRenderConfig() {
  return {
    typeColor,
    getTypeKey,
    getTypeLabel: (t) => getTypeLabel(t, typeLabel),
  };
}

function uiSelectConfig() {
  return {
    getTypeLabel: (t) => getTypeLabel(t, typeLabel),
    getTypeKey,
  };
}

function uiMetricConfig() {
  return {
    typeColor,
    getTypeLabel: (t) => getTypeLabel(t, typeLabel),
    getTypeKey,
  };
}

function mapRenderConfig() {
  return {
    typeColor,
    getTypeKey,
    getTypeLabel: (t) => getTypeLabel(t, typeLabel),
  };
}

async function loadUsersAdmin() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;
  try {
    state.users = await fetchUsers();
    renderUsersAdmin();
  } catch (err) {
    const statusEl = document.getElementById('users-status');
    if (statusEl) statusEl.textContent = err.message;
  }
}

function renderUsersAdmin() {
  const list = document.getElementById('users-list');
  const statusEl = document.getElementById('users-status');
  if (!list) return;
  if (!state.users.length) {
    list.innerHTML = '<p class="muted">Sin usuarios aun.</p>';
    return;
  }
  list.innerHTML = `
    <table class="table">
      <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead>
      <tbody>
        ${state.users
          .map(
            (u) => `
            <tr>
              <td>${u.name}</td>
              <td>${u.email}</td>
              <td><span class="badge">${u.role}</span></td>
              <td class="table-actions">
                <button class="ghost small" data-action="edit" data-id="${u.id}">Editar</button>
                <button class="ghost small" data-action="delete" data-id="${u.id}">Eliminar</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
  if (statusEl) statusEl.textContent = '';
}

function openUsersModal() {
  const backdrop = document.getElementById('users-modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = false;
  document.body.classList.add('no-scroll');
  loadUsersAdmin();
}

function closeUsersModal() {
  const backdrop = document.getElementById('users-modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = true;
  document.body.classList.remove('no-scroll');
  const form = document.getElementById('user-form-inline');
  if (form) {
    form.reset();
    form.dataset.editingId = '';
    const submitBtn = document.getElementById('user-submit');
    if (submitBtn) submitBtn.textContent = 'Crear usuario';
  }
  const statusEl = document.getElementById('users-status');
  if (statusEl) statusEl.textContent = '';
}

async function handleLogout() {
  try {
    await fetch('api/auth.php', { method: 'DELETE' });
  } catch (err) {
    // ignore
  } finally {
    window.location.href = 'login.html';
  }
}

function toggleDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  const isOpen = document.body.classList.toggle('drawer-open');
  if (overlay) overlay.hidden = !isOpen;
}

function closeDrawer() {
  const overlay = document.getElementById('drawer-overlay');
  document.body.classList.remove('drawer-open');
  if (overlay) overlay.hidden = true;
}
