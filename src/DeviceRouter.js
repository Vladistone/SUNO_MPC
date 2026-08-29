// src/DeviceRouter.js
// Универсальный маршрутизатор MIDI-команд

import easymidi from 'easymidi';
import Logger from '../utils/Logger.js';

const logger = new Logger('[MIDI-ROUTER]');

export default class DeviceRouter {
    constructor(deviceConfig, protocol) {
        this.device = deviceConfig;
        this.protocol = protocol;
        this.logger = new Logger('[MIDI-ROUTER]');
        this.input = null;
        this.output = null;
        this.handlers = [];
        this.isConnected = false;
        this.mode = deviceConfig.ports?.mode || 'track';
        this.channelOffset = deviceConfig.ports?.offset || 0;
        this.selectedTrack = 0;  // Для FX режима — выделенный трек
        this.guiManager = null;
        
        // Инициализация состояний
        const channelCount = deviceConfig.hardware?.channels || 8;
        this.channelStates = {};
        for (let i = 0; i < channelCount; i++) {
            this.channelStates[i] = {
                fader: 0,
                pan: 64,
                mute: false,
                solo: false,
                select: false,
                isTouched: false,
                fx: {
                    send1: 0,
                    send2: 0,
                    send3: 0,
                    send4: 0,
                    param1: 0,
                    param2: 0,
                    param3: 0
                }
            };
        }
        
        // Регистрация обработчиков для разных режимов
        this.modeHandlers = {
            track: this._handleTrackMode.bind(this),
            fx: this._handleFxMode.bind(this)
        };
    }

    /**
     * Регистрация GUI менеджера
     */
    setGUIManager(guiManager) {
        this.guiManager = guiManager;
        this.logger.log('✅ GUI менеджер зарегистрирован');
    }

    /**
     * Регистрация обработчика абстрактных команд
     */
    onCommand(handler) {
        if (typeof handler === 'function') {
            this.handlers.push(handler);
            this.logger.debug(`✅ Зарегистрирован обработчик (всего: ${this.handlers.length})`);
        }
    }

