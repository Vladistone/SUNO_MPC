// src/dom-adapter.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class DOMAdapter {
    constructor(page) {
        this.page = page;
        this.version = null;
        this.selectors = null;
    }

    async detectVersion() {
        // Определяем версию по наличию характерных элементов
        const isV2 = await this.page.evaluate(() => {
            return !!document.querySelector('.new-studio-class') || 
                   !!document.querySelector('[data-studio-version="2.0"]');
        });
        this.version = isV2 ? '2' : '1';
        console.log(`[DOM] Обнаружена версия Suno Studio: ${this.version}`);
        
        // Загружаем селекторы
        const configPath = path.join(__dirname, '../cfg', `selectors_v${this.version}.json`);
        const configData = fs.readFileSync(configPath, 'utf8');
        this.selectors = JSON.parse(configData);
        console.log('[DOM] Загружены селекторы:', this.selectors);
        return this.version;
    }

    async getTracks() {
        return this.page.evaluate((s) => {
            const trackHeaders = document.querySelectorAll(s.trackHeader);
            return Array.from(trackHeaders).map((track, idx) => {
                const nameEl = track.querySelector(s.trackName);
                const name = nameEl ? nameEl.textContent.trim() : `Track ${idx + 1}`;
                
                const thumb = track.querySelector(s.thumb);
                const fill = track.querySelector(s.fill);
                
                let value = 0;
                if (thumb && thumb.style.left) {
                    value = parseFloat(thumb.style.left) || 0;
                } else if (fill && fill.style.width) {
                    value = parseFloat(fill.style.width) || 0;
                }
                
                return { name, value, element: track };
            });
        }, this.selectors);
    }

    async setVolume(trackIndex, percent) {
        await this.page.evaluate(({ idx, pct, sel }) => {
            const tracks = document.querySelectorAll(sel.trackHeader);
            if (!tracks[idx]) return;
            
            const thumb = tracks[idx].querySelector(sel.thumb);
            const fill = tracks[idx].querySelector(sel.fill);
            
            if (thumb && thumb.style) thumb.style.left = pct + '%';
            if (fill && fill.style) fill.style.width = pct + '%';
            
            // Имитируем событие изменения для React
            const event = new Event('input', { bubbles: true });
            if (thumb) thumb.dispatchEvent(event);
            if (fill) fill.dispatchEvent(event);
        }, { idx: trackIndex, pct: percent, sel: this.selectors });
    }

    async getTrackPosition(trackIndex) {
        return this.page.evaluate(({ idx, sel }) => {
            const tracks = document.querySelectorAll(sel.trackHeader);
            if (!tracks[idx]) return 0;
            
            const thumb = tracks[idx].querySelector(sel.thumb);
            const fill = tracks[idx].querySelector(sel.fill);
            
            if (thumb && thumb.style.left) return parseFloat(thumb.style.left) || 0;
            if (fill && fill.style.width) return parseFloat(fill.style.width) || 0;
            return 0;
        }, { idx: trackIndex, sel: this.selectors });
    }
}