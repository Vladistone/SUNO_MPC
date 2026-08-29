// src/GUIManager.js
// Управление графическим интерфейсом Suno Studio

import Logger from '../utils/Logger.js';

export default class GUIManager {
    constructor(page, options = {}) {
        this.page = page;
        this.logger = new Logger('[GUI]');
        this.selectors = null;
        this.trackData = [];
        this.channelStates = {};
        this.options = {
            trackOffset: options.trackOffset || 1, // Смещение для пропуска мастер-трека
            maxTracks: options.maxTracks || 12,
            ...options
        };
    }

    // Загрузка селекторов из конфигурационного файла
    async loadSelectors(version = 'v1') {
        try {
            const configPath = `../config/selectors_${version}.json`;
            const config = await import(configPath, { assert: { type: 'json' } });
            this.selectors = config.default;
            this.logger.log('✅ Селекторы загружены:', this.selectors);
            return this.selectors;
        } catch (error) {
            this.logger.error('❌ Ошибка загрузки селекторов:', error.message);
            throw error;
        }
    }

    // Синхронизация данных треков с интерфейсом
    async syncTracks() {
        try {
            this.trackData = await this.page.evaluate((selectors) => {
                const allTracks = document.querySelectorAll(selectors.trackHeader);
                return Array.from(allTracks).map((track, index) => {
                    const nameEl = track.querySelector(selectors.trackName);
                    const name = nameEl ? nameEl.textContent.trim() : `Track ${index + 1}`;
                    
                    const thumb = track.querySelector(selectors.thumb);
                    const fill = track.querySelector(selectors.fill);
                    
                    let value = 50;
                    if (thumb && thumb.style.left) {
                        value = parseFloat(thumb.style.left) || 50;
                    } else if (fill && fill.style.width) {
                        value = parseFloat(fill.style.width) || 50;
                    }
                    
                    return {
                        index,
                        name,
                        value: Math.min(100, Math.max(0, value)),
                        element: track,
                        hasThumb: !!thumb,
                        hasFill: !!fill
                    };
                });
            }, this.selectors);

            this.logger.log(`✅ Синхронизировано ${this.trackData.length} треков`);
            
            // Инициализация состояний каналов
            this.trackData.forEach((track, i) => {
                this.channelStates[i] = {
                    volume: track.value,
                    pan: 64,
                    mute: false,
                    solo: false,
                    selected: false
                };
            });
            
            return this.trackData;
        } catch (error) {
            this.logger.error('❌ Ошибка синхронизации треков:', error.message);
            throw error;
        }
    }

    // Получение данных о треках
    getTracks() {
        return this.trackData;
    }

    // Получение состояния канала
    getChannelState(channel) {
        return this.channelStates[channel] || null;
    }

    // Установка громкости трека
    async setVolume(channel, value) {
        const trackIndex = channel + this.options.trackOffset;
        const track = this.trackData[trackIndex];
        
        if (!track) {
            this.logger.warn(`⚠️ Трек ${trackIndex} не найден`);
            return false;
        }

        // Нормализация значения (0-1 или 0-127 в проценты)
        let percent = value;
        if (typeof value === 'number' && value <= 1 && value >= 0) {
            percent = value * 100;
        } else if (typeof value === 'number' && value <= 127 && value >= 0) {
            percent = (value / 127) * 100;
        }
        percent = Math.min(100, Math.max(0, percent));

        try {
            await this.page.evaluate(({ trackIdx, pct, selectors }) => {
                const tracks = document.querySelectorAll(selectors.trackHeader);
                const track = tracks[trackIdx];
                if (!track) return;

                const thumb = track.querySelector(selectors.thumb);
                const fill = track.querySelector(selectors.fill);

                if (thumb) {
                    thumb.style.left = pct + '%';
                    // Отправляем события для React
                    const event = new Event('input', { bubbles: true, cancelable: true });
                    thumb.dispatchEvent(event);
                    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                    thumb.dispatchEvent(changeEvent);
                }
                if (fill) {
                    fill.style.width = pct + '%';
                    const event = new Event('input', { bubbles: true, cancelable: true });
                    fill.dispatchEvent(event);
                    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                    fill.dispatchEvent(changeEvent);
                }
            }, {
                trackIdx: trackIndex,
                pct: percent,
                selectors: this.selectors
            });

            this.channelStates[channel].volume = percent;
            this.trackData[trackIndex].value = percent;
            
            this.logger.debug(`🎚️ Volume трека ${channel + 1}: ${percent.toFixed(1)}%`);
            return true;
        } catch (error) {
            this.logger.error(`❌ Ошибка установки громкости трека ${channel}:`, error.message);
            return false;
        }
    }

