// Bootstrap: listener DOMContentLoaded e hashchange
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
