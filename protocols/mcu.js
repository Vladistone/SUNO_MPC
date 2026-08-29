// midi/protocols/mcu.js
// Реализация MCU-протокола (Mackie Control Universal)
// MCU — это более старый, но широко распространённый протокол для контроллеров

import { ABSTRACT_COMMANDS, ABSTRACT_STATES } from './abstract.js';

export class MCUProtocol {
    constructor() {
        this.name = 'MCU';
        this.version = '1.0';
        
        // Маппинг MIDI-сообщений в абстрактные команды
        this.commandMap = {
            // MUTE (CC#44 в MCU)
            44: {
                command: ABSTRACT_COMMANDS.MUTE,
                onValue: 127,
                offValue: 0
            },
            // SOLO (CC#45 в MCU)
            45: {
                command: ABSTRACT_COMMANDS.SOLO,
                onValue: 127,
                offValue: 0
            },
            // SELECT (CC#46 в MCU)
            46: {
                command: ABSTRACT_COMMANDS.SELECT,
                onValue: 127,
                offValue: 0
            },
            // FADER TOUCH (CC#47 в MCU)
            47: {
                command: ABSTRACT_COMMANDS.TOUCH,
                onValue: 127,
                offValue: 0
            }
        };
        
        // Маппинг Note On для транспорта (MCU использует Note On)
        this.noteMap = {
            // Транспорт
            0x5B: { command: ABSTRACT_COMMANDS.PLAY },      // 91
            0x5C: { command: ABSTRACT_COMMANDS.STOP },       // 92
            0x5D: { command: ABSTRACT_COMMANDS.RECORD },     // 93
            0x5E: { command: ABSTRACT_COMMANDS.REWIND },     // 94
            0x5F: { command: ABSTRACT_COMMANDS.FAST_FORWARD }, // 95
            0x56: { command: ABSTRACT_COMMANDS.LOOP },       // 86
            0x57: { command: ABSTRACT_COMMANDS.UNDO },       // 87
            
            // Навигация (банки)
            0x60: { command: ABSTRACT_COMMANDS.BANK_UP },    // 96
            0x61: { command: ABSTRACT_COMMANDS.BANK_DOWN },  // 97
            0x62: { command: ABSTRACT_COMMANDS.CHANNEL_UP }, // 98
            0x63: { command: ABSTRACT_COMMANDS.CHANNEL_DOWN } // 99
        };
        
        // Маппинг каналов фейдеров (MCU использует Pitch Bend на каналах 0-7)
        this.faderChannels = [0, 1, 2, 3, 4, 5, 6, 7];
        
        // Маппинг V-Pot (CC#16-23 в MCU)
        this.vpotControllers = [16, 17, 18, 19, 20, 21, 22, 23];
        
        // Маппинг V-Pot нажатие (CC#56-63 в MCU)
        this.vpotPressControllers = [56, 57, 58, 59, 60, 61, 62, 63];
    }

    /**
     * Парсинг входящего MIDI-сообщения в абстрактную команду
     */
    parse(message) {
        const { controller, value, note, channel, type } = message;

        // --- 1. Control Change (CC) ---
        if (type === 'cc' || type === 'controlChange') {
            // Фейдеры — MSB (CC#0-7)
            if (controller >= 0 && controller <= 7) {
                return {
                    type: ABSTRACT_COMMANDS.FADER,
                    value: value,
                    channel: controller,
                    isMSB: true,
                    raw: message
                };
            }
            
            // V-Pots (CC#16-23)
            if (controller >= 16 && controller <= 23) {
                return {
                    type: ABSTRACT_COMMANDS.VPOT,
                    value: value,
                    channel: controller - 16,
                    controller: controller,
                    raw: message
                };
            }
            
            // V-Pot нажатие (CC#56-63)
            if (controller >= 56 && controller <= 63) {
                return {
                    type: ABSTRACT_COMMANDS.VPOT_PRESS,
                    state: value > 0 ? ABSTRACT_STATES.PRESS : ABSTRACT_STATES.RELEASE,
                    channel: controller - 56,
                    raw: message
                };
            }
            
            // Кнопки каналов (Mute/Solo/Select/Touch — CC#44-47)
            if (controller >= 44 && controller <= 47) {
                const map = this.commandMap[controller];
                if (map) {
                    const state = value >= 64 ? ABSTRACT_STATES.ON : ABSTRACT_STATES.OFF;
                    // Для кнопок каналов — определяем канал из активной зоны
                    const channel = this._getChannel(message) || 0;
                    return {
                        type: map.command,
                        state: state,
                        channel: channel,
                        raw: message
                    };
                }
            }
        }

        // --- 2. Pitch Bend (фейдеры) ---
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

        // --- 3. Note On (транспорт, навигация, модификаторы) ---
        if (type === 'noteOn' || type === 'noteon') {
            const noteNum = message.note || message.data1;
            const velocity = message.velocity || message.data2 || 127;
            
            // Проверяем маппинг Note
            if (this.noteMap[noteNum]) {
                const cmd = this.noteMap[noteNum];
                return {
                    type: cmd.command,
                    state: velocity > 0 ? ABSTRACT_STATES.PRESS : ABSTRACT_STATES.RELEASE,
                    raw: message
                };
            }
        }

        return null;
    }

