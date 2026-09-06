import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// В режиме ES Modules (type: "module") переменная __dirname не существует по умолчанию.
// Создаем ее нативную замену на основе мета-данных текущего файла:
const logClients = new Set();
const PORT = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к папке map/ (выходим из папки utils/ на один уровень вверх в корень проекта, затем в map/)
const MAP_DIR = path.join(__dirname, '..', 'map', 'lib');

/*
Архитектура маркеров-команд системы
Каждый маркер в 4-й колонке теперь имеет строгое системное поведение:
[IGNORE] — Фильтрация на этапе компиляции. Исключает параметр из итоговой сборки (удобно для черновиков, логов или временного отключения модулей железа)
[RADIO] — Управление типом UI. Сигнализирует фронтенду, что для этого ID нужно отрендерить переключатель типа Radio-button на основе списка чек-поинтов (из строк типа ChPnt.).
[HIDDEN] — Скрытый параметр. Движок бэкенда его обрабатывает и учитывает в логике ядра, но конструктор фронтенда скрывает его из общего интерфейса WebIF, чтобы пользователь случайно ничего не сломал.
[DEPRECATED] — Устаревший параметр. Помечает запись специальным флагом. Фронтенд подсветит его серым цветом и заблокирует для редактирования, выводя предупреждение.
[VALIDATE] — Строгий режим проверки. Дает команду бэкенду и фронтенду активировать функцию валидации (например, проверку на регулярные выражения, лимит символов или строгое соответствие диапазону разрядности Bits.).
*/

// 1.1 Парсинг новой 3-колоночной структуры с обработкой переносов для сайдбара
function parseTxtToJSON(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const data = {};

    let lastActiveId = null;

    for (let line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue; 

        // Разбиваем строго по знаку табуляции TAB
        const parts = line.split('\t');
        if (parts.length < 2) continue; 

        const id = parts[0].trim();
        const param = parts[1] ? parts[1].trim() : '';
        let value = parts[2] ? parts[2].trim() : '';
        const marker = parts[3] ? parts[3].trim() : ''; // 4-я колонка: маркер-сигнализатор

        // 1. Обработка маркера [IGNORE] — сразу выкидываем строку из парсинга
        if (marker === '[IGNORE]') {
            continue; 
        }

        // 2. Обработка маркера [SPLIT] (для обратной совместимости, если используется в конфигах)
        if (marker === '[SPLIT]' && lastActiveId && data[lastActiveId]) {
            if (typeof data[lastActiveId].value === 'string') {
                data[lastActiveId].value += '\n\n' + param;
            }
            continue; 
        }

        // Автоматическое строгое приведение типов данных для VALUE
        if (value.toLowerCase() === 'true') value = true;
        else if (value.toLowerCase() === 'false') value = false;
        else if (value === 'NA' || value === 'null') value = null;
        else if (!isNaN(value) && value !== '') value = Number(value);
        else if (value.includes(',') && !value.includes('+')) {
            value = value.split(',').map(item => item.trim());
        }

        // Извлекаем префикс класса (Meta, Count, Suprt, Fb и т.д.) для унификации UI
        const [prefix, keyName] = param.includes('.') ? param.split('.') : ['', param];

        const formattedHeader = param.startsWith('[') && param.endsWith(']') ? param : `[${param}]`;

        // Инициализируем базовый объект параметра
        data[id] = {
            param: param,
            group: prefix || 'Generic',
            header: formattedHeader,
            value: value,
            marker: marker || null, // Сохраняем маркер для обратной сериализации
            ui_type: 'standard',    // Тип отображения по умолчанию
            hidden: false,          // Флаг видимости в WebIF
            deprecated: false,      // Флаг устаревшего параметра
            validate: false         // Флаг строгой валидации
        };

        // ==========================================
        // ДИСПЕТЧЕРИЗАЦИЯ ОСТАЛЬНЫХ МАРКЕРОВ
        // ==========================================
        switch (marker) {
            case '[RADIO]':
                data[id].ui_type = 'radio';
                break;
            case '[HIDDEN]':
                data[id].hidden = true;
                break;
            case '[DEPRECATED]':
                data[id].deprecated = true;
                break;
            case '[VALIDATE]':
                data[id].validate = true;
                break;
        }

        lastActiveId = id;
    }

    return data;
}
// 1.2 Сборка JSON обратно в эталонный 4-колоночный TXT с поддержкой сигнальных маркеров
function serializeJSONtoTxt(jsonData) {
    let txt = `# ====================================================================\n`;
    txt += `# CONTROL SURFACE ENGINE (CSE) - 4-COLUMN SEMI-AUTOMATIC MASTER MATRIX\n`;
    txt += `# Формат: [ID] + [TAB] + [КЛАСС.СУЩЕСТВИТЕЛЬНОЕ_Свойство] + [TAB] + [VALUE] + [TAB] + [MARKER]\n`;
    txt += `# ====================================================================\n\n`;

    // Сортируем ключи по числовому порядку
    const sortedIds = Object.keys(jsonData).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedIds.forEach(id => {
        const item = jsonData[id];
        if (!item || !item.param) return;

        let val = item.value;
        
        // Приведение типов данных обратно в строковый формат текстового файла
        if (Array.isArray(val)) {
            val = val.join(', ');
        } else if (typeof val === 'boolean') {
            val = val ? 'true' : 'false';
        } else if (val === null || val === '') {
            val = 'NA';
        }

        // Вычисляем, какой маркер нужно записать обратно в 4-ю колонку
        let marker = item.marker || '';
        
        // Если маркер не был явно сохранен в свойстве .marker, восстанавливаем его по флагам объекта:
        if (!marker) {
            if (item.ui_type === 'radio') marker = '[RADIO]';
            else if (item.hidden) marker = '[HIDDEN]';
            else if (item.deprecated) marker = '[DEPRECATED]';
            else if (item.validate) marker = '[VALIDATE]';
        }

        // Формируем финальную строку. Если маркер есть — пишем через TAB, если нет — оставляем пустым
        const markerString = marker ? `\t${marker}` : '';
        
        txt += `${id}\t${item.param}\t${val}${markerString}\n`;
    });

    return txt;
}

