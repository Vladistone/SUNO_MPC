/**
 * ====================================================================
 * CONTROL SURFACE ENGINE (CSE) - WEBIF CORE ENGINE JAVASCRIPT LAYER
 * rev: 3.5 (control by custom ID script)
 * Project: SUNO_MPC by Vladistone (modular)
 * ====================================================================
 */

// 1. Глобальный стек состояний оперативной памяти WebIF
let selectedId = "";
let repository = {};            // Чистый рабочий JSON-объект текущего прибора
let originalDataBackup = {};    // "Золотой эталон" с диска для сброса 4K правок

let undoStack = [];
let redoStack = [];
let isOperatingHistory = false;
let hasUnsavedChanges = false;

// 2. Динамический рендеринг списка репозитория прямо из текстовых файлов папки map/
async function renderDeviceList() {
    try {
        const response = await fetch('/api/devices');
        const txtFilesList = await response.json();
        
        const container = document.getElementById('device-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        txtFilesList.forEach(fileName => {
            const item = document.createElement('div');
            const devId = fileName.replace('.txt', '');
            
            let brandClass = 'brand-generic';
            if (fileName.toLowerCase().includes('ssl') || fileName.toLowerCase().includes('nucleus')) brandClass = 'brand-ssl';
            if (fileName.toLowerCase().includes('nektar') || fileName.toLowerCase().includes('impact') || fileName.toLowerCase().includes('lx')) brandClass = 'brand-nektar';
            if (fileName.toLowerCase().includes('roli') || fileName.toLowerCase().includes('seaboard')) brandClass = 'brand-roli';
            if (fileName.toLowerCase().includes('mackie')) brandClass = 'brand-mackie';

            item.className = `device-item ${brandClass} ${devId.toLowerCase() === selectedId.toLowerCase() ? 'active' : ''}`;
            item.onclick = () => selectDevice(devId);
            
            item.innerHTML = `
                <div style="display:flex; flex-direction:column; width:100%; overflow:hidden; z-index:2;">
                    <span style="font-weight:bold; font-size:11px; text-overflow:ellipsis; white-space:nowrap; overflow:hidden;">${devId.toUpperCase()}</span>
                    <span style="font-size:9px; opacity:0.7; font-family:monospace; margin-top:2px;">${fileName}</span>
                </div>
            `;
            container.appendChild(item);
        });
        
        const statsEl = document.getElementById('repo-stats');
        if (statsEl) statsEl.innerText = `Файлов в пуле: ${txtFilesList.length}`;
    } catch (err) {
        console.error("Ошибка обновления пула:", err);
    }
}

