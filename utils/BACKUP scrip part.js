// BACKUP scrip part from gtm_manager.html
<script>
        // 0. Глобальные переменные сетевого обмена по ID
        let selectedId = "";
        let repository = {};    // Буфер объекта ТЕКУЩЕГО активного прибора
        let originalDataBackup = {};    // бэкап с диска для сброса 4K правок
        
        let undoStack = [];
        let redoStack = [];
        let isOperatingHistory = false;
        let hasUnsavedChanges = false;

        // 1. Инициализация стартового выбора
        // selectedId = repository[0].DEVICE_ID;
        selectedId = "";

        // 2. Динамический рендеринг списка репозитория прямо из текстовых файлов папки map/
        async function renderDeviceList() {
            try {
                // Делаем GET-запрос к нашему Node.js серверу за пулом файлов
                const response = await fetch('/api/devices');
                const txtFilesList = await response.json(); // Получаем массив имен файлов, например: ['ssl-nucleus-2.txt', 'impact-lx25.txt']
                
                const container = document.getElementById('device-list-container');
                container.innerHTML = '';
                
                // Перебираем реальные текстовые файлы с диска
                txtFilesList.forEach(fileName => {
                    const item = document.createElement('div');
                    
                    // Выделяем чистое имя для ID (убираем расширение .txt)
                    const devId = fileName.replace('.txt', '');
                    
                    // Автоматически определяем класс бренда по имени файла для водяного знака на 4K
                    let brandClass = 'brand-generic';
                    if (fileName.toLowerCase().includes('ssl') || fileName.toLowerCase().includes('nucleus')) brandClass = 'brand-ssl';
                    if (fileName.toLowerCase().includes('nektar') || fileName.toLowerCase().includes('impact') || fileName.toLowerCase().includes('lx')) brandClass = 'brand-nektar';
                    if (fileName.toLowerCase().includes('roli') || fileName.toLowerCase().includes('seaboard')) brandClass = 'brand-roli';
                    if (fileName.toLowerCase().includes('mackie')) brandClass = 'brand-mackie';

                    item.className = `device-item ${brandClass} ${devId === selectedId ? 'active' : ''}`;
                    item.onclick = () => selectDevice(devId);
                    
                    item.innerHTML = `
                        <div style="display:flex; flex-direction:column; width:100%; overflow:hidden; z-index:2;">
                            <span style="font-weight:bold; font-size:11px; text-overflow:ellipsis; white-space:nowrap; overflow:hidden;">${devId.toUpperCase()}</span>
                            <span style="font-size:9px; opacity:0.7; font-family:monospace; margin-top:2px;">${fileName}</span>
                        </div>
                    `;
                    container.appendChild(item);
                });
                
                document.getElementById('repo-stats').innerText = `Файлов в пуле: ${txtFilesList.length}`;
            } catch (err) {
                if (typeof logToTerminal === 'function') logToTerminal('ERROR', `Ошибка чтения папки map/: ${err.message}`);
            }
        }

        // 3. Загрузка и парсинг конкретного модуля .txt на бэкенде
        // 3.1. функция загрузки с поддержкой ChBox и Radio
        async function selectDevice(id) {
            selectedId = id;
            const items = document.querySelectorAll('.device-item');
            items.forEach(item => item.classList.remove('active'));
            
            const activeItem = Array.from(items).find(item => item.innerHTML.toLowerCase().includes(`${id.toLowerCase()}.txt`));
            if (activeItem) activeItem.classList.add('active');

            try {
                const response = await fetch(`/api/devices/${id}`);
                if (!response.ok) throw new Error('Файл не найден');
                const deviceData = await response.json(); 

                originalDataBackup = JSON.parse(JSON.stringify(deviceData));
                repository = deviceData;

                clearDirtyStates();
                
                // Перебираем базовые ключи из .txt файла (например, '7.17.0')
                Object.keys(deviceData).forEach(idKey => {
                    const cell = deviceData[idKey];
                    
                    // ЕСЛИ ЭТО МАССИВ ЧЕКБОКСОВ (Группа 7.17.0 MMC)
                    if (idKey === '7.17.0') {
                        const activeModes = Array.isArray(cell.value) ? cell.value : (cell.value ? cell.value.split(',').map(s=>s.trim()) : []);
                        document.getElementById('field_7.17.1').checked = activeModes.includes('STOP');
                        document.getElementById('field_7.17.2').checked = activeModes.includes('PLAY');
                        document.getElementById('field_7.17.3').checked = activeModes.includes('REC');
                        document.getElementById('field_7.17.4').checked = activeModes.includes('PREV');
                        document.getElementById('field_7.17.5').checked = activeModes.includes('NEXT');
                        document.getElementById('field_7.17.6').checked = activeModes.includes('CYCLE');
                        return;
                    }

                    // ЕСЛИ ЭТО ГРУППА RADIO-КНОПОК (Группа 7.18.0 MMC_ALT)
                    if (idKey === '7.18.0') {
                        const activeRadio = String(cell.value).toUpperCase().trim();
                        document.getElementById('field_7.18.1').checked = (activeRadio === 'RTZ');
                        document.getElementById('field_7.18.2').checked = (activeRadio === 'END');
                        document.getElementById('field_7.18.3').checked = (activeRadio === 'LOOP');
                        return;
                    }

                    // Стандартный маппинг для всех остальных одиночных полей
                    const el = document.getElementById(`field_${idKey}`);
                    if (!el) return;
                    
                    if (el.type === 'checkbox') {
                        el.checked = !!cell.value;
                    } else {
                        el.value = Array.isArray(cell.value) ? cell.value.join(', ') : (cell.value !== null ? cell.value : '');
                    }
                });

                if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
                if (typeof recalculateDirtyStates === 'function') recalculateDirtyStates();
                bindContextDocumentationListeners(); // Инициализируем живую справку в сайдбаре
            } catch (err) {
                console.error(err);
            }
        }

        // 4. Обновление простого текстового или числового поля ввода по ID
        function updateField(idKey, value) {
            if (!repository) return;
            
            // Если значение в поле реально изменилось относительно памяти
            if (repository[idKey] !== value) {
                if (!isOperatingHistory) {
                    // Спасаем снимок в стек Undo перед правкой
                    undoStack.push(JSON.stringify(repository));
                    redoStack = []; // Сбрасываем Redo
                }
                
                repository[idKey] = value;
                hasUnsavedChanges = true;
                
                // Если изменилось имя или ID прибора, мгновенно обновляем сайдбар
                if (idKey === '1.2.0' || idKey === '1.3.0') renderDeviceList();
                
                recalculateDirtyStates(); // Пересчитываем 4K подсветку строк
            }
        }

        // 5. Обновление массивов (перечислений через запятую типа 2.4.0)
        function updateArrayField(idKey, value) {
            if (!repository) return;
            if (!isOperatingHistory) {
                undoStack.push(JSON.stringify(repository));
                redoStack = [];
            }
            // Разбиваем строку обратно в массив для передачи на сервер
            repository[idKey] = value.split(',').map(s => s.trim()).filter(s => s !== '');
            hasUnsavedChanges = true;
            recalculateDirtyStates();
        }

        // 6. Интеллектуальный расчет dirty-состояний и управление UNDO/REDO
        function recalculateDirtyStates() {
            if (!repository || !originalDataBackup) return;
            hasUnsavedChanges = false;
            
            // Пробегаемся по всем ID полей, которые есть в текущем объекте
            Object.keys(repository).forEach(idKey => {
                const el = document.getElementById(`field_${idKey}`);
                if (!el) return;
                const row = el.closest('.form-row');
                if (!row) return;

                let isEdited = false;
                // Сверяем значения в оперативной памяти с резервной копией с диска
                if (Array.isArray(repository[idKey])) {
                    const currentStr = repository[idKey].join(', ');
                    const baseStr = Array.isArray(originalDataBackup[idKey]) ? originalDataBackup[idKey].join(', ') : '';
                    isEdited = currentStr !== baseStr;
                } else {
                    const currentVal = repository[idKey] !== null ? repository[idKey] : '';
                    const baseVal = originalDataBackup[idKey] !== null ? originalDataBackup[idKey] : '';
                    isEdited = String(currentVal) !== String(baseVal);
                }

                // Включаем или выключаем янтарную подсветку строки на 4K
                if (isEdited) {
                    row.classList.add('is-dirty');
                    hasUnsavedChanges = true; // Сессия считается измененной
                } else {
                    row.classList.remove('is-dirty');
                }
            });
            
            // Управляем сочной цветовой активностью кнопок в шапке панели
            const undoBtn = document.getElementById('btn-undo');
            const redoBtn = document.getElementById('btn-redo');
            if (undoBtn) undoBtn.disabled = undoStack.length === 0;
            if (redoBtn) redoBtn.disabled = redoStack.length === 0;
        }

        // 7. Модифицированная функция сохранения: Собирает суб-чекбоксы и радио обратно в чистую строку для .txt
        async function exportToTXT() {
            if (!repository || Object.keys(repository).length === 0) return;
            const dev = repository; 

            Object.keys(dev).forEach(idKey => {
                // Сборка составного блока MMC 7.17.0
                if (idKey === '7.17.0') {
                    const mmcArray = [];
                    if (document.getElementById('field_7.17.1').checked) mmcArray.push('STOP');
                    if (document.getElementById('field_7.17.2').checked) mmcArray.push('PLAY');
                    if (document.getElementById('field_7.17.3').checked) mmcArray.push('REC');
                    if (document.getElementById('field_7.17.4').checked) mmcArray.push('PREV');
                    if (document.getElementById('field_7.17.5').checked) mmcArray.push('NEXT');
                    if (document.getElementById('field_7.17.6').checked) mmcArray.push('CYCLE');
                    dev[idKey].value = mmcArray.join(', ');
                    return;
                }

                // Сборка Radio-группы MMC_ALT 7.18.0
                if (idKey === '7.18.0') {
                    let radioVal = 'NA';
                    if (document.getElementById('field_7.18.1').checked) radioVal = 'RTZ';
                    if (document.getElementById('field_7.18.2').checked) radioVal = 'END';
                    if (document.getElementById('field_7.18.3').checked) radioVal = 'LOOP';
                    dev[idKey].value = radioVal;
                    return;
                }

                const el = document.getElementById(`field_${idKey}`);
                if (!el) return;
                
                if (el.type === 'checkbox') {
                    dev[idKey].value = el.checked;
                } else {
                    dev[idKey].value = el.value.trim();
                }
            });

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
                    if (typeof logToTerminal === 'function') logToTerminal('SUCCESS', `Модуль map/${selectedId}.txt успешно обновлен на сервере.`);
                }
            } catch (err) {
                console.error(err);
            }
        }
        // 8. Стек истории изменений
        let undoStack = [];
        let redoStack = [];
        let isOperatingHistory = false; // Блокиратор зацикливания при откате

        // 9. Функция сохранения снимка состояния в историю перед изменением
        function saveHistorySnapshot() {
            if (isOperatingHistory) return;
            
            // Защита: так как мы храним в repository объект текущего прибора, бэкапим его
            if (!repository || repository.length === 0) return;
            const currentDev = repository[0];
            if (!currentDev) return;
            
            // Записываем глубокую копию текущего прибора в стек отмены
            undoStack.push(JSON.stringify(repository));
            redoStack = []; // Сбрасываем стек Redo при новом действии пользователя
            if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
        }

        // 10. Функция обновления доступности кнопок в шапке
        function updateUndoRedoButtons() {
            const undoBtn = document.getElementById('btn-undo');
            const redoBtn = document.getElementById('btn-redo');
            if (undoBtn) undoBtn.disabled = undoStack.length === 0;
            if (redoBtn) redoBtn.disabled = redoStack.length === 0;
        }

        // 11. Модифицированная функция обновления простых полей
        function updateField(key, value) {
            if (!repository || repository.length === 0) return;
            const dev = repository[0]; // В сетевом режиме берем текущий рабочий объект
            if (dev) {
                if (dev[key] !== value) {
                    saveHistorySnapshot(); // Спасаем старое состояние в Undo
                    
                    dev[key] = value;
                    hasUnsavedChanges = true;
                    
                    const inputEl = document.getElementById(`field_${key}`);
                    if (inputEl) {
                        const row = inputEl.closest('.form-row');
                        if (row) row.classList.add('is-dirty');
                    }
                    if (key === 'DEVICE_NAME' || key === 'DEVICE_ID') renderDeviceList();
                    recalculateDirtyStates(); // Пересчитываем подсветку "на лету"
                }
            }
        }

        // 12. Модифицированная функция обновления массивов
        function updateArrayField(key, value) {
            if (!repository || repository.length === 0) return;
            const dev = repository[0];
            if (dev) {
                saveHistorySnapshot(); // Спасаем в Undo
                
                dev[key] = value.split(',').map(s => s.trim()).filter(s => s !== '');
                hasUnsavedChanges = true;

                const inputEl = document.getElementById(`field_${key}`);
                if (inputEl) {
                    const row = inputEl.closest('.form-row');
                    if (row) row.classList.add('is-dirty');
                }
                recalculateDirtyStates();
            }
        }

        // 13. Динамический наполнитель Правого Сайдбара (Knowledge Base)
        function bindContextDocumentationListeners() {
            const kbNode = document.getElementById('kb-viewer-node');
            
            // База знаний описания параметров (Бывшие help-info, теперь живут тут)
            const kbDatabase = {
                '1.1.0': 'Указывает компанию-производителя устройства (например, Solid State Logic). Используется для внутренней классификации брендов.',
                '1.2.0': 'Уникальный строковый идентификатор профиля в базе данных. Должен быть написан строчными буквами без пробелов.',
                '2.8.0': 'ASCII клавиатурная макро-комбинация, посылаемая пультом по USB-HID шине для автоматической синхронизации активного DAW-слоя в Suno Studio.',
                '7.16.0': 'Список поддерживаемых режимов автоматизации треков. Движок ядра считывает данные токены для переключения режимов энвелопов.',
                '7.17.0': 'Пул MMC (MIDI Machine Control) команд управления лентопротяжным механизмом студийного таймлайна DAW.',
                '7.18.0': 'Альтернативные взаимоисключающие режимы локомоции. Позволяет выбрать только один активный статус: Return To Zero, переход в конец или петля.'
            };

            // Находим все поля ввода и вешаем слушатели фокуса
            const inputs = document.querySelectorAll('[id^="field_"]');
            inputs.forEach(el => {
                // Извлекаем чистый базовый ID (из field_7.17.1 получаем 7.17.0 для групповых чекбоксов)
                let baseId = el.id.replace('field_', '');
                if (baseId.startsWith('7.17.')) baseId = '7.17.0';
                if (baseId.startsWith('7.18.')) baseId = '7.18.0';

                const updateKB = () => {
                    const paramName = repository[baseId] ? repository[baseId].param : baseId;
                    const helpText = kbDatabase[baseId] || 'Спецификация для данного параметра считывается в реальном времени из ядра маппера SUNO_MPC...';
                    
                    kbNode.innerHTML = `
                        <div style="font-weight:bold; color:#1e87e5; font-size:12px; border-bottom:1px solid #ddd; padding-bottom:4px; margin-bottom:8px;">⚙️ ID: ${baseId}</div>
                        <div style="font-family:monospace; font-weight:bold; margin-bottom:6px; color:#333;">[${paramName}]</div>
                        <div style="line-height:15px; color:#555;">${helpText}</div>
                    `;
                };

                el.addEventListener('focus', updateKB);
                el.addEventListener('mouseenter', updateKB);
            };
        }

        // 14. Функция UNDO
        function undoAction() {
            if (undoStack.length === 0) return;
            
            // Переносим текущее состояние всего репозитория в стек повтора (Redo)
            redoStack.push(JSON.stringify(repository));
            
            // Восстанавливаем состояние из стека отмены
            isOperatingHistory = true;
            repository = JSON.parse(undoStack.pop());
            
            // Накатываем историю на форму
            if (typeof refreshFormFields === 'function' && repository.length > 0) {
                refreshFormFields(repository[0]);
            }
            isOperatingHistory = false;
            recalculateDirtyStates();
        } // <-- ЭТА СКОБКА СПАСАЕТ ВЕСЬ ФАЙЛ ОТ КРАХА!

        // 15. Функция REDO
        function redoAction() {
            if (redoStack.length === 0) return;
            
            undoStack.push(JSON.stringify(repository));
            
            isOperatingHistory = true;
            repository = JSON.parse(redoStack.pop());
            
            if (typeof refreshFormFields === 'function' && repository.length > 0) {
                refreshFormFields(repository[0]);
            }
            isOperatingHistory = false;
            recalculateDirtyStates();
        }

        // 16. Инициализация бэкапа для Default Condition (Глобальный объект)
        let originalDataBackup = {};

        // 17. Интеллектуальный расчет dirty-состояний полей формы (Сверка с дефолтом для 4K)
        function recalculateDirtyStates() {
            if (!repository || repository.length === 0 || !originalDataBackup) return;
            
            const dev = repository[0];       // Текущие правки в памяти
            const base = originalDataBackup; // Чистый эталон с диска сервера
            if (!dev || !base) return;

            hasUnsavedChanges = false;
            Object.keys(dev).forEach(key => {
                const inputEl = document.getElementById(`field_${key}`);
                if (!inputEl) return;

                const row = inputEl.closest('.form-row');
                if (!row) return;

                // Сверяем текущее значение в оперативной памяти с бэкапом
                let isEdited = false;
                if (Array.isArray(dev[key])) {
                    const currentStr = dev[key].join(', ');
                    const baseStr = Array.isArray(base[key]) ? base[key].join(', ') : '';
                    isEdited = currentStr !== baseStr;
                } else {
                    const currentVal = dev[key] !== null ? dev[key] : '';
                    const baseVal = base[key] !== null ? base[key] : '';
                    isEdited = String(currentVal) !== String(baseVal);
                }

                // Включаем или выключаем янтарную 4K подсветку строки
                if (isEdited) {
                    row.classList.add('is-dirty');
                    hasUnsavedChanges = true; // Если хоть одно поле изменено — сессия "грязная"
                } else {
                    row.classList.remove('is-dirty');
                }
            });
            updateUndoRedoButtons();
        }

        // 18. Интегрируем перерасчет "на лету" в функции ввода данных
        const originalUpdateField = updateField;
        updateField = function(key, value) {
            originalUpdateField(key, value);
            if (typeof recalculateDirtyStates === 'function') recalculateDirtyStates();
        };

        // 19 Интегрируем перерасчет "на лету" в функции ввода данных массива
        const originalUpdateArrayField = updateArrayField;
        updateArrayField = function(key, value) {
            originalUpdateArrayField(key, value);
            if (typeof recalculateDirtyStates === 'function') recalculateDirtyStates();
        };

        // 20. Вспомогательный накат данных на форму (вызывается при Undo/Redo)
        function refreshFormFields(dev) {
            if (!dev) return;
            clearDirtyStates(); // Смываем старую янтарную подсветку 4K строк
            
            Object.keys(dev).forEach(key => {
                const el = document.getElementById(`field_${key}`);
                if (!el) return;
                if (el.type === 'checkbox') {
                    el.checked = !!dev[key];
                } else {
                    el.value = Array.isArray(dev[key]) ? dev[key].join(', ') : (dev[key] !== null ? dev[key] : '');
                }
            });
            updateUndoRedoButtons();
        }

        // 21. При успешном POST-сохранении фиксируем новый эталон Default Condition
        const baseExportToTXT = exportToTXT;
        exportToTXT = function() {
            baseExportToTXT();
            // Текущее состояние объекта памяти становится новым дефолтом для сброса подсветки
            originalDataBackup = JSON.parse(JSON.stringify(repository)); 
            if (typeof recalculateDirtyStates === 'function') recalculateDirtyStates();
        };

        // 22. Сброс истории при смене или полной перезагрузке файла
        function resetHistoryStacks() {
            undoStack = [];
            redoStack = [];
            updateUndoRedoButtons();
        }

        // 23. Клонирование выбранного блока (Сбор данных прямо из полей формы)
        async function cloneDevice() {
            // Собираем объект на основе того, что сейчас введено в поля формы
            const clone = {};
            const inputs = document.querySelectorAll('[id^="field_"]');
            
            inputs.forEach(el => {
                const key = el.id.replace('field_', '');
                if (el.type === 'checkbox') {
                    clone[key] = el.checked;
                } else {
                    clone[key] = el.value.trim();
                }
            });

            // Защита: если DEVICE_ID пустой, берем текущий selectedId или дефолт
            const baseId = clone.DEVICE_ID || selectedId || "generic-controller";
            const baseName = clone.DEVICE_NAME || "Generic Controller";

            // Генерируем красивый, читаемый ID для нового файла .txt
            const shortTimestamp = Date.now().toString().slice(-4);
            clone.DEVICE_ID = `${baseId}-clone-${shortTimestamp}`.toLowerCase().replace('.txt', '');
            clone.DEVICE_NAME = `${baseName} (Clone)`;

            try {
                if (typeof logToTerminal === 'function') logToTerminal('INFO', `Создание физического текстового клона: map/${clone.DEVICE_ID}.txt...`);
                
                const response = await fetch(`/api/devices/${clone.DEVICE_ID}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clone)
                });

                if (response.ok) {
                    if (typeof logToTerminal === 'function') logToTerminal('SUCCESS', `Модуль map/${clone.DEVICE_ID}.txt успешно сгенерирован.`);
                    await renderDeviceList(); // Перестраиваем панель
                    selectedId = clone.DEVICE_ID;
                    await selectDevice(selectedId); // Фокус на новый клон
                } else {
                    throw new Error('Бэкенд отклонил запись клона.');
                }
            } catch (err) {
                if (typeof logToTerminal === 'function') logToTerminal('ERROR', `Крах клонирования: ${err.message}`);
            }
        }

        // 24. Прямое сохранение (перезапись) .txt файла в папку map/ на сервере без скачивания в браузер
        async function exportToTXT() {
            // Защита: если репозиторий пуст, выходим
            if (!repository || Object.keys(repository).length === 0) return;
            const dev = repository; // В сетевом режиме берем текущий рабочий объект из буфера

            // Пробегаемся по форме, чтобы вытащить актуальные измененные данные из инпутов
            Object.keys(dev).forEach(key => {
                const el = document.getElementById(`field_${key}`);
                if (!el) return;
                if (el.type === 'checkbox') {
                    dev[key] = el.checked;
                } else {
                    dev[key] = el.value.trim(); // Убираем случайные пробелы по краям
                }
            });

            try {
                if (typeof logToTerminal === 'function') logToTerminal('INFO', `Отправка POST-запроса на перезапись map/${selectedId}.txt...`);
                
                // Шлем чистый selectedId без склейки расширения .txt (сервер Rserver.js сам его допишет)
                const response = await fetch(`/api/devices/${selectedId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dev)
                });

                if (response.ok) {
                    hasUnsavedChanges = false; // Снимаем защиту beforeunload от случайного закрытия
                    
                    // Фиксируем текущее состояние объекта как новый дефолт для сброса янтарной подсветки правок
                    originalDataBackup = JSON.parse(JSON.stringify(dev)); 
                    
                    if (typeof recalculateDirtyStates === 'function') recalculateDirtyStates(); // Гасим 4K подсветку строк
                    
                    if (typeof logToTerminal === 'function') logToTerminal('SUCCESS', `Файл map/${selectedId}.txt успешно обновлен на жестком диске Мака.`);
                } else {
                    throw new Error('Сервер ответил отказом на запись файла.');
                }
            } catch (err) {
                if (typeof logToTerminal === 'function') logToTerminal('ERROR', `Крах записи на сервер: ${err.message}`);
            }
        }

        // 25. Стартовая автоматическая загрузка первого файла при запуске (Исправлено)
        async function initWebInterface() {
            try {
                await renderDeviceList();
                const deviceItems = document.querySelectorAll('.device-item');
                
                if (deviceItems && deviceItems.length > 0) {
                    // Берем самый первый элемент из списка
                    const firstItem = deviceItems[0];
                    // Вытаскиваем ID из атрибута или структуры данных
                    const spanEl = firstItem.querySelector('span:last-child');
                    if (spanEl) {
                        const firstFileName = spanEl.innerText.trim();
                        const firstDevId = firstFileName.replace('.txt', '');
                        selectedId = firstDevId;
                        await selectDevice(firstDevId);
                    }
                } else {
                    if (typeof logToTerminal === 'function') logToTerminal('ERROR', 'Папка map/ пуста. Сгенерированы дефолтные пресеты.');
                }
            } catch (err) {
                console.error(err);
            }
        }
        // 26. Подключаемся к живому потоку консоли Node.js
        const eventSource = new EventSource('/api/logs');
        const loggerBlock = document.getElementById('cli-logger-stream');

        eventSource.onmessage = function(e) {
            if (loggerBlock.innerHTML.includes('Connecting')) loggerBlock.innerHTML = '';
            loggerBlock.innerHTML += e.data + '\n';
            loggerBlock.scrollTop = loggerBlock.scrollHeight; // Автопрокрутка вниз
        };
        // 27. START:
        initWebInterface();
    </script>