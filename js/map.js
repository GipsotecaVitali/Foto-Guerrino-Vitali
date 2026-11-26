// Mappe Leaflet: init, marker, tile, permalink
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
// Cambia tipo mappa
function switchMapType(type) {
currentMapType = type;
updateMapTiles(map);
if (mapLightbox) updateMapTiles(mapLightbox);
}
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
