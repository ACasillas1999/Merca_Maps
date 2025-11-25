export function hydrateUI() {
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

export function renderLocationList(state, locations, { typeColor, getTypeKey, getTypeLabel }) {
  const container = document.getElementById('locations-list');
  if (!container) return;
  if (state.loadingLocations) {
    container.innerHTML = '<p class="muted">Cargando ubicaciones...</p>';
    return;
  }
  if (!locations.length) {
    container.innerHTML = '<p class="muted">No hay ubicaciones guardadas todavia.</p>';
    return;
  }
  container.innerHTML = locations
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((loc) => {
      const color = typeColor[getTypeKey(loc.type)] || '#38bdf8';
      return `
        <div class="item item--compact">
          <div class="item__main">
            <div class="item__title">
              <span class="pin-icon" style="--color:${color}"></span>
              <div class="item__title-text">
                <strong>${loc.name}</strong>
                <div class="route-meta small-text">${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}</div>
              </div>
            </div>
            <div class="item__tags">
              <span class="badge ${getTypeKey(loc.type)}"><span class="dot"></span>${getTypeLabel(loc.type)}</span>
              ${loc.notes ? `<span class="muted small-text">${loc.notes}</span>` : ''}
            </div>
          </div>
          <div class="item__actions">
            <button type="button" class="ghost icon-only white-icon" data-action="nav-dest" data-id="${loc.id}" title="Ruta">➤</button>
            <button type="button" class="ghost icon-only white-icon" data-action="focus" data-id="${loc.id}" title="Ver">👁</button>
            ${state.currentUser?.role === 'admin' ? `<button type="button" class="ghost icon-only white-icon" data-action="remove" data-id="${loc.id}" title="Eliminar">✕</button>` : ''}
          </div>
        </div>`;
    })
    .join('');
}

export function renderRoutesList(state) {
  const container = document.getElementById('routes-list');
  const heroEmpty = document.getElementById('routes-empty-hero');
  if (!container) {
    updateNavOrigins(state);
    return;
  }
  if (!state.routes.length) {
    container.innerHTML = '<p class="muted">Crea una ruta para verla aqui.</p>';
    if (heroEmpty) heroEmpty.hidden = false;
    updateNavOrigins(state);
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

export function renderFilters(state, { getTypeLabel, getTypeKey, onChange }) {
  const container = document.getElementById('filters');
  if (!container) return;
  const counts = state.locations.reduce((acc, loc) => {
    const key = getTypeKey(loc.type);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const items = [{ key: 'todos', label: 'Todos', count: state.locations.length }].concat(
    Object.keys(counts).map((k) => ({
      key: k,
      label: getTypeLabel(k),
      count: counts[k],
    }))
  );
  container.innerHTML = items
    .map(
      (item) =>
        `<label><input type="radio" name="filter" value="${item.key}" ${item.key === state.filter ? 'checked' : ''}> ${item.label} (${item.count})</label>`
    )
    .join('');
  container.querySelectorAll('input[name="filter"]').forEach((el) => {
    el.addEventListener('change', (e) => onChange(e.target.value));
  });
}

export function renderRouteSelector(state) {
  const select = document.getElementById('route-selector');
  if (!select) return;
  select.innerHTML =
    `<option value="">Selecciona una ruta</option>` +
    state.routes
      .map((r) => `<option value="${r.id}" ${r.id === state.selectedRouteId ? 'selected' : ''}>${r.name} - ${r.user}</option>`)
      .join('');
}

export function renderStopSelect(state, { getTypeLabel, getTypeKey }) {
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

export function renderStopsPreview(state, { onRemove }) {
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
      onRemove(index);
    });
  });
}

export function openModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = false;
  document.body.classList.add('no-scroll');
  setTimeout(() => document.getElementById('loc-name')?.focus(), 50);
}

export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = true;
  document.body.classList.remove('no-scroll');
}

export function openRouteModal() {
  const backdrop = document.getElementById('route-modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = false;
  document.body.classList.add('no-scroll');
  setTimeout(() => document.getElementById('route-name')?.focus(), 50);
}

export function closeRouteModal() {
  const backdrop = document.getElementById('route-modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = true;
  document.body.classList.remove('no-scroll');
}

export function toggleNavCard() {
  const card = document.querySelector('.nav-search-card');
  const toggleBtn = document.getElementById('nav-toggle');
  if (!card) return;
  card.classList.toggle('is-collapsed');
  if (toggleBtn) {
    toggleBtn.textContent = card.classList.contains('is-collapsed') ? 'Expandir' : 'Minimizar';
  }
}

export function openNavCard() {
  const card = document.querySelector('.nav-search-card');
  const toggleBtn = document.getElementById('nav-toggle');
  if (!card) return;
  card.classList.remove('is-collapsed');
  if (toggleBtn) toggleBtn.textContent = 'Minimizar';
}

export function updateNavOrigins(state) {
  const originSelect = document.getElementById('nav-origin');
  if (!originSelect) return;
  const current = originSelect.value;
  originSelect.innerHTML =
    '<option value="">Elige una ubicacion guardada</option>' +
    state.locations.map((loc) => `<option value="${loc.id}">${loc.name}</option>`).join('');
  if (current) originSelect.value = current;
}

export function updateNavSummary(state) {
  const summary = document.getElementById('nav-summary');
  if (!summary) return;
  const originName =
    state.navOriginManual ||
    (state.navOriginId ? state.locations.find((l) => l.id === state.navOriginId)?.name || '' : '');
  const destName = state.navDestination?.name || '';
  summary.textContent = `Origen: ${originName || '--'} -> Destino: ${destName || '--'}`;
}

export function updateMetrics(state, { typeColor, getTypeLabel, getTypeKey }) {
  const totalEl = document.getElementById('metric-locations');
  if (totalEl) totalEl.textContent = state.locations.length;
  renderTypeMetrics(state, { typeColor, getTypeLabel, getTypeKey });
}

function renderTypeMetrics(state, { typeColor, getTypeLabel, getTypeKey }) {
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
