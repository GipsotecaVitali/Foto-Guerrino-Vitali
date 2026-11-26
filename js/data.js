// Caricamento dati: photos.json, grafo transizioni, tour LKH
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
} catch (err) {
console.warn('transition_graph.json non caricato: viste correlate disattivate.', err);
}
}
function transitionEdgeFor(fromId, toId) {
return transitionEdges.get(morphKey(fromId, toId)) || null;
}
// Carica dati
async function loadPhotos() {
try {
// I tre fetch partono in parallelo: grafo e tour non dipendono da photos.json in rete,
// la loro elaborazione attende solo photosData gia' caricato.
const graphPromise = loadTransitionGraph();
const lkhFetchPromise = fetch('dati/lkh_tour.json', { cache: 'no-cache' })
.catch((err) => {
console.warn('lkh_tour.json non caricato: navigazione tour in ordine ottimale disattivata.', err);
return null;
});
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
await graphPromise;
// Try to load LKH precomputed tour (non-blocking)
try {
const lkhRes = await lkhFetchPromise;
if (lkhRes && lkhRes.ok) {
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
} catch (err) {
console.warn('lkh_tour.json non caricato: navigazione tour in ordine ottimale disattivata.', err);
}
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
const grid = document.getElementById('photo-grid');
if (grid) {
grid.innerHTML = '<div class="masonry-item"><div class="alert alert-danger text-center" role="alert">'
+ 'Impossibile caricare l\'archivio fotografico. Ricarica la pagina; se il problema persiste, i dati potrebbero essere mancanti.'
+ '</div></div>';
}
showToast('Errore di caricamento dati');
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
