export const MAPBOX_TOKEN = 'pk.eyJ1IjoiYWNhc2lsbGFzNzY2IiwiYSI6ImNsdW12cTZyMjB4NnMya213MDdseXp6ZGgifQ.t7-l1lQfd8mgHILM5YrdNw';

export const STORAGE_KEYS = { routes: 'mm_routes' };

export const typeColor = {
  sucursal: '#22d3ee',
  proveedor: '#f472b6',
  almacen: '#fbbf24',
  otro: '#a5b4fc',
  competencia: '#f97316',
  clientes_potenciales: '#c084fc',
};

export const typeLabel = {
  sucursal: 'Sucursal',
  proveedor: 'Proveedor',
  almacen: 'Almacen',
  otro: 'Otro',
  competencia: 'Competencia',
  clientes_potenciales: 'Clientes potenciales',
};

export const state = {
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
  currentUser: null,
  users: [],
};

export const mapState = {
  map: null,
  mapReady: false,
  geocoder: null,
  markers: [],
  routeMarkers: [],
  navMarkers: [],
  clickMarker: null,
  layerIds: {
    route: 'route-line',
    navRoute: 'nav-route-line',
    navTraffic: 'nav-traffic-line',
  },
};

export const mapDefaults = {
  center: [-102.5528, 23.6345],
  zoom: 5,
};
