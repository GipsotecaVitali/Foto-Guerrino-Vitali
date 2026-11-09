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
function photoId(photo) {
return photo.id || photo.display.split('/').pop().split('.')[0];
}
function escapeHtml(str) {
return String(str)
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;');
}
function zoneLabel(zoneId) {
if (!zoneId) return '';
const key = String(zoneId);
return zoneNames[key] || zoneNames[zoneId] || `Zona ${zoneId}`;
}
// Etichetta visibile — opaca: Foto N + luogo/zona/didascalia, mai filename
function photoLabel(photo, seqIndex = 0) {
const n = seqIndex > 0 ? seqIndex : null;
const base = n ? `Foto ${n}` : 'Foto';
if (!photo) return base;
if (photo.caption) return photo.caption;
const place = photo.place_name || (photo.cluster_id ? zoneLabel(photo.cluster_id) : null);
return place ? `${base}, ${place}` : base;
}
function photoMetaDescription(photo, seqIndex) {
const label = photoLabel(photo, seqIndex);
if (photo.caption || photo.place_name || photo.cluster_id) {
return `${label} — ${siteMeta?.siteTitle || document.title}`;
}
return `${label} geolocalizzata (${photo.lat.toFixed(4)}, ${photo.lon.toFixed(4)}) — ${siteMeta?.siteTitle || document.title}`;
}
function prefersReducedMotion() {
return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function morphKey(fromId, toId) {
return `${fromId}|${toId}`;
}
function prefetchTourNeighbors(photo) {
const order = tourNavOrder();
const i = order.indexOf(photo);
if (i < 0) return;
for (const delta of [-1, 1]) {
const p = order[(i + delta + order.length) % order.length];
if (!p?.display) continue;
const im = new Image();
im.decoding = 'async';
im.src = p.display;
}
}
const TIER_RANK = { morph: 1, anchor: 0 };
async function loadTransitionGraph() {
try {
// no-cache = rivalida sempre (304 se invariato): i dati cambiano a ogni rigenerazione
const res = await fetch('dati/transition_graph.json', { cache: 'no-cache' });
if (!res.ok) return;
const data = await res.json();
if (Number(data.schema_version) !== 2) return;
transitionEdges.clear();
correlatedById.clear();
for (const edge of data.edges || []) {
if (!edge?.from || !edge?.to || !TIER_RANK.hasOwnProperty(edge.tier)) continue;
transitionEdges.set(morphKey(edge.from, edge.to), edge);
}
for (const edge of transitionEdges.values()) {
if (!correlatedById.has(edge.from)) correlatedById.set(edge.from, []);
correlatedById.get(edge.from).push(edge);
}
for (const edges of correlatedById.values()) {
edges.sort((a, b) =>
TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
Number(b.score || 0) - Number(a.score || 0)
);
}
const current = photosData[currentLightboxIndex];
if (current) renderCorrelatedFilmstrip(current);
} catch (_) {
}
}
function transitionEdgeFor(fromId, toId) {
return transitionEdges.get(morphKey(fromId, toId)) || null;
}
function setMorphViewerVisible(on) {
const container = document.querySelector('.lightbox-image-container');
const img = document.getElementById('lightbox-image');
const next = document.getElementById('lightbox-image-next');
const canvas = container?.querySelector('.morph-viewer-canvas');
if (canvas) canvas.classList.toggle('is-active', !!on);
if (img) {
img.classList.toggle('morph-hidden', !!on);
if (on) {
img.style.opacity = '0';
img.style.visibility = 'hidden';
} else {
img.style.visibility = '';
}
}
if (next && on) next.remove();
if (container) container.classList.toggle('morph-mode', !!on);
if (on && morphViewer) morphViewer.resize();
}
async function showWithMorphViewer(photo, { from = null, animate = false } = {}) {
const imgElement = document.getElementById('lightbox-image');
const loader = document.getElementById('lightbox-loader');
if (!imgElement) return false;
const viewer = await ensureMorphViewer();
if (!viewer || currentLightboxIndex !== photosData.indexOf(photo)) return false;
const toId = photoId(photo);
if (typeof window.resetZoom === 'function') window.resetZoom();
removeLightboxImageNext();
setMorphViewerVisible(true);
loader.style.display = 'none';
if (animate && from && photoId(from) !== toId) {
const fromId = photoId(from);
if (viewer.currentId !== fromId) await viewer.goToId(fromId, false);
if (currentLightboxIndex !== photosData.indexOf(photo)) return false;
await viewer.goToId(toId, true);
} else {
await viewer.goToId(toId, false);
}
if (currentLightboxIndex !== photosData.indexOf(photo)) return false;
lightboxDisplayedPhoto = photo;
prefetchTourNeighbors(photo);
const order = tourNavOrder();
const i = order.indexOf(photo);
const near = [];
if (i >= 0) {
if (order[i - 1]) near.push(photoId(order[i - 1]));
if (order[i + 1]) near.push(photoId(order[i + 1]));
}
viewer.prefetchIds(near);
return true;
}
async function ensureMorphViewer() {
if (morphViewer) return morphViewer;
if (morphViewerLoading) return morphViewerLoading;
morphViewerLoading = (async () => {
const mod = await import('./vendor/morph-viewer/morph-viewer.js?v=c8da99ac');
const container = document.querySelector('.lightbox-image-container');
if (!container) return null;
morphViewer = new mod.Viewer(container, {
transitionLookup: transitionEdgeFor,
reducedMotion: prefersReducedMotion(),
crossfadeMs: PHOTO_TRANSITION_MS
});
const photos = photosData.map((p) => ({
id: photoId(p),
url: p.display,
width: p.width || 1000,
height: p.height || 1000
}));
const startPhoto = photosData[currentLightboxIndex];
await morphViewer.load(photos, startPhoto ? { startId: photoId(startPhoto) } : {});
window.__morphViewer = morphViewer; // debug
return morphViewer;
})();
try {
return await morphViewerLoading;
} finally {
morphViewerLoading = null;
}
}
function disposeMorphViewer() {
if (morphViewer) {
morphViewer.dispose();
morphViewer = null;
}
setMorphViewerVisible(false);
}
function applyImageAspectRatio(img, photo) {
if (!img || !photo) return;
img.removeAttribute('width');
img.removeAttribute('height');
// Sempre rispettare l'AR: niente fill/stretch del box lightbox
if (photo.width && photo.height) {
img.style.aspectRatio = `${photo.width} / ${photo.height}`;
} else {
img.style.aspectRatio = '';
}
img.style.width = '';
img.style.height = '';
img.style.maxWidth = '100%';
img.style.maxHeight = '100%';
img.style.objectFit = 'contain';
}
function trapFocus(container) {
const focusable = container.querySelectorAll(
'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
);
if (!focusable.length) return () => {};
const first = focusable[0];
const last = focusable[focusable.length - 1];
const restore = document.activeElement;
first.focus();
function onKeyDown(e) {
if (e.key !== 'Tab') return;
if (e.shiftKey && document.activeElement === first) {
e.preventDefault();
last.focus();
} else if (!e.shiftKey && document.activeElement === last) {
e.preventDefault();
first.focus();
}
}
container.addEventListener('keydown', onKeyDown);
return () => {
container.removeEventListener('keydown', onKeyDown);
restore?.focus?.call(restore);
};
}
let siteMeta = null;
function readSiteMeta() {
const ds = document.body.dataset;
return {
siteUrl: (ds.siteUrl || '').replace(/\/$/, ''),
siteTitle: ds.siteTitle || document.title,
metaDescription: ds.metaDescription || '',
ogImage: ds.ogImage || '',
};
}
function queryMeta(attr, key) {
return document.querySelector(`meta[${attr}="${key}"]`);
}
function setMetaProperty(prop, value) {
let el = queryMeta('property', prop);
if (!el) {
el = document.createElement('meta');
el.setAttribute('property', prop);
document.head.appendChild(el);
}
el.setAttribute('content', value);
}
function setMetaName(name, value) {
let el = queryMeta('name', name);
if (!el) {
el = document.createElement('meta');
el.setAttribute('name', name);
document.head.appendChild(el);
}
el.setAttribute('content', value);
}
function setCanonical(url) {
let el = document.querySelector('link[rel="canonical"]');
if (!el) {
el = document.createElement('link');
el.rel = 'canonical';
document.head.appendChild(el);
}
el.href = url;
}
function absoluteAsset(path) {
if (!path) return '';
if (/^https?:\/\//i.test(path)) return path;
const base = siteMeta?.siteUrl
|| `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}`;
return `${base}/${path.replace(/^\//, '')}`;
}
function updatePageMeta(photo, seqIndex = 1) {
if (!siteMeta) siteMeta = readSiteMeta();
if (photo) {
const label = photoLabel(photo, seqIndex);
const title = `${label} — ${siteMeta.siteTitle}`;
const desc = photoMetaDescription(photo, seqIndex);
const pageUrl = siteMeta.siteUrl
? `${siteMeta.siteUrl}/?foto=${photoId(photo)}`
: `${window.location.origin}${window.location.pathname}?foto=${photoId(photo)}`;
const image = absoluteAsset(photo.display || photo.thumb);
document.title = title;
setMetaName('description', desc);
setMetaProperty('og:title', title);
setMetaProperty('og:description', desc);
setMetaProperty('og:url', pageUrl);
setMetaProperty('og:image', image);
setMetaName('twitter:title', title);
setMetaName('twitter:description', desc);
setMetaName('twitter:image', image);
setCanonical(pageUrl);
return;
}
document.title = siteMeta.siteTitle;
setMetaName('description', siteMeta.metaDescription);
setMetaProperty('og:title', siteMeta.siteTitle);
setMetaProperty('og:description', siteMeta.metaDescription);
const homeUrl = siteMeta.siteUrl || `${window.location.origin}${window.location.pathname}`;
setMetaProperty('og:url', homeUrl);
setMetaProperty('og:image', siteMeta.ogImage);
setMetaName('twitter:title', siteMeta.siteTitle);
setMetaName('twitter:description', siteMeta.metaDescription);
setMetaName('twitter:image', siteMeta.ogImage);
setCanonical(homeUrl);
}
// Helper per icone SVG Bootstrap Italia
function biIcon(name, extraClass = '') {
const cls = extraClass ? `icon ${extraClass}` : 'icon icon-xs';
return `<svg class="${cls}"><use href="${BI_SPRITE}#${name}"></use></svg>`;
}
function photosWithGps() {
return photosData.filter(p => p.has_gps && p.lat && p.lon);
}
function normalizeSearchQuery(q) {
return String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function getSearchState() {
const q = normalizeSearchQuery(activeSearchQuery);
if (!q) return { type: 'empty' };
// Numeric search: "12" or "foto 12" -> index in the current tour order (when available)
const mFoto = q.match(/^(?:foto\s*)?(\d+)\s*$/i);
if (mFoto) return { type: 'numeric', index: parseInt(mFoto[1], 10) };
// Zone restriction-only: "zona 2" or "z2"
let zoneRestriction = null;
const mZone = q.match(/^(?:zona|z)\s*(\d+)\s*$/i);
if (mZone) zoneRestriction = parseInt(mZone[1], 10);
// Inline zone restriction: "... zona 2 ..." or "... z2 ..."
const inlineZone = q.match(/\b(?:zona|z)\s*(\d+)\b/i);
if (inlineZone) zoneRestriction = parseInt(inlineZone[1], 10);
const qWithoutZone = zoneRestriction != null
? q.replace(/\b(?:zona|z)\s*\d+\b/g, '').trim()
: q;
const tokens = qWithoutZone.split(' ').filter(Boolean);
return { type: 'text', tokens, zoneRestriction };
}
function basePhotosByActiveZoneNoSearch() {
const gps = photosWithGps();
if (activeZoneFilter === null) return gps;
return gps.filter(p => p.cluster_id === activeZoneFilter);
}
function baseNavOrderByActiveZoneNoSearch() {
// When LKH is available, tour order is based on it; otherwise it falls back to gallery order.
if (lkhOrder.length) {
if (activeZoneFilter === null) return lkhOrder;
return lkhOrder.filter(p => p.cluster_id === activeZoneFilter);
}
return basePhotosByActiveZoneNoSearch();
}
function textSearchHaystack(photo) {
const parts = [];
if (photo.caption) parts.push(photo.caption);
if (photo.place_name) parts.push(photo.place_name);
if (photo.cluster_id) parts.push(zoneLabel(photo.cluster_id));
return parts.join(' ').toLowerCase();
}
function photoMatchesTextSearch(photo, state) {
if (state.zoneRestriction != null && photo.cluster_id !== state.zoneRestriction) return false;
const tokens = state.tokens || [];
if (!tokens.length) return true;
const hay = textSearchHaystack(photo);
return tokens.every(t => hay.includes(t));
}
function visiblePhotos() {
const st = getSearchState();
const baseNav = baseNavOrderByActiveZoneNoSearch();
if (st.type === 'empty') return basePhotosByActiveZoneNoSearch();
if (st.type === 'numeric') {
const idx = st.index - 1;
if (idx < 0 || idx >= baseNav.length) return [];
return [baseNav[idx]];
}
// Text search (place/caption/zone)
let base = basePhotosByActiveZoneNoSearch();
if (st.zoneRestriction != null || (st.tokens && st.tokens.length)) {
base = base.filter(p => photoMatchesTextSearch(p, st));
}
return base;
}
function clusterColor(id) {
if (!id) return '#0066cc';
return ZONE_COLORS[(id - 1) % ZONE_COLORS.length];
}
function zoneChipTextColor(hex) {
const r = parseInt(hex.slice(1, 3), 16);
const g = parseInt(hex.slice(3, 5), 16);
const b = parseInt(hex.slice(5, 7), 16);
const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
return lum > 0.62 ? '#17324d' : '#fff';
}
function zoneChipStyleAttr(zoneId, isActive) {
const col = clusterColor(zoneId);
if (isActive) {
const text = zoneChipTextColor(col);
return `--zone-color:${col};--zone-text:${text}`;
}
return `--zone-color:${col}`;
}
function scrollGalleryToTop() {
document.getElementById('gallery-view')?.scrollTo({ top: 0, behavior: 'smooth' });
}
function applyZoneFilter(next) {
if (next === activeZoneFilter) return;
activeZoneFilter = next;
const count = visiblePhotos().length;
const label = next === null ? 'Tutte le zone' : zoneLabel(next);
announce(next === null ? `Tutte le zone, ${count} foto` : `${label}, ${count} foto`);
renderZoneBar();
renderGallery();
updateMapMarkers();
updateTourPolyline();
updateTourProgress();
if (next !== null) {
const st = getSearchState();
const ordered = st.type === 'empty'
? baseNavOrderByActiveZoneNoSearch()
: visiblePhotos();
const firstPhoto = ordered[0];
if (firstPhoto) {
const index = photosData.indexOf(firstPhoto);
if (index >= 0) openLightbox(index);
}
} else {
scrollGalleryToTop();
if (currentView === 'map' && map) {
setTimeout(() => fitMapToVisiblePhotos(), 50);
}
}
document.activeElement?.blur?.();
}
function tourPhotosForPolyline() {
if (!lkhOrder.length) return [];
const st = getSearchState();
const baseNav = baseNavOrderByActiveZoneNoSearch();
if (st.type === 'empty') return baseNav;
if (st.type === 'numeric') {
const idx = st.index - 1;
if (idx < 0 || idx >= baseNav.length) return [];
return [baseNav[idx]];
}
return baseNav.filter(p => photoMatchesTextSearch(p, st));
}
function updateTourPolyline() {
if (!map) return;
if (tourPolyline) {
map.removeLayer(tourPolyline);
tourPolyline = null;
}
const tour = tourPhotosForPolyline();
if (tour.length < 2) return;
tourPolyline = L.polyline(tour.map(p => [p.lat, p.lon]), {
color: '#14b8a6',
weight: 3,
opacity: 0.8
}).addTo(map);
}
function updateTourControlsVisibility() {
const el = document.getElementById('tour-controls');
if (el) el.classList.toggle('d-none', lkhOrder.length === 0);
}
function tourNavOrder() {
const tour = tourPhotosForPolyline();
if (tour.length > 0) return tour;
return visiblePhotos();
}
function updateTourProgress() {
const navOrder = tourNavOrder();
if (!navOrder.length) return;
let idx = 0;
if (currentLightboxIndex >= 0) {
const current = photosData[currentLightboxIndex];
const found = navOrder.indexOf(current);
if (found >= 0) idx = found;
}
const label = document.getElementById('tour-progress-label');
const bar = document.getElementById('tour-progress-bar');
if (label) label.textContent = `Foto ${idx + 1} / ${navOrder.length}`;
if (bar) {
const pct = ((idx + 1) / navOrder.length) * 100;
bar.style.width = `${pct}%`;
bar.setAttribute('aria-valuenow', Math.round(pct));
}
const km = document.getElementById('tour-km-label');
if (km) {
km.textContent = lkhTourMeta?.length_m
? `${(lkhTourMeta.length_m / 1000).toFixed(1)} km`
: '';
}
}
function startTourPlay() {
if (!lkhOrder.length) return;
stopTourPlay(false);
tourPlaying = true;
document.getElementById('tour-play-btn')?.classList.add('d-none');
document.getElementById('tour-pause-btn')?.classList.remove('d-none');
const navOrder = tourNavOrder();
if (!navOrder.length) return;
if (currentLightboxIndex < 0) {
openLightbox(photosData.indexOf(navOrder[0]));
} else if (currentView !== 'photo') {
switchView('photo');
}
announce('Percorso automatico avviato');
const intervalMs = prefersReducedMotion() ? TOUR_PLAY_MS * 2 : TOUR_PLAY_MS;
tourPlayTimer = setInterval(() => {
if (currentView !== 'photo') switchView('photo');
navigateLightbox(1, true);
updateTourProgress();
}, intervalMs);
}
function stopTourPlay(updateButtons = true) {
const wasPlaying = tourPlaying;
tourPlaying = false;
if (tourPlayTimer) clearInterval(tourPlayTimer);
tourPlayTimer = null;
if (updateButtons) {
document.getElementById('tour-play-btn')?.classList.remove('d-none');
document.getElementById('tour-pause-btn')?.classList.add('d-none');
}
if (wasPlaying && updateButtons) announce('Percorso automatico in pausa');
}
function announce(message) {
const el = document.getElementById('aria-announcer');
if (!el || !message) return;
el.textContent = '';
requestAnimationFrame(() => { el.textContent = message; });
}
function showToast(message) {
const toast = document.getElementById('app-toast');
if (!toast || !message) return;
toast.textContent = message;
toast.classList.add('show');
announce(message);
clearTimeout(showToast._timer);
showToast._timer = setTimeout(() => {
toast.classList.remove('show');
toast.textContent = '';
}, 2500);
}
function haversineMeters(lat1, lon1, lat2, lon2) {
const R = 6371000;
const p1 = lat1 * Math.PI / 180;
const p2 = lat2 * Math.PI / 180;
const dp = (lat2 - lat1) * Math.PI / 180;
const dl = (lon2 - lon1) * Math.PI / 180;
const a = Math.sin(dp / 2) ** 2
+ Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function panoramaxCollectionId(feature) {
const link = feature?.links?.find(l => l.rel === 'collection');
if (!link?.href) return null;
const m = link.href.match(/\/collections\/([^/]+)/);
return m ? m[1] : null;
}
function panoramaxThumbUrl(feature) {
return feature?.assets?.thumb?.href
|| `https://api.panoramax.xyz/api/pictures/${feature.id}/thumb.jpg`;
}
function panoramaxPreviewUrl(feature) {
return feature?.assets?.sd?.href
|| panoramaxThumbUrl(feature);
}
function panoramaxHeading(feature) {
const ex = feature?.properties?.exif || {};
const raw = ex['Xmp.GPano.PoseHeadingDegrees']
?? ex['Xmp.GPano.InitialViewHeadingDegrees'];
if (raw == null || raw === '') return null;
const v = parseFloat(raw);
return Number.isFinite(v) ? v : null;
}
function panoramaxMatchFromFeature(feature, photoLat, photoLon) {
const [lon, lat] = feature.geometry?.coordinates || [];
if (!feature?.id || lat == null || lon == null) return null;
const distM = haversineMeters(photoLat, photoLon, lat, lon);
if (distM > PANORAMAX_MAX_DIST_M) return null;
return {
picId: feature.id,
seqId: panoramaxCollectionId(feature),
lat,
lon,
distM,
heading: panoramaxHeading(feature),
thumbUrl: panoramaxThumbUrl(feature),
previewUrl: panoramaxPreviewUrl(feature),
};
}
async function findPanoramaxPicture(lat, lon) {
const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
if (panoramaxCache.has(key)) return panoramaxCache.get(key);
try {
const r = PANORAMAX_SEARCH_RADIUS_DEG;
const bbox = [lon - r, lat - r, lon + r, lat + r].join(',');
const url = `${PANORAMAX_SEARCH}?bbox=${bbox}&limit=12`;
const res = await fetch(url);
if (!res.ok) {
panoramaxCache.set(key, null);
return null;
}
const data = await res.json();
let best = null;
for (const feature of data.features || []) {
const match = panoramaxMatchFromFeature(feature, lat, lon);
if (!match) continue;
if (!best || match.distM < best.distM) best = match;
}
panoramaxCache.set(key, best);
return best;
} catch (_) {
panoramaxCache.set(key, null);
return null;
}
}
function panoramaxViewerUrl(photo, match) {
const picId = typeof match === 'string' ? match : match?.picId;
const seqId = typeof match === 'object' ? match?.seqId : null;
if (!picId) return PANORAMAX_VIEWER;
let url = `${PANORAMAX_VIEWER}?focus=pic&map=18/${photo.lat}/${photo.lon}&pic=${picId}`;
if (seqId) url += `&seq=${seqId}`;
if (photo.direction !== null && photo.direction !== undefined) {
url += `&xyz=${Math.round(photo.direction)}/0/30`;
}
return url;
}
// Yaw Pannellum: direzione bussola archivio rispetto al nord iniziale del panorama Panoramax.
function panoramaxViewYaw(photo, match) {
const archiveHeading = photo?.direction;
if (archiveHeading == null) return 0;
const panoZero = match?.heading ?? 0;
let yaw = archiveHeading - panoZero;
while (yaw > 180) yaw -= 360;
while (yaw < -180) yaw += 360;
return yaw;
}
function destroyPanoramaxPannellum() {
if (panoramaxPannellumViewer) {
try {
panoramaxPannellumViewer.destroy();
} catch (_) {  }
panoramaxPannellumViewer = null;
}
}
function closePanoramaxZoom() {
destroyPanoramaxPannellum();
releasePanoramaxFocus?.();
releasePanoramaxFocus = null;
document.getElementById('panoramax-zoom')?.classList.add('d-none');
}
// Pannellum caricato on-demand: serve solo allo zoom Panoramax.
let pannellumLoadingPromise = null;
function ensurePannellum() {
if (typeof pannellum !== 'undefined') return Promise.resolve();
if (pannellumLoadingPromise) return pannellumLoadingPromise;
const CDN = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build';
pannellumLoadingPromise = Promise.all([
new Promise((resolve, reject) => {
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = `${CDN}/pannellum.css`;
link.onload = resolve;
link.onerror = reject;
document.head.appendChild(link);
}),
new Promise((resolve, reject) => {
const script = document.createElement('script');
script.src = `${CDN}/pannellum.js`;
script.integrity = 'sha384-S5+w/JlcNAOymqXGNrvzn2F++XsaHTJdex6KE5VbKryfFgqJiRUJOgOkUqaiOZTf';
script.crossOrigin = 'anonymous';
script.onload = resolve;
script.onerror = reject;
document.head.appendChild(script);
}),
]).catch((err) => {
pannellumLoadingPromise = null;
throw err;
});
return pannellumLoadingPromise;
}
async function openPanoramaxZoom() {
if (!currentPanoramaxMatch?.previewUrl) return;
try {
await ensurePannellum();
} catch (err) {
console.error('Pannellum non caricato:', err);
return;
}
const zoom = document.getElementById('panoramax-zoom');
if (!zoom) return;
destroyPanoramaxPannellum();
zoom.classList.remove('d-none');
releasePanoramaxFocus?.();
releasePanoramaxFocus = trapFocus(zoom);
const photo = photosData[currentLightboxIndex];
const match = currentPanoramaxMatch;
const yaw = panoramaxViewYaw(photo, match);
requestAnimationFrame(() => {
requestAnimationFrame(() => {
if (!isPanoramaxZoomOpen()) return;
try {
panoramaxPannellumViewer = pannellum.viewer('panoramax-zoom-pano', {
type: 'equirectangular',
panorama: match.previewUrl,
crossOrigin: 'anonymous',
autoLoad: true,
yaw,
pitch: 0,
hfov: 95,
minHfov: 50,
maxHfov: 110,
showZoomCtrl: true,
showFullscreenCtrl: false,
compass: false,
northOffset: match.heading ?? 0,
});
panoramaxPannellumViewer.on('load', () => {
if (!isPanoramaxZoomOpen()) return;
panoramaxPannellumViewer.setYaw(yaw);
panoramaxPannellumViewer.setPitch(0);
});
} catch (err) {
console.error('Panoramax preview failed:', err);
closePanoramaxZoom();
}
});
});
}
function isPanoramaxZoomOpen() {
const zoom = document.getElementById('panoramax-zoom');
return zoom && !zoom.classList.contains('d-none');
}
function hidePanoramaxPreview() {
closePanoramaxZoom();
currentPanoramaxMatch = null;
document.getElementById('panoramax-preview')?.classList.add('d-none');
const thumb = document.getElementById('panoramax-thumb');
if (thumb) thumb.removeAttribute('src');
const link = document.getElementById('lightbox-panoramax');
if (link) {
link.classList.add('d-none');
link.removeAttribute('href');
}
}
function showPanoramaxPreview(photo, match) {
const viewerUrl = panoramaxViewerUrl(photo, match);
const badge = document.getElementById('lightbox-panoramax');
if (badge) {
badge.href = viewerUrl;
badge.classList.remove('d-none');
}
const preview = document.getElementById('panoramax-preview');
const thumb = document.getElementById('panoramax-thumb');
const offset = document.getElementById('panoramax-offset');
if (!preview || !thumb) return;
thumb.src = match.thumbUrl;
thumb.alt = `Panoramax a ${Math.round(match.distM)} m da questa foto`;
if (offset) {
offset.textContent = `${Math.round(match.distM)} m`;
}
preview.classList.remove('d-none');
}
function isMobileViewport() {
return window.matchMedia('(max-width: 768px)').matches;
}
function updatePanoramaxPreview(photo) {
hidePanoramaxPreview();
// Su mobile l'anteprima copre la foto: non la mostriamo e non la scarichiamo.
if (isMobileViewport()) return;
findPanoramaxPicture(photo.lat, photo.lon).then(match => {
if (currentLightboxIndex !== photosData.indexOf(photo) || !match?.picId) return;
currentPanoramaxMatch = match;
showPanoramaxPreview(photo, match);
});
}
function mapToggleButtonContent(isMinimized) {
return isMinimized
? '<span class="map-toggle-symbol map-toggle-plus" aria-hidden="true"></span>'
: '<span class="map-toggle-symbol map-toggle-minus" aria-hidden="true"></span>';
}
// Tile layers
const tileLayers = {
osm: {
url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
attribution: '&copy; OpenStreetMap contributors'
}
};
// Calcola punto a distanza in metri da un punto dato
function destinationPoint(lat, lon, distanceMeters, bearingDegrees) {
const R = 6371000; // Raggio terra in metri
const d = distanceMeters / R;
const brng = bearingDegrees * Math.PI / 180;
const lat1 = lat * Math.PI / 180;
const lon1 = lon * Math.PI / 180;
const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
return {
lat: lat2 * 180 / Math.PI,
lon: lon2 * 180 / Math.PI
};
}
// Carica dati
async function loadPhotos() {
try {
const response = await fetch('dati/photos.json', { cache: 'no-cache' });
const data = await response.json();
photosData = data.photos;
zoneNames = data.zone_names || {};
siteMeta = readSiteMeta();
updateStats(data);
updateMapHero(data);
renderZoneBar();
renderGallery();
// Restore state from URL (permalink: ?foto=id o #id)
const hash = INITIAL_URL_HASH;
const fotoParam = INITIAL_FOTO_PARAM;
initMaps();
// Evita la race permalink: il viewer viene aperto solo dopo il grafo.
await loadTransitionGraph();
// Try to load LKH precomputed tour (non-blocking)
try {
const lkhRes = await fetch('dati/lkh_tour.json', { cache: 'no-cache' });
if (lkhRes.ok) {
const lkhData = await lkhRes.json();
const byIdx = new Map(photosData.map((p, i) => [i, p]));
lkhOrder = (lkhData.tour_indices || [])
.map(i => byIdx.get(i))
.filter(p => p && p.has_gps);
if (lkhOrder.length > 0) {
lkhTourMeta = lkhData;
updateTourPolyline();
updateTourControlsVisibility();
updateTourProgress();
updateMapHero(data);
// Ordine e numerazione "Foto N" dipendono dal tour LKH: ri-renderizza una sola volta.
renderZoneBar();
renderGallery();
updateMapMarkers();
updateTourPolyline();
updateTourProgress();
console.info(`LKH nav active: ${lkhOrder.length} photos, ${(lkhData.length_m / 1000).toFixed(2)} km`);
}
}
} catch (_) {  }
if (fotoParam) {
const idx = photosData.findIndex(p => photoId(p) === fotoParam);
if (idx >= 0) openLightbox(idx);
} else if (PHOTO_HASH_RE.test(hash)) {
openLightboxFromHash(hash);
} else if (MAP_HASH_RE.test(hash)) {
applyMapHash(hash);  // override the fitBounds from initMaps
}
maybeShowWelcome(hash);
} catch (error) {
console.error('Errore caricamento foto:', error);
}
}
// Aggiorna statistiche
function updateStats(data) {
const gpsPhotos = data.photos.filter(p => p.has_gps).length;
const zones = new Set(data.photos.filter(p => p.has_gps && p.cluster_id).map(p => p.cluster_id));
const badge = document.getElementById('header-stats-badge');
if (badge) {
badge.textContent = zones.size > 0
? `${gpsPhotos} foto · ${zones.size} zone`
: `${gpsPhotos} foto`;
}
const welcomeCount = document.getElementById('welcome-photo-count');
if (welcomeCount) welcomeCount.textContent = gpsPhotos;
}
function updateMapHero(data) {
const hero = document.getElementById('map-hero');
if (!hero) return;
if (localStorage.getItem(MAP_HERO_STORAGE_KEY)) {
hero.classList.add('map-hero--hidden');
return;
}
hero.classList.remove('map-hero--hidden');
const gpsPhotos = data?.photos?.filter(p => p.has_gps).length ?? photosWithGps().length;
const zones = new Set((data?.photos || photosData).filter(p => p.has_gps && p.cluster_id).map(p => p.cluster_id));
const photoCountEl = document.getElementById('hero-photo-count');
const zoneCountEl = document.getElementById('hero-zone-count');
const kmEl = document.getElementById('hero-tour-km');
if (photoCountEl) photoCountEl.textContent = gpsPhotos;
if (zoneCountEl) zoneCountEl.textContent = zones.size;
if (kmEl) {
kmEl.textContent = lkhTourMeta?.length_m
? `~${(lkhTourMeta.length_m / 1000).toFixed(1)} km`
: '—';
}
}
function dismissMapHero() {
localStorage.setItem(MAP_HERO_STORAGE_KEY, '1');
document.getElementById('map-hero')?.classList.add('map-hero--hidden');
}
function renderZoneBar() {
const bar = document.getElementById('zone-bar');
if (!bar) return;
const searchActive = Boolean(normalizeSearchQuery(activeSearchQuery));
const st = getSearchState();
let candidates = photosWithGps();
if (st.type === 'numeric') {
candidates = visiblePhotos();
} else if (st.type === 'text') {
candidates = candidates.filter(p => photoMatchesTextSearch(p, st));
}
const zoneCounts = new Map();
candidates.forEach(p => {
const z = p.cluster_id;
if (z) zoneCounts.set(z, (zoneCounts.get(z) || 0) + 1);
});
const zones = [...zoneCounts.keys()].sort((a, b) => a - b);
if (candidates.length === 0) {
bar.classList.add('d-none');
return;
}
bar.classList.remove('d-none');
const allCount = candidates.length;
const allPressed = activeZoneFilter === null ? 'true' : 'false';
const chips = [
`<button type="button" class="zone-chip zone-chip--all" aria-pressed="${allPressed}">Tutte (${allCount})</button>`
];
zones.forEach(z => {
const isActive = activeZoneFilter === z;
const pressed = isActive ? 'true' : 'false';
const style = zoneChipStyleAttr(z, isActive);
const name = zoneLabel(z);
chips.push(`<button type="button" class="zone-chip" data-zone="${z}" aria-pressed="${pressed}" style="${style}">${escapeHtml(name)} (${zoneCounts.get(z)})</button>`);
});
bar.innerHTML = chips.join('');
bar.querySelectorAll('.zone-chip').forEach(btn => {
// Evita focus ring al click mouse (il re-render spostava focus sul chip successivo)
btn.addEventListener('mousedown', (e) => {
if (e.button === 0) e.preventDefault();
});
btn.addEventListener('click', () => {
const raw = btn.dataset.zone;
const next = raw === undefined || raw === '' ? null : Number(raw);
applyZoneFilter(next);
});
});
requestAnimationFrame(() => {
const active = document.activeElement;
if (active instanceof HTMLElement && bar.contains(active)) {
active.blur();
}
});
}
function maybeShowWelcome(hash) {
if (localStorage.getItem(WELCOME_STORAGE_KEY)) return;
if (PHOTO_HASH_RE.test(hash) || MAP_HASH_RE.test(hash)) return;
const overlay = document.getElementById('welcome-overlay');
if (!overlay) return;
overlay.classList.remove('d-none');
releaseWelcomeFocus?.();
releaseWelcomeFocus = trapFocus(overlay);
}
function dismissWelcome(persist = true) {
const overlay = document.getElementById('welcome-overlay');
releaseWelcomeFocus?.();
releaseWelcomeFocus = null;
if (overlay) overlay.classList.add('d-none');
if (persist) localStorage.setItem(WELCOME_STORAGE_KEY, '1');
}
function openNavHelp() {
const overlay = document.getElementById('nav-help-overlay');
if (!overlay) return;
overlay.classList.remove('d-none');
releaseHelpFocus?.();
releaseHelpFocus = trapFocus(overlay);
}
function closeNavHelp() {
const overlay = document.getElementById('nav-help-overlay');
releaseHelpFocus?.();
releaseHelpFocus = null;
overlay?.classList.add('d-none');
}
function startTourFromWelcome() {
const first = tourNavOrder()[0];
if (first) openLightbox(photosData.indexOf(first));
}
async function copyPhotoLink() {
const url = window.location.href;
try {
await navigator.clipboard.writeText(url);
showToast('Link copiato negli appunti');
} catch (_) {
showToast('Impossibile copiare il link');
}
}
function updateSearchCountUI() {
const el = document.getElementById('photo-search-count');
if (!el) return;
const q = normalizeSearchQuery(activeSearchQuery);
const count = visiblePhotos().length;
if (!q) {
el.textContent = '';
return;
}
el.textContent = `${count} risultato${count === 1 ? '' : 'i'} per “${activeSearchQuery.trim()}”`;
}
// Renderizza galleria con Bootstrap Cards
function renderGallery() {
const grid = document.getElementById('photo-grid');
const photosToShow = visiblePhotos();
if (photosToShow.length === 0) {
const q = normalizeSearchQuery(activeSearchQuery);
const msg = q
? `Nessuna foto trovata per “${escapeHtml(activeSearchQuery.trim())}”.`
: (activeZoneFilter ? 'Nessuna foto in questa zona' : 'Nessuna foto con GPS trovata');
grid.innerHTML = `<div class="masonry-item"><div class="alert alert-warning text-center">${msg}</div></div>`;
return;
}
const html = photosToShow.map((photo, seqIndex) => {
const originalIndex = photosData.indexOf(photo);
const label = photoLabel(photo, seqIndex + 1);
const safeLabel = escapeHtml(label);
const aspectStyle = photo.width && photo.height
? ` style="aspect-ratio: ${photo.width} / ${photo.height};"`
: '';
return `
<div class="masonry-item" role="listitem">
<div class="card photo-card shadow-sm" data-photo-index="${originalIndex}"
role="button" tabindex="0" aria-label="${safeLabel}">
<img src="${photo.thumb}" alt="${safeLabel}" loading="lazy"${aspectStyle}>
<div class="card-body photo-card-body p-2">
<div class="photo-card-label mb-1">${safeLabel}</div>
<div class="photo-card-meta d-flex flex-wrap gap-1">
${photo.cluster_id ? (() => {
const zc = clusterColor(photo.cluster_id);
return `<span class="badge" style="background:${zc};color:${zoneChipTextColor(zc)}">${escapeHtml(zoneLabel(photo.cluster_id))}</span>`;
})() : ''}
<span class="badge bg-success">GPS</span>
${photo.direction !== null && photo.direction !== undefined ?
`<span class="badge bg-info">${Math.round(photo.direction)}°</span>` : ''}
</div>
</div>
</div>
</div>
`;
}).join('');
grid.innerHTML = html;
updateSearchCountUI();
}
// Calcola bounding box che contiene il 95% delle foto
function calculate95PercentBounds(photos) {
if (photos.length === 0) return null;
// Ordina per lat e lon
const lats = photos.map(p => p.lat).sort((a, b) => a - b);
const lons = photos.map(p => p.lon).sort((a, b) => a - b);
// Rimuovi 2.5% da ogni lato (totale 5% escluso)
const trim = Math.floor(photos.length * 0.025);
const lats95 = lats.slice(trim, lats.length - trim);
const lons95 = lons.slice(trim, lons.length - trim);
return {
minLat: lats95[0],
maxLat: lats95[lats95.length - 1],
minLon: lons95[0],
maxLon: lons95[lons95.length - 1]
};
}
// Inizializza mappe
function initMaps() {
const photosWithGPS = visiblePhotos();
const bounds95 = calculate95PercentBounds(photosWithGPS);
let initialView = [45.4642, 9.1900];
let initialZoom = 6;
if (bounds95) {
// Calcola centro di massa
const centerLat = (bounds95.minLat + bounds95.maxLat) / 2;
const centerLon = (bounds95.minLon + bounds95.maxLon) / 2;
initialView = [centerLat, centerLon];
}
// Mappa principale
map = L.map('map').setView(initialView, initialZoom);
updateMapTiles(map);
// Aggiungi marker
updateMapMarkers();
// Fit alla bounding box del 95%
if (bounds95 && photosWithGPS.length > 1) {
const leafletBounds = L.latLngBounds(
[bounds95.minLat, bounds95.minLon],
[bounds95.maxLat, bounds95.maxLon]
);
map.fitBounds(leafletBounds, { padding: [50, 50] });
}
// Map permalink: update URL hash on move/zoom (only when map view is active)
map.on('moveend', () => {
if (currentView !== 'map') return;
const c = map.getCenter();
history.replaceState(null, '', `#${c.lat.toFixed(6)},${c.lng.toFixed(6)},${map.getZoom()}z`);
});
// Leaflet needs a laid-out container; defer until after first paint
requestAnimationFrame(() => {
requestAnimationFrame(() => {
if (!map) return;
map.invalidateSize();
fitMapToVisiblePhotos();
});
});
}
function initLightboxMap(center, zoom = 15) {
if (mapLightbox) return mapLightbox;
const view = center || (map ? map.getCenter() : { lat: 45.4642, lng: 9.1900 });
const latLng = Array.isArray(view) ? view : [view.lat, view.lng];
mapLightbox = L.map('lightbox-map', {
zoomControl: false
}).setView(latLng, zoom);
updateMapTiles(mapLightbox);
return mapLightbox;
}
function ensureLightboxMap(photo) {
const center = photo ? [photo.lat, photo.lon] : null;
initLightboxMap(center, 15);
requestAnimationFrame(() => {
mapLightbox?.invalidateSize();
});
}
// Aggiorna tiles della mappa
function updateMapTiles(mapInstance) {
// Rimuovi layer esistenti
mapInstance.eachLayer(layer => {
if (layer instanceof L.TileLayer) {
mapInstance.removeLayer(layer);
}
});
const layer = tileLayers[currentMapType];
L.tileLayer(layer.url, {
attribution: layer.attribution,
maxZoom: 19,
opacity: 0.7  // Trasparenza per evidenziare i marker
}).addTo(mapInstance);
}
// Aggiorna marker sulla mappa
function updateMapMarkers() {
// Rimuovi marker e cluster esistenti
if (markerClusterGroup) {
map.removeLayer(markerClusterGroup);
}
markers.forEach(m => {
if (m.line) map.removeLayer(m.line);
});
markers = [];
const photosWithGPS = visiblePhotos();
if (photosWithGPS.length === 0) return;
markerClusterGroup = L.markerClusterGroup({
maxClusterRadius: 50,
spiderfyOnMaxZoom: true,
showCoverageOnHover: false,
zoomToBoundsOnClick: true
});
photosWithGPS.forEach((photo) => {
const photoIndex = photosData.indexOf(photo);
const zoneCol = clusterColor(photo.cluster_id);
const icon = L.divIcon({
className: 'custom-div-icon',
html: `<div class="marker-thumb" style="width:40px;height:40px;border-color:${zoneCol};background-image:url('${photo.thumb}')"></div>`,
iconSize: [40, 40],
iconAnchor: [20, 20]
});
const marker = L.marker([photo.lat, photo.lon], { icon: icon })
.on('click', () => openLightbox(photoIndex));
// Linea direzione se presente
let directionLine = null;
if (photo.direction !== null && photo.direction !== undefined) {
const endPoint = destinationPoint(photo.lat, photo.lon, 20, photo.direction);
directionLine = L.polyline(
[[photo.lat, photo.lon], [endPoint.lat, endPoint.lon]],
{ color: '#e74c3c', weight: 2, opacity: 0.5 }
).addTo(map);
}
markerClusterGroup.addLayer(marker);
markers.push({ marker, line: directionLine });
});
// Aggiungi il gruppo cluster alla mappa
map.addLayer(markerClusterGroup);
fitMapToVisiblePhotos();
updateTourPolyline();
}
function fitMapToVisiblePhotos() {
if (!map) return;
const photosWithGPS = visiblePhotos();
if (photosWithGPS.length === 0) return;
const bounds = L.latLngBounds(photosWithGPS.map(p => [p.lat, p.lon]));
if (photosWithGPS.length === 1) {
map.setView([photosWithGPS[0].lat, photosWithGPS[0].lon], 17);
} else {
map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
}
}
// Cambia vista
function switchView(view) {
currentView = view;
const galleryEl = document.getElementById('gallery-view');
const mapEl = document.getElementById('map-view');
const photoEl = document.getElementById('photo-view');
galleryEl.style.display = 'none';
mapEl.style.display = 'none';
photoEl.style.display = 'none';
const btnGallery = document.getElementById('viewGallery');
const btnMap = document.getElementById('viewMap');
if (view === 'gallery') {
galleryEl.style.display = 'flex';
galleryEl.style.flexDirection = 'column';
btnGallery.checked = true;
btnMap.checked = false;
} else if (view === 'map') {
mapEl.style.display = 'block';
btnGallery.checked = false;
btnMap.checked = true;
setTimeout(() => {
if (!map) return;
map.invalidateSize();
fitMapToVisiblePhotos();
}, 100);
} else if (view === 'photo') {
photoEl.style.display = 'flex';
photoEl.style.flexDirection = 'column';
btnGallery.checked = false;
btnMap.checked = false;
setTimeout(() => {
if (mapLightbox) mapLightbox.invalidateSize();
}, 150);
}
}
function leavePhotoViewFor(targetView) {
if (currentView === 'photo') {
stopTourPlay();
clearLightboxImageTransition();
hidePanoramaxPreview();
currentLightboxIndex = -1;
updatePageMeta(null);
history.replaceState(
null,
'',
targetView === 'map' ? (mapHashCurrent() || window.location.pathname) : window.location.pathname
);
updateTourProgress();
}
switchView(targetView);
}
// Cambia tipo mappa
function switchMapType(type) {
currentMapType = type;
updateMapTiles(map);
if (mapLightbox) updateMapTiles(mapLightbox);
}
// Apre la foto nella photo view (pagina dedicata, non modal)
function openLightbox(index, navDirection = 0) {
const prevIndex = currentLightboxIndex;
currentLightboxIndex = index;
const photo = photosData[index];
if (!photo.has_gps) return;
// Ricorda da dove siamo venuti per il tasto ✕
if (currentView !== 'photo') {
previousView = currentView;
}
const useTransition = currentView === 'photo' && prevIndex >= 0 && prevIndex !== index;
// Mostra la photo view
switchView('photo');
ensureLightboxMap(photo);
// Re-minimize map on mobile when opening a new photo
if (window.innerWidth <= 768) {
const mapContainer = document.getElementById('lightbox-map-container');
const mapToggleBtn = document.getElementById('map-toggle-btn');
if (mapContainer && !mapContainer.classList.contains('minimized')) {
mapContainer.classList.add('minimized');
mapToggleBtn.innerHTML = mapToggleButtonContent(true);
}
}
// Controlla cambia zona
if (prevIndex >= 0) {
checkZoneChange(photosData[prevIndex], photo);
}
const fromPhoto = (prevIndex >= 0 && prevIndex !== index) ? photosData[prevIndex] : null;
updateLightboxContent(photo, { transition: useTransition, direction: navDirection, fromPhoto });
const navOrder = tourNavOrder();
const seqIndex = Math.max(1, navOrder.indexOf(photo) + 1);
updatePageMeta(photo, seqIndex);
history.replaceState(null, '', `#${photoId(photo)}`);
updateTourProgress();
}
function removeLightboxImageNext() {
document.getElementById('lightbox-image-next')?.remove();
}
function clearLightboxImageTransition() {
if (lightboxImageTransitionTimer) {
clearTimeout(lightboxImageTransitionTimer);
lightboxImageTransitionTimer = null;
}
removeLightboxImageNext();
}
function sameLightboxSrc(imgElement, src) {
if (!imgElement || !src) return false;
const cur = imgElement.currentSrc || imgElement.src || '';
return cur === src || cur.endsWith(src) || cur.includes(src);
}
function afterPaint(cb) {
requestAnimationFrame(() => requestAnimationFrame(cb));
}
function setLightboxImageInstant(imgElement, loader, src, photo) {
if (typeof window.resetZoom === 'function') window.resetZoom();
imgElement.style.transition = 'none';
imgElement.style.transform = '';
imgElement.classList.remove('morph-hidden');
imgElement.style.visibility = '';
applyImageAspectRatio(imgElement, photo);
if (!sameLightboxSrc(imgElement, src)) imgElement.src = src;
imgElement.style.opacity = '1';
loader.style.display = 'none';
removeLightboxImageNext();
setMorphViewerVisible(false);
void imgElement.offsetWidth;
imgElement.style.transition = '';
lightboxDisplayedPhoto = photo;
prefetchTourNeighbors(photo);
}
async function finishLightboxSwap(imgElement, loader, nextEl, photo) {
imgElement.style.transition = 'none';
imgElement.style.transform = '';
applyImageAspectRatio(imgElement, photo);
if (!sameLightboxSrc(imgElement, photo.display)) imgElement.src = photo.display;
try {
if (imgElement.decode) await imgElement.decode();
} catch (_) {  }
imgElement.style.opacity = '1';
loader.style.display = 'none';
afterPaint(() => {
nextEl?.remove();
imgElement.style.transition = '';
});
lightboxDisplayedPhoto = photo;
prefetchTourNeighbors(photo);
}
function runDissolveTransition(imgElement, container, loader, photo) {
let next = document.getElementById('lightbox-image-next');
if (!next) {
next = document.createElement('img');
next.id = 'lightbox-image-next';
next.className = 'lightbox-image-next';
container.insertBefore(next, imgElement.nextSibling);
}
const easing = `opacity ${PHOTO_TRANSITION_MS}ms ease-out`;
next.style.transition = 'none';
next.style.opacity = '0';
next.src = photo.display;
applyImageAspectRatio(next, photo);
next.alt = imgElement.alt;
imgElement.style.transition = 'none';
void next.offsetWidth;
next.style.transition = easing;
imgElement.style.transition = easing;
requestAnimationFrame(() => {
imgElement.style.opacity = '0';
next.style.opacity = '1';
});
lightboxImageTransitionTimer = setTimeout(() => {
lightboxImageTransitionTimer = null;
if (currentLightboxIndex !== photosData.indexOf(photo)) return;
finishLightboxSwap(imgElement, loader, next, photo);
}, PHOTO_TRANSITION_MS + 32);
}
function updateLightboxImage(photo, options = {}) {
const { transition = false, fromPhoto = null } = options;
const useTransition = transition && !prefersReducedMotion();
const imgElement = document.getElementById('lightbox-image');
const loader = document.getElementById('lightbox-loader');
const container = imgElement?.parentElement;
if (!imgElement || !container) return;
clearLightboxImageTransition();
const from = fromPhoto || lightboxDisplayedPhoto;
const animate = !!(useTransition && from && photoId(from) !== photoId(photo));
loader.style.display = 'block';
void (async () => {
try {
const ok = await showWithMorphViewer(photo, { from, animate });
if (!ok && currentLightboxIndex === photosData.indexOf(photo)) {
setLightboxImageInstant(imgElement, loader, photo.display, photo);
}
} catch (err) {
console.warn('morph viewer non disponibile, fallback <img>', err);
disposeMorphViewer();
if (animate) runDissolveTransition(imgElement, container, loader, photo);
else setLightboxImageInstant(imgElement, loader, photo.display, photo);
}
})();
}
function transitionTierLabel(tier) {
return { morph: 'stessa inquadratura', anchor: 'stesso soggetto' }[tier] || 'correlata';
}
function renderCorrelatedFilmstrip(photo) {
const section = document.getElementById('sfm-correlated');
const strip = document.getElementById('sfm-correlated-strip');
const count = document.getElementById('sfm-correlated-count');
if (!section || !strip) return;
const edges = correlatedById.get(photoId(photo)) || [];
const byId = new Map(photosData.map(p => [photoId(p), p]));
const available = edges.filter(edge => byId.has(edge.to));
strip.replaceChildren();
if (!available.length) {
if (count) count.textContent = '0';
const empty = document.createElement('span');
empty.className = 'sfm-correlated-empty';
empty.textContent = 'Nessuna vista correlata per questa foto';
strip.appendChild(empty);
return;
}
if (count) count.textContent = String(available.length);
for (const edge of available) {
const target = byId.get(edge.to);
const button = document.createElement('button');
button.type = 'button';
button.className = `sfm-correlated-item tier-${edge.tier}`;
button.setAttribute('role', 'listitem');
button.dataset.photoId = edge.to;
const score = Math.round(Number(edge.score || 0) * 100);
button.title = `${photoLabel(target)} — ${transitionTierLabel(edge.tier)}${score ? `, affinità ${score}%` : ''}`;
button.setAttribute('aria-label', button.title);
const image = document.createElement('img');
image.src = target.thumb || target.display;
image.alt = '';
image.loading = 'lazy';
image.decoding = 'async';
const badge = document.createElement('span');
badge.className = 'sfm-correlated-badge';
badge.textContent = transitionTierLabel(edge.tier);
button.append(image, badge);
button.addEventListener('click', () => {
const index = photosData.indexOf(target);
if (index >= 0) openLightbox(index);
});
strip.appendChild(button);
}
if (morphViewer) morphViewer.prefetchIds(available.slice(0, 6).map(edge => edge.to));
}
function updateLightboxContent(photo, options = {}) {
updateLightboxImage(photo, options);
renderCorrelatedFilmstrip(photo);
// Sequence counter in header (ordine tour LKH filtrato per zona)
const navOrder = tourNavOrder();
const seqIndex = navOrder.indexOf(photo) + 1;
document.getElementById('lightbox-sequence').textContent =
seqIndex > 0 ? `${seqIndex} / ${navOrder.length}` : `— / ${navOrder.length}`;
const label = photoLabel(photo, seqIndex > 0 ? seqIndex : 1);
const imgEl = document.getElementById('lightbox-image');
imgEl.alt = label;
applyImageAspectRatio(imgEl, photo);
const placeEl = document.getElementById('lightbox-place');
if (placeEl) {
const placeText = photo.place_name || (photo.cluster_id ? zoneLabel(photo.cluster_id) : '');
if (placeText) {
placeEl.textContent = placeText;
placeEl.classList.remove('d-none');
} else {
placeEl.classList.add('d-none');
}
}
const osmEl = document.getElementById('lightbox-osm');
if (osmEl) {
osmEl.href = `https://www.openstreetmap.org/#map=18/${photo.lat}/${photo.lon}`;
osmEl.classList.remove('d-none');
}
const gpsEl = document.getElementById('lightbox-gps');
gpsEl.textContent = `${photo.lat.toFixed(6)}, ${photo.lon.toFixed(6)}`;
const directionEl = document.getElementById('lightbox-direction');
if (photo.direction !== null && photo.direction !== undefined) {
directionEl.textContent = `${Math.round(photo.direction)}°`;
directionEl.classList.remove('d-none');
} else {
directionEl.classList.add('d-none');
}
const cameraEl = document.getElementById('lightbox-camera');
if (photo.camera) {
cameraEl.textContent = photo.camera;
cameraEl.classList.remove('d-none');
} else {
cameraEl.classList.add('d-none');
}
const sfmEl = document.getElementById('lightbox-sfm');
if (sfmEl) {
if (photo.lat_raw != null && photo.lon_raw != null) {
sfmEl.classList.remove('d-none');
} else {
sfmEl.classList.add('d-none');
}
}
updatePanoramaxPreview(photo);
const seqLabel = photoLabel(photo, seqIndex > 0 ? seqIndex : 1);
announce(seqLabel);
updateLightboxMap(photo);
}
function checkZoneChange(prevPhoto, nextPhoto) {
// Se non hanno cluster id, ignora
if (!prevPhoto.cluster_id || !nextPhoto.cluster_id) return;
if (prevPhoto.cluster_id !== nextPhoto.cluster_id) {
showZoneNotification(`Nuova zona: ${zoneLabel(nextPhoto.cluster_id)}`);
}
}
function showZoneNotification(text) {
const container = document.getElementById('zone-notification');
const alert = container.querySelector('.alert');
const textEl = document.getElementById('zone-text');
textEl.textContent = text;
announce(text);
alert.classList.remove('d-none');
// Nascondi dopo 3 secondi
setTimeout(() => {
alert.classList.add('d-none');
}, 3000);
}
function updateLightboxMap(photo) {
ensureLightboxMap(photo);
if (!mapLightbox) return;
setTimeout(() => {
mapLightbox.invalidateSize();
// Rimuovi tutti i layer esistenti tranne tile layer
mapLightbox.eachLayer(layer => {
if (!(layer instanceof L.TileLayer)) {
mapLightbox.removeLayer(layer);
}
});
// Mostra tutti i marker
const photosWithGPS = photosData.filter(p => p.has_gps && p.lat && p.lon);
photosWithGPS.forEach((p) => {
const isCurrentPhoto = p === photo;
const pIndex = photosData.indexOf(p);
if (isCurrentPhoto) {
if (p.direction !== null && p.direction !== undefined) {
const endPoint = destinationPoint(p.lat, p.lon, 30, p.direction);
L.polyline(
[[p.lat, p.lon], [endPoint.lat, endPoint.lon]],
{ color: '#e74c3c', weight: 3, opacity: 0.8 }
).addTo(mapLightbox);
}
L.circleMarker([p.lat, p.lon], {
radius: 12,
fillColor: '#e74c3c',
color: 'white',
weight: 3,
fillOpacity: 1
}).addTo(mapLightbox);
} else {
L.circleMarker([p.lat, p.lon], {
radius: 7,
fillColor: clusterColor(p.cluster_id),
color: 'white',
weight: 2,
fillOpacity: 0.95
})
.on('click', () => openLightbox(pIndex))
.addTo(mapLightbox);
}
});
mapLightbox.setView([photo.lat, photo.lon], 18);
}, 150);
}
function closeLightbox() {
stopTourPlay();
clearLightboxImageTransition();
hidePanoramaxPreview();
setMorphViewerVisible(false);
currentLightboxIndex = -1;
switchView(previousView);
updatePageMeta(null);
history.replaceState(null, '', mapHashCurrent() || window.location.pathname);
updateTourProgress();
}
function navigateLightbox(direction, fromAutoplay = false) {
if (tourPlaying && !fromAutoplay) stopTourPlay();
const navOrder = tourNavOrder();
if (navOrder.length === 0) return;
const currentPhoto = photosData[currentLightboxIndex];
let idx = navOrder.indexOf(currentPhoto);
if (idx === -1) idx = 0;
idx = (idx + direction + navOrder.length) % navOrder.length;
const nextPhoto = navOrder[idx];
const nextIndex = photosData.indexOf(nextPhoto);
openLightbox(nextIndex, direction);
}
// Permalink helper: open lightbox from a file hash string (e.g. #5d1c7f1ef4a17046)
const PHOTO_HASH_RE = /^#[0-9a-f]{10,}$/i;
function openLightboxFromHash(hash) {
if (!hash || !PHOTO_HASH_RE.test(hash)) return false;
const id = hash.slice(1);
const index = photosData.findIndex(p => photoId(p) === id);
if (index >= 0) {
openLightbox(index);
return true;
}
return false;
}
// Regex for map permalink hash: #lat,lon,zoomz  e.g. #45.123456,9.654321,14z
const MAP_HASH_RE = /^#(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+)z$/;
function applyMapHash(hash) {
const m = hash.match(MAP_HASH_RE);
if (m && map) {
map.setView([parseFloat(m[1]), parseFloat(m[2])], parseInt(m[3]));
return true;
}
return false;
}
function mapHashCurrent() {
if (!map) return '';
const c = map.getCenter();
return `#${c.lat.toFixed(6)},${c.lng.toFixed(6)},${map.getZoom()}z`;
}
// hashchange fires when user edits the URL hash in-page (no reload).
// Note: history.replaceState (used in openLightbox/closeLightbox) does NOT trigger this.
window.addEventListener('hashchange', () => {
const hash = window.location.hash;
if (PHOTO_HASH_RE.test(hash)) {
openLightboxFromHash(hash);
} else if (MAP_HASH_RE.test(hash)) {
closeLightbox();
applyMapHash(hash);
} else {
closeLightbox();
}
});
// Event listeners
document.addEventListener('DOMContentLoaded', () => {
switchView('map'); // set initial state explicitly
loadPhotos();
// Search UI (place/caption/zone/Foto N) - never uses original filenames
const searchInput = document.getElementById('photo-search-input');
const clearBtn = document.getElementById('photo-search-clear');
const applySearch = (announceChange = true) => {
const q = normalizeSearchQuery(activeSearchQuery);
if (clearBtn) clearBtn.classList.toggle('d-none', !q);
renderZoneBar();
renderGallery();
updateMapMarkers();
updateTourPolyline();
updateTourProgress();
if (announceChange) {
const count = visiblePhotos().length;
if (!q) announce(`Ricerca svuotata, ${count} foto`);
else announce(`Ricerca “${activeSearchQuery.trim()}”, ${count} foto trovate`);
}
};
const onSearchInput = () => {
activeSearchQuery = searchInput ? searchInput.value : '';
if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
searchDebounceTimer = setTimeout(() => applySearch(true), 180);
};
if (searchInput) {
searchInput.addEventListener('input', onSearchInput);
searchInput.addEventListener('keydown', (e) => {
if (e.key === 'Escape') {
activeSearchQuery = '';
searchInput.value = '';
applySearch(true);
}
});
}
if (clearBtn) {
clearBtn.addEventListener('click', () => {
activeSearchQuery = '';
if (searchInput) searchInput.value = '';
applySearch(true);
});
}
// View buttons (Bootstrap radio buttons)
document.getElementById('viewGallery').addEventListener('change', (e) => {
if (e.target.checked) leavePhotoViewFor('gallery');
});
document.getElementById('viewMap').addEventListener('change', (e) => {
if (e.target.checked) leavePhotoViewFor('map');
});
document.getElementById('welcome-map-btn')?.addEventListener('click', () => {
dismissWelcome();
switchView('map');
});
document.getElementById('welcome-gallery-btn')?.addEventListener('click', () => {
dismissWelcome();
switchView('gallery');
});
document.getElementById('welcome-tour-btn')?.addEventListener('click', () => {
dismissWelcome();
startTourFromWelcome();
});
document.getElementById('welcome-dismiss-btn')?.addEventListener('click', () => dismissWelcome());
document.getElementById('hero-tour-btn')?.addEventListener('click', () => {
dismissMapHero();
startTourFromWelcome();
});
document.getElementById('hero-gallery-btn')?.addEventListener('click', () => {
dismissMapHero();
switchView('gallery');
});
document.getElementById('hero-dismiss-btn')?.addEventListener('click', dismissMapHero);
document.getElementById('nav-help-btn')?.addEventListener('click', openNavHelp);
document.getElementById('nav-help-close-btn')?.addEventListener('click', closeNavHelp);
document.getElementById('share-photo-btn')?.addEventListener('click', copyPhotoLink);
document.getElementById('tour-play-btn')?.addEventListener('click', startTourPlay);
document.getElementById('tour-pause-btn')?.addEventListener('click', () => stopTourPlay());
document.getElementById('panoramax-thumb-btn')?.addEventListener('click', openPanoramaxZoom);
document.getElementById('panoramax-zoom-close')?.addEventListener('click', closePanoramaxZoom);
document.querySelector('.panoramax-zoom-backdrop')?.addEventListener('click', closePanoramaxZoom);
document.getElementById('lbx-prev-btn')?.addEventListener('click', () => navigateLightbox(-1));
document.getElementById('lbx-next-btn')?.addEventListener('click', () => navigateLightbox(1));
document.getElementById('lbx-close-btn')?.addEventListener('click', () => closeLightbox());
// Galleria: event delegation (click + tastiera) sulle card
document.getElementById('photo-grid')?.addEventListener('click', (e) => {
const card = e.target.closest('.photo-card');
if (!card) return;
const idx = Number(card.dataset.photoIndex);
if (Number.isInteger(idx)) openLightbox(idx);
});
document.getElementById('photo-grid')?.addEventListener('keydown', (e) => {
if (e.key !== 'Enter' && e.key !== ' ') return;
const card = e.target.closest('.photo-card');
if (!card) return;
e.preventDefault();
const idx = Number(card.dataset.photoIndex);
if (Number.isInteger(idx)) openLightbox(idx);
});
// Map toggle
const mapContainer = document.getElementById('lightbox-map-container');
const mapToggleBtn = document.getElementById('map-toggle-btn');
mapToggleBtn.innerHTML = mapToggleButtonContent(false);
mapToggleBtn.setAttribute('aria-label', 'Chiudi mappa');
mapToggleBtn.setAttribute('title', 'Chiudi mappa');
function toggleMap(e) {
if (e) e.stopPropagation();
const isMinimized = mapContainer.classList.toggle('minimized');
mapToggleBtn.innerHTML = mapToggleButtonContent(isMinimized);
mapToggleBtn.setAttribute('aria-label', isMinimized ? 'Apri mappa' : 'Chiudi mappa');
mapToggleBtn.setAttribute('title', isMinimized ? 'Apri mappa' : 'Chiudi mappa');
if (!isMinimized) {
ensureLightboxMap(photosData[currentLightboxIndex]);
setTimeout(() => {
if (mapLightbox) mapLightbox.invalidateSize();
}, 300); // Wait for transition
}
}
mapToggleBtn.addEventListener('click', toggleMap);
// Expand when clicking on minimized container
mapContainer.addEventListener('click', (e) => {
if (mapContainer.classList.contains('minimized')) {
toggleMap(e);
}
});
// Auto-minimize on mobile
if (window.innerWidth <= 768) {
mapContainer.classList.add('minimized');
mapToggleBtn.innerHTML = mapToggleButtonContent(true);
mapToggleBtn.setAttribute('aria-label', 'Apri mappa');
mapToggleBtn.setAttribute('title', 'Apri mappa');
}
// Keyboard navigation
document.addEventListener('keydown', (e) => {
const welcomeOpen = !document.getElementById('welcome-overlay')?.classList.contains('d-none');
const helpOpen = !document.getElementById('nav-help-overlay')?.classList.contains('d-none');
if (welcomeOpen && e.key === 'Escape') {
dismissWelcome(false);
return;
}
if (helpOpen && e.key === 'Escape') {
closeNavHelp();
return;
}
if (currentView !== 'photo') return;
if (isPanoramaxZoomOpen()) {
if (e.key === 'Escape') closePanoramaxZoom();
return;
}
if (e.key === 'Escape') closeLightbox();
if (e.key === 'ArrowLeft') navigateLightbox(-1);
if (e.key === 'ArrowRight') navigateLightbox(1);
if (e.key === 'm' || e.key === 'M') toggleMap();
});
// Zoom & Swipe nel lightbox (desktop + mobile)
const imageContainer = document.querySelector('.lightbox-image-container');
const imgElement = document.getElementById('lightbox-image');
// Zoom State
let scale = 1;
let pointX = 0;
let pointY = 0;
let startX = 0;
let startY = 0;
let isDragging = false;
let startDist = 0;
let pinchMid = null;
// Swipe Navigation State
let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
let swipeMoved = false;
let lastTapTime = 0;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
// Coordinate relative al centro del container (transform-origin: center)
function containerPoint(clientX, clientY) {
const r = imageContainer.getBoundingClientRect();
return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
}
// Zoom mantenendo fisso il punto focale sotto cursore/dita
function zoomAt(focal, newScale) {
newScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
if (newScale === scale) return;
const k = newScale / scale;
pointX = focal.x + (pointX - focal.x) * k;
pointY = focal.y + (pointY - focal.y) * k;
scale = newScale;
updateImageTransform();
}
function toggleZoomAt(focal) {
zoomAt(focal, scale > 1.05 ? 1 : DOUBLE_TAP_SCALE);
}
// Target dello zoom: canvas WebGL quando il morph-viewer e attivo, altrimenti <img>.
function morphCanvas() {
return imageContainer.querySelector('.morph-viewer-canvas.is-active');
}
function zoomTarget() {
return morphCanvas() || imgElement;
}
function updateZoomCursor() {
imageContainer.classList.toggle('is-zoomed', scale > 1);
}
// Prevent default touch behavior to stop scrolling/zooming the whole page
imageContainer.addEventListener('gesturestart', (e) => e.preventDefault());
imageContainer.addEventListener('gesturechange', (e) => e.preventDefault());
imageContainer.addEventListener('gestureend', (e) => e.preventDefault());
imageContainer.addEventListener('touchstart', (e) => {
if (e.touches.length === 2) {
// Pinch to Zoom handling
e.preventDefault(); // Prevent page zoom
isDragging = false;
startDist = Math.hypot(
e.touches[0].clientX - e.touches[1].clientX,
e.touches[0].clientY - e.touches[1].clientY
);
pinchMid = containerPoint(
(e.touches[0].clientX + e.touches[1].clientX) / 2,
(e.touches[0].clientY + e.touches[1].clientY) / 2
);
} else if (e.touches.length === 1) {
// Single finger touch - could be pan (if zoomed) or swipe (if not)
startX = e.touches[0].pageX;
startY = e.touches[0].pageY;
swipeStartX = startX;
swipeStartY = startY;
swipeStartTime = Date.now();
swipeMoved = false;
isDragging = true;
}
}, { passive: false }); // passive: false needed for preventDefault
imageContainer.addEventListener('touchmove', (e) => {
if (e.touches.length === 2) {
// Pinching (zoom sul punto medio delle dita)
e.preventDefault();
const dist = Math.hypot(
e.touches[0].clientX - e.touches[1].clientX,
e.touches[0].clientY - e.touches[1].clientY
);
if (startDist > 0) {
const newScale = scale * (dist / startDist);
zoomAt(pinchMid, newScale);
}
startDist = dist;
} else if (e.touches.length === 1 && isDragging) {
// Panning or Swiping
const x = e.touches[0].pageX;
const y = e.touches[0].pageY;
const deltaX = x - startX;
const deltaY = y - startY;
if (Math.abs(x - swipeStartX) > 8 || Math.abs(y - swipeStartY) > 8) swipeMoved = true;
if (scale > 1) {
// If zoomed in, Pan
e.preventDefault();
pointX += deltaX;
pointY += deltaY;
updateImageTransform();
} else {
// Check if it's a horizontal swipe for navigation
// allow vertical scrolling of page if needed (though lightbox is fixed)
if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
e.preventDefault(); // Lock scroll if horizontal swipe
}
}
startX = x;
startY = y;
}
}, { passive: false });
imageContainer.addEventListener('touchend', (e) => {
if (e.touches.length === 2) return; // ancora in pinch
if (e.touches.length === 1) { startDist = 0; return; } // transizione pinch→pan
isDragging = false;
startDist = 0;
if (scale > 1) {
// Zoom attivo: tap rapido senza movimento = possibile doppio-tap
if (!swipeMoved && Date.now() - swipeStartTime < 300) {
const now = Date.now();
const tap = e.changedTouches[0];
if (now - lastTapTime < 350) {
toggleZoomAt(containerPoint(tap.clientX, tap.clientY));
lastTapTime = 0;
} else {
lastTapTime = now;
}
}
} else {
// Not zoomed, check for swipe navigation or doppio-tap
const deltaX = startX - swipeStartX;
const deltaY = startY - swipeStartY;
const isTap = !swipeMoved && Date.now() - swipeStartTime < 300;
if (isTap) {
const now = Date.now();
const tap = e.changedTouches[0];
if (now - lastTapTime < 350) {
toggleZoomAt(containerPoint(tap.clientX, tap.clientY));
lastTapTime = 0;
} else {
lastTapTime = now;
}
} else if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
if (deltaX < 0) navigateLightbox(1);
else navigateLightbox(-1);
}
}
});
// MOUSE EVENTS FOR DESKTOP
// Wheel to zoom (verso il cursore)
imageContainer.addEventListener('wheel', (e) => {
e.preventDefault();
const delta = -Math.sign(e.deltaY) * 0.25;
zoomAt(containerPoint(e.clientX, e.clientY), scale + delta);
}, { passive: false });
// Doppio click: toggle zoom sul punto cliccato
imageContainer.addEventListener('dblclick', (e) => {
e.preventDefault();
toggleZoomAt(containerPoint(e.clientX, e.clientY));
});
// Mouse Drag to Pan
imageContainer.addEventListener('mousedown', (e) => {
if (scale > 1) {
isDragging = true;
startX = e.clientX;
startY = e.clientY;
e.preventDefault(); // Prevent default drag behavior
}
});
imageContainer.addEventListener('mousemove', (e) => {
if (isDragging && scale > 1) {
e.preventDefault();
const deltaX = e.clientX - startX;
const deltaY = e.clientY - startY;
pointX += deltaX;
pointY += deltaY;
startX = e.clientX;
startY = e.clientY;
updateImageTransform();
}
});
imageContainer.addEventListener('mouseup', () => {
isDragging = false;
});
imageContainer.addEventListener('mouseleave', () => {
isDragging = false;
});
// Dimensione del contenuto visualizzato (object-fit: contain nel container)
function fittedContentSize() {
const cw = imageContainer.offsetWidth;
const ch = imageContainer.offsetHeight;
const photo = lightboxDisplayedPhoto;
if (photo?.width && photo?.height && cw && ch) {
const k = Math.min(cw / photo.width, ch / photo.height);
return { w: photo.width * k, h: photo.height * k };
}
return { w: cw, h: ch };
}
// Helper to update transform
function updateImageTransform() {
const { w, h } = fittedContentSize();
const imgWidth = w * scale;
const imgHeight = h * scale;
const containerWidth = imageContainer.offsetWidth;
const containerHeight = imageContainer.offsetHeight;
// Calculate max offsets (from center)
// If image is smaller than container effectively, max offset is 0 (keep centered)
// If image is larger, max offset is (imgDim - containerDim) / 2
const maxOffsetX = Math.max(0, (imgWidth - containerWidth) / 2);
const maxOffsetY = Math.max(0, (imgHeight - containerHeight) / 2);
// Clamp
pointX = Math.max(-maxOffsetX, Math.min(pointX, maxOffsetX));
pointY = Math.max(-maxOffsetY, Math.min(pointY, maxOffsetY));
const t = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
const target = zoomTarget();
target.style.transform = t;
// Pulisci l'altro layer se presente
if (target !== imgElement) imgElement.style.transform = '';
updateZoomCursor();
}
// Helper to reset zoom
window.resetZoom = function () {
scale = 1;
pointX = 0;
pointY = 0;
imgElement.style.transform = '';
const canvas = morphCanvas();
if (canvas) canvas.style.transform = '';
updateZoomCursor();
}
// Reset zoom when opening/changing photo
// Hook into existing functions by adding calls or overriding
const originalUpdateLightboxContent = updateLightboxContent;
updateLightboxContent = function (photo, options = {}) {
if (window.resetZoom) window.resetZoom();
originalUpdateLightboxContent(photo, options);
};
});