// Integrazione morph viewer (transizioni WebGL)
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
const mod = await import('../vendor/morph-viewer/morph-viewer.js?v=c8da99ac');
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
