// Tour ottimizzato LKH: polyline, progress, autoplay
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
function startTourFromWelcome() {
const first = tourNavOrder()[0];
if (first) openLightbox(photosData.indexOf(first));
}
