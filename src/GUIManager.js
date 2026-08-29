import Logger from '../utils/Logger.js';

export default class GUIManager {
    constructor(page, options = {}) {
        this.page = page;
        this.logger = new Logger('[GUI]');
        this.selectors = null;
        this.trackData = [];
        this.channelStates = {};
        this.options = {
            trackOffset: options.trackOffset || 1,
            maxTracks: options.maxTracks || 12,
            ...options
        };
    }

    async loadSelectors(version = 'v1') {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            
            const configPath = path.resolve(__dirname, `../config/selectors_${version}.json`);
            const data = await fs.readFile(configPath, 'utf8');
            this.selectors = JSON.parse(data);
            
            this.logger.log('✅ Селекторы загружены');
            return this.selectors;
        } catch (error) {
            this.logger.error('❌ Ошибка загрузки селекторов:', error.message);
            throw error;
        }
    }

    async syncTracks() {
        try {
            if (!this.selectors) {
                this.logger.error('❌ Селекторы не загружены');
                return [];
            }
            
            // Инициализируем, если undefined
            if (!this.trackData) {
                this.trackData = [];
            }
            
            const result = await this.page.evaluate((selectors) => {
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
                        hasThumb: !!thumb,
                        hasFill: !!fill
                    };
                });
            }, this.selectors);
            
            if (!Array.isArray(result)) {
                this.logger.warn('⚠️ Результат синхронизации не является массивом');
                this.trackData = [];
                return [];
            }
            
            this.trackData = result;
            this.logger.log(`✅ Синхронизировано ${this.trackData.length} треков`);
            
            this.channelStates = {};
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
            this.trackData = [];
            return this.trackData;
        }
    }

    getTracks() {
        return this.trackData;
    }

    getChannelState(channel) {
        return this.channelStates[channel] || null;
    }

    async setVolume(channel, value) {
        const trackIndex = channel + this.options.trackOffset;
        if (!this.trackData[trackIndex]) {
            this.logger.warn(`⚠️ Трек ${trackIndex} не найден`);
            return false;
        }

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
                    const event = new Event('input', { bubbles: true, cancelable: true });
                    thumb.dispatchEvent(event);
                }
                if (fill) {
                    fill.style.width = pct + '%';
                    const event = new Event('input', { bubbles: true, cancelable: true });
                    fill.dispatchEvent(event);
                }
            }, {
                trackIdx: trackIndex,
                pct: percent,
                selectors: this.selectors
            });

            this.channelStates[channel].volume = percent;
            this.trackData[trackIndex].value = percent;
            return true;
        } catch (error) {
            this.logger.error(`❌ Ошибка установки громкости трека ${channel}:`, error.message);
            return false;
        }
    }

    async setPan(channel, value) {
        // Реализация панорамы
        this.logger.debug(`🔄 Pan трека ${channel}: ${value}`);
        return true;
    }

    async toggleMute(channel, state) {
        this.logger.debug(`🔇 Mute трека ${channel}: ${state ? 'ON' : 'OFF'}`);
        return true;
    }

    async toggleSolo(channel, state) {
        this.logger.debug(`🎵 Solo трека ${channel}: ${state ? 'ON' : 'OFF'}`);
        return true;
    }

    async selectTrack(channel) {
        this.logger.debug(`🎯 Выбран трек ${channel}`);
        return true;
    }

    async transport(action) {
        this.logger.debug(`⏯️ Транспорт: ${action}`);
        return true;
    }

    async setFxSend(track, fxSlot, value) {
        this.logger.debug(`🎛️ FX Send ${fxSlot} трека ${track}: ${value}`);
        return true;
    }

    async setFxParam(track, paramSlot, value) {
        this.logger.debug(`🎛️ FX Param ${paramSlot} трека ${track}: ${value}`);
        return true;
    }

    async toggleFxBypass(track, fxSlot) {
        this.logger.debug(`🎛️ FX Bypass ${fxSlot} трека ${track}`);
        return true;
    }

    async toggleFxSolo(track, fxSlot) {
        this.logger.debug(`🎛️ FX Solo ${fxSlot} трека ${track}`);
        return true;
    }

    async selectFxPreset(track, preset) {
        this.logger.debug(`🎛️ FX Preset ${preset} трека ${track}`);
        return true;
    }
}
