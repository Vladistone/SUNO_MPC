export const SSL_NUCLEUS_2 = {
    name: 'SSL Nucleus 2',
    vendor: 'SSL',
    protocols: ['HUI', 'MCU'],
    defaultProtocol: 'HUI',
    ports: {
        available: [
            { id: 'pair-1', input: 'ipMIDI Port 1', output: 'ipMIDI Port 1', description: 'L panel', mode: 'track', offset: 0 },
            { id: 'pair-2', input: 'ipMIDI Port 2', output: 'ipMIDI Port 2', description: 'R panel', mode: 'track', offset: 8 },
            { id: 'pair-3', input: 'ipMIDI Port 3', output: 'ipMIDI Port 3', description: 'L panel', mode: 'track', offset: 0 },
            { id: 'pair-4', input: 'ipMIDI Port 4', output: 'ipMIDI Port 4', description: 'R panel', mode: 'track', offset: 8 },
            { id: 'pair-5', input: 'ipMIDI Port 5', output: 'ipMIDI Port 5', description: 'L panel', mode: 'track', offset: 0 },
            { id: 'pair-6', input: 'ipMIDI Port 6', output: 'ipMIDI Port 6', description: 'R panel', mode: 'fx', offset: 8 }
        ],
        default: 'ipMIDI Port 1'
    },
    hardware: {
        channels: 16,
        faderResolution: 14,
        vpotCount: 16,
        hasLCD: true,
        lcdChars: 4,
        hasLED: true
    },
    ledColors: { green: 127, yellow: 63, red: 1,off: 0
    },

    // ============================================================
    // МЭППИНГ ТАБЛИЦА КОНКРЕТНОГО КОНТРОЛЛЕРА (Локализация)
    // ============================================================
    mappingTable: {
        global: {
            // Зона 10 (0x0A) системных кнопок навигации Nucleus 2
            10: {
                0: 'chan_prev', // Функция 0 -> CHAN <
                1: 'bank_prev', // Функция 1 -> BANK <
                2: 'chan_next', // Функция 2 -> CHAN >
                3: 'bank_next'  // Функция 3 -> BANK >
            }
        },
        modes: {
            track: {
                elements: { fader: { type: 'fader' }, vpot: { type: 'vpot' } },
                buttons: { 0: { type: 'select' }, 1: { type: 'mute' }, 2: { type: 'solo' } }
            },
            fx: {
                elements: { fader: { type: 'fx_send_level' }, vpot: { type: 'fx_param' } },
                buttons: { 0: { type: 'fx_bypass' }, 1: { type: 'fx_send_select', index: 1 }, 2: { type: 'fx_send_select', index: 2 } }
            }
        }
    } // <-- Конец таблицы
};
