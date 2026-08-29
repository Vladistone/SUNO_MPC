// src/MIDIenv/DevTemplate.js
// Шаблон для добавления нового MIDI-контроллера

export default {
    name: 'My Controller',
    vendor: 'My Vendor',
    protocols: ['HUI', 'MCU'],
    defaultProtocol: 'HUI',
    
    ports: {
        input: 'My MIDI Input',
        output: 'My MIDI Output'
    },
    
    hardware: {
        channels: 8,
        faderResolution: 14,
        vpotCount: 8,
        hasLCD: false,
        lcdChars: 4,
        hasLED: false
    },
    
    mapping: {
        faders: {
            type: 'pitchBend',
            channels: [0, 1, 2, 3, 4, 5, 6, 7]
        },
        vpots: {
            type: 'cc',
            controllers: [16, 17, 18, 19, 20, 21, 22, 23]
        },
        channelButtons: {
            type: 'cc',
            controller: 47,
            commands: {
                mute: { on: 66, off: 2 },
                solo: { on: 67, off: 3 },
                select: { on: 65, off: 1 }
            }
        },
        transport: {
            play: 94,
            stop: 93,
            record: 92,
            rewind: 91,
            fastForward: 90,
            loop: 86,
            undo: 75
        }
    }
};