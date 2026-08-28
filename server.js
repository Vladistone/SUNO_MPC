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
            isTouched: false, msb: 0, lsb: 0, lastMidiValue: 64, lastLoggedPct: -1
            isUpdatingGUI: false,  // <-- новое поле
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
		// Блок считывания MIDI CC контроллера:
        midiInput5.on('cc', async (msg) => {
            try {
                if (msg.controller === 15 || msg.controller === 0) {
                    activeZone5 = msg.value;
                    activeTouchTrack5 = msg.value & 0x07;
                }
                
                if (msg.controller === 47) {
                    if (activeZone5 === 0x00 || (activeZone5 >= 0 && activeZone5 <= 7)) {
                        const trackId = activeTouchTrack5;
                        const isPressed = msg.value === 64;
                        if (channelStates[trackId].isTouched !== isPressed) {
                            channelStates[trackId].isTouched = isPressed;
                            console.log(`[TOUCH] Fader ${trackId + 1} -> ${isPressed ? 'ЗАЖАТ' : 'ОТПУЩЕН'}`);
                            
                            if (isPressed) {
                                const trackId = activeTouchTrack5; // используем trackId
                                const webTrackId = trackId + 1;    // определяем webTrackId здесь
                                const coords = await page.evaluate((targetIndex) => {

								    if (!track) return null;
    
								    const thumb = track.querySelector('[style*="left"]') || track.querySelector('[role="slider"]');
								    // Находим родительский контейнер или саму дорожку, которая определяет ширину хода
								    const sliderLine = track.querySelector('[style*="width"]') || thumb?.parentElement;
    
								    if (thumb && sliderLine) {
								        const thumbRect = thumb.getBoundingClientRect();
								        const lineRect = sliderLine.getBoundingClientRect();
								        return {
								            centerX: thumbRect.left + (thumbRect.width / 2),
								            centerY: thumbRect.top + (thumbRect.height / 2),
								            // Динамически передаем реальную ширину слайдера на экране в этот миллисекундный момент
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

                    if (activeZone5 === 0x1C && msg.value >= 64) {
                        const trackId = msg.value & 0x07; 
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
                }

                if (msg.controller >= 0 && msg.controller <= 7) { 
                    channelStates[msg.controller].msb = msg.value; 
                }
                
                if (msg.controller >= 32 && msg.controller <= 39) {
                    const trackId = msg.controller - 32;
                    channelStates[trackId].lsb = msg.value;

                    const fullHuiValue = (channelStates[trackId].msb << 7) | channelStates[trackId].lsb;
                    const midiVal = Math.round((fullHuiValue / 16383) * 127);
					const deltaMidi = midiVal - channelStates[trackId].lastMidiValue;
                    const webTrackId = trackId + 1;
                    const pctValue = midiToPercent(midiVal);// ИСПРАВЛЕНИЕ: используем правильную логарифмическую конвертацию

                    if (channelStates[trackId].lastLoggedPct !== pctValue) {
                        channelStates[trackId].lastLoggedPct = pctValue;
                        console.log(`[MOVE] Fader ${trackId + 1} -> Стем ${webTrackId + 1} | Положение: ${pctValue}% (MIDI ${midiVal})`);
                    }
			        // === ТОЧЕЧНОЕ ИСПРАВЛЕНИЕ ДИНАМИЧЕСКИХ КООРДИНАТ (СТРОКИ 249-279) ===
                    if (channelStates[trackId].isTouched) {
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
                                    trackWidth: lineRect.width,
                                    left: thumb.style.left
                                };
                            }
                            return null;
                        }, webTrackId);

                        if (coords) {
                            // Вычисляем новую позицию ТОЛЬКО для мыши
                            const pixelsPerMidiStep = coords.trackWidth / 127;
                            const targetX = coords.centerX + (deltaMidi * pixelsPerMidiStep);
                            const targetY = coords.centerY;

                            // ИСПРАВЛЕНО: ТОЛЬКО эмуляция мыши, без изменения DOM
                            if (!mouseDown) {
                                await page.mouse.move(coords.centerX, coords.centerY);
                                await page.mouse.down();
                                mouseDown = true;
                            }
                            
                            const steps = Math.max(1, Math.abs(Math.round(deltaMidi / 3)));
                            await page.mouse.move(targetX, targetY, { steps: steps });
                            
                            // УБИРАЕМ изменение style.left и dispatchEvent
                            // Оставляем только mouse move
                        }
                        channelStates[trackId].lastMidiValue = midiVal;
                    }
			    }
			} catch (err) {
			    console.log('[MIDI-ERROR]', err.message);
			}
		});
		
         async function runFeedbackLoop() {
            try {
                // ПРОВЕРКА: если хоть один фейдер зажат — пропускаем цикл
                if (channelStates.some(ch => ch.isTouched || ch.isUpdatingGUI)) {
                    setTimeout(runFeedbackLoop, 50);
                    return;
                }

                // Если фейдеры не зажаты — читаем положение из GUI
                const currentPercentages = await page.evaluate(() => {
                    const allTracks = document.querySelectorAll('[data-track-header]');
                    return Array.from(allTracks).slice(1, 13).map(track => {
                        const thumb = track.querySelector('.esp3i7i2');
                        if (thumb && thumb.style.left) {
                            return parseFloat(thumb.style.left.replace('%', '')) || 50;
                        }
                        const filledBar = track.querySelector('[style*="width"]');
                        if (filledBar && filledBar.style.width) {
                            return parseFloat(filledBar.style.width.replace('%', '')) || 50;
                        }
                        return 50;
                    });
                });

                // Отправляем MIDI только если фейдеры НЕ зажаты
                for (let i = 0; i < currentPercentages.length && i < 8; i++) {
                    if (channelStates[i].isTouched) continue;

                    const pct = currentPercentages[i];
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