    // Установка панорамы трека
    async setPan(channel, value) {
        const trackIndex = channel + this.options.trackOffset;
        const track = this.trackData[trackIndex];
        
        if (!track) {
            this.logger.warn(`⚠️ Трек ${trackIndex} не найден`);
            return false;
        }

        // Нормализация значения (0-1 или 0-127 в проценты)
        let percent = value;
        if (typeof value === 'number' && value <= 1 && value >= 0) {
            percent = value * 100;
        } else if (typeof value === 'number' && value <= 127 && value >= 0) {
            percent = (value / 127) * 100;
        }
        percent = Math.min(100, Math.max(0, percent));

        try {
            // Поиск элемента панорамы (обычно это отдельный ползунок)
            await this.page.evaluate(({ trackIdx, pct, selectors }) => {
                const tracks = document.querySelectorAll(selectors.trackHeader);
                const track = tracks[trackIdx];
                if (!track) return;

                // Ищем элементы панорамы: обычно это ползунок с aria-label="Pan"
                const panSlider = track.querySelector('[role="slider"][aria-label*="Pan"]') ||
                                 track.querySelector('[aria-label*="pan"]') ||
                                 track.querySelector('[data-param="pan"]');
                
                if (panSlider) {
                    panSlider.value = pct;
                    const event = new Event('input', { bubbles: true, cancelable: true });
                    panSlider.dispatchEvent(event);
                    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                    panSlider.dispatchEvent(changeEvent);
                }
            }, {
                trackIdx: trackIndex,
                pct: percent,
                selectors: this.selectors
            });

            this.channelStates[channel].pan = percent;
            this.logger.debug(`🔄 Pan трека ${channel + 1}: ${percent.toFixed(1)}%`);
            return true;
        } catch (error) {
            this.logger.error(`❌ Ошибка установки панорамы трека ${channel}:`, error.message);
            return false;
        }
    }

    // Переключение Mute
    async toggleMute(channel, state) {
        const trackIndex = channel + this.options.trackOffset;
        const track = this.trackData[trackIndex];
        
        if (!track) {
            this.logger.warn(`⚠️ Трек ${trackIndex} не найден`);
            return false;
        }

        try {
            const result = await this.page.evaluate(({ trackIdx, btnState, selectors }) => {
                const tracks = document.querySelectorAll(selectors.trackHeader);
                const track = tracks[trackIdx];
                if (!track) return false;

                // Ищем кнопку Mute
                let button = track.querySelector('button[aria-label*="mute"]') ||
                           track.querySelector('button[aria-label*="Mute"]') ||
                           track.querySelector('.mute-button') ||
                           track.querySelector('[data-action="mute"]');
                
                if (button) {
                    const isPressed = button.getAttribute('aria-pressed') === 'true';
                    if (isPressed !== btnState) {
                        button.click();
                        // Отправляем событие для React
                        const event = new Event('click', { bubbles: true, cancelable: true });
                        button.dispatchEvent(event);
                        return true;
                    }
                }
                return false;
            }, {
                trackIdx: trackIndex,
                btnState: state,
                selectors: this.selectors
            });

            if (result) {
                this.channelStates[channel].mute = state;
                this.logger.debug(`🔇 Mute трека ${channel + 1}: ${state ? 'ON' : 'OFF'}`);
            }
            return result;
        } catch (error) {
            this.logger.error(`❌ Ошибка переключения Mute трека ${channel}:`, error.message);
            return false;
        }
    }

