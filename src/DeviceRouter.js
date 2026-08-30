// src/DeviceRouter.js
// Универсальный маршрутизатор MIDI-команд

import easymidi from 'easymidi';
import Logger from '../utils/Logger.js';

const logger = new Logger('[ROUTER]');

export default class DeviceRouter {
    constructor(deviceConfig, protocol) {
        this.device = deviceConfig;
        this.protocol = protocol;
        this.logger = new Logger('[ROUTER]');
        this.input = null;
        this.output = null;
        this.handlers = [];
        this.isConnected = false;
        this.mode = deviceConfig.ports?.mode || 'track';
        this.channelOffset = deviceConfig.ports?.offset || 0;
        this.selectedTrack = 0;  // Для FX режима — выделенный трек
        this.guiManager = null;
        
        // ИСПРАВЛЕНО: Читаем строго из deviceConfig, который пришел на вход
        this.curOffsets = {
            left: deviceConfig.ports?.left?.offset !== undefined ? deviceConfig.ports.left.offset : 0,
            right: deviceConfig.ports?.right?.offset !== undefined ? deviceConfig.ports.right.offset : 8
        };

        const chCount = deviceConfig.hardware?.channels || 8;
        this.chStates = {};
        for (let i = 0; i < chCount; i++) {
            this.chStates[i] = {
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

    // ============================================================
    // МЕТОДЫ РЕГИСТРАЦИИ (Вне конструктора)
    // ============================================================

    // Регистрация GUI менеджера
    setGUIManager(guiManager) {
        this.guiManager = guiManager;
        this.logger.log('☑️ GUI менеджер зарегистрирован');
    }


    // Регистрация обработчика абстрактных команд
    onCommand(handler) {
        if (typeof handler === 'function') {
            this.handlers.push(handler);
            this.logger.debug(`☑️ Зарегистрирован обработчик (всего: ${this.handlers.length})`);
        }
    }

    // ============================================================
    // ОБРАБОТКА ВХОДЯЩИХ MIDI-СООБЩЕНИЙ
    // ============================================================
    _handleCC(msg) {
        try {
            const abstrCmd = this.protocol.parse({
                type: 'cc',
                controller: msg.controller,
                value: msg.value,
                channel: msg.channel
            });
            if (abstrCmd) {
                abstrCmd.port = msg.port; // <-- ФИКСИРУЕМ ПОРТ В АБСТРАКТНОЙ КОМАНДЕ
                this._dispatchCommand(abstrCmd);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки CC:', error.message);
        }
    }

    _handleNoteOn(msg) {
        try {
            const abstrCmd = this.protocol.parse({
                type: 'noteOn',
                note: msg.note,
                velocity: msg.velocity,
                channel: msg.channel
            });
            if (abstrCmd) {
                abstrCmd.port = msg.port; // <-- ФИКСИРУЕМ ПОРТ В АБСТРАКТНОЙ КОМАНДЕ
                this._dispatchCommand(abstrCmd);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки Note On:', error.message);
        }
    }

    _handleNoteOff(msg) {
        try {
            const abstrCmd = this.protocol.parse({
                type: 'noteOff',
                note: msg.note,
                velocity: msg.velocity,
                channel: msg.channel
            });
            if (abstrCmd) {
                abstrCmd.port = msg.port; // <-- ФИКСИРУЕМ ПОРТ В АБСТРАКТНОЙ КОМАНДЕ
                this._dispatchCommand(abstrCmd);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки Note Off:', error.message);
        }
    }

    _handlePitchBend(msg) {
        try {
            const abstrCmd = this.protocol.parse({
                type: 'pitchBend',
                value: msg.value,
                channel: msg.channel
            });
            if (abstrCmd) {
                abstrCmd.port = msg.port; // <-- ФИКСИРУЕМ ПОРТ В АБСТРАКТНОЙ КОМАНДЕ
                this._dispatchCommand(abstrCmd);
            }
        } catch (error) {
            this.logger.error('❌ Ошибка обработки Pitch Bend:', error.message);
        }
    }

    _handleSysEx(msg) {
        try {
            this.logger.debug(`🎹 SysEx получен (${msg.length} байт)`);
        } catch (error) {
            this.logger.error('❌ Ошибка обработки SysEx:', error.message);
        }
    }

    // ============================================================
    // ОТПРАВКА КОМАНДЫ ВСЕМ ЗАРЕГИСТРИРОВАННЫМ ОБРАБОТЧИКАМ
    // ============================================================
    // ============================================================
    // УНИВЕРСАЛЬНЫЙ КОНВЕЙЕР ДИСПЕТЧЕРИЗАЦИИ КОМАНД
    // ============================================================
    _dispatchCommand(command) {
        if (!command) return;

        // --- ЭТАП 1: ФИЛЬТР НАВИГАЦИИ (BANK / CHAN) ---
        // Эти кнопки не имеют номера канала, они меняют живые смещения и поглощаются драйвером
        switch (command.type) {
            case 'bank_next':
                this.curOffsets.left += 8;
                this.curOffsets.right += 8;
                this.logger.log(`🎛️ [DRIVER] BANK > Сдвиг. Текущие оффсеты: L=${this.curOffsets.left}, R=${this.curOffsets.right}`);
                this._triggerHardwareRefresh(); 
                return; // Команда поглощена драйвером

            case 'bank_prev':
                if (this.curOffsets.left >= 8) {
                    this.curOffsets.left -= 8;
                    this.curOffsets.right -= 8;
                    this.logger.log(`🎛️ [DRIVER] BANK < Сдвиг. Текущие оффсеты: L=${this.curOffsets.left}, R=${this.curOffsets.right}`);
                    this._triggerHardwareRefresh();
                }
                return;

            case 'chan_next':
                this.curOffsets.left += 1;
                this.curOffsets.right += 1;
                this.logger.log(`🎛️ [DRIVER] CHAN > Шаг вперед. Текущие оффсеты: L=${this.curOffsets.left}, R=${this.curOffsets.right}`);
                this._triggerHardwareRefresh();
                return;

            case 'chan_prev':
                if (this.curOffsets.left > 0) {
                    this.curOffsets.left -= 1;
                    this.curOffsets.right -= 1;
                    this.logger.log(`🎛️ [DRIVER] CHAN < Шаг назад. Текущие оффсеты: L=${this.curOffsets.left}, R=${this.curOffsets.right}`);
                    this._triggerHardwareRefresh();
                }
                return;
        }

        // --- ЭТАП 2: ДИНАМИЧЕСКИЙ РАСЧЕТ СМЕЩЕНИЯ ДЛЯ КОМАНД ТРЕКОВ ---
        // Применяем смещение ПЕРЕД записью в chStates и отправкой наверх
        if (command.channel !== undefined && command.port) {
            const activeOffsets = this.curOffsets || { left: 0, right: 8 };
            const offset = activeOffsets[command.port] || 0;
            
            // Вычисляем глобальный индекс трека в Suno Studio (0-13+)
            command.channel = command.channel + offset;
        }

        // --- ЭТАП 3: АВТОНОМНЫЙ ПЕРЕХВАТ РЕЖИМА FX MODE (КНОПКА SELECT) ---
        if (command.type === 'select') {
            // Запоминаем глобальный индекс трека, на котором нажали кнопку SEL
            this.selectedTrack = command.channel;
            
            // Если кнопка нажата (state === 'on'), переключаем пульт в FX режим, иначе возвращаем track
            this.mode = (command.state === 'on') ? 'fx' : 'track';
            
            this.logger.log(`🎛️ [DRIVER] Режим пульта изменен: ${this.mode.toUpperCase()}. Выделенный трек: ${this.selectedTrack}`);
            
            // Оповещаем ваши внутренние обработчики режимов, если они объявлены в классе
            if (this.modeHandlers && typeof this.modeHandlers[this.mode] === 'function') {
                this.modeHandlers[this.mode](command);
            }
        }

        // --- ЭТАП 4: ФИКСАЦИЯ СОСТОЯНИЯ В ВАШЕМ МАССИВЕ chStates И ОТПРАВКА В ORCHESTRATOR ---
        if (command.channel !== undefined) {
            const ch = command.channel;
            
            // Защитный динамический инициализатор ячеек при глубоких сдвигах BANK
            if (!this.chStates[ch]) {
                this.chStates[ch] = { fader: 0, pan: 64, mute: false, solo: false, select: false, isTouched: false, fx: { send1: 0, send2: 0, send3: 0, send4: 0, param1: 0, param2: 0, param3: 0 } };
            }

            // Записываем состояние
            switch (command.type) {
                case 'fader': this.chStates[ch].fader = command.value; break;
                case 'vpot': this.chStates[ch].pan = command.value; break;
                case 'mute': this.chStates[ch].mute = command.state === 'on'; break;
                case 'solo': this.chStates[ch].solo = command.state === 'on'; break;
                case 'select': this.chStates[ch].select = command.state === 'on'; break;
                case 'touch': this.chStates[ch].isTouched = true; break;
                case 'release': this.chStates[ch].isTouched = false; break;
            }
        }
        
        // Отправляем очищенную команду с правильным глобальным индексом канала наверх в core/index.js
        this.handlers.forEach(handler => {
            try {
                handler(command);
            } catch (error) {
                this.logger.error('❌ Ошибка в обработчике оркестратора:', error.message);
            }
        });
    }

    // Служебный метод принудительного обновления моторов
    _triggerHardwareRefresh() {
        if (global.appState?.feedbackLoop && typeof global.appState.feedbackLoop.forceFullSync === 'function') {
            global.appState.feedbackLoop.forceFullSync(); 
        }
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
            
            // Инициализируем объекты для хранения инстансов easymidi
            this.inputs = {};
            this.outputs = {};

            // Защищенный выбор целевого объекта устройства (используем то, что сохранено в конструкторе)
            const targetDevice = this.device || this.config;
            
            if (!targetDevice) {
                throw new Error('Объект устройства не инициализирован в конструкторе роутера');
            }

            const lPort = targetDevice.ports?.left;
            const rPort = targetDevice.ports?.right;

            // --- 1. Подключаем ЛЕВУЮ панель ---
            if (lPort) {
                this.logger.log(`📎 Подключение левой панели: ${lPort.input || 'none'} → ${lPort.output || 'none'}`);
                
                if (lPort.input && lPort.input !== 'none' && inputs.includes(lPort.input)) {
                    this.inputs.left = new easymidi.Input(lPort.input);
                    this._bindEvents(this.inputs.left, 'left');
                    this.logger.log(`☑️ MIDI-IN L создан: ${lPort.input}`);
                }
                if (lPort.output && lPort.output !== 'none' && outputs.includes(lPort.output)) {
                    this.outputs.left = new easymidi.Output(lPort.output);
                    this.logger.log(`☑️ MIDI-OUT L создан: ${lPort.output}`);
                }
            }

            // --- 2. Подключаем ПРАВУЮ панель ---
            if (rPort) {
                this.logger.log(`📎 Подключение правой панели: ${rPort.input || 'none'} → ${rPort.output || 'none'}`);
                
                if (rPort.input && rPort.input !== 'none' && inputs.includes(rPort.input)) {
                    this.inputs.right = new easymidi.Input(rPort.input);
                    this._bindEvents(this.inputs.right, 'right');
                    this.logger.log(`☑️ MIDI-IN R создан: ${rPort.input}`);
                }
                if (rPort.output && rPort.output !== 'none' && outputs.includes(rPort.output)) {
                    this.outputs.right = new easymidi.Output(rPort.output);
                    this.logger.log(`☑️ MIDI-OUT R создан: ${rPort.output}`);
                }
            }

            // Для обратной совместимости с плоской структурой
            if (!lPort && !rPort && targetDevice.ports?.input) {
                const flat = targetDevice.ports;
                if (inputs.includes(flat.input)) {
                    this.inputs.left = new easymidi.Input(flat.input);
                    this._bindEvents(this.inputs.left, 'left');
                }
                if (outputs.includes(flat.output)) {
                    this.outputs.left = new easymidi.Output(flat.output);
                }
            }

            this.isConnected = !!(this.inputs.left || this.inputs.right || this.outputs.left || this.outputs.right);
            this.logger.log('☑️ MIDI-маршрутизатор успешно настроен');

        } catch (error) {
            this.logger.error('❌ Ошибка подключения MIDI портов:', error.message);
            throw error;
        }
    }

    // Служебный метод для привязки событий (чтобы не дублировать код)
    _bindEvents(inputInstance, portName) {
        const wrapHandler = (handler) => {
            return (msg) => {
                // Вызываем ваш стандартный обработчик (_handlePitchBend и т.д.)
                // Но подмешиваем порт прямо во входящий msg
                msg.port = portName; 
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
        let vChannel = message.channel || 0; 
        let hwMidiCh = vChannel;

        const lCfg = this.config.ports?.left;
        const rCfg = this.config.ports?.right;

        // Получаем смещения из конфига (или дефолтные 0 и 8, если они не заданы)
        const lOffset = lCfg?.offset !== undefined ? lCfg.offset : 0;
        const rOffset = rCfg?.offset !== undefined ? rCfg.offset : 8;

        // ДИНАМИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ПАНЕЛИ:
        // Проверяем, попадает ли виртуальный канал в диапазон правой панели (строго 8 каналов)
        if (rCfg && vChannel >= rOffset && vChannel < (rOffset + 8)) {
            targetPort = 'right';
            // Вычисляем физический канал пульта внутри его 8-канальной HUI-сессии (всегда 0-7)
            hwMidiCh = vChannel - rOffset;
        } 
        // Проверяем, попадает ли виртуальный канал в диапазон левой панели
        else if (lCfg && vChannel >= lOffset && vChannel < (lOffset + 8)) {
            targetPort = 'left';
            hwMidiCh = vChannel - lOffset;
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
                    channel: hwMidiCh // Направляем на правильный физический фейдер 0-7
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
            const cleanMessage = { ...message, channel: hwMidiCh };
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

        const midiMsg = this.protocol.format(command);
        if (!midiMsg) return false;

        if (midiMsg.type === 'pitchBend' || midiMsg.type === 'pitchbend' || 
            midiMsg.type === 'pitchband' || midiMsg.type === 'pitchwheel' || midiMsg.type === 'pitch') {
            
            midiMsg.type = 'pitch'; // Гарантируем правильный тип для easymidi
            if (midiMsg.value !== undefined) {
                midiMsg.value = Math.min(16383, Math.max(0, midiMsg.value));
            }
        }
        return this.send(midiMsg);
    }

    // ============================================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ============================================================
    getChannelState(channel) {
        return this.chStates[channel] || null;
    }

    isActive() {
        return this.isConnected && this.input && this.output;
    }

    async disconnect() {
        if (this.input) {
            this.input.close();
            this.input = null;
            this.logger.log('⛔️ MIDI-IN закрыт');
        }
        if (this.output) {
            this.output.close();
            this.output = null;
            this.logger.log('⛔️ MIDI-OUT закрыт');
        }
        this.isConnected = false;
        this.handlers = [];
        this.logger.log('⛔️ MIDI-маршрутизатор отключен');
    }
}