// 3. Загрузка конкретного модуля с диска и сквозной маппинг по ID
async function selectDevice(id) {
    selectedId = id;
    const items = document.querySelectorAll('.device-item');
    items.forEach(item => item.classList.remove('active'));
    
    const activeItem = Array.from(items).find(item => item.innerHTML.toLowerCase().includes(`${id.toLowerCase()}.txt`));
    if (activeItem) activeItem.classList.add('active');

    try {
        const response = await fetch(`/api/devices/${id}`);
        if (!response.ok) throw new Error('Файл не найден на сервере');
        const deviceData = await response.json(); 

        originalDataBackup = JSON.parse(JSON.stringify(deviceData));
        repository = deviceData;

        clearDirtyStates();
        
        // Перебираем базовые ключи-ID из .txt файла
        Object.keys(deviceData).forEach(idKey => {
            const cell = deviceData[idKey];
            if (!cell) return;
            // Соответствие ID полей 1-READ, 2-WRITE, 3-REC, 4-TOUCH и т.д.
            if (idKey === '6.18.0') {
                const activeModes = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_6.18.1')) document.getElementById('field_6.18.1').checked = activeModes.includes('READ');
                if(document.getElementById('field_6.18.2')) document.getElementById('field_6.18.2').checked = activeModes.includes('WRITE');
                if(document.getElementById('field_6.18.3')) document.getElementById('field_6.18.3').checked = activeModes.includes('REC');
                if(document.getElementById('field_6.18.4')) document.getElementById('field_6.18.4').checked = activeModes.includes('TOUCH');
                if(document.getElementById('field_6.18.5')) document.getElementById('field_6.18.5').checked = activeModes.includes('LATCH');
                if(document.getElementById('field_6.18.6')) document.getElementById('field_6.18.6').checked = activeModes.includes('TRIM');
                return;
            }
            // Обработка MMC_ALT 6.19.0
            if (idKey === '6.19.0') {
                const mmcAltArray = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_6.19.1')) document.getElementById('field_6.19.1').checked = mmcAltArray.includes('RTZ');
                if(document.getElementById('field_6.19.2')) document.getElementById('field_6.19.2').checked = mmcAltArray.includes('END');
                if(document.getElementById('field_6.19.3')) document.getElementById('field_6.19.3').checked = mmcAltArray.includes('LOOP');
                return;
            }
            /*вариант с Radio-btn
            if (idKey === '6.19.0') {
                const radioVal = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_6.19.1')) document.getElementById('field_6.19.1').checked (radioVal === 'RTZ');
                if(document.getElementById('field_6.19.2')) document.getElementById('field_6.19.2').checked (radioVal === 'END');
                if(document.getElementById('field_6.19.3')) document.getElementById('field_6.19.3').checked (radioVal === 'LOOP');
                return;
            }
            */
            // Обработка составного блока чекбоксов MMC 6.20.0
            if (idKey === '6.20.0') {
                const mmcArray = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_6.20.1')) document.getElementById('field_6.20.1').checked = mmcArray.includes('STOP');
                if(document.getElementById('field_6.20.2')) document.getElementById('field_6.20.2').checked = mmcArray.includes('PLAY');
                if(document.getElementById('field_6.20.3')) document.getElementById('field_6.20.3').checked = mmcArray.includes('REC');
                if(document.getElementById('field_6.20.4')) document.getElementById('field_6.20.4').checked = mmcArray.includes('PREV');
                if(document.getElementById('field_6.20.5')) document.getElementById('field_6.20.5').checked = mmcArray.includes('NEXT');
                if(document.getElementById('field_6.20.6')) document.getElementById('field_6.20.6').checked = mmcArray.includes('CYCLE');
                return;
            }
            // Обработка составного блока чекбоксов MCU 7.13.0
            if (idKey === '7.13.0') {
                const mcuArray = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_7.13.1')) document.getElementById('field_7.13.1').checked = mcuArray.includes('INSTR');
                if(document.getElementById('field_7.13.2')) document.getElementById('field_7.13.2').checked = mcuArray.includes('PLUGIN');
                if(document.getElementById('field_7.13.3')) document.getElementById('field_7.13.3').checked = mcuArray.includes('EQ');
                if(document.getElementById('field_7.13.4')) document.getElementById('field_7.13.4').checked = mcuArray.includes('PAN');
                if(document.getElementById('field_7.13.5')) document.getElementById('field_7.13.5').checked = mcuArray.includes('SEND');
                if(document.getElementById('field_7.13.6')) document.getElementById('field_7.13.6').checked = mcuArray.includes('TRACK');
                return;
            }
            // Обработка составного блока чекбоксов HUI 7.14.0
            if (idKey === '7.14.0') {
                const huiArray = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_7.14.1')) document.getElementById('field_7.14.1').checked = huiArray.includes('DFLT');
                if(document.getElementById('field_7.14.2')) document.getElementById('field_7.14.2').checked = huiArray.includes('MUTE');
                if(document.getElementById('field_7.14.3')) document.getElementById('field_7.14.3').checked = huiArray.includes('PAN');
                if(document.getElementById('field_7.14.4')) document.getElementById('field_7.14.4').checked = huiArray.includes('A.SEND');
                if(document.getElementById('field_7.14.5')) document.getElementById('field_7.14.5').checked = huiArray.includes('B.SEND');
                if(document.getElementById('field_7.14.6')) document.getElementById('field_7.14.6').checked = huiArray.includes('C.SEND');
                if(document.getElementById('field_7.14.5')) document.getElementById('field_7.14.5').checked = huiArray.includes('D.SEND');
                if(document.getElementById('field_7.14.6')) document.getElementById('field_7.14.6').checked = huiArray.includes('E.SEND');    
                return;
            }
            // Стандартный автоматический маппинг одиночных полей формы
            const el = document.getElementById(`field_${idKey}`);
            if (!el) return;
            
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = (cell.value === true || String(cell.value).toLowerCase() === 'true');
            } else {
                el.value = Array.isArray(cell.value) ? cell.value.join(', ') : (cell.value !== null ? cell.value : '');
            }
        });

        undoStack = []; redoStack = []; // Очистка буфера истории при переключении
        updateUndoRedoButtons();
        recalculateDirtyStates();
        bindContextDocumentationListeners(); // Активация живого правого сайдбара
    } catch (err) {
        console.error("Крах маппинга:", err);
    // КРИТИЧЕСКИЙ FIX: останавливаем дальнейший рендеринг сломанных данных
    return; 
    }
}

