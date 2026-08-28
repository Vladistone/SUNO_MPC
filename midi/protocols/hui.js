// midi/protocols/hui.js
// Реализация HUI-протокола (Mackie HUI)

import { ABSTRACT_COMMANDS, ABSTRACT_STATES } from './abstract.js';

export class HUIProtocol {
    constructor() {
        this.name = 'HUI';
        this.version = '1.0';
        
        // Маппинг CC#47 значений в абстрактные команды
        this.commandMap = {
            // MUTE
            66: { command: ABSTRACT_COMMANDS.MUTE, state: ABSTRACT_STATES.ON },
            2: { command: ABSTRACT_COMMANDS.MUTE, state: ABSTRACT_STATES.OFF },
            
            // SOLO
            67: { command: ABSTRACT_COMMANDS.SOLO, state: ABSTRACT_STATES.ON },
            3: { command: ABSTRACT_COMMANDS.SOLO, state: ABSTRACT_STATES.OFF },
            
            // SELECT
            65: { command: ABSTRACT_COMMANDS.SELECT, state: ABSTRACT_STATES.ON },
            1: { command: ABSTRACT_COMMANDS.SELECT, state: ABSTRACT_STATES.OFF },
            
            // TOUCH
            64: { command: ABSTRACT_COMMANDS.TOUCH },
            0: { command: ABSTRACT_COMMANDS.RELEASE }
        };
        
        // Маппинг Note On для транспорта
        this.noteMap = {
            94: { command: ABSTRACT_COMMANDS.PLAY },
            93: { command: ABSTRACT_COMMANDS.STOP },
            92: { command: ABSTRACT_COMMANDS.RECORD },
            91: { command: ABSTRACT_COMMANDS.REWIND },
            90: { command: ABSTRACT_COMMANDS.FAST_FORWARD },
            86: { command: ABSTRACT_COMMANDS.LOOP },
            75: { command: ABSTRACT_COMMANDS.UNDO }
        };
    }
    
    // Парсинг входящего MIDI-сообщения в абстрактную команду
    parse(message) {
        const { controller, value, note, channel, type } = message;
        
        // 1. Control Change (CC)
        if (type === 'cc' || type === 'controlChange') {
            // CC#15 — выбор зоны/канала
            if (controller === 15) {
                return {
                    type: ABSTRACT_COMMANDS.SELECT,
                    state: ABSTRACT_STATES.PRESS,
                    channel: value & 0x07,
                    raw: message
                };
            }
            
            // CC#47 — кнопки Mute/Solo/Select/Touch
            if (controller === 47) {
                const cmd = this.commandMap[value];
                if (cmd) {
                    return {
                        type: cmd.command,
                        state: cmd.state || ABSTRACT_STATES.PRESS,
                        channel: this._getChannel(message),
                        raw: message
                    };
                }
            }
            
            // CC#16-23 — V-Pots (панорама, sends)
            if (controller >= 16 && controller <= 23) {
                return {
                    type: ABSTRACT_COMMANDS.VPOT,
                    value: value,
                    channel: controller - 16,
                    controller: controller,
                    raw: message
                };
            }
            
            // CC#0-7 — MSB фейдеров
            if (controller >= 0 && controller <= 7) {
                return {
                    type: ABSTRACT_COMMANDS.FADER,
                    value: value,
                    channel: controller,
                    isMSB: true,
                    raw: message
                };
            }
        }
        
        // 2. Pitch Bend (фейдеры)
        if (type === 'pitchBend' || type === 'pitchWheelChange') {
            const channel = message.channel || 0;
            if (channel >= 0 && channel <= 7) {
                return {
                    type: ABSTRACT_COMMANDS.FADER,
                    value: message.value || message.pitch || 8192,
                    channel: channel,
                    raw: message
                };
            }
        }
        
        // 3. Note On (транспорт и другие кнопки)
        if (type === 'noteOn' || type === 'noteon') {
            const note = message.note || message.data1;
            const cmd = this.noteMap[note];
            if (cmd) {
                return {
                    type: cmd.command,
                    state: ABSTRACT_STATES.PRESS,
                    raw: message
                };
            }
        }
        
        return null;
    }
    
    // Форматирование абстрактной команды в MIDI для обратной связи
    format(command) {
        const { type, state, channel, value } = command;
        
        // Обратный маппинг для CC#47
        const reverseCommandMap = {
            'mute': { on: 66, off: 2 },
            'solo': { on: 67, off: 3 },
            'select': { on: 65, off: 1 }
        };
        
        if (type === ABSTRACT_COMMANDS.MUTE || 
            type === ABSTRACT_COMMANDS.SOLO || 
            type === ABSTRACT_COMMANDS.SELECT) {
            
            const map = reverseCommandMap[type];
            if (map) {
                const ccValue = state === ABSTRACT_STATES.ON ? map.on : map.off;
                return {
                    type: 'cc',
                    controller: 47,
                    value: ccValue,
                    channel: channel || 0
                };
            }
        }
        
        // Fader (Pitch Bend)
        if (type === ABSTRACT_COMMANDS.FADER) {
            return {
                type: 'pitchBend',
                value: Math.round((value / 127) * 16383),
                channel: channel || 0
            };
        }
        
        // V-Pot (Control Change)
        if (type === ABSTRACT_COMMANDS.VPOT) {
            const controller = 16 + (channel || 0);
            return {
                type: 'cc',
                controller: controller,
                value: value || 64,
                channel: 0
            };
        }
        
        return null;
    }
    
    _getChannel(message) {
        return message.channel || 0;
    }
}