// tests/studio_v1.test.js
// Простой тест для проверки работы модулей

import Logger from '../utils/Logger.js';
import BrowserManager from '../src/BrowserManager.js';

const logger = new Logger('[TEST]');

async function testBrowserConnection() {
    logger.log('🧪 Тест подключения к браузеру...');
    
    try {
        const browserManager = new BrowserManager();
        const page = await browserManager.connect();
        
        if (page) {
            const title = await page.title();
            logger.log(`✅ Браузер подключен. Заголовок: "${title}"`);
            
            const url = page.url();
            logger.log(`📄 Текущий URL: ${url}`);
            
            // Проверяем наличие Suno Studio
            if (url.includes('suno.com')) {
                logger.log('✅ Suno Studio обнаружена');
            } else {
                logger.warn('⚠️ Suno Studio не обнаружена. URL:', url);
            }
            
            await browserManager.disconnect();
            logger.log('✅ Тест успешно завершён');
            return true;
        }
    } catch (error) {
        logger.error('❌ Ошибка подключения:', error.message);
        return false;
    }
}

// Запуск теста
testBrowserConnection();