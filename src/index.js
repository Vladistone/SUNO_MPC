// src/index.js
// Главная точка входа для Suno Studio Controller
// Запускает сервер, управляет браузером, MIDI и GUI

import BrowserManager from './BrowserManager.js';
import { HUIProtocol } from '../midi/protocols/hui.js';
import { SSL_NUCLEUS_2 } from '../midi/devices/ssl-nucleus-2.js';
import DeviceRouter from '../midi/device-router.js';
import GUIManager from './GUIManager.js';
import FeedbackLoop from '../util/FeedbackLoop.js';
import Logger from './Logger.js';

// Создаём экземпляр логгера
const logger = new Logger('[MAIN]');

// Состояние приложения
const appState = {
    isRunning: false,
    browser: null,
    page: null,
    deviceRouter: null,
    guiManager: null,
    feedbackLoop: null
};

/**
 * Основная функция запуска сервера
 */
async function startServer() {
    logger.log('🚀 Запуск Suno Studio Controller...');
    
    try {
        // --- 1. Подключение к браузеру ---
        const browserManager = new BrowserManager();
        const page = await browserManager.connect();
        appState.page = page;
        logger.log('✅ Браузер подключен');
        
        // --- 2. Инициализация GUI менеджера ---
        const guiManager = new GUIManager(page);
        await guiManager.loadSelectors();
        await guiManager.syncTracks();
        appState.guiManager = guiManager;
        logger.log('✅ GUI менеджер инициализирован');
        
        // --- 3. Настройка MIDI-маршрутизации ---
        // Создаём протокол (HUI)
        const protocol = new HUIProtocol();
        
        // Создаём маршрутизатор для устройства
        const deviceRouter = new DeviceRouter(SSL_NUCLEUS_2, protocol);
        
        // Подключаем MIDI-порты
        await deviceRouter.connect(
            SSL_NUCLEUS_2.ports.input,
            SSL_NUCLEUS_2.ports.output
        );
        appState.deviceRouter = deviceRouter;
        logger.log('✅ MIDI-маршрутизатор настроен');
        
        // --- 4. Настройка обработчиков команд ---
        // Регистрируем обработчик для абстрактных команд
        deviceRouter.onCommand(async (command) => {
            logger.log(`📨 Получена команда: ${command.type}`, command);
            
            try {
                // Маршрутизация команд в зависимости от типа
                switch (command.type) {
                    case 'mute':
                        await guiManager.toggleMute(command.channel, command.state === 'on');
                        break;
                        
                    case 'solo':
                        await guiManager.toggleSolo(command.channel, command.state === 'on');
                        break;
                        
                    case 'select':
                        await guiManager.selectTrack(command.channel);
                        break;
                        
                    case 'fader':
                        await guiManager.setVolume(command.channel, command.value);
                        break;
                        
                    case 'vpot':
                        await guiManager.setPan(command.channel, command.value);
                        break;
                        
                    case 'play':
                        await guiManager.transport('play');
                        break;
                        
                    case 'stop':
                        await guiManager.transport('stop');
                        break;
                        
                    case 'record':
                        await guiManager.transport('record');
                        break;
                        
                    case 'rewind':
                        await guiManager.transport('rewind');
                        break;
                        
                    case 'fastForward':
                        await guiManager.transport('fastForward');
                        break;
                        
                    case 'loop':
                        await guiManager.transport('loop');
                        break;
                        
                    case 'undo':
                        await guiManager.transport('undo');
                        break;
                        
                    case 'touch':
                        // Логика касания фейдера (отключает feedback)
                        logger.log(`👆 Касание фейдера ${command.channel + 1}`);
                        break;
                        
                    case 'release':
                        logger.log(`👋 Отпускание фейдера ${command.channel + 1}`);
                        break;
                        
                    default:
                        logger.warn(`⚠️ Неизвестная команда: ${command.type}`);
                }
            } catch (error) {
                logger.error(`❌ Ошибка обработки команды ${command.type}:`, error.message);
            }
        });
        
        // --- 5. Запуск обратной связи (Feedback Loop) ---
        const feedbackLoop = new FeedbackLoop(
            page,
            deviceRouter,
            guiManager,
            {
                interval: 150,
                touchDelay: 50
            }
        );
        feedbackLoop.start();
        appState.feedbackLoop = feedbackLoop;
        logger.log('✅ Обратная связь запущена');
        
        // --- 6. Завершение инициализации ---
        appState.isRunning = true;
        logger.log('🎉 Сервер успешно запущен!');
        logger.log(`📡 Устройство: ${SSL_NUCLEUS_2.name} (${SSL_NUCLEUS_2.defaultProtocol})`);
        logger.log(`🔊 MIDI порты: ${SSL_NUCLEUS_2.ports.input} → ${SSL_NUCLEUS_2.ports.output}`);
        logger.log(`📺 LCD дисплей: ${SSL_NUCLEUS_2.hardware.hasLCD ? 'Включен' : 'Выключен'}`);
        
        // --- 7. Обработка завершения ---
        process.on('SIGINT', () => {
            logger.log('🛑 Получен сигнал завершения. Останавливаем сервер...');
            shutdown();
        });
        
        process.on('SIGTERM', () => {
            logger.log('🛑 Получен сигнал завершения. Останавливаем сервер...');
            shutdown();
        });
        
    } catch (error) {
        logger.error('💥 Критическая ошибка при запуске сервера:', error.message);
        logger.error(error.stack);
        process.exit(1);
    }
}

/**
 * Функция корректного завершения работы
 */
async function shutdown() {
    logger.log('🔄 Остановка сервера...');
    
    try {
        // Останавливаем обратную связь
        if (appState.feedbackLoop) {
            appState.feedbackLoop.stop();
        }
        
        // Отключаем MIDI
        if (appState.deviceRouter) {
            await appState.deviceRouter.disconnect();
        }
        
        // Отключаем браузер
        if (appState.browser) {
            await appState.browser.disconnect();
        }
        
        appState.isRunning = false;
        logger.log('👋 Сервер остановлен. До свидания!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Ошибка при остановке сервера:', error.message);
        process.exit(1);
    }
}

// Запускаем сервер
startServer();

// Экспортируем функции для тестирования
export { startServer, shutdown };