// core/CfgMgr.js
// Управление конфигурацией

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new Logger('[CONFIG]');
const CONFIG_PATH = path.resolve(__dirname, '../config/Default_Cfg.json');

export async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        const config = JSON.parse(data);
        if (!config.deviceId || !config.protocolId) {
            logger.warn('⚠️ Конфигурация неполная');
            return null;
        }
        return config;
    } catch {
        logger.log('ℹ️ Файл конфигурации не найден');
        return null;
    }
}

export async function saveConfig(deviceId, protocolId, ports) {
    try {
        const config = {
            deviceId: deviceId,
            protocolId: protocolId,
            ports: {},
            timestamp: new Date().toISOString()
        };
        
        // Сохраняем порты для конкретного устройства
        if (ports) {
            config.ports[deviceId] = {};
            
            // Левая панель
            if (ports.left) {
                config.ports[deviceId].left = {
                    input: ports.left.input,
                    output: ports.left.output,
                    mode: ports.left.mode || 'track',
                    offset: ports.left.offset || 0
                };
            }
            
            // Правая панель
            if (ports.right) {
                config.ports[deviceId].right = {
                    input: ports.right.input,
                    output: ports.right.output,
                    mode: ports.right.mode || 'fx',
                    offset: ports.right.offset || 8
                };
            }
            
            // Для обратной совместимости: если ports — это массив или объект с input/output
            if (ports.input && ports.output) {
                config.ports[deviceId].input = ports.input;
                config.ports[deviceId].output = ports.output;
                config.ports[deviceId].mode = ports.mode || 'track';
                config.ports[deviceId].offset = ports.offset || 0;
            }
        }
        
        const configDir = path.dirname(CONFIG_PATH);
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
        logger.log('💾 Конфигурация сохранена');
        return config;
    } catch (error) {
        logger.warn('⚠️ Не удалось сохранить конфигурацию:', error.message);
        return null;
    }
}

export async function updateConfigPorts(deviceId, ports) {
    const config = await loadConfig();
    if (!config) return null;
    if (!config.ports) config.ports = {};
    if (!config.ports[deviceId]) config.ports[deviceId] = {};
    
    // Обновляем порты для левой панели
    if (ports.left) {
        config.ports[deviceId].left = {
            input: ports.left.input,
            output: ports.left.output,
            mode: ports.left.mode || 'track',
            offset: ports.left.offset || 0
        };
    }
    
    // Обновляем порты для правой панели
    if (ports.right) {
        config.ports[deviceId].right = {
            input: ports.right.input,
            output: ports.right.output,
            mode: ports.right.mode || 'fx',
            offset: ports.right.offset || 8
        };
    }
    
    config.timestamp = new Date().toISOString();
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
        logger.log('💾 Порты обновлены');
        return config;
    } catch (error) {
        logger.warn('⚠️ Не удалось обновить порты:', error.message);
        return null;
    }
}

export function isConfigValid(config, devices, protocols, midiDevices) {
    if (!config) return false;
    
    const savedDevice = devices.find(d => d.id === config.deviceId);
    const savedProtocol = protocols.find(p => p.id === config.protocolId);
    if (!savedDevice || !savedProtocol) return false;
    
    if (config.ports && config.ports[savedDevice.id]) {
        const devicePorts = config.ports[savedDevice.id];
        
        // Проверяем левую панель
        if (devicePorts.left) {
            const leftValid = midiDevices.inputs.includes(devicePorts.left.input) &&
                             midiDevices.outputs.includes(devicePorts.left.output);
            if (!leftValid) {
                logger.warn(`⛓️ L панель: порты ${devicePorts.left.input} → ${devicePorts.left.output} недоступны`);
                return false;
            }
        }
        
        // Проверяем правую панель
        if (devicePorts.right) {
            const rightValid = midiDevices.inputs.includes(devicePorts.right.input) &&
                               midiDevices.outputs.includes(devicePorts.right.output);
            if (!rightValid) {
                logger.warn(`⛓️ R панель: порты ${devicePorts.right.input} → ${devicePorts.right.output} недоступны`);
                return false;
            }
        }
        
        // Обратная совместимость: если есть прямой input/output
        if (devicePorts.input && devicePorts.output) {
            return midiDevices.inputs.includes(devicePorts.input) &&
                   midiDevices.outputs.includes(devicePorts.output);
        }
        
        // Если нет ни left, ни right, ни input/output — конфигурация невалидна
        return !!(devicePorts.left || devicePorts.right || devicePorts.input);
    }
    
    return false;
}