// 4. Обновление простого текстового или числового поля ввода по ID
function updateField(idKey, value) {
    if (!repository || !repository[idKey]) return;
    
    if (repository[idKey].value !== value) {
        if (!isOperatingHistory) {
            undoStack.push(JSON.stringify(repository));
            redoStack = [];
        }
        
        repository[idKey].value = value;
        hasUnsavedChanges = true;
        
        // Живой апдейт сайдбара при редактировании паспорта
        if (idKey === '1.2.0' || idKey === '1.3.0') renderDeviceList();
        
        recalculateDirtyStates();
    }
}

// 5. Обновление массивов (перечислений через запятую)
function updateArrayField(idKey, value) {
    if (!repository || !repository[idKey]) return;
    if (!isOperatingHistory) {
        undoStack.push(JSON.stringify(repository));
        redoStack = [];
    }
    repository[idKey].value = value.split(',').map(s => s.trim()).filter(s => s !== '');
    hasUnsavedChanges = true;
    recalculateDirtyStates();
}
// 6. Интеллектуальный расчет dirty-состояний и управление кнопками UNDO/REDO на 4K
function recalculateDirtyStates() {
    if (!repository || !originalDataBackup) return;
    hasUnsavedChanges = false;
    
    Object.keys(repository).forEach(idKey => {
        const el = document.getElementById(`field_${idKey}`);
        if (!el) return;
        const row = el.closest('.form-row');
        if (!row) return;

        let isEdited = false;
        const currentCell = repository[idKey];
        const baseCell = originalDataBackup[idKey];

        if (currentCell && baseCell) {
            if (Array.isArray(currentCell.value)) {
                const currentStr = currentCell.value.join(', ');
                const baseStr = Array.isArray(baseCell.value) ? baseCell.value.join(', ') : '';
                isEdited = currentStr !== baseStr;
            } else {
                const currentVal = currentCell.value !== null ? currentCell.value : '';
                const baseVal = baseCell.value !== null ? baseCell.value : '';
                isEdited = String(currentVal) !== String(baseVal);
            }
        }

        if (isEdited) {
            row.classList.add('is-dirty');
            hasUnsavedChanges = true; 
        } else {
            row.classList.remove('is-dirty');
        }
    });
    
    updateUndoRedoButtons();
}

