// Ricerca testuale e filtri
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
