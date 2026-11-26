// Stato globale condiviso e costanti
// Variabili globali
let photosData = [];
let lkhOrder = [];        // Ordine LKH ottimale (da lkh_tour.json), se disponibile
let currentView = 'map';  // Default: mappa
let currentMapType = 'osm';
let map = null;
let mapLightbox = null;
let markers = [];
let markerClusterGroup = null;
let tourPolyline = null;
let lkhTourMeta = null;
let tourPlaying = false;
let tourPlayTimer = null;
let currentLightboxIndex = -1;
let previousView = 'map'; // View to return to when closing photo view
let activeZoneFilter = null; // Filtro globale mappa+galleria; null = tutte le zone
let activeSearchQuery = ''; // stringa search input
let searchDebounceTimer = null;
let releaseSearchFocus = null; // per eventuale restore focus (se usiamo modali)
const WELCOME_STORAGE_KEY = 'vitali-gallery-welcome-seen';
const MAP_HERO_STORAGE_KEY = 'vitali-gallery-hero-dismissed';
const INITIAL_URL_HASH = window.location.hash;
const INITIAL_FOTO_PARAM = new URLSearchParams(window.location.search).get('foto');
const TOUR_PLAY_MS = 3500;
const PHOTO_TRANSITION_MS = 520;
const PANORAMAX_API = 'https://api.panoramax.xyz/api';
const PANORAMAX_SEARCH = `${PANORAMAX_API}/search`;
const PANORAMAX_VIEWER = 'https://api.panoramax.xyz/en/index';
const PANORAMAX_SEARCH_RADIUS_DEG = 0.001; // ~80–110 m intorno al punto
const PANORAMAX_MAX_DIST_M = 120;
const panoramaxCache = new Map();
let currentPanoramaxMatch = null;
let panoramaxPannellumViewer = null;
let lightboxImageTransitionTimer = null;
let lightboxDisplayedPhoto = null;
const transitionEdges = new Map();
const correlatedById = new Map();
let morphViewer = null;
let morphViewerLoading = null;
let zoneNames = {};
let releaseWelcomeFocus = null;
let releaseHelpFocus = null;
let releasePanoramaxFocus = null;
const ZONE_COLORS = [
'#e94560', '#4ecdc4', '#ffe66d', '#a855f7', '#fb923c',
'#22d3ee', '#86efac', '#f472b6', '#facc15', '#60a5fa',
'#34d399', '#c084fc'
];
// Bootstrap Italia sprite path
const BI_SPRITE = 'sprites.svg';
// ID stabile (hash) — usato solo per permalink, mai mostrato in UI
let siteMeta = null;
// Pannellum caricato on-demand: serve solo allo zoom Panoramax.
let pannellumLoadingPromise = null;
// Tile layers
const tileLayers = {
osm: {
url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
attribution: '&copy; OpenStreetMap contributors'
}
};
// Permalink helper: open lightbox from a file hash string (e.g. #5d1c7f1ef4a17046)
const PHOTO_HASH_RE = /^#[0-9a-f]{10,}$/i;
// Regex for map permalink hash: #lat,lon,zoomz  e.g. #45.123456,9.654321,14z
const MAP_HASH_RE = /^#(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+)z$/;