    /**
     * Форматирование абстрактной команды в MIDI для обратной связи
     */
    format(command) {
        const { type, state, channel, value } = command;
        const ch = channel || 0;

        // --- 1. Кнопки каналов (Mute/Solo/Select) ---
        const buttonMap = {
            'mute': { controller: 44, on: 127, off: 0 },
            'solo': { controller: 45, on: 127, off: 0 },
            'select': { controller: 46, on: 127, off: 0 },
            'touch': { controller: 47, on: 127, off: 0 }
        };

        if (buttonMap[type]) {
            const map = buttonMap[type];
            const ccValue = state === ABSTRACT_STATES.ON ? map.on : map.off;
            return {
                type: 'cc',
                controller: map.controller,
                value: ccValue,
                channel: ch
            };
        }

        // --- 2. Fader (Pitch Bend) ---
        if (type === ABSTRACT_COMMANDS.FADER) {
            let midiValue = value;
            if (typeof value === 'number' && value <= 1 && value >= 0) {
                midiValue = Math.round(value * 16383);
            } else if (typeof value === 'number' && value <= 127 && value >= 0) {
                midiValue = Math.round((value / 127) * 16383);
            }
            // Ограничиваем диапазон
            midiValue = Math.min(16383, Math.max(0, midiValue));
            return {
                type: 'pitchBend',
                value: midiValue,
                channel: ch
            };
        }

        // --- 3. V-Pot (Control Change) ---
        if (type === ABSTRACT_COMMANDS.VPOT) {
            const controller = 16 + (ch % 8);
            let ccValue = value;
            if (typeof value === 'number' && value <= 1 && value >= 0) {
                ccValue = Math.round(value * 127);
            }
            ccValue = Math.min(127, Math.max(0, ccValue));
            return {
                type: 'cc',
                controller: controller,
                value: ccValue,
                channel: 0
            };
        }

        // --- 4. V-Pot Press ---
        if (type === ABSTRACT_COMMANDS.VPOT_PRESS) {
            const controller = 56 + (ch % 8);
            const ccValue = state === ABSTRACT_STATES.PRESS ? 127 : 0;
            return {
                type: 'cc',
                controller: controller,
                value: ccValue,
                channel: 0
            };
        }

        // --- 5. Транспорт (Note On) ---
        const transportMap = {
            'play': 91,
            'stop': 92,
            'record': 93,
            'rewind': 94,
            'fastForward': 95,
            'loop': 86,
            'undo': 87,
            'bankUp': 96,
            'bankDown': 97,
            'channelUp': 98,
            'channelDown': 99
        };

        if (transportMap[type]) {
            const noteNum = transportMap[type];
            return {
                type: 'noteOn',
                note: noteNum,
                velocity: 127,
                channel: 0
            };
        }

        return null;
    }

    /**
     * Получение канала из сообщения
     */
    _getChannel(message) {
        if (message.channel !== undefined) {
            return message.channel;
        }
        if (message.data && message.data.length > 0) {
            return message.data[0] & 0x0F;
        }
        return 0;
    }
}