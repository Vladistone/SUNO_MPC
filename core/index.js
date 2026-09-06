// core/index.js
// Главная точка входа — исправленная загрузка и сохранение портов
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'

import Logger from '../utils/Logger.js';
import { appState } from './State.js';
import { loadConfig, saveConfig, isConfigValid } from './CfgMgr.js';
import { shutdown, setupShutdownHandler, setupErrorHandlers } from './LifeCycle.js';
import { detectMidiPorts } from '../src/MIDIenv/PortScan.js';
import { scanDevices } from '../src/MIDIenv/DevScan.js';
import { scanProtocols } from '../src/MIDIenv/PrtclScan.js';
import { selectDeviceAndProtocol, confirmContinue } from '../utils/menu.js';
import { setupConsoleCommands } from '../utils/commands.js';
import BrowserManager from '../src/BrowserManager.js';
import DeviceRouter from '../src/DeviceRouter.js';
import GUIManager from '../src/GUIManager.js';
import FeedbackLoop from '../src/FeedbackLoop.js';

// Получаем путь к текущей папке core/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Строим жесткий абсолютный путь к папке src/
const imagePath = path.join(__dirname, '../src/SunoColor.png');

function getTerminalIcon(filePath, widthCells = 1) {
    try {
        // Проверяем физическое наличие файла на диске Mac
        if (!fs.existsSync(filePath)) {
            return `[Ошибка: файл не найден по пути ${filePath}] `;
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        const base64Image = fileBuffer.toString('base64');
        
        // inline=1 заставляет iTerm2 рендерить графические байты
        return `\x1b]1337;File=width=${widthCells};height=auto;inline=1:${base64Image}\x07 `;
    } catch (e) {
        return `[Ошибка скрипта: ${e.message}] `;
    }
}

// Генерируем картинку, передавая абсолютный путь
const sunoImage = getTerminalIcon(imagePath, 4);


const logger = new Logger('[ MAIN ]');

// Сохраняем shutdown в appState
appState.shutdown = shutdown;

async function startServer() {
    logger.log('🚀 Запуск Suno Studio Controller...');

    try {
        // -1- Сканирование MIDI-портов
        const midiPorts = await detectMidiPorts();
        logger.log(`📡 Найдено MIDI-портов: входов=${midiPorts.inputs.length}, выходов=${midiPorts.outputs.length}`);

        // -2- Сканирование устройств и протоколов
        const devices = await scanDevices(midiPorts);
        const protocols = await scanProtocols();

        const availableDevices = devices.filter(d => d.isAvailable !== false);
        logger.log(`📡 Найдено устройств: ${devices.length}, доступных: ${availableDevices.length}`);

        // -3- Загрузка конфигурации
        let config = await loadConfig();
        let device = null;
        let protocol = null;
        let configValid = false;

        if (config) {
            configValid = isConfigValid(config, devices, protocols, midiPorts);
            if (configValid) {
                device = devices.find(d => d.id === config.deviceId);
                protocol = protocols.find(p => p.id === config.protocolId);
                
                // === ПРАВИЛЬНАЯ ЗАГРУЗКА ПОРТОВ ===
                // Структура: config.ports[device.id].left / .right
                if (config.ports && config.ports[device.id]) {
                    const devicePorts = config.ports[device.id];
                    
                    // Инициализируем ports как объект
                    device.ports = {};
                    
                    if (devicePorts.left) {
                        device.ports.left = {
                            input: devicePorts.left.input,
                            output: devicePorts.left.output,
                            mode: devicePorts.left.mode || 'track',
                            offset: devicePorts.left.offset || 0
                        };
                    }
                    
                    if (devicePorts.right) {
                        device.ports.right = {
                            input: devicePorts.right.input,
                            output: devicePorts.right.output,
                            mode: devicePorts.right.mode || 'fx',
                            offset: devicePorts.right.offset || 8
                        };
                    }
                    
                    // Для обратной совместимости с плоской структурой
                    if (devicePorts.input) {
                        device.ports.input = devicePorts.input;
                        device.ports.output = devicePorts.output;
                        device.ports.offset = devicePorts.offset || 0;
                    }
                }
                
                // Устанавливаем базовое смещение
                device.channelOffset = device.ports?.left?.offset || 0;
                
                logger.log(`📎 Найдена валидная конфигурация: ${device.name} → ${protocol.name}`);
                if (device.ports?.left) {
                    logger.log(`   Левая панель: ${device.ports.left.input} → ${device.ports.left.output} (${device.ports.left.mode})`);
                }
                if (device.ports?.right) {
                    logger.log(`   Правая панель: ${device.ports.right.input} → ${device.ports.right.output} (${device.ports.right.mode})`);
                }
            } else {
                logger.warn('⚠️ Конфигурация невалидна');
                config = null;  // Сбрасываем, чтобы запустить интерактивный выбор
            }
        }

        // -4- Интерактивный выбор (если нет валидной конфигурации)
        if (!configValid || !config) {
            logger.log('⚙️ Интерактивная настройка...');
            if (availableDevices.length === 0) {
                const ok = await confirmContinue('Нет доступных MIDI-устройств. Продолжить с ручным выбором?');
                if (!ok) { logger.log('🏁 Работа завершена.'); process.exit(0); }
            }
            
            const selection = await selectDeviceAndProtocol(
                availableDevices.length > 0 ? availableDevices : devices,
                protocols
            );
            device = selection.device;
            protocol = selection.protocol;
            
            // Сохраняем конфигурацию с правильной структурой
            await saveConfig(device.id, protocol.id, {
                left: {
                    input: device.ports.left.input,
                    output: device.ports.left.output,
                    mode: device.ports.left.mode || 'track',
                    offset: device.ports.left.offset || 0
                },
                right: {
                    input: device.ports.right.input,
                    output: device.ports.right.output,
                    mode: device.ports.right.mode || 'fx',
                    offset: device.ports.right.offset || 8
                }
            });
            config = await loadConfig();
        }

        // -5- Финальная проверка
        if (!device || !protocol) {
            logger.error('❌ Не удалось настроить устройство.');
            process.exit(1);
        }

        appState.selectedDevice = device;
        appState.selectedProtocol = protocol;
        appState.config = config;

        // -6- Вывод информации о портах
        const lPort = device.ports?.left;
        const rPort = device.ports?.right;
        
        logger.log(`📎 Устройство: ${device.name}`);
        logger.log(`   Протокол: ${protocol.name} (v${protocol.version})`);
        if (lPort) {
            logger.log(`   L панель: ${lPort.input} → ${lPort.output} (${lPort.mode})`);
        }
        if (rPort) {
            logger.log(`   R панель: ${rPort.input} → ${rPort.output} (${rPort.mode})`);
        }
        logger.log(`   Каналов: ${device.hardware?.channels || 8}\n`);

        // -7- Инициализация модулей
        const browserManager = new BrowserManager();
        const page = await browserManager.connect();
        appState.page = page;
        appState.browser = browserManager;
        logger.log('☑️ Браузер подключен');

        const guiManager = new GUIManager(page);
        await guiManager.loadSelectors();
        await guiManager.syncTracks();
        appState.guiManager = guiManager;
        logger.log('☑️ GUI менеджер инициализирован');

        const protocolInstance = protocol.instance || new (await import(`../protocols/${protocol.file}`)).default();
        const deviceRouter = new DeviceRouter(device, protocolInstance);
        deviceRouter.setGUIManager(guiManager);
        
        // Подключаем левый порт
        if (lPort) {
            await deviceRouter.connect(lPort.input, lPort.output);
            logger.log(`☑️ MIDI-Router (L панель): ${lPort.input} → ${lPort.output}`);
        }
        
        // Подключаем правый порт
        if (rPort) {
            await deviceRouter.connect(rPort.input, rPort.output);
            logger.log(`☑️ MIDI-Router (R панель): ${rPort.input} → ${rPort.output}`);
        }

        appState.deviceRouter = deviceRouter;
        logger.log('☑️ MIDI-Router настроен');

        // -8- Обработка команд
        deviceRouter.onCommand(async (command) => {
            try {
                // Определяем режим в зависимости от порта
                // Если команда пришла с левой панели — режим track, с правой — fx
                const mode = command.port === 'left' ? 'track' : 'fx';
                
                switch (command.type) {
                    case 'mute': await guiManager.toggleMute(command.channel, command.state === 'on'); break;
                    case 'solo': await guiManager.toggleSolo(command.channel, command.state === 'on'); break;
                    case 'select': await guiManager.selectTrack(command.channel); break;
                    case 'fader': await guiManager.setVolume(command.channel, command.value); break;
                    case 'vpot': await guiManager.setPan(command.channel, command.value); break;
                    case 'play': case 'stop': case 'record': case 'rewind': case 'fastForward': case 'loop': case 'undo':
                        await guiManager.transport(command.type); break;
                    case 'touch': appState.feedbackLoop?.onTouch(command.channel); break;
                    case 'release': appState.feedbackLoop?.onRelease(command.channel); break;
                    default: logger.warn(`⚠️ Неизвестная команда: ${command.type}`);
                }
            } catch (error) {
                logger.error(`❌ Ошибка ${command.type}:`, error.message);
            }
        });

        // -9- Обратная связь
        const feedbackLoop = new FeedbackLoop(page, deviceRouter, guiManager, { interval: 150, touchDelay: 50 });
        feedbackLoop.start();
        appState.feedbackLoop = feedbackLoop;
        logger.log('♻️ Обратная связь запущена');

        appState.isRunning = true;
        logger.log(`${sunoImage} Сервер запущен!`);
        //logger.log('👍 Сервер запущен!');

        // -10- Консольные команды
        const cleanup = setupConsoleCommands(appState);
        appState.consoleCleanup = cleanup;

        // -11- Обработка завершения
        setupShutdownHandler();
        setupErrorHandlers();

    } catch (error) {
        logger.error('☠️ Критическая ошибка:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

startServer();