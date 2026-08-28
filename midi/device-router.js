// midi/device-router.js
// Универсальный маршрутизатор MIDI-команд

import easymidi from 'easymidi';
import Logger from '../src/Logger.js';

export default class DeviceRouter {
    constructor(deviceConfig, protocol) {
        this.device = deviceConfig;
        this.protocol = protocol;
        this.logger = new Logger('[MIDI-ROUTER]');
        this.input = null;
        this.output = null;
        this.handlers = [];
        this.isConnected = false;
        this.channelStates = {};
        this.lastValues = {};

        // Инициализация состояний каналов
        for (let i = 0; i < (this.device.hardware?.channels || 8); i++) {
            this.channelStates[i] = {
                fader: 0,
                pan: 64,
                mute: false,
                solo: false,
                select: false,
                isTouched: false
            };
            this.lastValues[i] = {
                fader: 0,
                pan: 64
            };
        }
    }

    /**
     * Подключение к MIDI-портам
     */
    async connect(inputName, outputName) {
        try {
            this.logger.log(`🔌 Подключение к MIDI: ${inputName} → ${outputName}`);
            
            // Проверяем доступные порты
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
            
            // Создаём MIDI-вход
            this.input = new easymidi.Input(inputName);
            this.logger.log(`✅ MIDI-вход создан: ${inputName}`);
            
            // Создаём MIDI-выход
            this.output = new easymidi.Output(outputName);
            this.logger.log(`✅ MIDI-выход создан: ${outputName}`);
            
            // Настраиваем обработчик событий
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

    /**
     * Обработчик Control Change
     */
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

    /**
     * Обработчик Note On
     */
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

    /**
     * Обработчик Note Off
     */
    _handleNoteOff(msg) {
        // Note Off можно игнорировать или использовать как часть команд
        // Например, для кнопок-переключателей
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

    /**
     * Обработчик Pitch Bend (фейдеры)
     */
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

    /**
     * Обработчик SysEx (LCD-дисплей, светодиоды)
     */
    _handleSysEx(msg) {
        try {
            // SysEx обрабатывается отдельно, так как это обычно не команды, а данные
            // например, обновление LCD
            this.logger.debug(`📟 SysEx получен (${msg.length} байт)`);
            // Здесь можно добавить парсинг SysEx для LCD
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
            switch (command.type) {
                case 'fader':
                    this.channelStates[command.channel].fader = command.value;
                    break;
                case 'vpot':
                    this.channelStates[command.channel].pan = command.value;
                    break;
                case 'mute':
                    this.channelStates[command.channel].mute = command.state === 'on';
                    break;
                case 'solo':
                    this.channelStates[command.channel].solo = command.state === 'on';
                    break;
                case 'select':
                    this.channelStates[command.channel].select = command.state === 'on';
                    break;
                case 'touch':
                    this.channelStates[command.channel].isTouched = true;
                    break;
                case 'release':
                    this.channelStates[command.channel].isTouched = false;
                    break;
            }
        }
        
        // Отправляем команду всем обработчикам
        this.handlers.forEach(handler => {
            try {
                handler(command);
            } catch (error) {
                this.logger.error('❌ Ошибка в обработчике команды:', error.message);
            }
        });
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

    /**
     * Отправка MIDI-сообщения на контроллер
     */
    send(message) {
        if (!this.output) {
            this.logger.warn('⚠️ MIDI-выход не подключен');
            return false;
        }
        
        try {
            this.output.send(message.type, message);
            return true;
        } catch (error) {
            this.logger.error('❌ Ошибка отправки MIDI:', error.message);
            return false;
        }
    }

    /**
     * Отправка обратной связи на контроллер
     */
    sendFeedback(command) {
        const midiMessage = this.protocol.format(command);
        if (midiMessage) {
            return this.send(midiMessage);
        }
        return false;
    }

    /**
     * Получение состояния канала
     */
    getChannelState(channel) {
        return this.channelStates[channel] || null;
    }

    /**
     * Отключение от MIDI
     */
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

    /**
     * Проверка подключения
     */
    isActive() {
        return this.isConnected && this.input && this.output;
    }
}