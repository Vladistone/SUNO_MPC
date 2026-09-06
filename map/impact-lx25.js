export const IMPACT_LX25_PLUS = {
    id: 'impact-lx25-plus',
    name: 'Nektar Impact LX25+',
    vendor: 'Nektar',
    protocols: ['Generic_MIDI'], // Он общается стандартными CC и нотами
    defaultProtocol: 'Generic_MIDI',
    ports: {
        available: [
            { 
                id: 'pair-1', 
                input: 'Impact LX25+ MIDI1', 
                output: 'Impact LX25+ MIDI1', 
                description: 'Основная клавиатура и ручки', 
                mode: 'track', 
                offset: 0 
            },
            { 
                // АСИММЕТРИЧНЫЙ ПОРТ: Выход равен 'none', так как в macOS его физически нет!
                id: 'pair-2', 
                input: 'Impact LX25+ MIDI2', 
                output: 'none', 
                description: 'Порт интеграции DAW (Только Вход)', 
                mode: 'track', 
                offset: 8 
            }
        ],
        default: 'Impact LX25+ MIDI1'
    },
    hardware: {
        channels: 1, // Базовый MIDI канал
        faderResolution: 7, // Стандартное разрешение CC (0-127)
        vpotCount: 8,
        hasLCD: false,
        hasLED: false
    },
    // Кастомная таблица мэппинга для ручек и падов Nektar
    mappingTable: {
        global: {},
        modes: {
            track: {
                elements: {
                    // Здесь вы сможете сопоставить CC-номера ручек Nektar с командами Suno
                    cc: {
                        7: { type: 'fader', channel: 0 }, // Допустим, фейдер громкости на клавиатуре
                        10: { type: 'vpot', channel: 0 }  // Ручка панорамы
                    }
                },
                buttons: {}
            }
        }
    }
};
