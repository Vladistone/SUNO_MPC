// Пример логики динамического выбора версии внутри src/core/bridge.js
const fs = require('fs');
const path = require('path');

function loadSelectors(studioVersion) {
    const fileName = studioVersion === 2 ? 'selectors_v2.json' : 'selectors_v1.json';
    const configPath = path.join(__dirname, '../../config', fileName);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}