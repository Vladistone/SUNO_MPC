// midi/devices/ssl-nucleus-2.js
// Конфигурация SSL Nucleus 2

export const SSL_NUCLEUS_2 = {
    name: 'SSL Nucleus 2',
    vendor: 'SSL',
    protocols: ['HUI', 'MCU'],
    defaultProtocol: 'HUI',
    
    // MIDI-порты
    ports: {
        input: 'ipMIDI Port 5',
        output: 'ipMIDI Port 5'
    },
    
    // Аппаратные параметры
    hardware: {
        channels: 8,
        faderResolution: 14, // 14-бит (0-16383)
        vpotCount: 8,
        hasLCD: true,
        lcdChars: 4,
        hasLED: true
    },
    
    // Маппинг элементов управления
    mapping: {
        // Фейдеры (каналы 0-7)
        faders: {
            type: 'pitchBend',
            channels: [0, 1, 2, 3, 4, 5, 6, 7]
        },
        
        // V-Pots (каналы 0-7)
        vpots: {
            type: 'cc',
            controllers: [16, 17, 18, 19, 20, 21, 22, 23]
        },
        
        // V-Pot нажатие
        vpotPress: {
            type: 'cc',
            controller: 15,
            values: [0, 1, 2, 3, 4, 5, 6, 7] // зоны
        },
        
        // Кнопки каналов (Mute/Solo/Select)
        channelButtons: {
            type: 'cc',
            controller: 47,
            commands: {
                mute: { on: 66, off: 2 },
                solo: { on: 67, off: 3 },
                select: { on: 65, off: 1 }
            }
        },
        
        // Транспорт (Note On)
        transport: {
            play: 94,
            stop: 93,
            record: 92,
            rewind: 91,
            fastForward: 90,
            loop: 86,
            undo: 75
        },
        
        // Навигация
        navigation: {
            bankUp: 104,
            bankDown: 105,
            channelUp: 103,
            channelDown: 102
        },
        
        // Модификаторы
        modifiers: {
            shift: 101,
            option: 100,
            control: 99,
            alt: 98
        }
    },
    
    // Цвета LED для Nucleus 2
    ledColors: {
        green: 127,
        yellow: 63,
        red: 1,
        off: 0
    }
};