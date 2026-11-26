// UI accessoria: hero, welcome, help, condivisione
function updateMapHero(data) {
const hero = document.getElementById('map-hero');
if (!hero) return;
if (localStorage.getItem(MAP_HERO_STORAGE_KEY)) {
hero.classList.add('map-hero--hidden');
return;
}
hero.classList.remove('map-hero--hidden');
const gpsPhotos = data?.photos?.filter(p => p.has_gps).length ?? photosWithGps().length;
const zones = new Set((data?.photos || photosData).filter(p => p.has_gps && p.cluster_id).map(p => p.cluster_id));
const photoCountEl = document.getElementById('hero-photo-count');
const zoneCountEl = document.getElementById('hero-zone-count');
const kmEl = document.getElementById('hero-tour-km');
if (photoCountEl) photoCountEl.textContent = gpsPhotos;
if (zoneCountEl) zoneCountEl.textContent = zones.size;
if (kmEl) {
kmEl.textContent = lkhTourMeta?.length_m
? `~${(lkhTourMeta.length_m / 1000).toFixed(1)} km`
: '—';
}
}
function dismissMapHero() {
localStorage.setItem(MAP_HERO_STORAGE_KEY, '1');
document.getElementById('map-hero')?.classList.add('map-hero--hidden');
}
function maybeShowWelcome(hash) {
if (localStorage.getItem(WELCOME_STORAGE_KEY)) return;
if (PHOTO_HASH_RE.test(hash) || MAP_HASH_RE.test(hash)) return;
const overlay = document.getElementById('welcome-overlay');
if (!overlay) return;
overlay.classList.remove('d-none');
releaseWelcomeFocus?.();
releaseWelcomeFocus = trapFocus(overlay);
}
function dismissWelcome(persist = true) {
const overlay = document.getElementById('welcome-overlay');
releaseWelcomeFocus?.();
releaseWelcomeFocus = null;
if (overlay) overlay.classList.add('d-none');
if (persist) localStorage.setItem(WELCOME_STORAGE_KEY, '1');
}
function openNavHelp() {
const overlay = document.getElementById('nav-help-overlay');
if (!overlay) return;
overlay.classList.remove('d-none');
releaseHelpFocus?.();
releaseHelpFocus = trapFocus(overlay);
}
function closeNavHelp() {
const overlay = document.getElementById('nav-help-overlay');
releaseHelpFocus?.();
releaseHelpFocus = null;
overlay?.classList.add('d-none');
}
async function copyPhotoLink() {
const url = window.location.href;
try {
await navigator.clipboard.writeText(url);
showToast('Link copiato negli appunti');
} catch (err) {
console.warn('Copia negli appunti fallita:', err);
showToast('Impossibile copiare il link');
}
}
