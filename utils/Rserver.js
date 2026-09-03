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

// 1.1 Парсинг новой 3-колоночной структуры: [ID] + [TAB] + [PARAM] + [TAB] + [VALUE]
function parseTxtToJSON(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const data = {};

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue; // Игнорируем комментарии

        // Разбиваем строго по знаку табуляции TAB
        const parts = line.split('\t');
        if (parts.length < 3) continue; // Нам нужны минимум 3 колонки (ID, PARAM, VALUE)

        const id = parts[0].trim();    // Например: '1.1.0'
        const param = parts[1].trim(); // Например: 'DEVICE_ID'
        let value = parts[2].trim();   // Например: 'master-universal-blueprint'

        // Автоматическое строгое приведение типов данных для WebIF
        if (value.toLowerCase() === 'true') value = true;
        else if (value.toLowerCase() === 'false') value = false;
        else if (value === 'NA' || value === 'null') value = null;
        else if (!isNaN(value) && value !== '') value = Number(value);
        else if (value.includes(',') && !value.includes('+')) {
            value = value.split(',').map(item => item.trim());
        }

        // Сохраняем в JSON под цифровым ID, а имя параметра привязываем внутрь для сборки обратно
        data[id] = {
            param: param,
            value: value
        };
    }
    return data;
}