    // ============================================================
    // ОБРАБОТКА ВХОДЯЩИХ MIDI-СООБЩЕНИЙ
    // ============================================================
    _handleCC(msg) {
        try {
            const abstractCommand = this.protocol.parse({
                type: 'cc',
                controller: msg.controller,
                value: msg.value,
                channel: msg.channel
            });
            if (abstractCommand) {
                this._dispatchCommand(abstractCommand);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки CC:', error.message);
        }
    }

    _handleNoteOn(msg) {
        try {
            const abstractCommand = this.protocol.parse({
                type: 'noteOn',
                note: msg.note,
                velocity: msg.velocity,
                channel: msg.channel
            });
            if (abstractCommand) {
                this._dispatchCommand(abstractCommand);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки Note On:', error.message);
        }
    }

    _handleNoteOff(msg) {
        try {
            const abstractCommand = this.protocol.parse({
                type: 'noteOff',
                note: msg.note,
                velocity: msg.velocity,
                channel: msg.channel
            });
            if (abstractCommand) {
                this._dispatchCommand(abstractCommand);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки Note Off:', error.message);
        }
    }

    _handlePitchBend(msg) {
        try {
            const abstractCommand = this.protocol.parse({
                type: 'pitchBend',
                value: msg.value,
                channel: msg.channel
            });
            if (abstractCommand) {
                this._dispatchCommand(abstractCommand);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки Pitch Bend:', error.message);
        }
    }

    _handleSysEx(msg) {
        try {
            this.logger.debug(`📟 SysEx получен (${msg.length} байт)`);
        } catch (error) {
            this.logger.error('❌ Ошибка обработки SysEx:', error.message);
        }
    }

    /**
     * Отправка команды всем зарегистрированным обработчикам
     */
    _dispatchCommand(command) {
        // Сохраняем состояние канала
        if (command.channel !== undefined) {
            const ch = command.channel;
            switch (command.type) {
                case 'fader':
                    this.channelStates[ch].fader = command.value;
                    break;
                case 'vpot':
                    this.channelStates[ch].pan = command.value;
                    break;
                case 'mute':
                    this.channelStates[ch].mute = command.state === 'on';
                    break;
                case 'solo':
                    this.channelStates[ch].solo = command.state === 'on';
                    break;
                case 'select':
                    this.channelStates[ch].select = command.state === 'on';
                    break;
                case 'touch':
                    this.channelStates[ch].isTouched = true;
                    break;
                case 'release':
                    this.channelStates[ch].isTouched = false;
                    break;
            }
        }
        
        // Вызываем обработчики
        this.handlers.forEach(handler => {
            try {
                handler(command);
            } catch (error) {
                this.logger.error('❌ Ошибка в обработчике:', error.message);
            }
        });
    }

    // ============================================================
    // РЕЖИМЫ РАБОТЫ
    // ============================================================
    async _handleTrackMode(command) {
        if (!this.guiManager) return;
        const channel = command.channel + this.channelOffset;
        switch (command.type) {
            case 'fader':
                await this.guiManager.setVolume(channel, command.value);
                break;
            case 'vpot':
                await this.guiManager.setPan(channel, command.value);
                break;
            case 'mute':
                await this.guiManager.toggleMute(channel, command.state === 'on');
                break;
            case 'solo':
                await this.guiManager.toggleSolo(channel, command.state === 'on');
                break;
            case 'select':
                this.selectedTrack = channel;
                await this.guiManager.selectTrack(channel);
                break;
        }
    }

    async _handleFxMode(command) {
        if (!this.guiManager) return;
        const channel = command.channel;
        const targetTrack = this.selectedTrack || 0;
        
        switch (command.type) {
            case 'fader':
                await this.guiManager.setFxSend(targetTrack, channel, command.value);
                break;
            case 'vpot':
                await this.guiManager.setFxParam(targetTrack, channel, command.value);
                break;
            case 'mute':
                await this.guiManager.toggleFxBypass(targetTrack, channel);
                break;
            case 'solo':
                await this.guiManager.toggleFxSolo(targetTrack, channel);
                break;
            case 'select':
                await this.guiManager.selectFxPreset(targetTrack, channel);
                break;
        }
    }

    // ============================================================
    // ПОДКЛЮЧЕНИЕ К MIDI
    // ============================================================
    async connect(inputName, outputName) {
        try {
            this.logger.log(`🔌 Подключение к MIDI: ${inputName} → ${outputName}`);
            
            const inputs = easymidi.getInputs();
            const outputs = easymidi.getOutputs();
            
            if (!inputs.includes(inputName)) {
                this.logger.warn(`⚠️ Входной порт не найден: ${inputName}`);
                this.logger.log(`📋 Доступные входы: ${inputs.join(', ')}`);
            }
            
            if (!outputs.includes(outputName)) {
                this.logger.warn(`⚠️ Выходной порт не найден: ${outputName}`);
                this.logger.log(`📋 Доступные выходы: ${outputs.join(', ')}`);
            }
            
            this.input = new easymidi.Input(inputName);
            this.logger.log(`✅ MIDI-вход создан: ${inputName}`);
            
            this.output = new easymidi.Output(outputName);
            this.logger.log(`✅ MIDI-выход создан: ${outputName}`);
            
            this.input.on('cc', this._handleCC.bind(this));
            this.input.on('noteon', this._handleNoteOn.bind(this));
            this.input.on('noteoff', this._handleNoteOff.bind(this));
            this.input.on('pitchbend', this._handlePitchBend.bind(this));
            this.input.on('sysex', this._handleSysEx.bind(this));
            
            this.isConnected = true;
            this.logger.log('✅ MIDI-маршрутизатор готов');
            
        } catch (error) {
            this.logger.error('❌ Ошибка подключения MIDI:', error.message);
            throw error;
        }
    }

    // ============================================================
    // ОТПРАВКА MIDI
    // ============================================================
    send(message) {
        if (!this.output) {
            this.logger.warn('⚠️ MIDI-выход не подключен');
            return false;
        }
        try {
            // Если это pitchbend, отправляем как специальное сообщение
            if (message.type === 'pitchbend' || message.type === 'pitchBend' || 
                message.type === 'pitchwheel' || message.type === 'pitchband') {
                // easymidi ожидает { value: 0-16383, channel: 0-15 }
                this.output.send('pitch', {  // <-- easymidi ДОЛЖНО БЫТЬ pitch
                    value: message.value || 8192,
                    channel: message.channel || 0
                });
                return true;
            }
            
            if (message.type === 'sysex') {
                const data = message.data || message;
                if (!Array.isArray(data)) {
                    this.logger.error('❌ SysEx данные должны быть массивом');
                    return false;
                }
                if (data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) {
                    this.logger.error('❌ SysEx должен начинаться с 0xF0 и заканчиваться 0xF7');
                    return false;
                }
                this.output.send('sysex', data);
                return true;
            }
            
            // Остальные типы (cc, noteon, noteoff)
            this.output.send(message.type, message);
            return true;
        } catch (error) {
            this.logger.error('❌ Ошибка отправки MIDI:', error.message);
            return false;
        }
    }

    sendFeedback(command) {
        const midiMessage = this.protocol.format(command);
        if (!midiMessage) return false;
        if (midiMessage.type === 'pitchBend' || midiMessage.type === 'pitchbend' || 
            midiMessage.type === 'pitchband' || midiMessage.type === 'pitchwheel') {
            midiMessage.type = 'pitch';  // <-- easymidi ДОЛЖНО БЫТЬ pitch
            if (midiMessage.value !== undefined) {
                midiMessage.value = Math.min(16383, Math.max(0, midiMessage.value));
            }
        }
        return this.send(midiMessage);
    }

    // ============================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================================
    getChannelState(channel) {
        return this.channelStates[channel] || null;
    }

    isActive() {
        return this.isConnected && this.input && this.output;
    }

    async disconnect() {
        if (this.input) {
            this.input.close();
            this.input = null;
            this.logger.log('🔌 MIDI-вход закрыт');
        }
        if (this.output) {
            this.output.close();
            this.output = null;
            this.logger.log('🔌 MIDI-выход закрыт');
        }
        this.isConnected = false;
        this.handlers = [];
        this.logger.log('✅ MIDI-маршрутизатор отключен');
    }
}
/*
    // ============================================================
    // ОТПРАВКА MIDI (ИСПРАВЛЕННАЯ)
    // ============================================================
    send(message) {
        if (!this.output) {
            this.logger.warn('⚠️ MIDI-выход не подключен');
            return false;
        }
        try {
            let msgType = message.type;
            
            // ИСПРАВЛЕНИЕ 1: easymidi использует 'pitchwheel' вместо 'pitchBend'
            if (msgType === 'pitchBend' || msgType === 'pitchbend') {
                msgType = 'pitchwheel';
            }
            
            // ИСПРАВЛЕНИЕ 2: SysEx проверка
            if (msgType === 'sysex') {
                const data = message.data || message;
                if (!Array.isArray(data)) {
                    this.logger.error('❌ SysEx данные должны быть массивом');
                    return false;
                }
                if (data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) {
                    this.logger.error('❌ SysEx должен начинаться с 0xF0 и заканчиваться 0xF7');
                    return false;
                }
                this.output.send(msgType, data);
                return true;
            }
            
            this.output.send(msgType, message);
            return true;
        } catch (error) {
            this.logger.error('❌ Ошибка отправки MIDI:', error.message);
            return false;
        }
    }

    // ============================================================
    // ОТПРАВКА ОБРАТНОЙ СВЯЗИ (ИСПРАВЛЕННАЯ)
    // ============================================================
    sendFeedback(command) {
        const midiMessage = this.protocol.format(command);
        if (!midiMessage) return false;
        
        // ИСПРАВЛЕНИЕ: преобразуем pitchBend в pitchwheel для easymidi
        if (midiMessage.type === 'pitchBend' || midiMessage.type === 'pitchbend') {
            midiMessage.type = 'pitchwheel';
            if (midiMessage.value !== undefined) {
                midiMessage.value = Math.min(16383, Math.max(0, midiMessage.value));
            }
        }
        
        return this.send(midiMessage);
    }
//}
*/