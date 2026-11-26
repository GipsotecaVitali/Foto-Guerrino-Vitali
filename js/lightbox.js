// Lightbox/photo view: apertura, navigazione, transizioni immagini
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
} catch (err) {
console.warn('decode() immagine fallito (file corrotto o formato non supportato):', photo?.display, err);
}
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
