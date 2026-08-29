export const SSL_NUCLEUS_2 = {
    name: 'SSL Nucleus 2',
    vendor: 'SSL',
    protocols: ['HUI', 'MCU'],
    defaultProtocol: 'HUI',
    ports: {
        available: [
            { id: 'pair-1', input: 'ipMIDI Port 1', output: 'ipMIDI Port 1', description: 'Левая панель', mode: 'track', offset: 0 },
            { id: 'pair-2', input: 'ipMIDI Port 2', output: 'ipMIDI Port 2', description: 'Правая панель', mode: 'fx', offset: 8 },
            { id: 'pair-3', input: 'ipMIDI Port 3', output: 'ipMIDI Port 3', description: 'Левая панель', mode: 'track', offset: 0 },
            { id: 'pair-4', input: 'ipMIDI Port 4', output: 'ipMIDI Port 4', description: 'Правая панель', mode: 'fx', offset: 8 },
            { id: 'pair-5', input: 'ipMIDI Port 5', output: 'ipMIDI Port 5', description: 'Левая панель', mode: 'track', offset: 0 },
            { id: 'pair-6', input: 'ipMIDI Port 6', output: 'ipMIDI Port 6', description: 'Правая панель', mode: 'fx', offset: 8 }
        ],
        default: 'ipMIDI Port 5'
    },
    hardware: {
        channels: 16,
        faderResolution: 14,
        vpotCount: 16,
        hasLCD: true,
        lcdChars: 4,
        hasLED: true
    },
    ledColors: {
        green: 127,
        yellow: 63,
        red: 1,
        off: 0
    }
};
