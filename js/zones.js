// Barra zone e notifiche di cambio zona
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