// 1.2 Сборка JSON обратно в эталонный 3-колоночный TXT с сохранением оригинальных PARAM и TAB
function serializeJSONtoTxt(jsonData) {
    let txt = `# ====================================================================\n`;
    txt += `# CONTROL SURFACE ENGINE (CSE) - 3-COLUMN MASTER GEAR MATRIX TEMPLATE\n`;
    txt += `# Структура: [ID] -> [TAB] -> [PARAM] -> [TAB] -> [VALUE]\n`;
    txt += `# ====================================================================\n\n`;

    // Сортируем ключи по числовому порядку (чтобы 1.1.0 шел перед 2.1.0)
    const sortedIds = Object.keys(jsonData).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedIds.forEach(id => {
        const item = jsonData[id];
        if (!item || !item.param) return;

        let val = item.value;
        if (Array.isArray(val)) {
            val = val.join(', ');
        } else if (typeof val === 'boolean') {
            val = val ? 'true' : 'false';
        } else if (val === null || val === '') {
            val = 'NA';
        }

        // Записываем строго через два знака TAB
        txt += `${id}\t${item.param}\t${val}\n`;
    });
    return txt;
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

// ====================================================================
// АВТОГЕНЕРАТОР ЭТАЛОННЫХ ВИРТУАЛЬНЫХ ПРИБОРОВ ДЛЯ ПУЛА REPOSITORY
// ====================================================================
// АВТОГЕНЕРАТОР ЭТАЛОННЫХ ВИРТУАЛЬНЫХ ПРИБОРОВ ДЛЯ ПУЛА REPOSITORY (Формат V3)
function initDefaultTextProfiles() {
    if (!fs.existsSync(MAP_DIR)) fs.mkdirSync(MAP_DIR, { recursive: true });
    
    // Проверяем наличие файлов .txt
    const existingFiles = fs.readdirSync(MAP_DIR).filter(f => f.endsWith('.txt') && f !== 'GearMapTemplate.txt');
    if (existingFiles.length > 0) return; // Если файлы уже есть, ничего не перезаписываем
    
    console.log('--- Папка map/ пуста. Генерируем эталонные 3-колоночные модули... ---');
    
    // 1. Создаем текстовый файл для SSL Nucleus 2 строго по вашей спецификации V3
    const sslTxt = 
		"1.1.0\tMeta.VENDOR\tSolid State Logic\n" +
		"1.2.0\tMeta.DEVICE_ID\tssl-nucleus-2\n" +
		"1.3.0\tMeta.DEVICE_NAME\tSSL Nucleus 2\n" + 		"1.4.0\tMeta.REF_MANUAL_URL\thttps://www.solid-state-logic.co.jp/assets/uploads/downloads/nucleus/Nucleus2-User-Guide.pdf\n" +
        "1.5.0\tMeta.REF_DATASHEET\tNA\n" +
        "1.6.0\tMeta.PROJECT_DOC_URL\thttps://github.com\n" +
        "2.1.0\tCount.PROTOCOL_ACTIVE\t4\n" +
        "2.2.0\tCount.DAW_STUDIO_LAYERS\t3\n" +
        "2.3.0\tCount.USER_IF_PER_LAYER\t3\n" +
        "2.4.0\tChPnt.PORT_CONNECTION\tUSB_HID, ipMIDI_Ethernet, LINK_Ext\n" +
        "2.5.0\tChPnt.TRANSORT_PROTOCOL\tipMIDI, RTP_MIDI, OSC, Generic_MIDI\n" +
        "2.6.0\tChPnt.APP_PROTOCOL\tMCU, HUI, CC#, MPE, OSC_Custom, ASCII\n" +
        "2.7.0\tSuprt.HID_EMULATION\ttrue\n" +
        "2.8.0\tMacro.KVMHot_ASCII_COMB\tShift+S\n" +
        "2.9.0\tChPnt.ASCII_HOT_KEY_CFG\tFOLLOW_KEY_STATE, MODIFIER_ONLY_OUT, SEL_KEY_AUTO_FOCUS\n" +
        "3.1.0\tSuprt.AFTOUCH_POLY\tfalse\n" +
        "3.2.0\tSuprt.AFTOUCH_MONO\tfalse\n" +
        "3.3.0\tSuprt.WHEEL_PITCH\tfalse\n" +
        "3.4.0\tSuprt.WHEEL_MODLTN\tfalse\n" +
        "3.5.0\tSuprt.XY_PAD_RIBBN\tfalse\n" +
        "3.6.0\tBits.CTRL_RESOLUT.\t14\n" +
        "3.7.0\tSuprt.BREATH_CTRL\tfalse\n" +
        "3.8.0\tSuprt.NRPN\ttrue\n" +
        "3.9.0\tSuprt.SysEx\tfalse\n" +
        "4.1.0\tFb.FADER_MOTORIZED\ttrue\n" +
        "4.2.0\tFb.FADER_TOUCH_SENS\ttrue\n" +
        "4.3.0\tFb.ENC_MOTORIZED\tfalse\n" +
        "4.4.0\tFb.ENC_LED_RINGS\ttrue\n" +
        "4.5.0\tFb.ENC_LED_STATE\ttrue\n" +
        "4.6.0\tFb.BUTTON_STATES\ttrue\n" +
        "4.7.0\tFb.LEDS_PEAK_METERS\ttrue\n" +
        "4.8.0\tCount.LEDS_METER_SEG\t10\n" +
        "4.9.0\tCount.BUTTON_LED\t24\n" +
        "4.10.0\tChPnt.BUTTON_LEDS_COLOR\tmonochrome\n" +
        "5.1.0\tFb.SCRIBBLE_STRIPS\ttrue\n" +
        "5.2.0\tFb.LCD_RESPONSABLE\ttrue\n" +
        "5.3.0\tFb.LCD_METER_BRIDGE\ttrue\n" +
        "5.4.0\tFb.LED_7SEG\ttrue\n" +
        "5.5.0\tParam.LED_7SEG\ttime_code\n" +
        "5.6.0\tCount.LED_7SEG_CHARS\t10\n" +
        "5.7.0\tCount.MCU_CHARS_CHAN\t7\n" +
        "5.8.0\tCount.HUI_CHARS_CHAN\t4\n" +
        "5.9.0\tChar.LCD_CHAN_SPACER\tspace\n" +
        "5.10.0\tCount.LCD_MSG_CHARS\t2x56\n" +
        "6.1.0\tSuprt.FADER_TOUCH_SENS\ttrue\n" +
        "6.2.0\tSuprt.FADER_MOTORIZED\ttrue\n" +
        "6.3.0\tSuprt.FADER_MASTER\tfalse\n" +
        "6.4.0\tSuprt.FLIP_STATE\ttrue\n" +
        "6.5.0\tSuprt.JOG_WHEEL\ttrue\n" +
        "6.6.0\tSuprt.JOG_SRUB_MOD\ttrue\n" +
        "6.7.0\tCount.CHANNEL\t8\n" +
        "6.8.0\tCount.FADERS\t8\n" +
        "6.9.0\tCount.BUTTON\t24\n" +
        "6.10.0\tCount.ENC_VPOT\t8\n" +
        "6.11.0\tCount.ENC_SW\t8\n" +
        "6.12.0\tCount.MAIN_SOFT_BTN\t20\n" +
        "6.13.0\tCount.MODE_SOFT_BTN\t8\n" +
        "6.14.0\tCount.EXT_SOFT_SW\t8\n" +
        "6.15.0\tCount.EXT_FOOT_SW\t2\n" +
        "7.1.0\tSuprt.BANK_STEP_SHIFT\ttrue\n" +
        "7.2.0\tSuprt.CHAN_STEP_SHIFT\ttrue\n" +
        "7.3.0\tSuprt.NAV_MOD_SW\ttrue\n" +
        "7.4.0\tSuprt.NAV_RAW_LR\ttrue\n" +
        "7.5.0\tSuprt.NAV_RAW_UD\ttrue\n" +
        "7.6.0\tSuprt.AUTOMATION\ttrue\n" +
        "7.7.0\tChPnt.AUTOMATION\tREAD, WRITE, REC, TOUCH, LATCH, TRIM\n" +
        "7.8.0\tChPnt.MMC\tSTOP, PLAY, REC, PREV, NEXT, CYCLE\n" +
        "7.9.0\tChPnt.MMC_ALT\tRTZ, END, LOOP\n"
        "7.10.0\tChPnt.MCU_SUB_MODES\tDFLT, INSTR, TRACK, PAN, EQ, SEND, PLUGIN\n" +
        "7.11.0\tChPnt.HUI_SUB_MODES\tDFLT, MUTE, A.SND, B.SND, C.SND, D.SND, E.SND, PAN\n" +
        "7.12.0\tMap.dflt_CH_FADER\tvolume\n" +
        "7.13.0\tMap.dflt_CH_ENC\tpan\n" +
        "7.14.0\tMap.dflt_CH_ENC_SW\tRST\n" +
        "7.15.0\tMap.dflt_CH_BTN_0\tselect\n" +
        "7.16.0\tMap.dflt_CH_BTN_1\tmute\n" +
        "7.17.0\tMap.dflt_CH_BTN_2\tsolo\n" +
        "7.18.0\tMap.dflt_CH_BTN_3\tNA\n" +


    fs.writeFileSync(path.join(MAP_DIR, 'ssl-nucleus-2.txt'), sslTxt, 'utf-8');
    console.log('--- 3-колоночный модуль [ssl-nucleus-2.txt] успешно создан на диске! ---');
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
