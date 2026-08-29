// src/MIDIenv/PortScan.js
// Сканирование MIDI-портов

import easymidi from 'easymidi';
import Logger from '../../utils/Logger.js';

const logger = new Logger('[PORT-SCAN]');

export async function detectMidiPorts() {
    try {
        const inputs = easymidi.getInputs();
        const outputs = easymidi.getOutputs();
        return { inputs, outputs };
    } catch (error) {
        logger.error('❌ Ошибка сканирования портов:', error.message);
        return { inputs: [], outputs: [] };
    }
}

export function validatePorts(config, ports) {
    if (!config?.ports) return false;
    const port = config.ports[config.deviceId];
    if (!port) return false;
    return ports.inputs.includes(port.input) && ports.outputs.includes(port.output);
}