// src/MIDIenv/DevScan.js
// Сканирование устройств

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new Logger('[DvSCAN]');

let _devicesCache = null;

export async function scanDevices(midiPorts, forceRescan = false) {
    try {
        if (!forceRescan && _devicesCache) return _devicesCache;
        
        // Папка с файлами маппингов/устройств (SUNO/map)
        const devicesDir = path.resolve(__dirname, '../../map');
        try { 
            await fs.access(devicesDir); 
        } catch { 
            return []; 
        }
        
        const files = await fs.readdir(devicesDir);
        const deviceFiles = files.filter(f => f.endsWith('.js') && !f.startsWith('template'));
        const devices = [];
        
        // ПЕРЕБОР ФАЙЛОВ НА ДИСКЕ
        for (const file of deviceFiles) {
            try {
                // 1. ДИНАМИЧЕСКИЙ ИМПОРТ: загружаем контент файла (например, ssl-nucleus-2.js или impact-lx25.js)
                const fileUrl = `file://${path.join(devicesDir, file)}`;
                const module = await import(fileUrl);
                
                // Извлекаем объект устройства (берем default или первый попавшийся экспорт)
                const rawDevice = module.default || module[Object.keys(module)[0]];
                if (!rawDevice) continue;

                // Создаем глубокую копию объекта, чтобы не портить кэш модулей Node.js
                const device = JSON.parse(JSON.stringify(rawDevice));
                // Восстанавливаем оригинальный id на основе имени файла (без расширения .js)
                device.id = rawDevice.id || file.replace('.js', '');

                // 2. БЕЗОПАСНАЯ ИЗОЛИРОВАННАЯ ФИЛЬТРАЦИЯ ПОРТОВ (С ЗАЩИТОЙ ОТ АСИММЕТРИИ)
                if (device.ports && device.ports.available) {
                    const validPorts = device.ports.available.filter(p => {
                        // Проверяем вход и выход абсолютно независимо (учитываем 'none' или асимметрию)
                        const hasInput = p.input && p.input !== 'none' ? midiPorts.inputs.includes(p.input) : true;
                        const hasOutput = p.output && p.output !== 'none' ? midiPorts.outputs.includes(p.output) : true;
                        
                        // Порт валиден, если его заявленные физические порты реально присутствуют в macOS
                        return (p.input && p.input !== 'none' && hasInput) || (p.output && p.output !== 'none' && hasOutput);
                    });

                    // Устройство доступно для выбора, если у него ожил хотя бы один порт из шаблона
                    device.isAvailable = validPorts.length > 0;
                    
                    if (validPorts.length > 0) {
                        device.ports.selected = validPorts;
                    }
                } else {
                    device.isAvailable = false;
                }

                // Добавляем успешно распарсенное устройство в общий массив
                devices.push(device);

            } catch (fileError) {
                // Ошибка изоляции: если один файл кривой, сканер не падает, а идет к следующему файлу!
                logger.warn(`⚠️ Не удалось загрузить ${file}: ${fileError.message}`);
            }
        }
        
        _devicesCache = devices;
        return devices;

    } catch (error) {
        logger.error('❌ Ошибка сканирования устройств:', error.message);
        return [];
    }
}