// 7. Сохранение изменений обратно в 3-колоночный .txt на сервере
async function exportToTXT() {
    if (!repository || Object.keys(repository).length === 0) return;
    const dev = repository; 

    Object.keys(dev).forEach(idKey => {
        
        // Сборка составного блока AUTOMATION 6.18.0
        if (idKey === '6.18.0') {
            const automationArray = [];
            if (document.getElementById('field_6.18.1') && document.getElementById('field_6.18.1').checked) automationArray.push('READ');
            if (document.getElementById('field_6.18.2') && document.getElementById('field_6.18.2').checked) automationArray.push('WRITE');
            if (document.getElementById('field_6.18.3') && document.getElementById('field_6.18.3').checked) automationArray.push('REC');
            if (document.getElementById('field_6.18.4') && document.getElementById('field_6.18.4').checked) automationArray.push('TOUCH');
            if (document.getElementById('field_6.18.5') && document.getElementById('field_6.18.5').checked) automationArray.push('LATCH');
            if (document.getElementById('field_6.18.6') && document.getElementById('field_6.18.6').checked) automationArray.push('TRIM');
            dev[idKey].value = automationArray.join(', ');
            return;
        }
        // Сборка составного блока MMC_ALT 6.19.0
        if (idKey === '6.19.0') {
            let mmcAltArray = [];
            if (document.getElementById('field_6.19.1') && document.getElementById('field_6.19.1').checked) mmcAltArray.push('RTZ');
            if (document.getElementById('field_6.19.2') && document.getElementById('field_6.19.2').checked) mmcAltArray.push('END');
            if (document.getElementById('field_6.19.3') && document.getElementById('field_6.19.3').checked) mmcAltArray.push('LOOP');
            dev[idKey].value = mmcAltArray.join(', ');
            return;
        }
/*        // Сборка составного блока Radio_btn 6.19.0
        if (idKey === '6.19.0') {
            let radioVal = [];
            if (document.getElementById('field_6.19.1') && document.getElementById('field_6.19.1').checked) radioVal = 'RTZ';
            if (document.getElementById('field_6.19.2') && document.getElementById('field_6.19.2').checked) radioVal = 'END';
            if (document.getElementById('field_6.19.3') && document.getElementById('field_6.19.3').checked) radioVal = 'LOOP';
            dev[idKey].value = radioVal.join(', ');
            return;
        }
        */
        // Сборка составного блока MMC 6.20.0
        if (idKey === '6.20.0') {
            const mmcArray = [];
            if (document.getElementById('field_6.20.1') && document.getElementById('field_6.20.1').checked) mmcArray.push('STOP');
            if (document.getElementById('field_6.20.2') && document.getElementById('field_6.20.2').checked) mmcArray.push('PLAY');
            if (document.getElementById('field_6.20.3') && document.getElementById('field_6.20.3').checked) mmcArray.push('REC');
            if (document.getElementById('field_6.20.4') && document.getElementById('field_6.20.4').checked) mmcArray.push('PREV');
            if (document.getElementById('field_6.20.5') && document.getElementById('field_6.20.5').checked) mmcArray.push('NEXT');
            if (document.getElementById('field_6.20.6') && document.getElementById('field_6.20.6').checked) mmcArray.push('CYCLE');
            dev[idKey].value = mmcArray.join(', ');
            return;
        }
        // Сборка составного блока MCU 7.13.0
        if (idKey === '7.13.0') {
            const mcuArray = [];
            if (document.getElementById('field_7.13.1') && document.getElementById('field_7.13.1').checked) mcuArray.push('INSTR');
            if (document.getElementById('field_7.13.2') && document.getElementById('field_7.13.2').checked) mcuArray.push('PLUGIN');
            if (document.getElementById('field_7.13.3') && document.getElementById('field_7.13.3').checked) mcuArray.push('EQ');
            if (document.getElementById('field_7.13.4') && document.getElementById('field_7.13.4').checked) mcuArray.push('PAN');
            if (document.getElementById('field_7.13.5') && document.getElementById('field_7.13.5').checked) mcuArray.push('SEND');
            if (document.getElementById('field_7.13.6') && document.getElementById('field_7.13.6').checked) mcuArray.push('TRACK');
            dev[idKey].value = mcuArray.join(', ');
            return;
        }
        // Сборка составного блока HUI 7.14.0
        if (idKey === '7.14.0') {
            const huiArray = [];
            if (document.getElementById('field_7.14.1') && document.getElementById('field_7.14.1').checked) huiArray.push('DFLT');
            if (document.getElementById('field_7.14.2') && document.getElementById('field_7.14.2').checked) huiArray.push('MUTE');
            if (document.getElementById('field_7.14.3') && document.getElementById('field_7.14.3').checked) huiArray.push('PAN');
            if (document.getElementById('field_7.14.4') && document.getElementById('field_7.14.4').checked) huiArray.push('A.SEND');
            if (document.getElementById('field_7.14.5') && document.getElementById('field_7.14.5').checked) huiArray.push('B.SEND');
            if (document.getElementById('field_7.14.6') && document.getElementById('field_7.14.6').checked) huiArray.push('C.SEND');
            if (document.getElementById('field_7.14.5') && document.getElementById('field_7.14.5').checked) huiArray.push('D.SEND');
            if (document.getElementById('field_7.14.6') && document.getElementById('field_7.14.6').checked) huiArray.push('E.SEND');
            dev[idKey].value = huiArray.join(', ');
            return;
        }
        // Стандартный маппинг остальных одиночных полей
        const el = document.getElementById(`field_${idKey}`);
        if (!el) return;
        
        if (el.type === 'checkbox' || el.type === 'radio') {
            dev[idKey].value = el.checked;
        } else {
            dev[idKey].value = el.value.trim();
        }
    });

    // Теперь блок отправки находится вне цикла, на уровне async функции, и await работает легально!
    try {
        const response = await fetch(`/api/devices/${selectedId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dev)
        });
        if (response.ok) {
            hasUnsavedChanges = false;
            originalDataBackup = JSON.parse(JSON.stringify(dev));
            recalculateDirtyStates();
        }
    } catch (err) {
        console.error("Ошибка сохранения:", err);
    }
}

// 8. Логика истории Undo / Redo
function undoAction() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(repository));
    isOperatingHistory = true;
    repository = JSON.parse(undoStack.pop());
    restoreFormFields(repository);
}

function redoAction() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(repository));
    isOperatingHistory = true;
    repository = JSON.parse(redoStack.pop());
    restoreFormFields(repository);
}

function restoreFormFields(data) {
    isOperatingHistory = true;
    selectDevice(selectedId); // Мгновенный перезапуск маппинга текущего состояния
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function clearDirtyStates() {
    document.querySelectorAll('.form-row.is-dirty').forEach(r => r.classList.remove('is-dirty'));
}

// 10. Клонирование таблицы mapping прибора
async function cloneDevice() {
    if (!repository) return;
    const clone = JSON.parse(JSON.stringify(repository));
    const shortTimestamp = Date.now().toString().slice(-4);
    
    const oldId = clone['1.2.0'] ? clone['1.2.0'].value : "generic";
    const newId = `${oldId}-clone-${shortTimestamp}`.toLowerCase();
    
    if(clone['1.2.0']) clone['1.2.0'].value = newId;
    if(clone['1.3.0']) clone['1.3.0'].value = `${clone['1.3.0'].value || "Controller"} (Clone)`;

    const response = await fetch(`/api/devices/${newId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clone)
    });
    if (response.ok) {
        await renderDeviceList();
        selectedId = newId;
        await selectDevice(selectedId);
    }
}

