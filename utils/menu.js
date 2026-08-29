// utils/menu.js
// Inquirer меню

import inquirer from 'inquirer';
import Logger from './Logger.js';

const logger = new Logger('[MENU]');

export async function selectDeviceAndProtocol(devices, protocols) {
    if (devices.length === 0) {
        return {
            device: {
                name: 'SSL Nucleus 2',
                ports: { 
                    left: { input: 'ipMIDI Port 5', output: 'ipMIDI Port 5', mode: 'track', offset: 0 },
                    right: { input: 'ipMIDI Port 6', output: 'ipMIDI Port 6', mode: 'fx', offset: 8 }
                },
                defaultProtocol: 'HUI',
                hardware: { channels: 16, hasLCD: true }
            },
            protocol: protocols.find(p => p.name === 'HUI') || protocols[0]
        };
    }

    // --- 1. Выбор устройства ---
    const deviceChoices = devices.map(d => ({
        name: `${d.name}${d.isAvailable ? ' ✅' : ' ⚠️'}`,
        value: d.id
    }));

    const { deviceId } = await inquirer.prompt([{
        type: 'list',
        name: 'deviceId',
        message: 'Выберите MIDI-контроллер:',
        choices: deviceChoices,
        default: devices[0]?.id
    }]);

    const selectedDevice = devices.find(d => d.id === deviceId);

    // --- 2. Выбор протокола ---
    const protocolChoices = protocols
        .filter(p => (selectedDevice.protocols || ['HUI']).includes(p.name))
        .map(p => ({
            name: `${p.name} (v${p.version})`,
            value: p.id
        }));

    let selectedProtocol = protocols.find(p => p.name === selectedDevice.defaultProtocol);
    if (protocolChoices.length > 1) {
        const { protocolId } = await inquirer.prompt([{
            type: 'list',
            name: 'protocolId',
            message: 'Выберите протокол:',
            choices: protocolChoices,
            default: selectedDevice.defaultProtocol
        }]);
        selectedProtocol = protocols.find(p => p.id === protocolId);
    }

    // --- 3. Выбор MIDI-портов для левой и правой панели ---
    // Порты для левой панели (нечётные)
    const leftPorts = selectedDevice.ports?.available?.filter(p => 
        p.input.includes('Port 1') || p.input.includes('Port 3') || p.input.includes('Port 5')
    ) || [];
    
    // Порты для правой панели (чётные)
    const rightPorts = selectedDevice.ports?.available?.filter(p => 
        p.input.includes('Port 2') || p.input.includes('Port 4') || p.input.includes('Port 6')
    ) || [];

    // Выбор левого порта
    let leftPort = null;
    if (leftPorts.length > 0) {
        const choices = leftPorts.map(p => ({
            name: `${p.input} → ${p.output} (${p.description || 'Левая панель'})`,
            value: p.input
        }));
        const { leftInput } = await inquirer.prompt([{
            type: 'list',
            name: 'leftInput',
            message: 'Выберите порт для ЛЕВОЙ панели (каналы 1-8):',
            choices,
            default: leftPorts[0]?.input
        }]);
        leftPort = leftPorts.find(p => p.input === leftInput);
    }

    // Выбор правого порта
    let rightPort = null;
    if (rightPorts.length > 0) {
        const choices = rightPorts.map(p => ({
            name: `${p.input} → ${p.output} (${p.description || 'Правая панель'})`,
            value: p.input
        }));
        const { rightInput } = await inquirer.prompt([{
            type: 'list',
            name: 'rightInput',
            message: 'Выберите порт для ПРАВОЙ панели (каналы 9-16):',
            choices,
            default: rightPorts[0]?.input
        }]);
        rightPort = rightPorts.find(p => p.input === rightInput);
    }

    // Если порты не найдены — ручной ввод
    if (!leftPort || !rightPort) {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'leftInput',
                message: 'Введите MIDI-вход для ЛЕВОЙ панели:',
                default: 'ipMIDI Port 5'
            },
            {
                type: 'input',
                name: 'leftOutput',
                message: 'Введите MIDI-выход для ЛЕВОЙ панели:',
                default: 'ipMIDI Port 5'
            },
            {
                type: 'input',
                name: 'rightInput',
                message: 'Введите MIDI-вход для ПРАВОЙ панели:',
                default: 'ipMIDI Port 6'
            },
            {
                type: 'input',
                name: 'rightOutput',
                message: 'Введите MIDI-выход для ПРАВОЙ панели:',
                default: 'ipMIDI Port 6'
            }
        ]);
        
        leftPort = { 
            input: answers.leftInput, 
            output: answers.leftOutput, 
            mode: 'track', 
            offset: 0 
        };
        rightPort = { 
            input: answers.rightInput, 
            output: answers.rightOutput, 
            mode: 'fx', 
            offset: 8 
        };
    }

    // --- 4. Выбор режима для панелей ---
    const modeChoices = [
        { name: '🎚️ Track Control (громкость/панорама)', value: 'track' },
        { name: '🎛️ FX Control (эффекты выделенного канала)', value: 'fx' }
    ];
    
    const { leftMode } = await inquirer.prompt([{
        type: 'list',
        name: 'leftMode',
        message: 'Режим ЛЕВОЙ панели:',
        choices: modeChoices,
        default: leftPort?.mode || 'track'
    }]);
    
    const { rightMode } = await inquirer.prompt([{
        type: 'list',
        name: 'rightMode',
        message: 'Режим ПРАВОЙ панели:',
        choices: modeChoices,
        default: rightPort?.mode || 'fx'
    }]);

    // --- 5. Сборка конфигурации портов ---
    const ports = {
        left: {
            input: leftPort.input,
            output: leftPort.output,
            mode: leftMode,
            offset: leftPort.offset || 0
        },
        right: {
            input: rightPort.input,
            output: rightPort.output,
            mode: rightMode,
            offset: rightPort.offset || 8
        }
    };

    // Сохраняем порты в устройство
    selectedDevice.ports = ports;
    selectedDevice.channelOffset = 0; // Базовое смещение, будет переопределено при инициализации

    // --- 6. Вывод информации ---
    logger.log(`\n📋 Конфигурация:`);
    logger.log(`   Левая панель: ${ports.left.input} → ${ports.left.output} (${leftMode})`);
    logger.log(`   Правая панель: ${ports.right.input} → ${ports.right.output} (${rightMode})`);

    return { device: selectedDevice, protocol: selectedProtocol };
}

export async function confirmContinue(message) {
    const { ok } = await inquirer.prompt([{
        type: 'confirm',
        name: 'ok',
        message,
        default: false
    }]);
    return ok;
}