    // Переключение Solo
    async toggleSolo(channel, state) {
        const trackIndex = channel + this.options.trackOffset;
        const track = this.trackData[trackIndex];
        
        if (!track) {
            this.logger.warn(`⚠️ Трек ${trackIndex} не найден`);
            return false;
        }

        try {
            const result = await this.page.evaluate(({ trackIdx, btnState, selectors }) => {
                const tracks = document.querySelectorAll(selectors.trackHeader);
                const track = tracks[trackIdx];
                if (!track) return false;

                // Ищем кнопку Solo
                let button = track.querySelector('button[aria-label*="solo"]') ||
                           track.querySelector('button[aria-label*="Solo"]') ||
                           track.querySelector('.solo-button') ||
                           track.querySelector('[data-action="solo"]');
                
                if (button) {
                    const isPressed = button.getAttribute('aria-pressed') === 'true';
                    if (isPressed !== btnState) {
                        button.click();
                        const event = new Event('click', { bubbles: true, cancelable: true });
                        button.dispatchEvent(event);
                        return true;
                    }
                }
                return false;
            }, {
                trackIdx: trackIndex,
                btnState: state,
                selectors: this.selectors
            });

            if (result) {
                this.channelStates[channel].solo = state;
                this.logger.debug(`🎵 Solo трека ${channel + 1}: ${state ? 'ON' : 'OFF'}`);
            }
            return result;
        } catch (error) {
            this.logger.error(`❌ Ошибка переключения Solo трека ${channel}:`, error.message);
            return false;
        }
    }

    // Выбор трека
    async selectTrack(channel) {
        const trackIndex = channel + this.options.trackOffset;
        const track = this.trackData[trackIndex];
        
        if (!track) {
            this.logger.warn(`⚠️ Трек ${trackIndex} не найден`);
            return false;
        }

        try {
            const result = await this.page.evaluate(({ trackIdx, selectors }) => {
                const tracks = document.querySelectorAll(selectors.trackHeader);
                const track = tracks[trackIdx];
                if (!track) return false;

                // Кликаем по треку для выбора
                track.click();
                // Отправляем событие для React
                const event = new Event('click', { bubbles: true, cancelable: true });
                track.dispatchEvent(event);
                return true;
            }, {
                trackIdx: trackIndex,
                selectors: this.selectors
            });

            if (result) {
                this.channelStates[channel].selected = true;
                this.logger.debug(`🎯 Выбран трек ${channel + 1}`);
            }
            return result;
        } catch (error) {
            this.logger.error(`❌ Ошибка выбора трека ${channel}:`, error.message);
            return false;
        }
    }

    // Транспортные команды
    async transport(action) {
        const keyMap = {
            play: ' ',
            stop: ' ',
            record: 'r',
            rewind: 'Home',
            fastForward: 'End',
            loop: 'l',
            undo: 'z'
        };

        const modifierMap = {
            undo: true,
            rewind: false,
            fastForward: false
        };

        const key = keyMap[action];
        if (!key) {
            this.logger.warn(`⚠️ Неизвестное действие транспорта: ${action}`);
            return false;
        }

        try {
            // Для Play/Stop используем пробел
            if (action === 'play' || action === 'stop') {
                await this.page.keyboard.press('Space');
            } else if (action === 'undo') {
                // Cmd+Z или Ctrl+Z
                const isMac = process.platform === 'darwin';
                const modifier = isMac ? 'Meta' : 'Control';
                await this.page.keyboard.down(modifier);
                await this.page.keyboard.press('z');
                await this.page.keyboard.up(modifier);
            } else if (action === 'rewind' || action === 'fastForward') {
                // Shift+Left/Right
                await this.page.keyboard.down('Shift');
                await this.page.keyboard.press(action === 'rewind' ? 'ArrowLeft' : 'ArrowRight');
                await this.page.keyboard.up('Shift');
            } else {
                await this.page.keyboard.press(key);
            }
            
            this.logger.debug(`⏯️ Транспорт: ${action}`);
            return true;
        } catch (error) {
            this.logger.error(`❌ Ошибка выполнения ${action}:`, error.message);
            return false;
        }
    }

