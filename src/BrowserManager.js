// src/BrowserManager.js
// Управление браузером через Puppeteer

import puppeteer from 'puppeteer-core';
import Logger from '../utils/Logger.js';

export default class BrowserManager {
    constructor(options = {}) {
        this.logger = new Logger('[BROWSE]');
        this.browser = null;
        this.page = null;
        this.port = options.port || 9222;
        this.url = options.url || 'https://suno.com';
        this.isConnected = false;
    }

    // Подключение к запущенному браузеру
    async connect() {
        try {
            this.logger.log(`🚧 Подключение к Chrome на порту ${this.port}...`);
            
            this.browser = await puppeteer.connect({
                browserURL: `http://127.0.0.1:${this.port}`,
                defaultViewport: null
            });

            const pages = await this.browser.pages();
            this.page = pages.find(p => p.url().includes('suno.com'));

            if (!this.page) {
                this.logger.log('🖥️ Вкладка Suno не найдена. Открываем новую...');
                this.page = await this.browser.newPage();
                await this.page.goto(this.url, {
                    waitUntil: 'networkidle2',
                    timeout: 60000  // Увеличили до 60 секунд
                });
            } else {
                this.logger.log('☑️ Подключены к существующей вкладке Suno Studio!');
                // Убираем принудительную перезагрузку
                // await this.page.reload({ waitUntil: 'networkidle2' });
            }

            this.isConnected = true;
            
            this.page.on('error', (error) => {
                this.logger.error('⚠️ Ошибка страницы:', error.message);
            });

            this.page.on('pageerror', (error) => {
                this.logger.error('⚠️ ', error.message);
            });

            this.logger.log('☑️ Браузер готов к работе');
            return this.page;

        } catch (error) {
            this.logger.error('❌ Ошибка подключения к браузеру:', error.message);
            this.logger.error('💡 Убедитесь, что Chrome запущен с флагом --remote-debugging-port=' + this.port);
            throw error;
        }
    }

    // Проверка, активна ли страница
    async isPageActive() {
        if (!this.page) return false;
        try {
            await this.page.evaluate(() => document.readyState);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Перезагрузка страницы
    async reloadPage() {
        if (!this.page) return;
        this.logger.log('🔄 Перезагрузка страницы...');
        await this.page.reload({ waitUntil: 'networkidle2' });
        this.logger.log('♻️ Страница перезагружена');
    }


    // Выполнение JavaScript в контексте страницы
    async evaluateScript(script, ...args) {
        if (!this.page) throw new Error('Страница не подключена');
        return await this.page.evaluate(script, ...args);
    }


    // Поиск элемента в DOM
    async findElement(selector, timeout = 5000) {
        if (!this.page) throw new Error('Страница не подключена');
        try {
            await this.page.waitForSelector(selector, { timeout });
            return await this.page.$(selector);
        } catch (error) {
            this.logger.warn(`⚠️ Элемент не найден: ${selector}`);
            return null;
        }
    }

    // Поиск всех элементов по селектору
    async findElements(selector) {
        if (!this.page) throw new Error('Страница не подключена');
        return await this.page.$$(selector);
    }

    // Отключение от браузера
    async disconnect() {
        if (this.browser) {
            this.logger.log('⏹️ Отключение от браузера...');
            await this.browser.disconnect();
            this.isConnected = false;
            this.browser = null;
            this.page = null;
            this.logger.log('⛔️ Отключено');
        }
    }

    // Сделать скриншот страницы (для отладки)
    async screenshot(path = 'screenshot.png') {
        if (!this.page) return;
        await this.page.screenshot({ path, fullPage: true });
        this.logger.log(`🛟 Скриншот сохранён: ${path}`);
    }

    // Получить текущий URL
    getCurrentUrl() {
        return this.page ? this.page.url() : null;
    }

    // Получить заголовок страницы
    async getTitle() {
        if (!this.page) return null;
        return await this.page.title();
    }
}