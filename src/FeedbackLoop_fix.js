async _loop() {
    if (!this.isRunning) return;
    
    try {
        if (this.isTouched) {
            this._scheduleNext();
            return;
        }
        
        if (!this.page) {
            this.logger.warn('⚠️ Страница не инициализирована');
            this._scheduleNext();
            return;
        }
        
        // Проверяем доступность страницы
        try {
            await this.page.evaluate(() => document.readyState);
        } catch (e) {
            this._scheduleNext();
            return;
        }
        
        const currentState = await this._getGUIState();
        if (currentState && currentState.length > 0) {
            await this._processStateChanges(currentState);
        }
    } catch (error) {
        if (error.message && !error.message.includes('Protocol error')) {
            this.logger.error('❌ Ошибка в цикле:', error.message);
        }
    }
    this._scheduleNext();
}
