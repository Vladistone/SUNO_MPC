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
            // Обработка составного блока чекбоксов AUTOMATION 7.7.0
            // ИСПРАВЛЕНО: Соответствие ID полей (1-REC, 2-READ, 3-WRITE, 4-TOUCH) вашему HTML
            if (idKey === '7.7.0') {
                const activeModes = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_7.7.1')) document.getElementById('field_7.7.1').checked = activeModes.includes('REC');
                if(document.getElementById('field_7.7.2')) document.getElementById('field_7.7.2').checked = activeModes.includes('READ');
                if(document.getElementById('field_7.7.3')) document.getElementById('field_7.7.3').checked = activeModes.includes('WRITE');
                if(document.getElementById('field_7.7.4')) document.getElementById('field_7.7.4').checked = activeModes.includes('TOUCH') || activeModes.includes('TOCH');
                if(document.getElementById('field_7.7.5')) document.getElementById('field_7.7.5').checked = activeModes.includes('LATCH');
                if(document.getElementById('field_7.7.6')) document.getElementById('field_7.7.6').checked = activeModes.includes('TRIM');
                return;
            }
            
            // Обработка составного блока чекбоксов MMC 7.8.0
            if (idKey === '7.8.0') {
                const activeModes = Array.isArray(cell.value) ? cell.value : (cell.value ? String(cell.value).split(',').map(s=>s.trim()) : []);
                if(document.getElementById('field_7.8.1')) document.getElementById('field_7.8.1').checked = activeModes.includes('STOP');
                if(document.getElementById('field_7.8.2')) document.getElementById('field_7.8.2').checked = activeModes.includes('PLAY');
                if(document.getElementById('field_7.8.3')) document.getElementById('field_7.8.3').checked = activeModes.includes('REC');
                if(document.getElementById('field_7.8.4')) document.getElementById('field_7.8.4').checked = activeModes.includes('PREV');
                if(document.getElementById('field_7.8.5')) document.getElementById('field_7.8.5').checked = activeModes.includes('NEXT');
                if(document.getElementById('field_7.8.6')) document.getElementById('field_7.8.6').checked = activeModes.includes('CYCLE');
                return;
            }

            // Обработка Radio-группы MMC_ALT 7.9.0
            if (idKey === '7.9.0') {
                const activeRadio = String(cell.value).toUpperCase().trim();
                if(document.getElementById('field_7.9.1')) document.getElementById('field_7.9.1').checked = (activeRadio === 'RTZ');
                if(document.getElementById('field_7.9.2')) document.getElementById('field_7.9.2').checked = (activeRadio === 'END');
                if(document.getElementById('field_7.9.3')) document.getElementById('field_7.9.3').checked = (activeRadio === 'LOOP');
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

    // ОДИН единый цикл для перебора всех ключей без дублирования кода
    Object.keys(dev).forEach(idKey => {
        
        // Сборка составного блока AUTOMATION 7.7.0
        // ИСПРАВЛЕНО: Соответствие чекбоксов (1-REC, 2-READ, 3-WRITE) вашему интерфейсу
        if (idKey === '7.7.0') {
            const automationArray = [];
            if (document.getElementById('field_7.7.1') && document.getElementById('field_7.7.1').checked) automationArray.push('REC');
            if (document.getElementById('field_7.7.2') && document.getElementById('field_7.7.2').checked) automationArray.push('READ');
            if (document.getElementById('field_7.7.3') && document.getElementById('field_7.7.3').checked) automationArray.push('WRITE');
            if (document.getElementById('field_7.7.4') && document.getElementById('field_7.7.4').checked) automationArray.push('TOUCH');
            if (document.getElementById('field_7.7.5') && document.getElementById('field_7.7.5').checked) automationArray.push('LATCH');
            if (document.getElementById('field_7.7.6') && document.getElementById('field_7.7.6').checked) automationArray.push('TRIM');
            dev[idKey].value = automationArray.join(', ');
            return;
        }

        // Сборка составного блока MMC 7.8.0
        if (idKey === '7.8.0') {
            const mmcArray = [];
            if (document.getElementById('field_7.8.1') && document.getElementById('field_7.8.1').checked) mmcArray.push('STOP');
            if (document.getElementById('field_7.8.2') && document.getElementById('field_7.8.2').checked) mmcArray.push('PLAY');
            if (document.getElementById('field_7.8.3') && document.getElementById('field_7.8.3').checked) mmcArray.push('REC');
            if (document.getElementById('field_7.8.4') && document.getElementById('field_7.8.4').checked) mmcArray.push('PREV');
            if (document.getElementById('field_7.8.5') && document.getElementById('field_7.8.5').checked) mmcArray.push('NEXT');
            if (document.getElementById('field_7.8.6') && document.getElementById('field_7.8.6').checked) mmcArray.push('CYCLE');
            dev[idKey].value = mmcArray.join(', ');
            return;
        }

        // Сборка Radio-группы MMC_ALT 7.9.0
        if (idKey === '7.9.0') {
            let radioVal = 'NA';
            if (document.getElementById('field_7.9.1') && document.getElementById('field_7.9.1').checked) radioVal = 'RTZ';
            if (document.getElementById('field_7.9.2') && document.getElementById('field_7.9.2').checked) radioVal = 'END';
            if (document.getElementById('field_7.9.3') && document.getElementById('field_7.9.3').checked) radioVal = 'LOOP';
            dev[idKey].value = radioVal;
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
    }); // Цикл перебора ключей теперь корректно закрывается ЗДЕСЬ

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

// 13. Динамический наполнитель Сайдбара с подкачкой из gmt_kb_library.txt и защитой от перебивания событий
async function bindContextDocumentationListeners() {
    const kbNode = document.getElementById('kb-viewer-node');
    if (!kbNode) return;
    
    // Пытаемся забрать базу из кэша. Если кэша нет - делаем прямой экстренный GET-запрос к серверу
    if (!window.kbDatabaseGlobal || Object.keys(window.kbDatabaseGlobal).length === 0) {
        try {
            const response = await fetch('/api/kb');
            window.kbDatabaseGlobal = await response.json();
        } catch (e) {
            console.error("Крах чтения сетевого эндпоинта /api/kb:", e);
            window.kbDatabaseGlobal = {};
        }
    }
    
    // Резервный локальный атлас для точечных суб-чекбоксов Группы 07
    const subKbEntries = {
        '7.17.1': 'Команда STOP (Остановка): Мгновенно останавливает локомоцию лентопротяжного механизма DAW, фиксируя текущий плейхед студийной сессии.',
        '7.17.2': 'Команда PLAY (Воспроизведение): Запускает линейный просчет и воспроизведение таймлайна проекта.',
        '7.17.3': 'Команда REC (Запись): Включает мастер-режим фиксации входящих MIDI/Аудио потоков на подготовленных треках.',
        '7.17.4': 'Команда PREV (Предыдущий маркер): Быстрый прыжок плейхеда назад на ближайший CheckPoint-маркер таймлайна.',
        '7.17.5': 'Команда NEXT (Следующий маркер): Быстрый прыжок плейхеда вперед на ближайший CheckPoint-маркер таймлайна.',
        '7.17.6': 'Команда CYCLE (Петля): Активирует режим цикличного воспроизведения (Loop) между левым и правым локаторами.',
        '7.18.1': 'Режим RTZ (Return To Zero): Взаимоисключающий режим. Мгновенно сбрасывает текущую позицию таймлайна на абсолютный ноль (00:00:00:00).',
        '7.18.2': 'Режим END (Прыжок в конец): Переносит курсор воспроизведения на финальный маркер окончания последней аудио-сессии.',
        '7.18.3': 'Режим LOOP (Глобальный перезапуск петли): Жесткая фиксация транспортной шины в режиме бесконечного рестарта сессии.'
    };

    // 1. Обработка стандартных строк (Группы 01 - 06)
    const rows = document.querySelectorAll('.form-row');
    rows.forEach(row => {
        const mainInput = row.querySelector('input, select');
        if (!mainInput) return;
        
        let baseId = mainInput.id.replace('field_', '');
        // Жестко изолируем транспортную группу 07, чтобы строки не перебивали точечные чекбоксы
        if (baseId.startsWith('7.17.') || baseId.startsWith('7.18.')) return;

        const triggerMainKB = () => {
            const paramName = repository[baseId] ? repository[baseId].param : baseId;
            // Ищем строку в подкачанном глобальном window-кэше
            const helpText = window.kbDatabaseGlobal[baseId] || `Инженерное описание для ID ${baseId} подгружается из внешнего файла gmt_kb_library.txt...`;
            const imageUrl = `/png/ssl/${baseId}.png`;

            kbNode.innerHTML = `
                <div style="font-weight:bold; color:#1e87e5; font-size:12px; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px;">⚙️ ID: ${baseId}</div>
                <div style="font-family:monospace; font-weight:bold; margin-bottom:6px; color:#333;">[${paramName}]</div>
                <div style="line-height:15px; color:#555; margin-bottom:12px;">${helpText}</div>
                <div id="kb-img-container" style="margin-top:10px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.03); text-align:center;">
                    <img src="${imageUrl}" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ccc; border-radius:3px;" onerror="this.style.display='none'; document.getElementById('kb-img-container').style.display='none';">
                </div>
            `;
        };

        row.addEventListener('mouseenter', triggerMainKB);
        mainInput.addEventListener('focus', triggerMainKB);
    });

    // 2. У НЮАНС: Точечное наведение строго на суб-чекбоксы транспорта (PLAY, RTZ, STOP и т.д.)
    const subLabels = document.querySelectorAll('.checkbox-row label');
    subLabels.forEach(label => {
        const subInput = label.querySelector('input');
        if (!subInput) return;

        const subId = subInput.id.replace('field_', ''); // Например: '7.17.2'

        const triggerSubKB = (e) => {
            e.stopPropagation(); // ПРЕДОТВРАЩАЕМ ВСПЛЫТИЕ: строка больше не перебьет этот вызов!
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

        label.addEventListener('mouseenter', triggerSubKB);
        subInput.addEventListener('focus', triggerSubKB);
    });
}

// 10. Клонирование прибора
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

// 27. START: Запуск сквозного сетевого маппинга при загрузке страницы
initWebInterface();
