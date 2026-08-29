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

    // Регистрация GUI менеджера
    setGUIManager(guiManager) {
        this.guiManager = guiManager;
        this.logger.log('✅ GUI менеджер зарегистрирован');
    }


    // Регистрация обработчика абстрактных команд
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

    // Отправка команды всем зарегистрированным обработчикам
    _dispatchCommand(command) {
        // Сохраняем состояние канала
        if (command.channel !== undefined) {
            const ch = command.channel;
            switch (command.type) {
                case 'fader': this.channelStates[ch].fader = command.value; break;
                case 'vpot': this.channelStates[ch].pan = command.value; break;
                case 'mute': this.channelStates[ch].mute = command.state === 'on'; break;
                case 'solo': this.channelStates[ch].solo = command.state === 'on'; break;
                case 'select': this.channelStates[ch].select = command.state === 'on'; break;
                case 'touch': this.channelStates[ch].isTouched = true; break;
                case 'release': this.channelStates[ch].isTouched = false; break;
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
            case 'fader': await this.guiManager.setVolume(channel, command.value); break;
            case 'vpot': await this.guiManager.setPan(channel, command.value); break;
            case 'mute': await this.guiManager.toggleMute(channel, command.state === 'on'); break;
            case 'solo': await this.guiManager.toggleSolo(channel, command.state === 'on'); break;
            case 'select': this.selectedTrack = channel; await this.guiManager.selectTrack(channel); break;
        }
    }

    async _handleFxMode(command) {
        if (!this.guiManager) return;
        const channel = command.channel;
        const targetTrack = this.selectedTrack || 0;
        
        switch (command.type) {
            case 'fader': await this.guiManager.setFxSend(targetTrack, channel, command.value); break;
            case 'vpot': await this.guiManager.setFxParam(targetTrack, channel, command.value); break;
            case 'mute': await this.guiManager.toggleFxBypass(targetTrack, channel); break;
            case 'solo': await this.guiManager.toggleFxSolo(targetTrack, channel); break;
            case 'select': await this.guiManager.selectFxPreset(targetTrack, channel); break;
        }
    }

    // ============================================================
    // ПОДКЛЮЧЕНИЕ К MIDI ports (Безопасный независимый режим)
    // ============================================================
    async connect() {
        try {
            const inputs = easymidi.getInputs();
            const outputs = easymidi.getOutputs();
            
            // Инициализируем объекты для хранения портов
            this.inputs = {};
            this.outputs = {};

            const leftPort = this.config.ports?.left;
            const rightPort = this.config.ports?.right;

            // --- 1. Подключаем ЛЕВУЮ панель ---
            if (leftPort) {
                this.logger.log(`🔌 Подключение левой панели: ${leftPort.input || 'none'} → ${leftPort.output || 'none'}`);
                
                if (leftPort.input && leftPort.input !== 'none' && inputs.includes(leftPort.input)) {
                    this.inputs.left = new easymidi.Input(leftPort.input);
                    this._bindEvents(this.inputs.left, 'left'); // Привязываем слушатели с флагом панели
                    this.logger.log(`✅ MIDI-вход создан (Левый): ${leftPort.input}`);
                }
                if (leftPort.output && leftPort.output !== 'none' && outputs.includes(leftPort.output)) {
                    this.outputs.left = new easymidi.Output(leftPort.output);
                    this.logger.log(`✅ MIDI-выход создан (Левый): ${leftPort.output}`);
                }
            }

            // --- 2. Подключаем ПРАВУЮ панель (Ваш 6-й порт!) ---
            if (rightPort) {
                this.logger.log(`🔌 Подключение правой панели: ${rightPort.input || 'none'} → ${rightPort.output || 'none'}`);
                
                if (rightPort.input && rightPort.input !== 'none' && inputs.includes(rightPort.input)) {
                    this.inputs.right = new easymidi.Input(rightPort.input);
                    this._bindEvents(this.inputs.right, 'right'); // Привязываем слушатели с флагом панели
                    this.logger.log(`✅ MIDI-вход создан (Правый): ${rightPort.input}`);
                }
                if (rightPort.output && rightPort.output !== 'none' && outputs.includes(rightPort.output)) {
                    this.outputs.right = new easymidi.Output(rightPort.output);
                    this.logger.log(`✅ MIDI-выход создан (Правый): ${rightPort.output}`);
                }
            }

            // Для обратной совместимости с однопортовыми девайсами
            if (!leftPort && !rightPort && this.config.ports?.input) {
                const flat = this.config.ports;
                if (inputs.includes(flat.input)) {
                    this.inputs.left = new easymidi.Input(flat.input);
                    this._bindEvents(this.inputs.left, 'left');
                }
                if (outputs.includes(flat.output)) {
                    this.outputs.left = new easymidi.Output(flat.output);
                }
            }

            this.isConnected = !!(this.inputs.left || this.inputs.right || this.outputs.left || this.outputs.right);
            this.logger.log('✅ MIDI-маршрутизатор успешно настроен');

        } catch (error) {
            this.logger.error('❌ Ошибка подключения MIDI портов:', error.message);
            throw error;
        }
    }

    // Служебный метод для красивой привязки событий (чтобы не дублировать код)
    _bindEvents(inputInstance, portName) {
        // Обертка, которая добавляет в команду инфо о том, с какого порта (left/right) она пришла
        const wrapHandler = (handler) => {
            return (msg) => {
                msg.port = portName; // Запоминаем порт для секции switch в index.js!
                handler(msg);
            };
        };

        inputInstance.on('cc', wrapHandler(this._handleCC.bind(this)));
        inputInstance.on('noteon', wrapHandler(this._handleNoteOn.bind(this)));
        inputInstance.on('noteoff', wrapHandler(this._handleNoteOff.bind(this)));
        inputInstance.on('pitchbend', wrapHandler(this._handlePitchBend.bind(this)));
        inputInstance.on('sysex', wrapHandler(this._handleSysEx.bind(this)));
    }

    // ============================================================
    // ОТПРАВКА MIDI
    // ============================================================
    send(message) {
        if (!message) return false;

        // По умолчанию целимся в левую панель
        let targetPort = 'left';
        let virtualChannel = message.channel || 0; 
        let hardwareMidiChannel = virtualChannel;

        const leftCfg = this.config.ports?.left;
        const rightCfg = this.config.ports?.right;

        // Получаем смещения из конфига (или дефолтные 0 и 8, если они не заданы)
        const leftOffset = leftCfg?.offset !== undefined ? leftCfg.offset : 0;
        const rightOffset = rightCfg?.offset !== undefined ? rightCfg.offset : 8;

        // ДИНАМИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ПАНЕЛИ:
        // Проверяем, попадает ли виртуальный канал в диапазон правой панели (строго 8 каналов)
        if (rightCfg && virtualChannel >= rightOffset && virtualChannel < (rightOffset + 8)) {
            targetPort = 'right';
            // Вычисляем физический канал пульта внутри его 8-канальной HUI-сессии (всегда 0-7)
            hardwareMidiChannel = virtualChannel - rightOffset;
        } 
        // Проверяем, попадает ли виртуальный канал в диапазон левой панели
        else if (leftCfg && virtualChannel >= leftOffset && virtualChannel < (leftOffset + 8)) {
            targetPort = 'left';
            hardwareMidiChannel = virtualChannel - leftOffset;
        }

        // Выбираем соответствующий физический MIDI-OUT
        const output = this.outputs[targetPort];
        if (!output) {
            return false; // Если порт не подключен или асимметричен (как Impact Port 2)
        }

        try {
            // Формируем чистый объект сообщения с физическим каналом пульта (0-7)
            if (message.type === 'pitchbend' || message.type === 'pitchBend' || 
                message.type === 'pitchwheel' || message.type === 'pitchband' || message.type === 'pitch') {
                
                output.send('pitch', {
                    value: message.value !== undefined ? message.value : 8192,
                    channel: hardwareMidiChannel // Направляем на правильный физический фейдер 0-7
                });
                return true;
            }
            
            if (message.type === 'sysex') {
                const data = message.data || message;
                if (Array.isArray(data)) {
                    output.send('sysex', data);
                    return true;
                }
                return false;
            }
            
            // Для остальных команд (cc, noteon)
            const cleanMessage = { ...message, channel: hardwareMidiChannel };
            output.send(message.type, cleanMessage);
            return true;

        } catch (error) {
            this.logger.error(`❌ [MIDI-OUT] Ошибка отправки в динамический порт [${targetPort}]:`, error.message);
            return false;
        }
    }

    // ============================================================
    // ФИДБЕК ОТПРАВКА (Слой адаптации под easymidi 'pitch')
    // ============================================================
    sendFeedback(command) {
        if (!this.output) return false; // Защита: нет выхода — нет фидбека

        const midiMessage = this.protocol.format(command);
        if (!midiMessage) return false;

        if (midiMessage.type === 'pitchBend' || midiMessage.type === 'pitchbend' || 
            midiMessage.type === 'pitchband' || midiMessage.type === 'pitchwheel' || midiMessage.type === 'pitch') {
            
            midiMessage.type = 'pitch'; // Гарантируем правильный тип для easymidi
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
