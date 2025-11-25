(() => {
  mapboxgl.accessToken = 'pk.eyJ1IjoiYWNhc2lsbGFzNzY2IiwiYSI6ImNsdW12cTZyMjB4NnMya213MDdseXp6ZGgifQ.t7-l1lQfd8mgHILM5YrdNw';

  const STORAGE_KEYS = { routes: 'mm_routes' };

  const typeColor = {
    sucursal: '#22d3ee',
    proveedor: '#f472b6',
    almacen: '#fbbf24',
    otro: '#a5b4fc',
    competencia: '#f97316',
    'clientes_potenciales': '#c084fc',
  };
  
  const typeLabel = {
    sucursal: 'Sucursal',
    proveedor: 'Proveedor',
    almacen: 'Almacen',
    otro: 'Otro',
    competencia: 'Competencia',
    'clientes_potenciales': 'Clientes potenciales',
  };

  const state = {
    locations: [],
    routes: [],
    currentStops: [],
    selectedRouteId: '',
    filter: 'todos',
    searchTerm: '',
    loadingLocations: false,
    navDestination: null,
    navOriginId: '',
    navOriginManual: '',
    trafficOn: false,
    navRouteData: null,
  };

  let map;
  let routeLayerId = 'route-line';
  let navRouteLayerId = 'nav-route-line';
  let navTrafficLayerId = 'nav-traffic-line';
  let routeMarkers = [];
  let markers = [];
  let navMarkers = [];
  let clickMarker;
  let mapReady = false;
  let geocoder;

  document.addEventListener('DOMContentLoaded', () => {
    state.routes = loadRoutes();
    hydrateUI();
    initMap();
    bindEvents();
    fetchLocations();
    renderAll();
  });

  function loadRoutes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.routes);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn('No se pudo leer rutas almacenadas', err);
      return [];
    }
  }

  function persistRoutes() {
    localStorage.setItem(STORAGE_KEYS.routes, JSON.stringify(state.routes));
  }

  function initMap() {
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [-102.5528, 23.6345],
      zoom: 5,
    });
    map.addControl(new mapboxgl.NavigationControl());

    map.on('load', () => {
      mapReady = true;
      renderMarkers();
      setupGeocoder();
    });

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      document.getElementById('loc-lat').value = lat.toFixed(6);
      document.getElementById('loc-lng').value = lng.toFixed(6);
      highlightDraftLocation(lat, lng);
      state.navDestination = { lng, lat, name: `Punto seleccionado (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
      const status = document.getElementById('nav-status');
      if (status) status.textContent = 'Destino seleccionado desde el mapa.';
      updateNavSummary();
    });
  }

  function highlightDraftLocation(lat, lng) {
    if (clickMarker) clickMarker.remove();
    const el = document.createElement('span');
    el.className = 'marker';
    el.style.setProperty('--color', '#38bdf8');
    clickMarker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
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
      updateNavSummary();
    });
    navOriginText?.addEventListener('input', (e) => {
      if (e.target.value) {
        if (navOriginSelect) navOriginSelect.value = '';
      }
      state.navOriginManual = e.target.value.trim();
      state.navOriginId = '';
      updateNavSummary();
    });
    navToggle?.addEventListener('click', toggleNavCard);
    trafficToggle?.addEventListener('change', (e) => {
      state.trafficOn = e.target.checked;
      if (state.navRouteData && state.navDestination) {
        drawNavRoute(state.navRouteData, state.navRouteData.origin || null, state.navDestination);
      }
    });
    searchInput?.addEventListener('input', (e) => {
      state.searchTerm = e.target.value.toLowerCase();
      renderLocationList();
      renderMarkers();
    });

    locationForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
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
        locationForm.querySelector('button[type="submit"]').disabled = true;
        await createLocation({ name, type, lat, lng, notes });
        locationForm.reset();
        state.currentStops = [];
        renderStopsPreview();
        closeModal();
        map.flyTo({ center: [lng, lat], zoom: 12 });
      } catch (err) {
        console.error(err);
        alert('No se pudo guardar la ubicacion.');
      } finally {
        locationForm.querySelector('button[type="submit"]').disabled = false;
      }
    });

    routeForm?.addEventListener('submit', (e) => {
      e.preventDefault();
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
      persistRoutes();
      routeForm.reset();
      renderAll();
      drawRoute(route);
      closeRouteModal();
    });

    addStopBtn?.addEventListener('click', () => {
      const select = document.getElementById('route-stop');
      const stopId = select?.value;
      if (!stopId) return;
      state.currentStops.push(stopId);
      renderStopsPreview();
    });

    routeSelector?.addEventListener('change', (e) => {
      state.selectedRouteId = e.target.value;
    });
    showRouteBtn?.addEventListener('click', () => {
      const route = state.routes.find((r) => r.id === state.selectedRouteId);
      if (route) drawRoute(route);
    });
    clearRouteBtn?.addEventListener('click', () => {
      state.selectedRouteId = '';
      if (routeSelector) routeSelector.value = '';
      clearRouteLayer();
    });

    document.querySelectorAll('input[name="filter"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        state.filter = e.target.value;
        renderLocationList();
        renderMarkers();
      });
    });

    locationsList?.addEventListener('click', async (e) => {
      if (e.target.matches('[data-action="remove"]')) {
        const id = e.target.dataset.id;
        if (confirm('Eliminar esta ubicacion?')) {
          await deleteLocation(id);
        }
      }
      if (e.target.matches('[data-action="focus"]')) {
        const id = e.target.dataset.id;
        const loc = state.locations.find((l) => l.id === id);
        if (loc) {
          map.flyTo({ center: [loc.lng, loc.lat], zoom: 13 });
          new mapboxgl.Popup({ offset: 16 })
            .setLngLat([loc.lng, loc.lat])
            .setHTML(`<strong>${loc.name}</strong><br>${typeLabel[loc.type]}<br>${loc.notes || ''}`)
            .addTo(map);
        }
      }
      if (e.target.matches('[data-action="nav-dest"]')) {
        const id = e.target.dataset.id;
        const loc = state.locations.find((l) => l.id === id);
        if (loc) {
          state.navDestination = { lng: loc.lng, lat: loc.lat, name: loc.name };
          const status = document.getElementById('nav-status');
          if (status) status.textContent = `Destino: ${loc.name}. Elige origen o usa "Desde mi ubicacion".`;
          drawNavPoint(loc.lng, loc.lat, 'destino');
          updateNavSummary();
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
        if (route) drawRoute(route);
      }
      if (e.target.matches('[data-action="delete-route"]')) {
        const id = e.target.dataset.id;
        if (confirm('Eliminar esta ruta?')) {
          state.routes = state.routes.filter((r) => r.id !== id);
          if (state.selectedRouteId === id) {
            state.selectedRouteId = '';
            clearRouteLayer();
          }
          persistRoutes();
          renderAll();
        }
      }
    });
  }

  async function fetchLocations() {
    state.loadingLocations = true;
    renderLocationList();
    try {
      const res = await fetch('api/locations.php');
      const raw = await res.text();
      const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
      state.locations = (data.locations || []).map((loc) => ({
        ...loc,
        id: String(loc.id),
        lat: Number(loc.lat),
        lng: Number(loc.lng),
      }));
      state.loadingLocations = false;
      renderAll();
    } catch (err) {
      console.error(err);
      const container = document.getElementById('locations-list');
      if (container) container.innerHTML = '<p class="muted">Error al cargar ubicaciones.</p>';
    } finally {
      state.loadingLocations = false;
      renderLocationList();
    }
  }

  async function createLocation(payload) {
    const res = await fetch('api/locations.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
    await fetchLocations();
    return data.location;
  }

  async function deleteLocation(id) {
    const res = await fetch(`api/locations.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const raw = await res.text();
    const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
    state.routes = state.routes.map((r) => ({ ...r, stops: r.stops.filter((stopId) => stopId !== id) }));
    persistRoutes();
    await fetchLocations();
  }

  function renderAll() {
    updateMetrics();
    renderMarkers();
    renderLocationList();
    renderStopSelect();
    renderStopsPreview();
    renderRouteSelector();
    renderRoutesList();
    renderFilters();
    updateNavOrigins();
    updateNavSummary();
  }

  function getTypeKey(type) {
    const raw = String(type || '').trim().toLowerCase();
    if (raw.includes('competencia')) return 'competencia';
    const normalized = raw.replace(/\s+/g, '_');
    const map = {
      clientes_potenciales: 'clientes_potenciales',
      cliente_potencial: 'clientes_potenciales',
    };
    return map[normalized] || normalized;
  }
  
  function getTypeLabel(type) {
    const key = getTypeKey(type);
    return typeLabel[key] || (type ? type : 'Sin tipo');
  }
  
  function renderMarkers() {
    if (!mapReady) return;
    markers.forEach((m) => m.remove());
    markers = [];
    const locations = getFilteredLocations();
    locations.forEach((loc) => {
      const key = getTypeKey(loc.type);
      const el = document.createElement('span');
      el.className = 'marker';
      el.dataset.type = key;
      el.style.setProperty('--color', typeColor[key] || '#38bdf8');
      const marker = new mapboxgl.Marker(el)
        .setLngLat([loc.lng, loc.lat])
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${loc.name}</strong><br>${getTypeLabel(loc.type)}<br>${loc.notes || ''}`))
        .addTo(map);
      markers.push(marker);
    });
  }

  function renderLocationList() {
    const container = document.getElementById('locations-list');
    if (!container) return;
    if (state.loadingLocations) {
      container.innerHTML = '<p class="muted">Cargando ubicaciones...</p>';
      return;
    }
    const locations = getFilteredLocations();
    if (!locations.length) {
      container.innerHTML = '<p class="muted">No hay ubicaciones guardadas todavia.</p>';
      return;
    }
    container.innerHTML = locations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(
        (loc) => `
        <div class="item">
          <div>
            <div class="title-row">
              <span class="pin-icon" style="--color:${typeColor[getTypeKey(loc.type)] || '#38bdf8'}"></span>
              <strong>${loc.name}</strong>
            </div>
            <div class="route-meta">
              <span class="badge ${getTypeKey(loc.type)}"><span class="dot"></span>${getTypeLabel(loc.type)}</span>
              - ${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}
            </div>
            ${loc.notes ? `<p class="muted">${loc.notes}</p>` : ''}
          </div>
          <div class="chips">
            <button type="button" class="ghost" data-action="nav-dest" data-id="${loc.id}">Ruta</button>
            <button type="button" class="ghost" data-action="focus" data-id="${loc.id}">Ver</button>
            <button type="button" class="ghost" data-action="remove" data-id="${loc.id}">Eliminar</button>
          </div>
        </div>`
      )
      .join('');
  }

  function renderRoutesList() {
    const container = document.getElementById('routes-list');
    const heroEmpty = document.getElementById('routes-empty-hero');
    if (!container) {
      updateNavOrigins();
      return;
    }
    if (!state.routes.length) {
      container.innerHTML = '<p class="muted">Crea una ruta para verla aqui.</p>';
      if (heroEmpty) heroEmpty.hidden = false;
      updateNavOrigins();
      return;
    }
    if (heroEmpty) heroEmpty.hidden = true;
    container.innerHTML = state.routes
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((route) => {
        const stopsNames = route.stops
          .map((id) => state.locations.find((l) => l.id === id))
          .filter(Boolean)
          .map((l) => l.name)
          .join(' -> ');
        return `
        <div class="item">
          <div>
            <strong>${route.name}</strong>
            <div class="route-meta">Asignado a ${route.user} - ${route.stops.length} paradas</div>
            <div class="muted">${stopsNames || 'Sin paradas validas'}</div>
          </div>
          <div class="chips">
            <button class="ghost" data-action="view-route" data-id="${route.id}">Ver</button>
            <button class="ghost" data-action="delete-route" data-id="${route.id}">Eliminar</button>
          </div>
        </div>`;
      })
      .join('');
  }

  function renderFilters() {
    const container = document.getElementById('filters');
    if (!container) return;
    const counts = state.locations.reduce((acc, loc) => {
      const key = getTypeKey(loc.type);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const types = Object.keys(counts);
    const items = [{ key: 'todos', label: 'Todos', count: state.locations.length }, ...types.map((k) => ({
      key: k,
      label: getTypeLabel(k),
      count: counts[k],
    }))];
    container.innerHTML = items
      .map(
        (item) => `<label><input type="radio" name="filter" value="${item.key}" ${item.key === state.filter ? 'checked' : ''}> ${item.label} (${item.count})</label>`
      )
      .join('');
    container.querySelectorAll('input[name="filter"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        state.filter = e.target.value;
        renderLocationList();
        renderMarkers();
      });
    });
  }

  function renderRouteSelector() {
    const select = document.getElementById('route-selector');
    if (!select) return;
    select.innerHTML = `<option value="">Selecciona una ruta</option>` +
      state.routes
        .map((r) => `<option value="${r.id}" ${r.id === state.selectedRouteId ? 'selected' : ''}>${r.name} - ${r.user}</option>`)
        .join('');
  }

  function renderStopSelect() {
    const select = document.getElementById('route-stop');
    if (!select) return;
    if (!state.locations.length) {
      select.innerHTML = `<option value="">Primero agrega ubicaciones</option>`;
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = state.locations
      .map((loc) => `<option value="${loc.id}">${loc.name} (${getTypeLabel(loc.type)})</option>`)
      .join('');
  }

  function openModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => document.getElementById('loc-name')?.focus(), 50);
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function openRouteModal() {
    const backdrop = document.getElementById('route-modal-backdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => document.getElementById('route-name')?.focus(), 50);
  }

  function closeRouteModal() {
    const backdrop = document.getElementById('route-modal-backdrop');
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function renderStopsPreview() {
    const container = document.getElementById('stops-preview');
    if (!container) return;
    if (!state.currentStops.length) {
      container.innerHTML = '<span class="muted">Sin paradas aun</span>';
      return;
    }
    container.innerHTML = state.currentStops
      .map((id, idx) => {
        const loc = state.locations.find((l) => l.id === id);
        if (!loc) return '';
        return `<span class="chip">${idx + 1}. ${loc.name}<button type="button" data-remove-stop="${idx}">x</button></span>`;
      })
      .join('');

    container.querySelectorAll('[data-remove-stop]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const index = Number(e.target.dataset.removeStop);
        state.currentStops.splice(index, 1);
        renderStopsPreview();
      });
    });
  }

  function clearRouteLayer() {
    if (!mapReady) return;
    if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
    if (map.getSource(routeLayerId)) map.removeSource(routeLayerId);
    routeMarkers.forEach((m) => m.remove());
    routeMarkers = [];
  }

  function clearNavRoute() {
    if (!mapReady) return;
    if (map.getLayer(navRouteLayerId)) map.removeLayer(navRouteLayerId);
    if (map.getSource(navRouteLayerId)) map.removeSource(navRouteLayerId);
    if (map.getLayer(navTrafficLayerId)) map.removeLayer(navTrafficLayerId);
    if (map.getSource(navTrafficLayerId)) map.removeSource(navTrafficLayerId);
    navMarkers.forEach((m) => m.remove());
    navMarkers = [];
    state.navDestination = null;
    state.navOriginId = '';
    state.navOriginManual = '';
    state.navRouteData = null;
    const status = document.getElementById('nav-status');
    if (status) status.textContent = 'Selecciona una dirección para trazar.';
    geocoder?.clear();
    const originSelect = document.getElementById('nav-origin');
    if (originSelect) originSelect.value = '';
    const originText = document.getElementById('nav-origin-text');
    if (originText) originText.value = '';
    updateNavSummary();
  }

  function drawRoute(route) {
    if (!mapReady) return;
    clearRouteLayer();
    if (!route) return;
    const latlngs = [];
    route.stops.forEach((id, idx) => {
      const loc = state.locations.find((l) => l.id === id);
      if (!loc) return;
      latlngs.push([loc.lng, loc.lat]);
      const pinEl = document.createElement('span');
      pinEl.className = 'route-pin';
      pinEl.textContent = idx + 1;
      const marker = new mapboxgl.Marker(pinEl).setLngLat([loc.lng, loc.lat]).addTo(map);
      routeMarkers.push(marker);
    });
    if (latlngs.length) {
      map.addSource(routeLayerId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: latlngs } },
      });
      map.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeLayerId,
        paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-opacity': 0.8 },
      });
      const bounds = latlngs.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(latlngs[0], latlngs[0]));
      map.fitBounds(bounds, { padding: 40 });
    }
  }

  function drawNavPoint(lng, lat, label) {
    navMarkers.forEach((m) => m.remove());
    navMarkers = [];
    const el = document.createElement('span');
    el.className = 'marker';
    el.style.setProperty('--color', '#38bdf8');
    const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
    marker.getElement().setAttribute('title', label);
    navMarkers.push(marker);
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
          drawNavRoute(routeData, origin, state.navDestination);
          if (status) status.textContent = 'Ruta trazada desde tu ubicacion.';
          updateNavSummary();
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
          drawNavRoute(routeData, place, state.navDestination);
          if (status) status.textContent = `Ruta trazada desde ${place.name}.`;
          updateNavSummary();
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
        drawNavRoute(routeData, { lng: origin.lng, lat: origin.lat, name: origin.name }, state.navDestination);
        if (status) status.textContent = `Ruta trazada desde ${origin.name}.`;
        updateNavSummary();
      })
      .catch((err) => {
        console.error(err);
        if (status) status.textContent = `No se pudo trazar la ruta: ${err.message || ''}`;
        alert(`No se pudo trazar la ruta: ${err.message || ''}`);
      });
  }

  async function fetchNavRoute(origin, destination) {
    const oLng = Number(origin.lng);
    const oLat = Number(origin.lat);
    const dLng = Number(destination?.lng);
    const dLat = Number(destination?.lat);
    if (!Number.isFinite(oLng) || !Number.isFinite(oLat) || !Number.isFinite(dLng) || !Number.isFinite(dLat)) {
      throw new Error('Coordenadas invalidas');
    }
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${oLng},${oLat};${dLng},${dLat}?geometries=geojson&overview=full&language=es&annotations=congestion&access_token=${mapboxgl.accessToken}`;
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

  async function geocodePlace(query) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&language=es&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature?.center) throw new Error('No geocode');
    return { lng: feature.center[0], lat: feature.center[1], name: feature.place_name };
  }

  async function reverseGeocode(origin) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${origin.lng},${origin.lat}.json?limit=1&language=es&access_token=${mapboxgl.accessToken}`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    return feature?.place_name || '';
  }

  function drawNavRoute(routeData, origin, destination) {
    if (!mapReady || !routeData?.coordinates?.length) return;
    state.navRouteData = { ...routeData, origin };
    if (map.getLayer(navRouteLayerId)) map.removeLayer(navRouteLayerId);
    if (map.getSource(navRouteLayerId)) map.removeSource(navRouteLayerId);
    if (map.getLayer(navTrafficLayerId)) map.removeLayer(navTrafficLayerId);
    if (map.getSource(navTrafficLayerId)) map.removeSource(navTrafficLayerId);
    map.addSource(navRouteLayerId, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeData.coordinates } },
    });
    map.addLayer({
      id: navRouteLayerId,
      type: 'line',
      source: navRouteLayerId,
      paint: {
        'line-color': '#0ea5e9',
        'line-width': 4,
        'line-opacity': state.trafficOn ? 0.2 : 0.9,
      },
    });
    if (state.trafficOn && routeData.congestion?.length) {
      addTrafficSegments(routeData);
    }
    navMarkers.forEach((m) => m.remove());
    navMarkers = [];
    const originEl = document.createElement('span');
    originEl.className = 'marker';
    originEl.style.setProperty('--color', '#22d3ee');
    navMarkers.push(new mapboxgl.Marker(originEl).setLngLat([origin.lng, origin.lat]).addTo(map));
    const destEl = document.createElement('span');
    destEl.className = 'marker';
    destEl.style.setProperty('--color', '#f472b6');
    navMarkers.push(new mapboxgl.Marker(destEl).setLngLat([destination.lng, destination.lat]).addTo(map));
    const bounds = routeData.coordinates.reduce(
      (b, coord) => b.extend(coord),
      new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
    );
    map.fitBounds(bounds, { padding: 60 });
    updateNavSummary();
  }

  function addTrafficSegments(routeData) {
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
    map.addSource(navTrafficLayerId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });
    map.addLayer({
      id: navTrafficLayerId,
      type: 'line',
      source: navTrafficLayerId,
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

  function hydrateUI() {
    const stopSelect = document.getElementById('route-stop');
    const routeSelector = document.getElementById('route-selector');
    const latInput = document.getElementById('loc-lat');
    const lngInput = document.getElementById('loc-lng');
    if (stopSelect) stopSelect.innerHTML = '<option value="">Primero agrega ubicaciones</option>';
    if (routeSelector) routeSelector.innerHTML = '<option value="">Selecciona una ruta</option>';
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
    closeModal();
    closeRouteModal();
  }

  function setupGeocoder() {
    const geocoderContainer = document.getElementById('geocoder');
    if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
    geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl,
      marker: false,
      placeholder: 'Buscar direccion',
      language: 'es',
      countries: 'mx',
      limit: 5,
    });
    geocoder.addTo(geocoderContainer);
    geocoder.on('result', (e) => {
      if (!e.result?.center) return;
      const [lng, lat] = e.result.center;
      state.navDestination = { lng, lat, name: e.result.place_name };
      const status = document.getElementById('nav-status');
      if (status) status.textContent = 'Destino seleccionado. Elige origen o usa "Desde mi ubicacion".';
      const originSelect = document.getElementById('nav-origin');
      if (originSelect && !originSelect.value && state.locations.length) {
        originSelect.selectedIndex = 1;
      }
      drawNavPoint(lng, lat, 'destino');
      updateNavSummary();
    });
  }

  function updateNavOrigins() {
    const originSelect = document.getElementById('nav-origin');
    if (!originSelect) return;
    const current = originSelect.value;
    originSelect.innerHTML = '<option value="">Elige una ubicacion guardada</option>' +
      state.locations.map((loc) => `<option value="${loc.id}">${loc.name}</option>`).join('');
    if (current) originSelect.value = current;
  }

  function toggleNavCard() {
    const card = document.querySelector('.nav-search-card');
    const toggleBtn = document.getElementById('nav-toggle');
    if (!card) return;
    card.classList.toggle('is-collapsed');
    if (toggleBtn) {
      toggleBtn.textContent = card.classList.contains('is-collapsed') ? 'Expandir' : 'Minimizar';
    }
  }

  function updateNavSummary() {
    const summary = document.getElementById('nav-summary');
    if (!summary) return;
    const originName =
      state.navOriginManual ||
      (state.navOriginId ? (state.locations.find((l) => l.id === state.navOriginId)?.name || '') : '');
    const destName = state.navDestination?.name || '';
    summary.textContent = `Origen: ${originName || '--'} · Destino: ${destName || '--'}`;
  }

  function setOriginFromCoords(origin, label) {
    const originSelect = document.getElementById('nav-origin');
    const originText = document.getElementById('nav-origin-text');
    if (originSelect) originSelect.value = '';
    if (originText && label) originText.value = label;
    state.navOriginId = '';
    state.navOriginManual = label || '';
    updateNavSummary();
  }

  function updateMetrics() {
    document.getElementById('metric-locations').textContent = state.locations.length;
    renderTypeMetrics();
  }

  function renderTypeMetrics() {
    const container = document.getElementById('metric-types');
    if (!container) return;
    const counts = state.locations.reduce((acc, loc) => {
      const key = getTypeKey(loc.type);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const items = Object.keys(counts).map((key) => ({
      key,
      label: getTypeLabel(key),
      count: counts[key],
      color: typeColor[key] || '#38bdf8',
    }));
    container.innerHTML = items
      .map(
        (item) => `
        <div class="metric">
          <p class="label">${item.label}</p>
          <p class="value" style="color:${item.color}">${item.count}</p>
        </div>`
      )
      .join('');
  }

  function getFilteredLocations() {
    const term = state.searchTerm.toLowerCase();
    return state.locations
      .filter((loc) => {
        if (state.filter !== 'todos' && getTypeKey(loc.type) !== state.filter) return false;
        if (!term) return true;
        return (
          String(loc.name || '').toLowerCase().includes(term) ||
          String(loc.notes || '').toLowerCase().includes(term)
        );
      });
  }

  function uid(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
})();
