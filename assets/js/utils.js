export function getTypeKey(type) {
  const raw = String(type || '').trim().toLowerCase();
  if (raw.includes('competencia')) return 'competencia';
  const normalized = raw.replace(/\s+/g, '_');
  const map = {
    clientes_potenciales: 'clientes_potenciales',
    cliente_potencial: 'clientes_potenciales',
  };
  return map[normalized] || normalized;
}

export function getTypeLabel(type, typeLabelMap) {
  const key = getTypeKey(type);
  return typeLabelMap[key] || (type ? type : 'Sin tipo');
}

export function filterLocations(locations, filter, searchTerm) {
  const term = String(searchTerm || '').toLowerCase();
  return locations.filter((loc) => {
    if (filter !== 'todos' && getTypeKey(loc.type) !== filter) return false;
    if (!term) return true;
    return (
      String(loc.name || '').toLowerCase().includes(term) ||
      String(loc.notes || '').toLowerCase().includes(term)
    );
  });
}

export function uid(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
