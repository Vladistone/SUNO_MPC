// src/MIDIenv/DevScan.js
// Сканирование устройств

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger('[DEV-SCAN]');

let _devicesCache = null;

export async function scanDevices(midiPorts, forceRescan = false) {
    try {
        if (!forceRescan && _devicesCache) return _devicesCache;
        
        const devicesDir = path.resolve(__dirname, '../../map');
        try { await fs.access(devicesDir); } catch { return []; }

        const files = await fs.readdir(devicesDir);
        const deviceFiles = files.filter(f => f.endsWith('.js') && !f.startsWith('template'));

        const devices = [];
        for (const file of deviceFiles) {
            try {
                const module = await import(`../../map/${file}`);
                const device = module.default || module[Object.keys(module)[0]];
                if (device?.name) {
                    if (device.ports?.available) {
                        const validPorts = device.ports.available.filter(p =>
                            midiPorts.inputs.includes(p.input) &&
                            midiPorts.outputs.includes(p.output)
                        );
                        device.isAvailable = validPorts.length > 0;
                        if (validPorts.length > 0) { // Сохраняем offset для выбранного порта
                            device.ports.selected = validPorts[0];
                            device.channelOffset = validPorts[0].offset || 0;
                        }
                    }
                    devices.push({
                        ...device,
                        file,
                        id: file.replace('.js', '')
                    });
                }
            } catch (error) {
                logger.warn(`⚠️ Не удалось загрузить ${file}:`, error.message);
            }
        }
        _devicesCache = devices;
        return devices;
    } catch (error) {
        logger.error('❌ Ошибка сканирования устройств:', error.message);
        return [];
    }
}