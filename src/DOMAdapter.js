// Скрипт для поиска новых селекторов в Suno 2.0
(function findSelectors() {
    const track = document.querySelector('[data-track-header]');
    if (!track) { console.log('Треки не найдены'); return; }
    
    const thumb = track.querySelector('[style*="left"]');
    const fill = track.querySelector('[style*="width"]');
    const name = track.querySelector('span[role="button"]');
    
    console.log('Новые селекторы:');
    console.log('  trackHeader: [data-track-header]'); // обычно не меняется
    if (thumb) console.log('  thumb:', thumb.className);
    if (fill) console.log('  fill:', fill.className);
    if (name) console.log('  trackName:', name.className);
})();