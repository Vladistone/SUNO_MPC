// core/LifeCycle.js
// Управление жизненным циклом

import Logger from '../utils/Logger.js';
import { appState } from './State.js';

const logger = new Logger('[LIFECYCLE]');

export async function shutdown() {
    if (!appState.isRunning) return;
    logger.log('🔄 Остановка сервера...');
    appState.isRunning = false;

    // Проверяем, что consoleCleanup существует и является функцией
    if (appState.consoleCleanup && typeof appState.consoleCleanup === 'function') {
        appState.consoleCleanup();
    }

    if (appState.feedbackLoop) {
        appState.feedbackLoop.stop();
    }
    if (appState.deviceRouter) {
        await appState.deviceRouter.disconnect();
    }
    if (appState.browser) {
        await appState.browser.disconnect();
    }

    logger.log('👋 Сервер остановлен.');
    process.exit(0);
}

export function setupShutdownHandler() {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

export function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        logger.error('💥 Необработанное исключение:', error.message);
        console.error(error.stack);
    });
    process.on('unhandledRejection', (reason) => {
        logger.error('💥 Необработанный rejection:', reason);
    });
}