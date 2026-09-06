// midi/protocols/abstract.js
// Абстрактный слой команд — универсальный язык для всех протоколов

export const ABSTRACT_COMMANDS = {
    // Кнопки каналов
    MUTE: 'mute',
    SOLO: 'solo',
    SELECT: 'select',
    
    // Транспорт
    PLAY: 'play',
    STOP: 'stop',
    RECORD: 'record',
    REWIND: 'rewind',
    FAST_FORWARD: 'fastForward',
    LOOP: 'loop',
    UNDO: 'undo',
    
    // Фейдеры и энкодеры
    FADER: 'fader',
    VPOT: 'vpot',
    VPOT_PRESS: 'vpotPress',
    
    // Касание
    TOUCH: 'touch',
    RELEASE: 'release',
    
    // Навигация
    BANK_UP: 'bankUp',
    BANK_DOWN: 'bankDown',
    CHANNEL_UP: 'channelUp',
    CHANNEL_DOWN: 'channelDown',
    
    // Модификаторы
    SHIFT: 'shift',
    OPTION: 'option',
    CONTROL: 'control',
    ALT: 'alt'
};

export const ABSTRACT_STATES = {
    ON: 'on',
    OFF: 'off',
    UP: 'up',
    DOWN: 'down',
    LEFT: 'left',
    RIGHT: 'right',
    PRESS: 'press',
    RELEASE: 'release'
};

export const ABSTRACT_TYPES = {
    BUTTON: 'button',
    FADER: 'fader',
    ENCODER: 'encoder',
    TRANSPORT: 'transport'
};