    // Управление Send уровнями FX
    async setFxSend(trackIndex, fxSlot, value) {
        const percent = (value / 127) * 100;
        // Ищем элементы FX Send в GUI
        await this.page.evaluate(({ track, fx, pct }) => {
            const tracks = document.querySelectorAll('[data-track-header]');
            const trackEl = tracks[track];
            if (!trackEl) return;
            
            // Ищем send-контрол для конкретного FX
            const sendControl = trackEl.querySelector(`[data-fx-send="${fx}"]`);
            if (sendControl) {
                sendControl.value = pct;
                sendControl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, { track: trackIndex, fx: fxSlot, pct: percent });
    }

    // Управление параметрами FX
    async setFxParam(trackIndex, paramSlot, value) {
        const percent = (value / 127) * 100;
        await this.page.evaluate(({ track, param, pct }) => {
            const tracks = document.querySelectorAll('[data-track-header]');
            const trackEl = tracks[track];
            if (!trackEl) return;
            
            const paramControl = trackEl.querySelector(`[data-fx-param="${param}"]`);
            if (paramControl) {
                paramControl.value = pct;
                paramControl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, { track: trackIndex, param: paramSlot, pct: percent });
    }

    // Включение/выключение FX
    async toggleFxBypass(trackIndex, fxSlot) {
        await this.page.evaluate(({ track, fx }) => {
            const tracks = document.querySelectorAll('[data-track-header]');
            const trackEl = tracks[track];
            if (!trackEl) return;
            
            const bypassBtn = trackEl.querySelector(`[data-fx-bypass="${fx}"]`);
            if (bypassBtn) {
                bypassBtn.click();
            }
        }, { track: trackIndex, fx: fxSlot });
    }

    // Обновление LCD-дисплея (отправка SysEx)
    async updateLCD(channel, name) {
        // Эта функция будет вызываться из FeedbackLoop
        // Реализация отправки SysEx будет в MIDI-роутере
        this.logger.debug(`📟 LCD ${channel}: ${name}`);
        return true;
    }

    // Получение текущего состояния всех треков из GUI
    async getCurrentState() {
        try {
            const state = await this.page.evaluate((selectors) => {
                const allTracks = document.querySelectorAll(selectors.trackHeader);
                return Array.from(allTracks).slice(1, 13).map((track) => {
                    // Громкость
                    const thumb = track.querySelector(selectors.thumb);
                    let volume = 50;
                    if (thumb && thumb.style.left) {
                        volume = parseFloat(thumb.style.left) || 50;
                    }

                    // Имя
                    const nameEl = track.querySelector(selectors.trackName);
                    const name = nameEl ? nameEl.textContent.trim() : "Track";

                    // Mute
                    const muteBtn = track.querySelector('button[aria-label*="mute"]');
                    const muted = muteBtn ? muteBtn.getAttribute('aria-pressed') === 'true' : false;

                    // Solo
                    const soloBtn = track.querySelector('button[aria-label*="solo"]');
                    const soloed = soloBtn ? soloBtn.getAttribute('aria-pressed') === 'true' : false;

                    return {
                        name,
                        volume: Math.min(100, Math.max(0, volume)),
                        muted,
                        soloed
                    };
                });
            }, this.selectors);

            return state;
        } catch (error) {
            this.logger.error('❌ Ошибка получения состояния GUI:', error.message);
            return [];
        }
    }
}