// 11. Инициализация при старте страницы
async function initWebInterface() {
    await renderDeviceList();
    const firstItem = document.querySelector('.device-item');
    if (firstItem) {
        // Парсим имя первого файла
        const spanEl = firstItem.querySelector('span:last-child');
        if (spanEl) {
            const firstFileName = spanEl.innerText.trim();
            selectedId = firstFileName.replace('.txt', '');
            await selectDevice(selectedId);
        }
    }
}

// 12. Защита от потери данных
window.addEventListener('beforeunload', function (e) {
    if (hasUnsavedChanges) {
        const msg = 'У вас есть несохраненные изменения!';
        (e || window.event).returnValue = msg; return msg;
    }
});

// 13. Динамический наполнитель Сайдбара с подкачкой из gmt_kb_library.txt и защитой от перебивания событий
async function bindContextDocumentationListeners() {
    const kbNode = document.getElementById('kb-viewer-node');
    if (!kbNode) return;
    
    // Пытаемся забрать базу из кэша. Если кэша нет - делаем прямой экстренный GET-запрос к серверу
    if (!window.kbDatabaseGlobal || Object.keys(window.kbDatabaseGlobal).length === 0) {
        try {
            const response = await fetch('/api/kb');
            const rawData = await response.json();
            
            // Преобразуем объект в строку, заменяем текстовые \\n на реальные \n и парсим обратно
            const fixedJsonString = JSON.stringify(rawData).replace(/\\\\n/g, '\\n');
            window.kbDatabaseGlobal = JSON.parse(fixedJsonString);
            
        } catch (e) {
            console.error("Крах чтения сетевого эндпоинта /api/kb:", e);
            window.kbDatabaseGlobal = {};
        }
    }

    // Резервный локальный атлас для точечных суб-чекбоксов Группы 06 и 07
    const subKbEntries = {
        '6.19.1': 'Режим RTZ (Return To Zero): Мгновенно сбрасывает текущую позицию таймлайна на абсолютный ноль (00:00:00:00).',
        '6.19.2': 'Режим END (Прыжок в конец): Переносит курсор воспроизведения на финальный маркер окончания последней аудио-сессии.',
        '6.19.3': 'Режим LOOP (Глобальный перезапуск петли): Жесткая фиксация транспортной шины в режиме бесконечного рестарта сессии.',
        '6.20.1': 'Команда STOP (Остановка): Мгновенно останавливает локомоцию лентопротяжного механизма DAW, фиксируя текущий плейхед студийной сессии.',
        '6.20.2': 'Команда PLAY (Воспроизведение): Запускает линейный просчет и воспроизведение таймлайна проекта.',
        '6.20.3': 'Команда REC (Запись): Включает мастер-режим фиксации входящих MIDI/Аудио потоков на подготовленных треках.',
        '6.20.4': 'Команда PREV (Предыдущий маркер): Быстрый прыжок плейхеда назад на ближайший CheckPoint-маркер таймлайна.',
        '6.20.5': 'Команда NEXT (Следующий маркер): Быстрый прыжок плейхеда вперед на ближайший CheckPoint-маркер таймлайна.',
        '6.20.6': 'Команда CYCLE (Петля): Активирует режим цикличного воспроизведения (Loop) между левым и правым локаторами.',
    };

    // 1. Обработка стандартных строк (Группы 01 - 07)
    const rows = document.querySelectorAll('.form-row');
    rows.forEach(row => {
        const mainInput = row.querySelector('input, select');
        if (!mainInput) return;
        
        let baseId = mainInput.id.replace('field_', '');
        // Жестко изолируем транспортную подгруппу, чтобы строки не перебивали точечные чекбоксы
        if (baseId.startsWith('7.17.') || baseId.startsWith('7.18.')) return;

        const triggerMainKB = () => {
            const paramName = repository[baseId] ? repository[baseId].param : baseId;
            // Получаем чистую сырую строку из глобального кэша
            let helpText = window.kbDatabaseGlobal[baseId] || `Инженерное описание для ID ${baseId} подгружается из внешнего файла gmt_kb_library.txt...`;
            const imageUrl = `/png/ssl/${baseId}.png`;

            let formattedHelpContent = '';

            if (typeof typeof helpText === 'string') {
                // Удаляем маркеры депрекации
                helpText = helpText.replace(/\[DEPRECATED\]/g, '');

                // ВСЕЯДНЫЙ РЕГЕКС:
                // (?:\\[nt])* — игнорирует возможные экранированные слэши или табы перед маркером
                // [_\s\t]*SPLIT[_\s\t]*LINE[_\s\t]* — найдет маркер в любом формате (SPLIT_LINE, split line, SPLIT LINE)
                // /i — отключает чувствительность к регистру букв
                const flexibleSplitRegex = /(?:\\[nt])*[\s\t]*SPLIT[_\s\t]*LINE[\s\t]*(?:\\[nt])*/i;

                if (flexibleSplitRegex.test(helpText)) {
                    // Разрезаем строку по нашему гибкому регулярному выражению
                    const parts = helpText.split(flexibleSplitRegex);
                    
                    // Безопасно извлекаем левую и правую части, как в исходном рабочем коде
                    let leftPart = parts[0] ? parts[0] : '';
                    let rightPart = parts[1] ? parts[1] : '';

                    // Ваша полностью рабочая и сохраненная логика внутренних переносов \n
                    leftPart = leftPart.replace(/\n/g, '<br>').trim();
                    rightPart = rightPart.replace(/\n/g, '<br>').trim();

                    // Формируем вывод двух независимых блоков с пунктирной линией
                    formattedHelpContent = `
                        <div style="margin-bottom: 12px; color: #333; font-weight: 500; line-height: 16px;">${leftPart}</div>
                        <div style="border-top: 1px dashed #acacac; margin: 12px 0; opacity: 0.5;"></div>
                        <div style="margin-top: 12px; color: #333; font-weight: 500; line-height: 16px;">${rightPart}</div>
                    `;
                } else {
                    // Если токена склейки нет, просто обрабатываем внутренние \n (ваша исходная рабочая логика)
                    const cleanSingleText = helpText.replace(/\n/g, '<br>').trim();
                    formattedHelpContent = `<div style="color:#555; line-height: 16px;">${cleanSingleText}</div>`;
                }
            } else {
                formattedHelpContent = `<div style="color:#555;">${helpText}</div>`;
            }

            // Рендерим итоговый HTML-шаблон в сайдбар через innerHTML
            kbNode.innerHTML = `
                <div style="font-weight:bold; color:#1e87e5; font-size:12px; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px;">⚙️ ID: ${baseId}</div>
                <div style="font-family:monospace; font-weight:bold; margin-bottom:6px; color:#333;">[${paramName}]</div>
                <div style="font-size:11px;">${formattedHelpContent}</div>
                <div id="kb-img-container" style="margin-top:10px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.03); text-align:center;">
                    <img src="${imageUrl}" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ccc; border-radius:3px;" onerror="this.style.display='none'; document.getElementById('kb-img-container').style.display='none';">
                </div>
            `;
        };

        // Навешиваем слушатели событий на стандартную строку
        row.addEventListener('mouseenter', triggerMainKB);
        mainInput.addEventListener('focus', triggerMainKB);
    });

/* DEBAGER
            const triggerMainKB = () => {
            const paramName = repository[baseId] ? repository[baseId].param : baseId;
            // Получаем сырую строку из глобального кэша
            let helpText = window.kbDatabaseGlobal[baseId] || `Инженерное описание для ID ${baseId} подгружается из внешнего файла gmt_kb_library.txt...`;
            const imageUrl = `/png/ssl/${baseId}.png`;

            // ОТЛАДКА: Готовим безопасное отображение спецсимволов, чтобы увидеть скрытые табы и слэши
            let rawDebug = String(helpText)
                .replace(/\t/g, '[TAB]')
                .replace(/\n/g, '[\\n]\n'); // Визуализируем перенос строки, не ломая его физически

            let formattedHelpContent = '';

            if (typeof helpText === 'string') {
                helpText = helpText.replace(/\[DEPRECATED\]/g, '');

                // ВРЕМЕННО: Оставляем старый рабочий вариант рендеринга одиночной строки, пока смотрим RAW данные
                const cleanSingleText = helpText.replace(/\n/g, '<br>').trim();
                formattedHelpContent = `<div style="color:#555; line-height: 16px;">${cleanSingleText}</div>`;
            } else {
                formattedHelpContent = `<div style="color:#555;">${helpText}</div>`;
            }

            // Рендерим итоговый HTML-шаблон в сайдбар + добавляем блок отладки raw-кода
            kbNode.innerHTML = `
                <div style="font-weight:bold; color:#1e87e5; font-size:12px; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px;">⚙️ ID: ${baseId}</div>
                <div style="font-family:monospace; font-weight:bold; margin-bottom:6px; color:#333;">[${paramName}]</div>
                <div style="font-size:11px;">${formattedHelpContent}</div>
                
                <!-- БЛОК ОТЛАДКИ RAW-КОДА -->
                <div style="margin-top:15px; padding:6px; background:#fff3cd; border:1px solid #ffeeba; border-radius:3px; font-family:monospace; font-size:10px; color:#856404; white-space:pre-wrap; word-break:break-all;">
                    <strong>[RAW DATA FROM SERVER]:</strong><br>${rawDebug}
                </div>

                <div id="kb-img-container" style="margin-top:10px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.03); text-align:center;">
                    <img src="${imageUrl}" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ccc; border-radius:3px;" onerror="this.style.display='none'; document.getElementById('kb-img-container').style.display='none';">
                </div>
            `;
        };
*/ // END DEBUGER

    // 2. Точечное наведение строго на суб-чекбоксы транспорта (PLAY, RTZ, STOP и т.д.)
    const subLabels = document.querySelectorAll('.checkbox-row label');
    subLabels.forEach(label => {
        const subInput = label.querySelector('input');
        if (!subInput) return;

        const subId = subInput.id.replace('field_', ''); 

        const triggerSubKB = (e) => {
            e.stopPropagation(); // Предотвращаем всплытие события к родительской строке формы
            const cleanLabelText = label.innerText.replace('*', '').trim();
            const helpText = subKbEntries[subId] || `Управление макросом транспортной шины для команды ${cleanLabelText}.`;
            const imageUrl = `/png/ssl/${subId}.png`;

            kbNode.innerHTML = `
                <div style="font-weight:bold; color:#cc0000; font-size:12px; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px;">🎯 SUB-ID: ${subId}</div>
                <div style="font-family:monospace; font-weight:bold; margin-bottom:6px; color:#333;">[MMC_CONTROL &rarr; ${cleanLabelText}]</div>
                <div style="line-height:15px; color:#555; margin-bottom:12px;">${helpText}</div>
                <div id="kb-img-container" style="margin-top:10px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.03); text-align:center;">
                    <img src="${imageUrl}" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ccc; border-radius:3px;" onerror="this.style.display='none'; document.getElementById('kb-img-container').style.display='none';">
                </div>
            `;
        };

        // ПРАВИЛЬНАЯ фиксация слушателей внутри цикла subLabels.forEach
        label.addEventListener('mouseenter', triggerSubKB);
        subInput.addEventListener('focus', triggerSubKB);
    });
}

// 27. START: Запуск сквозного сетевого маппинга при загрузке страницы
initWebInterface();
