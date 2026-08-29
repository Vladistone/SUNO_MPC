// utils/commands.js
// Консольные команды

import Logger from './Logger.js';

const logger = new Logger('[CMD]');

export function setupConsoleCommands(appState) {
    console.log('\n🔄 Команды:');
    console.log('  r  - перезагрузить страницу');
    console.log('  s  - принудительная синхронизация');
    console.log('  c  - показать конфигурацию');
    console.log('  q  - выход\n');

    process.stdin.setRawMode(true);
    process.stdin.resume();

    // ... обработка команд
    const handler = async (key) => {
        const k = key.toString();
        const { page, guiManager, feedbackLoop, selectedDevice, selectedProtocol, config, shutdown } = appState;

        switch (k) {
            case 'q': case '\u0003': await shutdown?.(); break;
            case 'r':
                logger.log('🔄 Перезагрузка...');
                try {
                    await page.reload({ waitUntil: 'networkidle2' });
                    await guiManager.syncTracks();
                    await feedbackLoop.forceSync();
                    logger.log('✅ Перезагрузка завершена');
                } catch (e) { logger.error('❌ Ошибка:', e.message); }
                break;
            case 's':
                logger.log('🔄 Синхронизация...');
                try { await feedbackLoop.forceSync(); logger.log('✅ Синхронизация завершена'); }
                catch (e) { logger.error('❌ Ошибка:', e.message); }
                break;
            case 'c':
                console.log('\n📋 КОНФИГУРАЦИЯ');
                console.log('═'.repeat(50));
                console.log(`  Устройство:   ${selectedDevice?.name || 'не выбрано'}`);
                console.log(`  Протокол:     ${selectedProtocol?.name || 'не выбран'}`);
                console.log(`  MIDI вход:    ${selectedDevice?.ports?.input || 'не выбран'}`);
                console.log(`  MIDI выход:   ${selectedDevice?.ports?.output || 'не выбран'}`);
                console.log(`  Каналов:      ${selectedDevice?.hardware?.channels || 8}`);
                console.log(`  LCD:          ${selectedDevice?.hardware?.hasLCD ? 'Да' : 'Нет'}`);
                console.log(`  Обновлено:    ${config?.timestamp || 'неизвестно'}`);
                console.log('═'.repeat(50) + '\n');
                break;
        }
    };

    process.stdin.on('data', handler);

    return {
        cleanup: () => {
            process.stdin.removeListener('data', handler);
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }
    };
}