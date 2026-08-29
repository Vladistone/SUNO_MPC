// src/MIDIenv/PrtclScan.js
// Сканирование протоколов

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger('[PRTCL-SCAN]');

let _protocolsCache = null;

export async function scanProtocols(forceRescan = false) {
    try {
        if (!forceRescan && _protocolsCache) return _protocolsCache;
        
        const protocolsDir = path.resolve(__dirname, '../../protocols');
        try { await fs.access(protocolsDir); } catch { return []; }

        const files = await fs.readdir(protocolsDir);
        const protocolFiles = files.filter(f => 
            f.endsWith('.js') && !f.startsWith('abstract') && !f.startsWith('template')
        );

        const protocols = [];
        for (const file of protocolFiles) {
            try {
                const module = await import(`../../protocols/${file}`);
                const ProtocolClass = module.default || module[Object.keys(module)[0]];
                if (ProtocolClass && typeof ProtocolClass === 'function') {
                    const instance = new ProtocolClass();
                    if (instance.name) {
                        protocols.push({
                            name: instance.name,
                            version: instance.version || '1.0',
                            file,
                            id: file.replace('.js', ''),
                            instance
                        });
                    }
                }
            } catch (error) {
                logger.warn(`⚠️ Не удалось загрузить протокол ${file}:`, error.message);
            }
        }
        _protocolsCache = protocols;
        return protocols;
    } catch (error) {
        logger.error('❌ Ошибка сканирования протоколов:', error.message);
        return [];
    }
}