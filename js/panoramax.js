// Integrazione Panoramax (API + viewer Pannellum)
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
} catch (err) {
console.warn('Ricerca Panoramax fallita (rete o API non raggiungibile):', err);
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
} catch (err) {
console.warn('Errore chiusura viewer Panoramax:', err);
}
panoramaxPannellumViewer = null;
}
}
function closePanoramaxZoom() {
destroyPanoramaxPannellum();
releasePanoramaxFocus?.();
releasePanoramaxFocus = null;
document.getElementById('panoramax-zoom')?.classList.add('d-none');
}
function ensurePannellum() {
if (typeof pannellum !== 'undefined') return Promise.resolve();
if (pannellumLoadingPromise) return pannellumLoadingPromise;
const CDN = 'vendor/pannellum';
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
