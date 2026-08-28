import puppeteer from 'puppeteer-core';
import easymidi from 'easymidi';
// server.js (новая версия)
// import DOMAdapter from './src/dom-adapter.js';

async function startServer() {
    console.log('[START] Инициализация сервера автоматизации...');

    try {
        const browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null
        });

        const pages = await browser.pages();
        let page = pages.find(p => p.url().includes('suno.com'));

        if (!page) {
            console.log('[BROWSER] Вкладка Suno не найдена. Открываем новую...');
            page = await browser.newPage();
            await page.goto('https://suno.com');
        } else {
            console.log('[BROWSER] Успешно подключились к живой вкладке Suno Studio!');
        }

        const midiInput5 = new easymidi.Input('ipMIDI Port 5');
        const midiOutput5 = new easymidi.Output('ipMIDI Port 5');
        console.log('[MIDI] Монолитный HUI-мост (Макро-дебаг) запущен на ipMIDI Port 5!');

        let lastSentValues = new Array(16).fill(-1);
        let channelStates = Array.from({ length: 16 }, () => ({
            isTouched: false,
            msb: 0,
            lsb: 0,
            lastMidiValue: 64,
            lastLoggedPct: -1,
            accumulatedDelta: 0,
            isUpdatingGUI: false
        }));

        let activeTouchTrack5 = 0;
        let activeZone5 = 0;
        const SENSITIVITY = 0.8;
        let lastUserMoveTime = 0;
        let mouseDown = false;

        // =====================================================================
        // ПРАВИЛЬНАЯ КОНВЕРТАЦИЯ MIDI → UI % (логарифмическая шкала WavTool)
        // MIDI 0-127 → UI 0-100%
        // 0 MIDI = 0% (-∞ dB)
        // 105 MIDI = 80% (0.0 dB)
        // 127 MIDI = 100% (+12 dB)
        // =====================================================================
        function midiToPercent(midi) {
            // Жесткие границы минимума и максимума фейдера Nucleus2
            if (midi <= 0) return 0;
            if (midi >= 127) return 100;
            // Зеркальный перевод HUI-команд пульта в реальные проценты ползунка Suno
            if (midi <= 105) {
                // Диапазон фейдера 0..105 плавно переходит в 0%..80% на экране (от -72dB до 0dB)
                return (midi / 105) * 80;
            } else {
                // Диапазон фейдера 106..127 плавно переходит в 81%..100% на экране (от 0dB до +12dB)
                return 80 + (((midi - 105) / 22) * 20);
            }
        }

        function updateHuiDisplay(channelIndex, name) {
            if (channelIndex >= 8) return;

            let shortName = name;
            if (name === "Woodwinds") shortName = "Wood";
            if (name === "Brass") shortName = "Bras";
            if (name === "Keyboard") shortName = "Keyb";
            if (name === "Guitar") shortName = "Gtr ";
            if (name === "Percussion") shortName = "Perc";
            if (name === "Backing_Vocals") shortName = "BVox";
            if (name === "Vocals") shortName = "Vox ";

            let formattedName = shortName.substring(0, 4).padEnd(4, ' ');

            const sysexBytes = [
                0xF0, 0x00, 0x00, 0x66, 0x05, 0x00, 0x10,
                channelIndex
            ];

            for (let i = 0; i < 4; i++) {
                sysexBytes.push(formattedName.charCodeAt(i) & 0x7F);
            }
            sysexBytes.push(0xF7);

            try {
                midiOutput5.send('sysex', sysexBytes);
            } catch (e) {
                console.log(`[LCD-ERROR] Не удалось отправить текст для канала ${channelIndex + 1}`);
            }
        }

        try {
            console.log('\n[SYNC-DIAGNOSTIC] === СКАНИРОВАНИЕ ИНТЕРФЕЙСА SUNO ===');

            const trackData = await page.evaluate(() => {
                const allTracks = document.querySelectorAll('[data-track-header]');
                return Array.from(allTracks).map((track) => {
                    const nameSpan = track.querySelector('span[role="button"]') || track.querySelector('[style*="cursor: pointer"]');
                    const trackName = nameSpan ? nameSpan.textContent.trim() : "Mstr";

                    const thumb = track.querySelector('[style*="left"]') || track.querySelector('[role="slider"]');
                    const filledBar = track.querySelector('[style*="width"]');

                    let parsed = null;
                    if (thumb && thumb.style.left) {
                        parsed = parseFloat(thumb.style.left.replace('%', ''));
                    } else if (filledBar && filledBar.style.width) {
                        parsed = parseFloat(filledBar.style.width.replace('%', ''));
                    }

                    return {
                        name: trackName,
                        thumbFound: !!thumb || !!filledBar,
                        finalValue: (parsed !== null && !isNaN(parsed)) ? parsed : 50,
                        isVisible: track.offsetWidth > 0 || track.offsetHeight > 0
                    };
                });
            });

            const stems = trackData.slice(1);

            stems.forEach((stem, i) => {
                if (i >= 12) return;

                console.log(` -> Fader ${i + 1} [Имя: "${stem.name}"]: ` +
                    `Element=${stem.thumbFound ? 'OK' : 'NOT_FOUND'}, ` +
                    `Value=${stem.finalValue.toFixed(2)}% | Видим=${stem.isVisible}`);

                if (i < 8) {
                    updateHuiDisplay(i, stem.name);
                }

                const pct = stem.finalValue;
                const targetMidiVal = Math.round((pct / 100) * 127);

                channelStates[i].lastMidiValue = targetMidiVal;
                lastSentValues[i] = targetMidiVal;

                const fullHuiOut = Math.round((targetMidiVal / 127) * 16383);
                const msbOut = (fullHuiOut >> 7) & 0x7F;

                if (i < 8) {
                    midiOutput5.send('cc', { controller: i, value: msbOut, channel: 0 });
                    midiOutput5.send('cc', { controller: i + 32, value: targetMidiVal, channel: 0 });
                }
            });

            console.log('[SYNC-DIAGNOSTIC] === КОНЕЦ ОТЧЕТА СИНХРОНИЗАЦИИ ===\n');
        } catch (syncErr) {
            console.log('[SYNC] Сбой разбора интерфейса:', syncErr.message);
        }

        // =====================================================================
        // Блок считывания MIDI CC контроллера с использованием switch
        // =====================================================================
        midiInput5.on('cc', async (msg) => {
            try {
                const controller = msg.controller;
                const value = msg.value;

                switch (controller) {
                    // Зона и трек касания
                    case 15:
                    case 0:
                        activeZone5 = value;
                        activeTouchTrack5 = value & 0x07;
                        break;

                    // Касание фейдера и специальные команды
                    case 47:
                        // Обработка зоны фейдеров (0x00 или 0-7)
                        if (activeZone5 === 0x00 || (activeZone5 >= 0 && activeZone5 <= 7)) {
                            const trackId = activeTouchTrack5;
                            const isPressed = value === 64;
                            if (channelStates[trackId].isTouched !== isPressed) {
                                channelStates[trackId].isTouched = isPressed;
                                console.log(`[TOUCH] Fader ${trackId + 1} -> ${isPressed ? 'ЗАЖАТ' : 'ОТПУЩЕН'}`);

                                if (isPressed) {
                                    const webTrackId = trackId + 1;
                                    const coords = await page.evaluate((targetIndex) => {
                                        const tracks = document.querySelectorAll('[data-track-header]');
                                        const track = tracks[targetIndex];
                                        if (!track) return null;

                                        const thumb = track.querySelector('[style*="left"]') || track.querySelector('[role="slider"]');
                                        const sliderLine = track.querySelector('[style*="width"]') || thumb?.parentElement;

                                        if (thumb && sliderLine) {
                                            const thumbRect = thumb.getBoundingClientRect();
                                            const lineRect = sliderLine.getBoundingClientRect();
                                            return {
                                                centerX: thumbRect.left + (thumbRect.width / 2),
                                                centerY: thumbRect.top + (thumbRect.height / 2),
                                                trackWidth: lineRect.width
                                            };
                                        }
                                        return null;
                                    }, webTrackId);

                                    if (coords && !mouseDown) {
                                        await page.mouse.move(coords.centerX, coords.centerY);
                                        await page.mouse.down();
                                        mouseDown = true;
                                    }
                                } else {
                                    if (mouseDown) {
                                        await page.mouse.up();
                                        mouseDown = false;
                                    }
                                }
                            }
                        }

                        // Сброс V-Pot (зона 0x1C)
                        if (activeZone5 === 0x1C && value >= 64) {
                            const trackId = value & 0x07;
                            const webTrackId = trackId + 1;
                            console.log(`[RESET] V-Pot ${trackId + 1} -> Сброс Стема ${webTrackId + 1} в 50%`);
                            channelStates[trackId].lastMidiValue = 64;

                            await page.evaluate((track) => {
                                const tracks = document.querySelectorAll('[data-track-header]');
                                if (tracks[track]) {
                                    const thumb = tracks[track].querySelector('[style*="left"]') || tracks[track].querySelector('[role="slider"]');
                                    const filledBar = tracks[track].querySelector('[style*="width"]');
                                    if (thumb && filledBar) {
                                        thumb.style.left = '50%';
                                        filledBar.style.width = '50%';
                                        const opts = { bubbles: true, cancelable: true };
                                        thumb.dispatchEvent(new Event('input', opts));
                                        thumb.dispatchEvent(new Event('change', opts));
                                    }
                                }
                            }, webTrackId);
                        }
                        break;

                    // MSB (старший байт) фейдера
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                        channelStates[controller].msb = value;
                        break;

                    // LSB (младший байт) фейдера — основное движение
                    case 32:
                    case 33:
                    case 34:
                    case 35:
                    case 36:
                    case 37:
                    case 38:
                    case 39: {
                        const trackId = controller - 32;
                        channelStates[trackId].lsb = value;

                        const fullHuiValue = (channelStates[trackId].msb << 7) | channelStates[trackId].lsb;
                        const midiVal = Math.round((fullHuiValue / 16383) * 127);
                        const webTrackId = trackId + 1;

                        const pctValue = midiToPercent(midiVal);
                        const deltaMidi = midiVal - channelStates[trackId].lastMidiValue;
                        channelStates[trackId].lastMidiValue = midiVal;

                        if (channelStates[trackId].lastLoggedPct !== pctValue) {
                            channelStates[trackId].lastLoggedPct = pctValue;
                            console.log(`[MOVE] Fader ${trackId + 1} -> Стем ${webTrackId + 1} | Положение: ${pctValue.toFixed(1)}% (MIDI ${midiVal})`);
                        }

                        if (channelStates[trackId].isTouched && Math.abs(deltaMidi) > 0) {
                            channelStates[trackId].accumulatedDelta += deltaMidi;

                            if (Math.abs(channelStates[trackId].accumulatedDelta) > 2) {
                                const coords = await page.evaluate((targetIndex) => {
                                    const tracks = document.querySelectorAll('[data-track-header]');
                                    const track = tracks[targetIndex];
                                    if (!track) return null;

                                    const thumb = track.querySelector('.esp3i7i2');
                                    const sliderLine = track.querySelector('[style*="width"]') || thumb?.parentElement;

                                    if (thumb && sliderLine) {
                                        const thumbRect = thumb.getBoundingClientRect();
                                        const lineRect = sliderLine.getBoundingClientRect();
                                        return {
                                            centerX: thumbRect.left + (thumbRect.width / 2),
                                            centerY: thumbRect.top + (thumbRect.height / 2),
                                            trackWidth: lineRect.width
                                        };
                                    }
                                    return null;
                                }, webTrackId);

                                if (coords) {
                                    const pixelsPerMidiStep = coords.trackWidth / 127;
                                    const targetX = coords.centerX + (channelStates[trackId].accumulatedDelta * pixelsPerMidiStep);
                                    const targetY = coords.centerY;

                                    channelStates[trackId].isUpdatingGUI = true;

                                    if (!mouseDown) {
                                        await page.mouse.move(coords.centerX, coords.centerY);
                                        await page.mouse.down();
                                        mouseDown = true;
                                    }
                                    await page.mouse.move(targetX, targetY, { steps: 5 });

                                    channelStates[trackId].isUpdatingGUI = false;
                                    channelStates[trackId].accumulatedDelta = 0;

                                    console.log(`[MOVE] Fader ${trackId + 1} -> Стем ${webTrackId + 1} | Мышь: ${targetX.toFixed(0)}x${targetY.toFixed(0)}`);
                                }
                            }
                        }
                        break;
                    }

                    // Другие контроллеры игнорируем
                    default:
                        // Можно добавить логирование неизвестных CC для отладки
                        // console.log(`[MIDI] Неизвестный CC: ${controller} = ${value}`);
                        break;
                }
            } catch (err) {
                console.log('[MIDI-ERROR]', err.message);
            }
        });

        // =====================================================================
        // ОБРАТНАЯ СВЯЗЬ (Feedback Loop)
        // =====================================================================
        async function runFeedbackLoop() {
            try {
                if (channelStates.some(ch => ch.isTouched || ch.isUpdatingGUI)) {
                    setTimeout(runFeedbackLoop, 50);
                    return;
                }

                // Читаем данные из GUI
                const currentPercentages = await page.evaluate(() => {
                    const allTracks = document.querySelectorAll('[data-track-header]');
                    return Array.from(allTracks).slice(1, 13).map(track => {
                        const thumb = track.querySelector('.esp3i7i2');
                        const nameSpan = track.querySelector('span[role="button"]');
                        const name = nameSpan ? nameSpan.textContent.trim() : "Track";
                        if (thumb && thumb.style.left) {
                            return { name, value: parseFloat(thumb.style.left.replace('%', '')) || 50 };
                        }
                        const filledBar = track.querySelector('[style*="width"]');
                        if (filledBar && filledBar.style.width) {
                            return { name, value: parseFloat(filledBar.style.width.replace('%', '')) || 50 };
                        }
                        return { name, value: 50 };
                    });
                });

                // Отслеживание состояния Mute/Solo для обратной связи
                const trackStates = await page.evaluate(() => {
                    const allTracks = document.querySelectorAll('[data-track-header]');
                    return Array.from(allTracks).slice(1, 9).map(track => {
                        const muteBtn = track.querySelector('[aria-label*="mute"]');
                        const soloBtn = track.querySelector('[aria-label*="solo"]');
                        return {
                            muted: muteBtn ? muteBtn.getAttribute('aria-pressed') === 'true' : false,
                            soloed: soloBtn ? soloBtn.getAttribute('aria-pressed') === 'true' : false
                        };
                    });
                });

                // Отправка обратной связи для Mute/Solo
                for (let i = 0; i < trackStates.length; i++) {
                    // Mute Feedback
                    const muteValue = trackStates[i].muted ? 66 : 2;
                    midiOutput5.send('cc', { controller: 47, value: muteValue, channel: 0 });
                    midiOutput5.send('cc', { controller: 15, value: i, channel: 0 });

                    // Solo Feedback
                    const soloValue = trackStates[i].soloed ? 67 : 3;
                    midiOutput5.send('cc', { controller: 47, value: soloValue, channel: 0 });
                    midiOutput5.send('cc', { controller: 15, value: i, channel: 0 });
                }

                // Обновление LCD и отправка значений фейдеров
                for (let i = 0; i < currentPercentages.length && i < 8; i++) {
                    // Обновляем LCD
                    updateHuiDisplay(i, currentPercentages[i].name);

                    if (channelStates[i].isTouched) continue;

                    const pct = currentPercentages[i].value;
                    let targetMidiVal = 0;
                    if (pct <= 80) {
                        targetMidiVal = Math.round((pct / 80) * 105);
                    } else {
                        targetMidiVal = 105 + Math.round(((pct - 80) / 20) * 22);
                    }
                    if (targetMidiVal > 127) targetMidiVal = 127;
                    if (targetMidiVal < 0) targetMidiVal = 0;

                    const delta = Math.abs(targetMidiVal - channelStates[i].lastMidiValue);

                    if (delta > 2 && targetMidiVal !== lastSentValues[i]) {
                        lastSentValues[i] = targetMidiVal;
                        channelStates[i].lastMidiValue = targetMidiVal;

                        const fullHuiOut = Math.round((targetMidiVal / 127) * 16383);
                        const msbOut = (fullHuiOut >> 7) & 0x7F;

                        if (i < 8) {
                            midiOutput5.send('cc', { controller: i, value: msbOut, channel: 0 });
                            midiOutput5.send('cc', { controller: i + 32, value: targetMidiVal, channel: 0 });
                        }
                    }
                }
            } catch (e) {
                // Игнорируем ошибки
            }
            setTimeout(runFeedbackLoop, 150);
        }

        runFeedbackLoop();

    } catch (error) {
        console.error('[FATAL] Сбой:', error.message);
    }
}

startServer();