// Функция-помощник для автоматического вычисления ID правой колонки (например, из 6.9.0 делает 6.10.0)
function calculateNextId(currentId) {
    const parts = currentId.split('.').map(Number);
    if (parts.length === 3 && !isNaN(parts[1])) {
        parts[1] = parts[1] + 1; // Увеличиваем средний сегмент (6.9.0 -> 6.10.0)
        parts[2] = 0;            // Сбрасываем под-индекс на ноль
        return parts.join('.');
    }
    return currentId + '_sub'; // Резервный вариант, если синтаксис ID нарушен
}

// ====================================================================
// HTTP СЕРВЕР СЕТЕВОГО API (REST API)
// ====================================================================

const server = http.createServer((req, res) => {
    const url = req.url;
    const method = req.method;

    // 1. Роут: Отдать статический файл веб-интерфейса менеджера
    if (url === '/' || url === '/index.html') {
        // Указываем точное имя файла в текущей папке utils/
        const htmlPath = path.join(__dirname, 'gmt_manager.html'); 
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(htmlPath));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Файл веб-интерфейса не найден по пути: ${htmlPath}`);
        }
        return;
    }
    
    // 3. API Роут: Стриминг логов консоли (Исправлен сброс 404 и добавлены заголовки)
    if (url === '/api/logs' || url === '/api/logs/') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*' // Защита от блокировок Chrome
        });
        
        // Отправляем стартовый пинг, чтобы Chrome подтвердил статус 200 OK
        res.write('data: [SYSTEM] - Сквозной ESM-канал логирования CLI успешно активирован.\n\n');
        
        logClients.add(res);
        req.on('close', () => { logClients.delete(res); });
        return;
    }

    // 2. Rout Picture ./util/png/
    if (url.startsWith('/png/')) {
        // Декодируем URL, чтобы избежать проблем с пробелами и символами в путях
        const decodedUrl = decodeString(url); 
        // Собираем абсолютный путь (выходим из utils/ наверх, затем в utils/png/...)
        const imagePath = path.join(__dirname, decodedUrl); 

        if (fs.existsSync(imagePath) && fs.lstatSync(imagePath).isFile()) {
            let ext = path.extname(imagePath).toLowerCase();
            let contentType = (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png';
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(fs.readFileSync(imagePath));
        } else {
            res.writeHead(404);
            res.end();
        }
        return;
    }
    // API РОУТ: Чтение текстовой библиотеки знаний Knowledge Base
    if (url === '/api/kb' && method === 'GET') {
        const kbPath = path.join(__dirname, 'gmt_kb_library.txt');
        if (!fs.existsSync(kbPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({}));
            return;
        }
        
        try {
            const content = fs.readFileSync(kbPath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const kbData = {};
            
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('#')) continue;
                
                const parts = line.split('\t');
                if (parts.length < 2) continue;
                
                kbData[parts[0].trim()] = parts[1].trim();
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(kbData));
        } catch (err) {
            res.writeHead(500); res.end(err.message);
        }
        return;
    }

function decodeString(str) { try { return decodeURIComponent(str); } catch(e) { return str; } }

    // 2. API Роут: Получить список всех текстовых файлов (.txt) в папке map/
    if (url === '/api/devices' && method === 'GET') {
        try {
            if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
            
            const files = fs.readdirSync(MAP_DIR)
                .filter(file => file.endsWith('.txt') && file !== 'GearMapTemplate.txt');
                
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(err.message);
        }
        return;
    }

    // 3. API Роут: Загрузить и спарсить конкретный текстовый модуль
    if (url.startsWith('/api/devices/') && method === 'GET') {
        const fileName = url.replace('/api/devices/', '');
        const targetPath = path.join(MAP_DIR, fileName.endsWith('.txt') ? fileName : `${fileName}.txt`);
        
        if (fs.existsSync(targetPath)) {
            const jsonConfig = parseTxtToJSON(targetPath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(jsonConfig));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Файл модуля не найден');
        }
        return;
    }

    // 4. API Роут: Принять изменения из формы и перезаписать/создать .txt файл на диске
    if (url.startsWith('/api/devices/') && method === 'POST') {
        const fileName = url.replace('/api/devices/', '');
        const targetPath = path.join(MAP_DIR, fileName.endsWith('.txt') ? fileName : `${fileName}.txt`);
        
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const jsonData = JSON.parse(body);
                const txtContent = serializeJSONtoTxt(jsonData);
                
                fs.writeFileSync(targetPath, txtContent, 'utf-8');
                
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Успешно сохранено');
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(err.message);
            }
        });
        return;
    }
	
    // 5. ТОЧЕЧНЫЙ РОУТ ДЛЯ РАЗДАЧИ ИЗОЛИРОВАННОГО СКРИПТА ЯДРА РЕДАКТОРА
    if (url === '/gmt_editor_core.js') {
        const scriptPath = path.join(__dirname, 'gmt_editor_core.js');
        if (fs.existsSync(scriptPath)) {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(fs.readFileSync(scriptPath));
        } else {
            res.writeHead(404); res.end();
        }
        return;
    }
	
    res.writeHead(404);
    res.end();
});

/// ====================================================================
// АВТОГЕНЕРАТОР ЭТАЛОННЫХ ВИРТУАЛЬНЫХ ПРИБОРОВ ДЛЯ ПУЛА REPOSITORY (Формат V4)
// ====================================================================
function initDefaultTextProfiles() {
    if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
    
    // Проверяем наличие уже сгенерированных рабочих профилей устройств
    const existingFiles = fs.readdirSync(MAP_DIR).filter(f => f.endsWith('.txt') && f !== 'GearMapTemplate.txt');
    if (existingFiles.length > 0) return; // Если файлы уже есть, ничего не перезаписываем
    
    // Определяем путь к вашей обновленной эталонной матрице шаблона
    const templatePath = path.join(MAP_DIR, 'GearMapTemplate.txt');
    const markerMap = {}; // Сюда соберем карту: ID -> MARKER

    // Читаем и парсим маркеры из GearMapTemplate.txt для синхронизации
    if (fs.existsSync(templatePath)) {
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        const lines = templateContent.split(/\r?\n/);
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            const parts = line.split('\t');
            if (parts.length >= 4) {
                const id = parts[0].trim();
                // Проверяем, существует ли вообще 4-й элемент в массиве parts перед вызовом .trim()
                const marker = parts[3] ? parts[3].trim() : '';

                if (marker.startsWith('[') && marker.endsWith(']')) {
                    markerMap[id] = marker; // Запоминаем директиву для этого ID
                }
            }
        });
    } else {
        console.warn(`[Предупреждение]: Файл шаблона матрицы ${templatePath} не найден. Генерация пройдет без маркеров.`);
    }

    console.log('--- Папка map/ пуста. Генерируем эталонные 4-колоночные модули спецификаций V4... ---');
    
    // Базовый жесткий массив данных (ID, PARAM, VALUE) для SSL Nucleus 2
    const rawSslDataset = [
        { id: "1.1.0", param: "Meta.VENDOR", value: "Solid State Logic" },
        { id: "1.2.0", param: "Meta.DEVICE_ID", value: "ssl-nucleus-2" },
        { id: "1.3.0", param: "Meta.DEVICE_NAME", value: "SSL Nucleus 2" },
        { id: "1.4.0", param: "Meta.INSTANCE_ID", value: "1" },
        { id: "1.5.0", param: "Meta.REF_MANUAL_URL", value: "https://www.solid-state-logic.co.jp/assets/uploads/downloads/nucleus/Nucleus2-User-Guide.pdf" },
        { id: "1.6.0", param: "Meta.REF_DATASHEET_URL", value: "NA" }, // Скорректировано имя согласно шаблону Matrix Specs
        { id: "1.7.0", param: "Meta.PROJECT_DOC_URL", value: "https://github.com/Vladistone/SUNO_MPC" },
        { id: "1.8.0", param: "Meta.ROUTING_TARGET", value: "SUNO_MAIN" },
        { id: "2.1.0", param: "Count.PROTOCOL_ACTIVE", value: "4" },
        { id: "2.2.0", param: "Count.DAW_STUDIO_LAYERS", value: "3" },
        { id: "2.3.0", param: "Count.USER_IF_PER_LAYER", value: "3" },
        { id: "2.4.0", param: "ChPnt.PORT_CONNECTION", value: "USB_HID, ipMIDI_Ethernet, LINK_Ext, USB, DIN5, WiFi" },
        { id: "2.5.0", param: "ChPnt.TRANSORT_PROTOCOL", value: "RTP_MIDI, ipMIDI, OSC, USB, Generic_MIDI, Other" },
        { id: "2.6.0", param: "ChPnt.APP_PROTOCOL", value: "MCU, HUI, CC#, MPE, OSC_Custom, ASCII" },
        { id: "2.7.0", param: "Suprt.HID_EMULATION", value: "true" },
        { id: "2.8.0", param: "Macro.KVMHot_ASCII_COMB", value: "Shift+S" },
        { id: "2.9.0", param: "ChPnt.ASCII_HOT_KEY_CFG", value: "none, FOLLOW_KEY_STATE, MODIFIER_ONLY_OUT, SEL_KEY_AUTO_FOCUS" },
        { id: "3.1.0", param: "Suprt.AFTOUCH_POLY", value: "false" },
        { id: "3.2.0", param: "Suprt.AFTOUCH_MONO", value: "false" },
        { id: "3.3.0", param: "Suprt.WHEEL_PITCH", value: "false" },
        { id: "3.4.0", param: "Suprt.WHEEL_MODLTN", value: "false" },
        { id: "3.5.0", param: "Suprt.BREATH_CTRL", value: "false" },
        { id: "3.6.0", param: "Suprt.XY_PAD_RIBBN", value: "false" },
        { id: "6.1.0", param: "Bits.CTRL_RESOLUTION", value: "14" }, // Скорректировано имя и ID под эталонную структуру
        { id: "3.7.0", param: "Suprt.NRPN", value: "true" },
        { id: "3.8.0", param: "Suprt.SysEx", value: "false" },
        { id: "4.1.0", param: "Fb.LED_PEAK_METERS", value: "true" }, // Скорректировано под шаблон Matrix Specs
        { id: "4.2.0", param: "Count.LED_PEAK", value: "10" },       // Скорректировано под шаблон Matrix Specs
        { id: "4.3.0", param: "Fb.FADER_MOTORIZED", value: "true" },
        { id: "4.4.0", param: "Fb.FADER_TOUCH_SENS", value: "true" },
        { id: "4.5.0", param: "Fb.ENC_MOTORIZED", value: "false" },
        { id: "4.6.0", param: "Fb.ENC_LED_RINGS", value: "true" },
        { id: "4.7.0", param: "Fb.ENC_LED_STATE", value: "true" },
        { id: "4.8.0", param: "Fb.BUTTON_STATES", value: "true" },
        { id: "4.9.0", param: "Count.BTN_LED", value: "24" },        // Скорректировано под шаблон Matrix Specs
        { id: "4.10.0", param: "ChPnt.BTN_LED_COLOR", value: "MONOCROME" }, // Скорректировано под шаблон Matrix Specs
        { id: "5.1.0", param: "Fb.LCD_METER_BRIDGE", value: "false" },
        { id: "5.2.0", param: "Count.LED_PEAK_SEG", value: "0" },    // Скорректировано под шаблон Matrix Specs
        { id: "5.3.0", param: "Fb.LED_7SEG", value: "time_code" },   // Скорректировано под шаблон Matrix Specs
        { id: "5.4.0", param: "Count.LED_7SEG", value: "2" },        // Скорректировано под шаблон Matrix Specs
        { id: "5.5.0", param: "Count.LED_7SEG_CHARS", value: "10" },
        { id: "5.6.0", param: "Fb.SCRIBBLE_STRIPS", value: "true" },
        { id: "5.7.0", param: "Fb.LCD_RESPONSABLE", value: "true" },
        { id: "5.8.0", param: "Char.LCD_CHAN_SPACER", value: "space" }, // Синхронизировано ID и порядок
        { id: "5.9.0", param: "Count.LCD_MSG_CHARS", value: "2x56" },   // Синхронизировано ID и порядок
        { id: "5.10.0", param: "Count.MCU_CHARS", value: "7" },      // Синхронизировано под шаблон Matrix Specs
        { id: "5.11.0", param: "Count.HUI_CHARS", value: "4" },      // Синхронизировано под шаблон Matrix Specs
        { id: "6.1.0", param: "Suprt.FADER_TOUCH_SENS", value: "true" },
        { id: "6.2.0", param: "Suprt.FADER_MOTORIZED", value: "true" },
        { id: "6.3.0", param: "Suprt.FADER_MASTER", value: "false" },
        { id: "6.4.0", param: "Suprt.FLIP_STATE", value: "true" },
        { id: "6.5.0", param: "Suprt.JOG_WEEL", value: "true" },     // Синхронизировано под шаблон Matrix Specs
        { id: "6.6.0", param: "Suprt.JOG_SRUB_MOD", value: "true" },
        { id: "6.7.0", param: "Count.MCU_PORTS", value: "2" },       // Синхронизировано под шаблон Matrix Specs
        { id: "6.8.0", param: "Count.CHANNELS", value: "8" },        // Синхронизировано под шаблон Matrix Specs
        { id: "6.9.0", param: "Count.FADERS", value: "1" },          // Синхронизировано под шаблон Matrix Specs
        { id: "6.10.0", param: "Count.BUTTONS", value: "3" },        // Синхронизировано под шаблон Matrix Specs
        { id: "6.11.0", param: "Count.ENC_VPOTS", value: "1" },      // Синхронизировано под шаблон Matrix Specs
        { id: "6.12.0", param: "Count.ENC_SW", value: "1" },
        { id: "6.13.0", param: "Count.SOFT_BTN_MODE", value: "8" },  // Синхронизировано под шаблон Matrix Specs
        { id: "6.14.0", param: "Count.SOFT_SW_UTIL", value: "8" },   // Синхронизировано под шаблон Matrix Specs
        { id: "6.15.0", param: "Count.FOOT_SW_FOOT", value: "2" },   // Синхронизировано под шаблон Matrix Specs
        { id: "6.16.0", param: "Count.SOFT_BTN_TOTAL", value: "20" }, // Синхронизировано под шаблон Matrix Specs
        { id: "6.17.0", param: "Suprt.AUTOMATION", value: "true" },
        { id: "6.18.0", param: "ChPnt.AUTOMATION", value: "READ, WRITE, REC, TOUCH, LATCH, TRIM" },
        { id: "6.19.0", param: "ChPnt.MMC_ALT", value: "RTZ, END, LOOP" },
        { id: "6.20.0", param: "ChPnt.MMC", value: "STOP, PLAY, REC, PREV, NEXT, CYCLE" },
        { id: "7.1.0", param: "Suprt.BANK_STEP_SHIFT", value: "true" },
        { id: "7.2.0", param: "Suprt.CHAN_STEP_SHIFT", value: "true" },
        { id: "7.3.0", param: "Suprt.NAV_RAW_LR", value: "true" },
        { id: "7.4.0", param: "Suprt.NAV_RAW_UD", value: "true" },
        { id: "7.5.0", param: "Suprt.NAV_MOD_SW", value: "true" },
        { id: "7.6.0", param: "Map.dflt_CH_FADER", value: "volume" },
        { id: "7.7.0", param: "Map.dflt_CH_ENC", value: "pan" },
        { id: "7.8.0", param: "Map.dflt_CH_ENC_SW", value: "RST" },
        { id: "7.9.0", param: "Map.dflt_CH_BTN_0", value: "select" },
        { id: "7.10.0", param: "Map.dflt_CH_BTN_1", value: "mute" },
        { id: "7.11.0", param: "Map.dflt_CH_BTN_2", value: "solo" },
        { id: "7.12.0", param: "Map.dflt_CH_BTN_3", value: "NA" },
        { id: "7.13.0", param: "ChPnt.MCU_SUB_MODES", value: "DFLT, INSTR, TRACK, PAN, EQ, SEND, PLUGIN" },
        { id: "7.14.0", param: "ChPnt.HUI_SUB_MODES", value: "DFLT, MUTE, PAN, A.SND, B.SND, C.SND, D.SND, E.SND" }
    ];

    // Собираем результирующий текстовый контент файла по 4-колоночной схеме
    let outputTxt = `# ====================================================================\n`;
    outputTxt += `# CONTROL SURFACE ENGINE (CSE) - HARDWARE SPECIFICATION PROFILE (V4)\n`;
    outputTxt += `# Модель: Solid State Logic Nucleus 2 (Logic Standard Profile)\n`;
    outputTxt += `# Формат: [ID] + [TAB] + [КЛАСС.СУЩЕСТВИТЕЛЬНОЕ_Свойство] + [TAB] + [VALUE] + [TAB] + [MARKER]\n`;
    outputTxt += `# ====================================================================\n\n`;

    rawSslDataset.forEach(item => {
        // Проверяем, какой маркер назначен этому ID в эталонном шаблоне GearMapTemplate.txt
        const attachedMarker = markerMap[item.id] || '';

        // Правило [IGNORE]: Если в шаблоне стоит маркер игнорирования, 
        // данный пункт полностью вырезается из сборки эталонного прибора repository
        if (attachedMarker === '[IGNORE]') {
            return; 
        }

        // Записываем строчку, добавляя маркер в 4-ю колонку через TAB (если он существует)
        const markerString = attachedMarker ? `\t${attachedMarker}` : '';
        outputTxt += `${item.id}\t${item.param}\t${item.value}${markerString}\n`;
    });

    // Физически записываем обновленный файл на жесткий диск
    fs.writeFileSync(path.join(MAP_DIR, 'nucleus_2.txt'), outputTxt, 'utf-8');
    console.log('--- 4-колоночный модуль [nucleus_2.txt] успешно сгенерирован и синхронизирован с шаблоном! ---');
}
/*
    // 2. Создаем текстовый файл для Nektar Impact LX25+
    const nektarTxt = `DEVICE_ID\tnektar-impact-lx25\nDEVICE_NAME\tImpact LX25+\nVENDOR\tNektar\nTOTAL_PHYSICAL_PORTS\t1\nPHYSICAL_PORTS_LIST\tUSB_MIDI\nPROTOCOLS_HARDWARE\tUSB\nPROTOCOLS_TRANSPORT\tGeneric_MIDI\nPROTOCOLS_APPLICATION\tCC#\nPROTOCOLS_NUMBER\t1\nTOTAL_DAW_LAYERS\t1\nTOTAL_PHYSICAL_CHANNELS\t1\nFADER_BIT_RESOLUTION\t7\nFADER_MOTORIZED_COUNT\t0\nSINGLE_MASTER_FADER\tfalse\nVPOT_ENCODER_COUNT\t8\nSUPPORT_MPE\tfalse\nFB_MOTORIZED_FADERS\tfalse\nFB_LCD_SCRIBBLE_STRIPS\tfalse\nFB_LED_7_SEG_CHARS_COUNT\t3\nMODE_TRACK_CONTROL\ttrue\nMODE_PAD_DRUM_MODE\ttrue\nPLAY\ttrue\nSTOP\ttrue\nREC\ttrue\nJOG_WHEEL\tfalse\nHID_KEYBOARD_EMULATION\tfalse\n`;
    fs.writeFileSync(path.join(MAP_DIR, 'nektar-impact-lx25.txt'), nektarTxt, 'utf-8');

    // 3. Создаем текстовый файл для Tascam (чтобы класс .brand-generic отработал как TASCAM водяной знак)
    const tascamTxt = `DEVICE_ID\ttascam-model-12\nDEVICE_NAME\tTascam Model 12\nVENDOR\tGeneric\nTOTAL_PHYSICAL_PORTS\t2\nPHYSICAL_PORTS_LIST\tUSB_MIDI, Multi_DIN\nPROTOCOLS_HARDWARE\tUSB, DIN-5\nPROTOCOLS_TRANSPORT\tGeneric_MIDI\nPROTOCOLS_APPLICATION\tMCU, CC#\nPROTOCOLS_NUMBER\t2\nTOTAL_DAW_LAYERS\t1\nTOTAL_PHYSICAL_CHANNELS\t10\nFADER_BIT_RESOLUTION\t7\nFADER_MOTORIZED_COUNT\t0\nSINGLE_MASTER_FADER\ttrue\nVPOT_ENCODER_COUNT\t0\nFB_MOTORIZED_FADERS\tfalse\nFB_LCD_SCRIBBLE_STRIPS\tfalse\nFB_LED_7_SEG_CHARS_COUNT\t0\nMODE_TRACK_CONTROL\ttrue\nPLAY\ttrue\nSTOP\ttrue\nREC\ttrue\nJOG_WHEEL\tfalse\n`;
    fs.writeFileSync(path.join(MAP_DIR, 'tascam-model-12.txt'), tascamTxt, 'utf-8');

    console.log('--- Модули [ssl-nucleus-2.txt], [nektar-impact-lx25.txt], [tascam-model-12.txt] успешно созданы на диске! ---');
}
*/
// Запускаем автоматическую генерацию при старте сервера перед прослушиванием порта
initDefaultTextProfiles();

server.listen(PORT, () => {
    console.log(`\n====================================================================`);
    console.log(`⚡ SUNO_MPC Модульный ESM-Сервер Репозитория запущен успешно!`);
    console.log(`🌐 Откройте в браузере: http://localhost:${PORT}`);
    console.log(`📁 Директория текстовых модулей карт: ${MAP_DIR}`);
    console.log(`====================================================================\n`);
});
