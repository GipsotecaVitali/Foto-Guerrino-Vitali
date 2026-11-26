// Rendering galleria masonry
// Renderizza galleria con Bootstrap Cards
function renderGallery() {
const grid = document.getElementById('photo-grid');
const photosToShow = visiblePhotos();
if (photosToShow.length === 0) {
const q = normalizeSearchQuery(activeSearchQuery);
const msg = q
? `Nessuna foto trovata per “${escapeHtml(activeSearchQuery.trim())}”.`
: (activeZoneFilter ? 'Nessuna foto in questa zona' : 'Nessuna foto con GPS trovata');
grid.innerHTML = `<div class="masonry-item"><div class="alert alert-warning text-center">${msg}</div></div>`;
return;
}
const html = photosToShow.map((photo, seqIndex) => {
const originalIndex = photosData.indexOf(photo);
const label = photoLabel(photo, seqIndex + 1);
const safeLabel = escapeHtml(label);
const aspectStyle = photo.width && photo.height
? ` style="aspect-ratio: ${photo.width} / ${photo.height};"`
: '';
return `
<div class="masonry-item" role="listitem">
<div class="card photo-card shadow-sm" data-photo-index="${originalIndex}"
role="button" tabindex="0" aria-label="${safeLabel}">
<img src="${photo.thumb}" alt="${safeLabel}" loading="lazy"${aspectStyle}>
<div class="card-body photo-card-body p-2">
<div class="photo-card-label mb-1">${safeLabel}</div>
<div class="photo-card-meta d-flex flex-wrap gap-1">
${photo.cluster_id ? (() => {
const zc = clusterColor(photo.cluster_id);
return `<span class="badge" style="background:${zc};color:${zoneChipTextColor(zc)}">${escapeHtml(zoneLabel(photo.cluster_id))}</span>`;
})() : ''}
<span class="badge bg-success">GPS</span>
${photo.direction !== null && photo.direction !== undefined ?
`<span class="badge bg-info">${Math.round(photo.direction)}°</span>` : ''}
</div>
</div>
</div>
</div>
`;
}).join('');
grid.innerHTML = html;
updateSearchCountUI();
}
