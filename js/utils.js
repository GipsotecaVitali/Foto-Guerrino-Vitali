// Utility generiche: label, meta, icone, colori, geo, toast
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
// Lo scroll animato programmatico non viene disattivato dalla regola CSS
// scroll-behavior: rispettiamo prefers-reduced-motion anche qui.
const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
document.getElementById('gallery-view')?.scrollTo({ top: 0, behavior });
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
function isMobileViewport() {
return window.matchMedia('(max-width: 768px)').matches;
}
function mapToggleButtonContent(isMinimized) {
return isMinimized
? '<span class="map-toggle-symbol map-toggle-plus" aria-hidden="true"></span>'
: '<span class="map-toggle-symbol map-toggle-minus" aria-hidden="true"></span>';
}
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
function sameLightboxSrc(imgElement, src) {
if (!imgElement || !src) return false;
const cur = imgElement.currentSrc || imgElement.src || '';
return cur === src || cur.endsWith(src) || cur.includes(src);
}
function afterPaint(cb) {
requestAnimationFrame(() => requestAnimationFrame(cb));
}
