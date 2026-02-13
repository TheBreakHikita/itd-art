// ==UserScript==
// @name         ITD ART
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Расширение функционала окна рисования. Новости и обновления: https://t.me/itd_art
// @author       TheBreakHikita
// @match        https://xn--d1ah4a.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=xn--d1ah4a.com
// @downloadURL  https://github.com/TheBreakHikita/itd-art/raw/refs/heads/main/itd_art.user.js
// @updateURL    https://github.com/TheBreakHikita/itd-art/raw/refs/heads/main/itd_art.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (typeof window.TouchEvent === 'undefined') {
        window.TouchEvent = function TouchEvent() {};
    }
    // --- CONFIG & CONSTANTS ---
    const CONFIG = {
        historyLimit: 30,
        fontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap'
    };

    const SVELTE_CLASS = "svelte-12bmgzp";
    const SEL = {
        overlay: `.drawing-overlay.${SVELTE_CLASS}`,
        modal: `.drawing-modal.${SVELTE_CLASS}`,
        toolbar: `.drawing-toolbar.${SVELTE_CLASS}`,
        canvas: `canvas.${SVELTE_CLASS}`,
        canvasContainer: `.drawing-canvas-container.${SVELTE_CLASS}`,
        colorInput: `input.color-picker-input.${SVELTE_CLASS}`,
        sizeBtns: `button.size-btn.${SVELTE_CLASS}`,
        undoBtn: `button[title*="Отменить"]`,
        redoBtn: `button[title*="Повторить"]`,
        saveBtn: `button.drawing-btn--save`,
        cancelBtn: `button.drawing-btn--cancel`,
        closeBtn: `button.drawing-close`,
        actionBtns: `.toolbar-section--actions.${SVELTE_CLASS}`,
        sizesContainer: `.toolbar-sizes.${SVELTE_CLASS}`
    };

    // --- STATE MANAGEMENT ---
    const State = {
        historyStack: [],
        historyStep: -1,
        lastUploadedGif: null,
        lastActiveToolTitle: 'Кисть',
        cropListeners: null,
        customSize: 5,

        reset() {
            this.historyStack = [];
            this.historyStep = -1;
            this.lastUploadedGif = null;
            this.cleanCropListeners();
            const canvas = document.querySelector(SEL.canvas);
            if (canvas) canvas.style.opacity = "1";
            document.getElementById('dyatlo-gif-container')?.remove();
        },

        cleanCropListeners() {
            if (this.cropListeners) {
                window.removeEventListener('mousemove', this.cropListeners.move);
                window.removeEventListener('mouseup', this.cropListeners.up);
                this.cropListeners = null;
            }
        },

        hasUnsavedChanges() {
            return this.historyStep >= 0 || this.lastUploadedGif !== null;
        }
    };
	
    (function() {
        try {
            const ctxProto = CanvasRenderingContext2D.prototype;
            
            // 1. ПАТЧ ТОЛЩИНЫ ЛИНИИ (lineWidth)
            const desc = Object.getOwnPropertyDescriptor(ctxProto, 'lineWidth');
            if (desc && desc.set) {
                const originalSet = desc.set;
                Object.defineProperty(ctxProto, 'lineWidth', {
                    get: function() { return desc.get.call(this); },
                    set: function(val) {
                        const customBtn = document.getElementById('dyatlo-custom-size-btn');
                        // Если включена наша кнопка — игнорируем размер сайта и ставим свой
                        if (customBtn && customBtn.classList.contains('active')) {
                            originalSet.call(this, State.customSize);
                        } else {
                            originalSet.call(this, val);
                        }
                    },
                    configurable: true
                });
            }

            // 2. ПАТЧ РИСОВАНИЯ КРУГА/ТОЧКИ (arc)
            const originalArc = ctxProto.arc;
            ctxProto.arc = function(x, y, radius, startAngle, endAngle, counterclockwise) {
                const customBtn = document.getElementById('dyatlo-custom-size-btn');
                
                // Проверяем инструмент: патчим arc ТОЛЬКО если это Кисть или Ластик.
                // Если это инструмент "Круг", мы не должны мешать рисовать геометрию.
                const activeToolBtn = document.querySelector('.tool-btn.active');
                const isBrushOrEraser = activeToolBtn && 
                                      (activeToolBtn.title === 'Кисть' || activeToolBtn.title === 'Ластик');

                if (customBtn && customBtn.classList.contains('active') && isBrushOrEraser) {
                    // Подменяем радиус на половину нашего размера (так как радиус = диаметр / 2)
                    // Math.abs чтобы избежать глюков с отрицательными значениями
                    originalArc.call(this, x, y, Math.abs(State.customSize / 2), startAngle, endAngle, counterclockwise);
                } else {
                    originalArc.apply(this, arguments);
                }
            };
            
            // 3. ПАТЧ НАЧАЛА ПУТИ (beginPath)
            // Иногда сайт сбрасывает стили при начале пути, обновляем их
            const originalBeginPath = ctxProto.beginPath;
            ctxProto.beginPath = function() {
                originalBeginPath.apply(this, arguments);
                const customBtn = document.getElementById('dyatlo-custom-size-btn');
                if (customBtn && customBtn.classList.contains('active')) {
                    this.lineWidth = State.customSize;
                }
            };

        } catch (e) {
            console.error("Master Patch Error:", e);
        }
    })();
	
	// --- HISTORY SYSTEM ---
    const History = {
        save(ctx, canvas) {
            if (State.historyStep < CONFIG.historyLimit - 1) {
                State.historyStep++;
                State.historyStack.splice(State.historyStep);
                State.historyStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
            }
        }
    };

    // --- UTILS ---
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: 255
        } : { r: 0, g: 0, b: 0, a: 255 };
    }
	
	function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) h = 0;
        else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, v: v * 100 };
    }

    function hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function floodFill(ctx, startX, startY, fillColor) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        startX = Math.floor(startX);
        startY = Math.floor(startY);

        const pos = (startY * width + startX) * 4;
        const targetR = data[pos];
        const targetG = data[pos + 1];
        const targetB = data[pos + 2];
        const targetA = data[pos + 3];

        const fillRgba = hexToRgb(fillColor);
        if (targetR === fillRgba.r && targetG === fillRgba.g && targetB === fillRgba.b && targetA === fillRgba.a) return;

        const stack = [[startX, startY]];
        while (stack.length) {
            const [x, y] = stack.pop();
            const currentPos = (y * width + x) * 4;

            if (data[currentPos] === targetR && data[currentPos+1] === targetG &&
                data[currentPos+2] === targetB && data[currentPos+3] === targetA) {
                
                data[currentPos] = fillRgba.r;
                data[currentPos+1] = fillRgba.g;
                data[currentPos+2] = fillRgba.b;
                data[currentPos+3] = fillRgba.a;

                if (x > 0) stack.push([x - 1, y]);
                if (x < width - 1) stack.push([x + 1, y]);
                if (y > 0) stack.push([x, y - 1]);
                if (y < height - 1) stack.push([x, y + 1]);
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    // --- INIT RESOURCES ---
    if (!document.getElementById('dyatlo-font-montserrat')) {
        const link = document.createElement('link');
        link.id = 'dyatlo-font-montserrat';
        link.href = CONFIG.fontUrl;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    
        const style = document.createElement('style');
        style.innerHTML = `
            .dyatlo-brush-cursor {
                position: absolute;
                pointer-events: none;
                border: 1px solid rgba(0, 0, 0, 0.5);
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
                border-radius: 50%;
                z-index: 10000;
                display: none;
                transform: translate(-50%, -50%);
                mix-blend-mode: difference;
            }
            #text-panel-handle:hover {
                background: rgba(59, 130, 246, 0.1);
            }
            ${SEL.canvasContainer} {
                position: relative !important;
            }
            ${SEL.canvasContainer} canvas {
                cursor: none !important;
            }

            .dyatlo-size-custom-wrapper {
                position: relative;
                display: flex;
                align-items: center;
            }
            .dyatlo-size-btn-custom {
                width: 34px;
                height: 34px;
                border-radius: 50%;
                border: 2px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.05);
                color: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 800;
                transition: all 0.2s;
                margin-left: 8px;
            }
            .dyatlo-size-btn-custom.active {
                border-color: #3b82f6;
                background: rgba(59, 130, 246, 0.2);
                box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
                color: #3b82f6;
            }
            .dyatlo-size-btn-custom:hover {
                border-color: #3b82f6;
                background: rgba(59, 130, 246, 0.1);
            }
            .dyatlo-size-btn-custom.active {
                border-color: #3b82f6;
                background: #3b82f6;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
                color: #fff !important;
            }
            .dyatlo-size-popup {
                position: absolute;
                bottom: 120%;
                left: 50%;
                transform: translateX(-50%);
                background: #1a1a1a;
                border: 1px solid #333;
                padding: 12px;
                border-radius: 10px;
                display: none;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                z-index: 1001;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            }
            .dyatlo-size-popup.show { display: flex; }
            .dyatlo-size-popup::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 6px solid transparent;
                border-top-color: #1a1a1a;
            }

            .dyatlo-text-panel {
                backdrop-filter: blur(12px);
                background: rgba(10, 10, 10, 0.95) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5) !important;
                transition: transform 0.2s ease;
            }
            .dyatlo-input {
                background: rgba(0,0,0,0.3) !important;
                border: 1px solid rgba(59, 130, 246, 0.3) !important;
                transition: all 0.2s;
            }
            .dyatlo-input:focus {
                border-color: #3b82f6 !important;
                background: rgba(0,0,0,0.5) !important;
            }
            .dyatlo-range {
                -webkit-appearance: none;
                height: 4px;
                background: #333;
                border-radius: 2px;
            }
            .dyatlo-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 14px;
                height: 14px;
                background: #3b82f6;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
            }
            .dyatlo-checkbox-label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(255,255,255,0.05);
                transition: 0.2s;
            }
            .dyatlo-checkbox-label:hover {
                background: rgba(59, 130, 246, 0.1);
            }
            .dyatlo-btn-primary {
                background: #3b82f6 !important;
                transition: all 0.2s;
            }
            .dyatlo-btn-primary:hover {
                background: #2563eb !important;
                transform: translateY(-1px);
            }
            .tool-btn#dyatlo-fill-btn svg, .tool-btn#dyatlo-text-btn svg {
                width: 18px;
                height: 18px;
                margin: auto;
                display: block;
            }
            .tool-btn#dyatlo-upload, 
            .tool-btn#dyatlo-download,
            .tool-btn#dyatlo-text-btn,
            .tool-btn#dyatlo-fill-btn {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
            }
            .tool-btn svg {
                width: 20px;
                height: 20px;
                flex-shrink: 0;
            }
            /* СТИЛИ ДЛЯ ЦВЕТОВОЙ ПАНЕЛИ */
            .dyatlo-cp-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .dyatlo-cp-top {
                display: flex;
                gap: 12px;
                height: 180px; /* Сделали выше */
            }
            .dyatlo-sb-area {
                flex: 1; /* Растягивается на всю доступную ширину */
                position: relative;
                background: red;
                border-radius: 6px;
                cursor: crosshair;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .dyatlo-sb-bg-white {
                position: absolute; inset: 0;
                background: linear-gradient(to right, #fff, transparent);
            }
            .dyatlo-sb-bg-black {
                position: absolute; inset: 0;
                background: linear-gradient(to top, #000, transparent);
            }
            .dyatlo-sb-cursor {
                position: absolute; width: 12px; height: 12px;
                border: 2px solid white; border-radius: 50%;
                box-shadow: 0 0 3px rgba(0,0,0,0.8);
                transform: translate(-6px, -6px); pointer-events: none;
            }
            .dyatlo-hue-wrap {
                width: 35px; /* Широкий ползунок радуги */
                position: relative;
                border-radius: 6px;
                overflow: hidden;
                cursor: ns-resize;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .dyatlo-hue-track {
                width: 100%; height: 100%;
                background: linear-gradient(to bottom, red 0%, #ff0 17%, lime 33%, cyan 50%, blue 67%, magenta 83%, red 100%);
            }
			.dyatlo-val-track {
                width: 100%; height: 100%;
                background: linear-gradient(to bottom, #fff, #000); /* Будем менять через JS */
            }
            .dyatlo-slider-thumb-horz {
                position: absolute; left: 0; right: 0; height: 8px;
                background: transparent;
                border: 2px solid white;
                box-shadow: 0 0 2px rgba(0,0,0,0.5);
                transform: translateY(-4px);
                pointer-events: none;
            }
            .dyatlo-cp-mid {
                display: flex; gap: 10px; align-items: stretch;
            }
            .dyatlo-preview-block {
                width: 50px; border-radius: 6px; overflow: hidden;
                display: flex; flex-direction: column;
                border: 1px solid rgba(255,255,255,0.2);
            }
            .dyatlo-preview-color { flex: 1; position: relative; }
            .dyatlo-inputs-grid {
                flex: 1; display: grid; grid-template-columns: 1fr 1fr 1fr 40px; gap: 6px;
            }
            .dyatlo-input-group { display: flex; flex-direction: column; gap: 2px; }
            .dyatlo-input-label { font-size: 9px; color: #888; text-transform: uppercase; font-weight: 700; }
            .dyatlo-input-tiny {
                width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
                color: #fff; font-size: 11px; padding: 6px 4px; border-radius: 4px; text-align: center; font-family: monospace;
            }
            .dyatlo-swatches {
                display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px;
                padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);
            }
            .dyatlo-swatch {
                aspect-ratio: 1; border-radius: 4px; cursor: pointer;
                border: 1px solid rgba(255,255,255,0.1); position: relative; overflow: hidden;
                transition: transform 0.1s;
            }
            .dyatlo-swatch:hover { transform: scale(1.15); border-color: #fff; z-index: 2; }
            .dyatlo-pipette-btn {
                grid-column: span 1; display: flex; align-items: center; justify-content: center;
                background: #333; border: 1px solid #555; border-radius: 6px; color: #ccc;
                cursor: pointer; transition: all 0.2s;
            }
            .dyatlo-pipette-btn:hover { background: #444; color: #fff; border-color: #888; }
            .dyatlo-pipette-btn.active { background: #3b82f6; color: white; border-color: #60a5fa; }
            .dyatlo-swatches-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);
            }
            .dyatlo-clear-btn {
                background: none; border: none; color: #666; cursor: pointer;
                font-size: 10px; text-transform: uppercase; font-weight: 700;
                transition: color 0.2s; padding: 2px 4px;
            }
            .dyatlo-clear-btn:hover { color: #ff4444; background: rgba(255, 68, 68, 0.1); border-radius: 4px; }
            .dyatlo-swatch.empty {
                background-image: linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
                background-size: 8px 8px;
                background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
                opacity: 0.5;
            }
		`;
        document.head.appendChild(style);
    }

    // --- NATIVE PROTOTYPE PATCH (GIF SUPPORT) ---
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        if (this.classList.contains('drawing-canvas') && State.lastUploadedGif) {
            callback(State.lastUploadedGif);
            return;
        }
        return originalToBlob.apply(this, arguments);
    };

    // --- CONFIRMATION LOGIC ---
    function setupConfirmations(modal) {
        if (modal.dataset.confirmSetup) return;
        modal.dataset.confirmSetup = "true";

        // Функция вызова confirm
        const confirmAction = (e, message) => {
            if (!confirm(message)) {
                // Если нажали "Отмена" в браузере, блокируем действие сайта
                e.stopImmediatePropagation();
                e.preventDefault();
                return false;
            }
            return true;
        };

        // Проверка перед закрытием
        const handleUnsavedExit = (e) => {
            if (State.hasUnsavedChanges()) {
                confirmAction(e, "У вас есть несохраненные изменения. Вы уверены?");
            }
        };

        // 1. Клик по кнопке "Закрыть" (Крестик справа сверху)
        modal.querySelector(SEL.closeBtn)?.addEventListener('click', handleUnsavedExit, true);

        // 2. Клик по кнопке "Отмена" (Снизу)
        modal.querySelector(SEL.cancelBtn)?.addEventListener('click', handleUnsavedExit, true);

        // 3. Клик по кнопке "Сохранить" (Снизу)
        modal.querySelector(SEL.saveBtn)?.addEventListener('click', (e) => confirmAction(e, "Сохранить рисунок?"), true);

        // 4. Клик мимо окна (по темному фону / overlay)
        const overlay = document.querySelector(SEL.overlay); 
        if (overlay) {
            overlay.addEventListener('mousedown', (e) => {
                // Проверяем, что кликнули именно по фону, а не по самому окну рисования
                if (e.target === overlay) {
                    handleUnsavedExit(e);
                }
            }, true); // true (capture) очень важен, чтобы перехватить событие до сайта
        }
    }

    // --- UI HELPERS ---
    function getSettings(modal) {
        const pipetteBtn = document.getElementById('cp-pipette');
        if (pipetteBtn?.classList.contains('active')) return { tool: 'Пипетка', size: 4, color: '#ffffff' };

        const textBtn = document.getElementById('dyatlo-text-btn');
        if (textBtn?.classList.contains('active')) return { tool: 'Текст', size: getActiveSize(modal), color: getActiveColor(modal) };
        
        const fillBtn = document.getElementById('dyatlo-fill-btn');
        if (fillBtn?.classList.contains('active')) return { tool: 'Заливка', size: getActiveSize(modal), color: getActiveColor(modal) };
        
        const activeToolBtn = modal.querySelector('button.tool-btn.active');
        return { tool: activeToolBtn ? (activeToolBtn.getAttribute('title') || 'Кисть') : 'Кисть', size: getActiveSize(modal), color: getActiveColor(modal) };
    }

    function getActiveSize(modal) {
        const customBtn = document.getElementById('dyatlo-custom-size-btn');
        // Если выбрана наша кастомная кнопка, берем значение из State
        if (customBtn && customBtn.classList.contains('active')) {
            return State.customSize;
        }
        // Иначе ищем активную стандартную кнопку сайта
        const activeSizeBtn = modal.querySelector(`${SEL.sizeBtns}.active`);
        if (!activeSizeBtn) return State.customSize || 5;
        const match = (activeSizeBtn.getAttribute('aria-label') || "").match(/(\d+)/);
        return match ? parseInt(match[1]) : 5;
    }

    function getActiveColor(modal) { return modal.querySelector(SEL.colorInput)?.value || '#000000'; }
    
    function revertToLastTool(modal) {
        document.getElementById('dyatlo-text-btn')?.classList.remove('active');
        document.getElementById('dyatlo-fill-btn')?.classList.remove('active');
        const prevBtn = modal.querySelector(`button.tool-btn[title="${State.lastActiveToolTitle}"]`);
        if (prevBtn) { prevBtn.click(); setTimeout(() => { if (!prevBtn.classList.contains('active')) prevBtn.classList.add('active'); }, 20); }
    }

    // --- INJECT CUSTOM UI ---
    function injectNativeUI(modal) {
        if (modal.dataset.dyatloUi) return;
        modal.dataset.dyatloUi = "true";

        const toolContainer = modal.querySelector('.toolbar-tools');
        if (toolContainer) {
            // Кнопка Заливка
            const fillBtn = document.createElement('button');
            fillBtn.title = 'Заливка';
            fillBtn.className = `tool-btn ${SVELTE_CLASS}`;
            fillBtn.id = 'dyatlo-fill-btn';
            fillBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"></path><path d="m5 2 5 5"></path><path d="M2 13h15"></path></svg>`;
            
            // Кнопка Текст
            const textBtn = document.createElement('button');
            textBtn.title = 'Текст';
            textBtn.className = `tool-btn ${SVELTE_CLASS}`;
            textBtn.id = 'dyatlo-text-btn';
            textBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`;
            
            // Вставляем кнопки
            const circleBtn = toolContainer.querySelector('button[title="Круг"]');
            
            // 1. Сначала вставляем Заливку в правильное место
            if (circleBtn) {
                circleBtn.insertAdjacentElement('afterend', fillBtn);
            } else {
                toolContainer.appendChild(fillBtn);
            }

            toolContainer.appendChild(textBtn);

            // ИСПРАВЛЕННЫЙ ОБРАБОТЧИК ИНСТРУМЕНТОВ
            toolContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button.tool-btn');
                if (!btn) return;

                if (btn.id === 'dyatlo-text-btn' || btn.id === 'dyatlo-fill-btn' || btn.id === 'dyatlo-palette-btn') {
                    // Если нажали наши кнопки: гасим все остальные
                    // (Кроме палитры, она не "выбирается", она открывает окно, но можно и подсветить)
                    if (btn.id !== 'dyatlo-palette-btn') {
                        toolContainer.querySelectorAll('button.tool-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                } else {
                    // Если нажали РОДНУЮ кнопку (Кисть, Ластик и т.д.):
                    // 1. Гасим наши кнопки
                    textBtn.classList.remove('active');
                    fillBtn.classList.remove('active');
                    
                    // 2. [ИСПРАВЛЕНИЕ] Принудительно зажигаем нажатую родную кнопку,
                    // даже если сайт думает, что она уже горит
                    toolContainer.querySelectorAll('button.tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    State.lastActiveToolTitle = btn.getAttribute('title') || 'Кисть';
                }
            }, true);
			    // --- ЗАМЕНА СТАНДАРТНОЙ КНОПКИ ЦВЕТА НА НАШУ ПАЛИТРУ ---
        const colorsContainer = modal.querySelector('.drawing-colors');
        if (colorsContainer) {
            // 1. Ищем родной лейбл с радужным кружком
            const nativeLabel = colorsContainer.querySelector('.color-picker-label');
            
            // 2. Скрываем его (не удаляем, так как внутри лежит input, нужный для работы), но убираем с глаз
            if (nativeLabel) {
                nativeLabel.style.display = 'none';
            }

            // 3. Создаем нашу кнопку-триггер
            // Используем те же классы svelte, чтобы кнопка встала ровно в ряд
            const paletteTrigger = document.createElement('div');
            paletteTrigger.className = `color-picker-label ${SVELTE_CLASS}`;
            paletteTrigger.title = 'Открыть расширенную палитру';
            paletteTrigger.style.cursor = 'pointer';
            
            // Внутри рисуем радужный фон (как у оригинала) + иконку палитры сверху
            paletteTrigger.innerHTML = `
                <span class="color-picker-preview ${SVELTE_CLASS}" 
                      style="background: conic-gradient(from 180deg, red, yellow, lime, aqua, blue, magenta, red); 
                             display: flex; align-items: center; justify-content: center; 
                             border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));">
                        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
                    </svg>
                </span>
            `;

            // 4. Добавляем функционал открытия нашей палитры
            paletteTrigger.onclick = (e) => {
                e.stopPropagation();
                toggleColorPanel(modal);
            };

            // 5. Вставляем кнопку в конец списка цветов
            colorsContainer.appendChild(paletteTrigger);
        }
        }

        const sizesContainer = modal.querySelector(SEL.sizesContainer);
        if (sizesContainer) {
            const sizeWrapper = document.createElement('div');
            sizeWrapper.className = 'dyatlo-size-custom-wrapper';
            sizeWrapper.innerHTML = `
                <button id="dyatlo-custom-size-btn" class="dyatlo-size-btn-custom" title="Свой размер">5</button>
                <div id="dyatlo-size-popup" class="dyatlo-size-popup">
                    <span id="dyatlo-size-val-display" style="color:#3b82f6; font-size:12px; font-weight:700;">5px</span>
                    <input type="range" id="dyatlo-size-slider" class="dyatlo-range" min="1" max="100" value="5" style="width:120px;">
                </div>
            `;
            sizesContainer.appendChild(sizeWrapper);

            const cBtn = sizeWrapper.querySelector('#dyatlo-custom-size-btn');
            const cPopup = sizeWrapper.querySelector('#dyatlo-size-popup');
            const cSlider = sizeWrapper.querySelector('#dyatlo-size-slider');
            const cDisplay = sizeWrapper.querySelector('#dyatlo-size-val-display');
            
            cBtn.onclick = (e) => { 
                e.stopPropagation(); 
                cPopup.classList.toggle('show'); 
            };

            const updateCanvasSize = (val) => {
                const canvas = modal.querySelector(SEL.canvas);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.lineWidth = val;
                }
            };

            const updateLabel = (val) => {
                const nativeLabel = sizesContainer.parentElement.querySelector('.toolbar-label');
                if (nativeLabel) nativeLabel.innerText = `Размер: ${val}px`;
            };

            cSlider.oninput = (e) => {
                const val = parseInt(e.target.value);
                State.customSize = val;
                
                cBtn.innerText = val;
                cDisplay.innerText = val + 'px';
                
                modal.querySelectorAll(SEL.sizeBtns).forEach(b => b.classList.remove('active'));
                cBtn.classList.add('active');

                updateLabel(val);
                updateCanvasSize(val);
            };

            // ИСПРАВЛЕННЫЙ ОБРАБОТЧИК РАЗМЕРОВ
            sizesContainer.addEventListener('click', (e) => {
                const nativeBtn = e.target.closest(SEL.sizeBtns);
                if (nativeBtn) {
                    // Гасим нашу кнопку
                    cBtn.classList.remove('active');
                    
                    // [ИСПРАВЛЕНИЕ] Гасим все родные кнопки и зажигаем ту, на которую нажали
                    modal.querySelectorAll(SEL.sizeBtns).forEach(b => b.classList.remove('active'));
                    nativeBtn.classList.add('active');

                    const match = (nativeBtn.getAttribute('aria-label') || "").match(/(\d+)/);
                    if (match) {
                        const size = parseInt(match[1]);
                        State.customSize = size;
                        
                        cBtn.innerText = size;
                        cSlider.value = size;
                        cDisplay.innerText = size + 'px';
                        
                        updateLabel(size);
                        updateCanvasSize(size);
                    }
                }
            }, true);

            document.addEventListener('click', (e) => { 
                if (!sizeWrapper.contains(e.target)) cPopup.classList.remove('show'); 
            });
        }

        const toolbar = modal.querySelector(SEL.toolbar);
        const extra = document.createElement('div');
        extra.className = `toolbar-section ${SVELTE_CLASS}`;
        extra.innerHTML = `
            <span class="toolbar-label ${SVELTE_CLASS}">Плагин</span>
            <div class="toolbar-tools ${SVELTE_CLASS}">
                <button id="dyatlo-upload" title="Загрузить изображение / GIF" class="tool-btn ${SVELTE_CLASS}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                <button id="dyatlo-download" title="Скачать как PNG" class="tool-btn ${SVELTE_CLASS}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <input type="file" id="dyatlo-file-input" accept="image/gif,image/png,image/jpeg" style="display:none">
            </div>`;
        toolbar.insertBefore(extra, modal.querySelector(SEL.actionBtns));
        extra.querySelector('#dyatlo-upload').onclick = () => extra.querySelector('#dyatlo-file-input').click();
        extra.querySelector('#dyatlo-file-input').onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image(); img.onload = () => {
                    if (file.type === 'image/gif') State.lastUploadedGif = file;
                    startCropping(img, modal, file.type === 'image/gif');
                }; img.src = ev.target.result;
            }; reader.readAsDataURL(file);
            e.target.value = '';
        };
        extra.querySelector('#dyatlo-download').onclick = () => {
            const link = document.createElement('a'); link.download = `art-${Date.now()}.png`;
            link.href = modal.querySelector(SEL.canvas).toDataURL('image/png'); link.click();
        };
    }

    // --- COLOR PANEL & PIPETTE LOGIC ---
    function toggleColorPanel(modal) {
        if (document.getElementById('dyatlo-color-panel-overlay')) {
            document.getElementById('dyatlo-color-panel-overlay').remove();
            return;
        }

        const modalRect = modal.getBoundingClientRect();
        const nativeInput = modal.querySelector(SEL.colorInput);
        const initialHex = nativeInput ? nativeInput.value : '#000000';
        const initialRgb = hexToRgb(initialHex);
        
        let colorState = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b);
        // Нормализация 0-1
        colorState.h /= 360; colorState.s /= 100; colorState.v /= 100;

        // Пресеты
        let swatches = [];
        try { swatches = JSON.parse(localStorage.getItem('dyatlo_swatches') || '[]'); } catch(e){}
        if(swatches.length < 16) swatches = [...swatches, ...Array(16 - swatches.length).fill(null)];

        const overlay = document.createElement('div');
        overlay.id = 'dyatlo-color-panel-overlay';
        overlay.style = `position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 9999; font-family: 'Montserrat', sans-serif;`;

        // HTML Структура
        overlay.innerHTML = `
            <div id="color-panel" class="dyatlo-text-panel" style="position: fixed; top: ${modalRect.top + 20}px; left: ${modalRect.left - 340}px; pointer-events: auto; color: #fff; padding: 12px; border-radius: 12px; width: 320px; user-select: none;">
                <!-- Header -->
                <div id="color-panel-handle" style="cursor: move; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 12px; color: #3b82f6; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Палитра</span>
                    <button id="cp-close" style="background:none; border:none; color:#666; cursor:pointer; font-weight:bold; font-size:14px; padding: 0 4px;">✕</button>
                </div>

                <div class="dyatlo-cp-container" style="gap: 10px;">
                    <!-- TOP: SB Area + Hue Slider + Val Slider -->
                    <div class="dyatlo-cp-top" style="height: 160px; gap: 8px;">
                        <!-- 1. Поле Насыщенности/Яркости -->
                        <div class="dyatlo-sb-area" id="cp-sb">
                            <div class="dyatlo-sb-bg-white"></div>
                            <div class="dyatlo-sb-bg-black"></div>
                            <div class="dyatlo-sb-cursor" id="cp-sb-cursor"></div>
                        </div>
                        
                        <!-- 2. Спектр (Hue) -->
                        <div class="dyatlo-hue-wrap" id="cp-hue" title="Тон" style="width: 24px;">
                            <div class="dyatlo-hue-track"></div>
                            <div class="dyatlo-slider-thumb-horz" id="cp-hue-thumb" style="top: 0%"></div>
                        </div>

                        <!-- 3. Яркость (Value) -->
                        <div class="dyatlo-hue-wrap" id="cp-val" title="Яркость" style="width: 24px; margin-left: 0;">
                            <div class="dyatlo-val-track" id="cp-val-bg"></div>
                            <div class="dyatlo-slider-thumb-horz" id="cp-val-thumb" style="top: 0%"></div>
                        </div>
                    </div>

                    <!-- MID: Inputs + Preview -->
                    <div class="dyatlo-cp-mid" style="gap: 8px; align-items: stretch;">
                        <!-- Превью цвета -->
                        <div class="dyatlo-preview-block" style="width: 40px; border: 1px solid rgba(255,255,255,0.1);">
                            <div class="dyatlo-preview-color" id="cp-prev-new" title="Новый"></div>
                            <div class="dyatlo-preview-color" id="cp-prev-old" title="Текущий" style="background-color: ${initialHex}"></div>
                        </div>
                        
                        <!-- Блок инпутов (Сгруппирован удобно) -->
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                            <!-- Верхний ряд: HEX + Пипетка -->
                            <div style="display: flex; gap: 6px;">
                                <div class="dyatlo-input-group" style="flex: 1;">
                                    <input type="text" id="inp-hex" class="dyatlo-input-tiny" value="#000000" maxlength="7" style="text-align:center; font-weight:700; font-family: monospace; padding: 6px 0;">
                                </div>
                                <button id="cp-pipette" class="dyatlo-pipette-btn" title="Пипетка" style="width: 30px;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                                        <path d="M19.4 4.6a2 2 0 0 1 0 2.8L6 21l-4 1 1-4L16.6 4.6a2 2 0 0 1 2.8 0z"></path>
                                        <path d="M14 7l3 3"></path>
                                    </svg>
                                </button>
                            </div>

                            <!-- Нижний ряд: R G B -->
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
                                <div class="dyatlo-input-group"><input type="number" id="inp-r" class="dyatlo-input-tiny" min="0" max="255"><span class="dyatlo-input-label" style="text-align:center;">R</span></div>
                                <div class="dyatlo-input-group"><input type="number" id="inp-g" class="dyatlo-input-tiny" min="0" max="255"><span class="dyatlo-input-label" style="text-align:center;">G</span></div>
                                <div class="dyatlo-input-group"><input type="number" id="inp-b" class="dyatlo-input-tiny" min="0" max="255"><span class="dyatlo-input-label" style="text-align:center;">B</span></div>
                            </div>
                        </div>
                    </div>

                    <!-- BOTTOM: Swatches -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                             <span style="font-size: 9px; color: #888; font-weight: 700; letter-spacing: 0.5px;">СОХРАНЕННЫЕ ЦВЕТА</span>
                             <button id="cp-clear-all" class="dyatlo-clear-btn" title="Удалить все" style="padding: 2px 6px;">Очистить</button>
                        </div>
                        <!-- Исправленная сетка: единственный ID cp-swatches -->
                        <div class="dyatlo-swatches" id="cp-swatches" style="border: none; padding: 0; grid-template-columns: repeat(8, 1fr); gap: 5px;"></div>
                    </div>
                </div>
            </div>`;
        
        document.body.appendChild(overlay);

        // References
        const ui = {
            panel: overlay.querySelector('#color-panel'),
            sb: overlay.querySelector('#cp-sb'),
            sbCursor: overlay.querySelector('#cp-sb-cursor'),
            hue: overlay.querySelector('#cp-hue'),
            hueThumb: overlay.querySelector('#cp-hue-thumb'),
			val: overlay.querySelector('#cp-val'),
            valThumb: overlay.querySelector('#cp-val-thumb'),
            valBg: overlay.querySelector('#cp-val-bg'),
            prevNew: overlay.querySelector('#cp-prev-new'),
            hex: overlay.querySelector('#inp-hex'),
            r: overlay.querySelector('#inp-r'),
            g: overlay.querySelector('#inp-g'),
            b: overlay.querySelector('#inp-b'),
            pipette: overlay.querySelector('#cp-pipette')
        };
		
		// --- ЛОГИКА ВОЗВРАТА К СТАРОМУ ЦВЕТУ ---
        // При клике на нижний квадрат восстанавливаем исходный цвет
        ui.panel.querySelector('#cp-prev-old').onclick = () => {
            const rgb = hexToRgb(initialHex);
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
            // Восстанавливаем состояние H, S, V
            colorState = { h: hsv.h / 360, s: hsv.s / 100, v: hsv.v / 100 };
            updateUI();
        };
        // Добавим курсор, чтобы было понятно, что можно нажать
        ui.panel.querySelector('#cp-prev-old').style.cursor = 'pointer';

        // --- Core Logic ---
        const updateSite = (hex) => {
            if (nativeInput) {
                const proto = window.HTMLInputElement.prototype;
                const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
                set.call(nativeInput, hex);
                nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
                nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        const updateUI = (skipInput = false) => {
            const rgb = hsvToRgb(colorState.h, colorState.s, colorState.v);
            const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

            // 1. SB Background (Hue) - фон большого квадрата
            const hueRgb = hsvToRgb(colorState.h, 1, 1);
            ui.sb.style.backgroundColor = `rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`;

            // 2. Фон ползунка яркости (от текущего цвета (S, H) к черному)
            // Верхняя точка градиента (яркость 100%, текущая насыщенность и тон)
            const valTopRgb = hsvToRgb(colorState.h, colorState.s, 1);
            ui.valBg.style.background = `linear-gradient(to bottom, rgb(${valTopRgb.r}, ${valTopRgb.g}, ${valTopRgb.b}), #000)`;

            // 3. Positions
            // Курсор на квадрате
            ui.sbCursor.style.left = (colorState.s * 100) + '%';
            ui.sbCursor.style.top = (100 - colorState.v * 100) + '%';
            
            // Ползунки
            ui.hueThumb.style.top = (colorState.h * 100) + '%';
            ui.valThumb.style.top = (100 - colorState.v * 100) + '%'; // Инверсия, т.к. 100% яркости наверху
            
            // 4. Values
            ui.prevNew.style.backgroundColor = hex;
            
            if (!skipInput) {
                if (document.activeElement !== ui.hex) ui.hex.value = hex;
                if (document.activeElement !== ui.r) ui.r.value = rgb.r;
                if (document.activeElement !== ui.g) ui.g.value = rgb.g;
                if (document.activeElement !== ui.b) ui.b.value = rgb.b;
            }
            updateSite(hex);
        };

        // --- Drag Logic Fixed ---
        const initDrag = (element, callback) => {
            const onMove = (e) => {
                const rect = element.getBoundingClientRect();
                let x = (e.clientX - rect.left) / rect.width;
                let y = (e.clientY - rect.top) / rect.height;
                x = Math.max(0, Math.min(1, x));
                y = Math.max(0, Math.min(1, y));
                callback(x, y);
                updateUI();
            };

            element.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Важно для предотвращения выделения текста
                onMove(e); // Сразу применяем при клике
                
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        };

        // Подключаем драг
        initDrag(ui.sb, (x, y) => {
            colorState.s = x;
            colorState.v = 1 - y; // Y инвертирован (низ = 0)
        });

        initDrag(ui.hue, (x, y) => {
            colorState.h = y;
        });
		
        initDrag(ui.val, (x, y) => {
            colorState.v = 1 - y; // Инвертируем Y (низ = 0, верх = 1)
        });

        // --- Inputs ---
        const parseRGB = () => {
            const r = parseInt(ui.r.value), g = parseInt(ui.g.value), b = parseInt(ui.b.value);
            if (!isNaN(r)) {
                const hsv = rgbToHsv(r,g,b);
                colorState = { h: hsv.h/360, s: hsv.s/100, v: hsv.v/100 };
                updateUI(true);
            }
        };
        [ui.r, ui.g, ui.b].forEach(inp => inp.addEventListener('input', parseRGB));
        
        ui.hex.addEventListener('input', (e) => {
            let val = e.target.value;

            // 1. Если пользователь стер решетку, вернем её (но дадим возможность стереть всё)
            if (val.length > 0 && !val.startsWith('#')) {
                val = '#' + val;
            }
            
            // 2. Оставляем только допустимые символы (0-9, a-f)
            // Регулярка оставляет # в начале и буквы/цифры
            const cleanVal = val.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7);
            
            // Если мы изменили ввод (убрали мусор), обновляем поле
            if (val !== cleanVal) {
                ui.hex.value = cleanVal;
                val = cleanVal;
            }

            // 3. Если введен полный цвет (# + 6 символов), применяем
            if (val.length === 7) {
                const rgb = hexToRgb(val);
                const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                colorState = { h: hsv.h/360, s: hsv.s/100, v: hsv.v/100 };
                
                // updateUI(true) означает "обнови все, кроме поля HEX", 
                // чтобы курсор текста не прыгал
                updateUI(true);
            }
        });
        
        // При потере фокуса, если ввели неполный код (напр #F), возвращаем старый цвет
        ui.hex.addEventListener('blur', () => {
            updateUI(); 
        });

        // --- Pipette (Fixed: No Drawing) ---
        // --- Pipette (Fixed: Pointer events & Logic) ---
        ui.pipette.onclick = (e) => {
            e.stopPropagation();
            
            // Если уже активна - выключаем
            if (ui.pipette.classList.contains('active')) {
                cleanupPipette();
                return;
            }

            const canvas = modal.querySelector(SEL.canvas);
            const ctx = canvas.getContext('2d');
            
            ui.pipette.classList.add('active');
            canvas.style.cursor = 'none';

            // Функция очистки (удаление слушателей)
            function cleanupPipette() {
                canvas.removeEventListener('pointerdown', pickColor, { capture: true });
                canvas.style.cursor = 'none'; // Возвращаем умный курсор
                ui.pipette.classList.remove('active');
            }

            // Функция взятия цвета
            function pickColor(ev) {
                // Блокируем рисование
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();

                // Вычисляем координаты
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const x = Math.floor((ev.clientX - rect.left) * scaleX);
                const y = Math.floor((ev.clientY - rect.top) * scaleY);
                
                // Берем пиксель
                try {
                    const p = ctx.getImageData(x, y, 1, 1).data;
                    const hsv = rgbToHsv(p[0], p[1], p[2]);
                    
                    // Обновляем состояние
                    colorState = { h: hsv.h/360, s: hsv.s/100, v: hsv.v/100 };
                    updateUI();
                } catch (err) {
                    console.error("Pipette error:", err);
                } finally {
                    // Всегда убираем слушатели после клика
                    cleanupPipette();
                }
            }

            // Используем pointerdown с capture:true, чтобы перехватить нажатие ДО того, как сайт начнет рисовать
            canvas.addEventListener('pointerdown', pickColor, { capture: true });
        };

        // --- Swatches Logic ---
        const swatchesContainer = overlay.querySelector('#cp-swatches');
        
        // Функция отрисовки слотов
        const renderSwatches = () => {
            swatchesContainer.innerHTML = swatches.map((c, i) => {
                const bg = c ? c : ''; 
                const style = c 
                    ? `background-color: ${c}; border-color: rgba(255,255,255,0.2);` 
                    : `border-color: rgba(255,255,255,0.05);`;
                const className = c ? 'dyatlo-swatch' : 'dyatlo-swatch empty';
                const title = c ? 'ЛКМ: Выбрать\nПКМ: Заменить\nShift+Click: Удалить' : 'Нажмите, чтобы сохранить';
                
                return `<div class="${className}" data-idx="${i}" style="${style}" title="${title}"></div>`;
            }).join('');
            localStorage.setItem('dyatlo_swatches', JSON.stringify(swatches));
        };

        // Обработчик кликов по слотам
        const handleSwatchClick = (e, isRightClick = false) => {
            const swatch = e.target.closest('.dyatlo-swatch');
            if (!swatch) return;
            
            const idx = parseInt(swatch.dataset.idx);
            const currentColor = ui.hex.value;

            if (isRightClick) {
                // ПКМ: Перезаписать текущим цветом (Изменить)
                e.preventDefault(); // Блокируем меню браузера
                swatches[idx] = currentColor;
                renderSwatches();
            } else {
                // ЛКМ
                if (e.shiftKey) { 
                    // Shift + ЛКМ: Удалить
                    swatches[idx] = null;
                    renderSwatches();
                } else if (!swatches[idx]) { 
                    // ЛКМ по пустому: Сохранить
                    swatches[idx] = currentColor;
                    renderSwatches();
                } else { 
                    // ЛКМ по цветному: Загрузить цвет
                    const rgb = hexToRgb(swatches[idx]);
                    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                    colorState = { h: hsv.h/360, s: hsv.s/100, v: hsv.v/100 };
                    updateUI();
                }
            }
        };

        // Слушатели событий слотов
        swatchesContainer.addEventListener('click', (e) => handleSwatchClick(e, false));
        swatchesContainer.addEventListener('contextmenu', (e) => handleSwatchClick(e, true));

        // Кнопка очистить всё
        overlay.querySelector('#cp-clear-all').onclick = () => {
            if (confirm('Удалить все сохраненные цвета?')) {
                swatches = Array(16).fill(null);
                renderSwatches();
            }
        };

        // Первичная отрисовка
        renderSwatches();

        // --- Window Drag ---
        let isDragging = false, offset = { x: 0, y: 0 };
        const handle = overlay.querySelector('#color-panel-handle');
        handle.onmousedown = (e) => { 
            if(e.target.closest('button')) return;
            isDragging = true; 
            offset = { x: e.clientX - ui.panel.offsetLeft, y: e.clientY - ui.panel.offsetTop }; 
        };
        const onWMove = (e) => { if (isDragging) { ui.panel.style.left = (e.clientX - offset.x) + 'px'; ui.panel.style.top = (e.clientY - offset.y) + 'px'; } };
        const onWUp = () => isDragging = false;
        window.addEventListener('mousemove', onWMove);
        window.addEventListener('mouseup', onWUp);

        // Close
        overlay.querySelector('#cp-close').onclick = () => {
            window.removeEventListener('mousemove', onWMove);
            window.removeEventListener('mouseup', onWUp);
            overlay.remove();
        };

        updateUI();
    }

    // --- TEXT TOOL DIALOG ---
    function showTextDialog(initialX, initialY, ctx, canvas, modal) {
        if (document.getElementById('dyatlo-text-overlay')) return;
        const modalRect = modal.getBoundingClientRect();
        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let curX = initialX, curY = initialY;

        const overlay = document.createElement('div');
        overlay.id = 'dyatlo-text-overlay';
        overlay.style = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 10000; pointer-events: none; font-family: 'Montserrat', sans-serif;`;

        overlay.innerHTML = `
            <div id="text-panel" class="dyatlo-text-panel" style="position: fixed; top: ${modalRect.top}px; left: ${modalRect.right + 20}px; pointer-events: auto; color: #fff; padding: 20px; border-radius: 16px; width: 260px; display: flex; flex-direction: column; gap: 14px; user-select: none;">
                <div id="text-panel-handle" style="cursor: move; display: flex; align-items: center; justify-content: space-between; margin: -20px -20px 5px -20px; padding: 12px 20px; border-radius: 16px 16px 0 0; background: rgba(59, 130, 246, 0.1);">
                    <span style="font-size: 11px; color: #3b82f6; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Настройка текста</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><path d="M5 9l7 7 7-7"/></svg>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 10px; color: #888; font-weight: 600;">СОДЕРЖАНИЕ</span>
                    <input type="text" id="t-val" class="dyatlo-input" placeholder="Введите текст..." style="padding: 10px 12px; border-radius: 8px; color: #fff; outline: none; font-size: 13px; font-family: inherit;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 10px; color: #888; font-weight: 600;">РАЗМЕР</span>
                        <span id="t-size-val" style="font-size: 10px; color: #3b82f6; font-weight: 700;">50px</span>
                    </div>
                    <input type="range" id="t-size" class="dyatlo-range" min="10" max="300" value="50">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                        <span style="font-size: 10px; color: #888; font-weight: 600;">ПРОЗРАЧНОСТЬ</span>
                        <span id="t-alpha-val" style="font-size: 10px; color: #3b82f6; font-weight: 700;">100%</span>
                    </div>
                    <input type="range" id="t-alpha" class="dyatlo-range" min="0" max="100" value="100">
                </div>

                <div style="display: grid; grid-template-columns: 1fr; gap: 6px;">
                    <label class="dyatlo-checkbox-label"><input type="checkbox" id="t-bg"> <span>Фоновая подложка</span></label>
                    <label class="dyatlo-checkbox-label"><input type="checkbox" id="t-stroke"> <span>Контурная обводка</span></label>
                    <label class="dyatlo-checkbox-label"><input type="checkbox" id="t-shadow"> <span>Мягкая тень</span></label>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    <button id="t-cancel" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); color: #ccc; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;">Отмена</button>
                    <button id="t-ok" class="dyatlo-btn-primary" style="flex: 1.5; padding: 10px; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 700;">Применить</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        const panel = overlay.querySelector('#text-panel');
        const handle = overlay.querySelector('#text-panel-handle');
        let isDragging = false, offset = { x: 0, y: 0 };
        
        handle.onmousedown = (e) => { 
            isDragging = true; 
            offset = { x: e.clientX - panel.offsetLeft, y: e.clientY - panel.offsetTop };
            panel.style.transition = 'none';
        };
        
        const onMouseMove = (e) => { if (isDragging) { panel.style.left = (e.clientX - offset.x) + 'px'; panel.style.top = (e.clientY - offset.y) + 'px'; } };
        const onMouseUp = () => { isDragging = false; panel.style.transition = 'transform 0.2s ease'; };
        window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);

        const render = () => {
            ctx.putImageData(snapshot, 0, 0);
            const text = overlay.querySelector('#t-val').value;
            const size = parseInt(overlay.querySelector('#t-size').value);
            const alpha = parseInt(overlay.querySelector('#t-alpha').value);
            
            overlay.querySelector('#t-size-val').innerText = size + 'px';
            overlay.querySelector('#t-alpha-val').innerText = alpha + '%';
            
            if (!text) return;
            
            ctx.save(); ctx.font = `bold ${size}px Montserrat`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.globalAlpha = alpha / 100;
            if (overlay.querySelector('#t-bg').checked) {
                const m = ctx.measureText(text); const w = m.width + 30, h = size + 15;
                ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(curX - w/2, curY - h/2, w, h, 12); else ctx.rect(curX - w/2, curY - h/2, w, h); ctx.fill();
            }
            if (overlay.querySelector('#t-shadow').checked) { ctx.shadowColor = '#000'; ctx.shadowBlur = size/6; }
            if (overlay.querySelector('#t-stroke').checked) { ctx.strokeStyle = '#000'; ctx.lineWidth = size * 0.06; ctx.lineJoin = 'round'; ctx.strokeText(text, curX, curY); }
            ctx.fillStyle = getActiveColor(modal); ctx.fillText(text, curX, curY); ctx.restore();
        };

        const canvasClick = (e) => {
            const rect = canvas.getBoundingClientRect();
            curX = (e.clientX - rect.left) * (canvas.width / rect.width);
            curY = (e.clientY - rect.top) * (canvas.height / rect.height);
            render();
        };

        canvas.addEventListener('mousedown', canvasClick); overlay.addEventListener('input', render);
        const close = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); canvas.removeEventListener('mousedown', canvasClick); overlay.remove(); revertToLastTool(modal); };
        overlay.querySelector('#t-ok').onclick = () => { render(); History.save(ctx, canvas); close(); };
        overlay.querySelector('#t-cancel').onclick = () => { ctx.putImageData(snapshot, 0, 0); close(); };
        render();
    }

    // --- FULLSCREEN CROP & GIF LOGIC ---
    function startCropping(img, modal, isGif = false) {
        document.getElementById('dyatlo-crop-overlay')?.remove();
        State.cleanCropListeners();
        const canvas = modal.querySelector(SEL.canvas);
        const rect = canvas.getBoundingClientRect();
        
        const overlay = document.createElement('div');
        overlay.id = 'dyatlo-crop-overlay';
        overlay.style = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: move;`;
        
        const cropArea = document.createElement('div');
        cropArea.style = `position: absolute; top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: ${rect.height}px; overflow: hidden; outline: 2px dashed #3b82f6; border-radius: 4px; background: #111;`;
        
        const cropImg = document.createElement('img');
        cropImg.src = img.src; cropImg.style = `position: absolute; display: block; max-width: none; user-select: none; pointer-events: none;`;
        cropArea.appendChild(cropImg);

        const ui = document.createElement('div');
        ui.style = `position: absolute; top: ${rect.bottom + 20}px; display: flex; gap: 10px;`;
        ui.innerHTML = `<button id="crop-cancel" class="drawing-btn drawing-btn--cancel ${SVELTE_CLASS}">Отмена</button>
                        <button id="crop-ok" class="drawing-btn drawing-btn--save ${SVELTE_CLASS}">${isGif ? 'Вставить GIF' : 'Наложить'}</button>`;
        
        overlay.appendChild(cropArea);
        overlay.appendChild(ui);
        document.body.appendChild(overlay);

        const vScale = rect.width / canvas.width;
        let s = { scale: Math.max(canvas.width / img.width, canvas.height / img.height), x: 0, y: 0, isDragging: false, lx: 0, ly: 0 };
        s.x = (canvas.width - img.width * s.scale) / 2;
        s.y = (canvas.height - img.height * s.scale) / 2;

        const redraw = () => {
            cropImg.style.width = (img.width * s.scale * vScale) + 'px';
            cropImg.style.height = (img.height * s.scale * vScale) + 'px';
            cropImg.style.left = (s.x * vScale) + 'px';
            cropImg.style.top = (s.y * vScale) + 'px';
        }; redraw();

        overlay.onmousedown = (e) => { if(e.target.closest('button')) return; s.isDragging = true; s.lx = e.clientX; s.ly = e.clientY; };
        overlay.onwheel = (e) => { e.preventDefault(); s.scale *= (e.deltaY > 0 ? 0.95 : 1.05); redraw(); };
        const onMove = (e) => { if (!s.isDragging) return; s.x += (e.clientX - s.lx) / vScale; s.y += (e.clientY - s.ly) / vScale; s.lx = e.clientX; s.ly = e.clientY; redraw(); };
        const onUp = () => s.isDragging = false;
        State.cropListeners = { move: onMove, up: onUp };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);

        overlay.querySelector('#crop-ok').onclick = () => {
            if (isGif) applyGif(modal, img.src, s, img.width, img.height);
            else { const ctx = canvas.getContext('2d'); ctx.drawImage(img, s.x, s.y, img.width*s.scale, img.height*s.scale); History.save(ctx, canvas); }
            clean();
        };
        overlay.querySelector('#crop-cancel').onclick = () => { State.lastUploadedGif = null; clean(); };
        function clean() { State.cleanCropListeners(); overlay.remove(); }
    }

    function applyGif(modal, src, s, w, h) {
        const canvas = modal.querySelector(SEL.canvas), container = modal.querySelector(SEL.canvasContainer);
        modal.querySelector('#dyatlo-gif-container')?.remove();
        const gifBox = document.createElement('div');
        gifBox.id = 'dyatlo-gif-container';
        gifBox.style = `position: absolute; top: ${canvas.offsetTop}px; left: ${canvas.offsetLeft}px; width: ${canvas.clientWidth}px; height: ${canvas.clientHeight}px; overflow: hidden; pointer-events: none; background: #fff; z-index: 5; border-radius: 4px;`;
        const vScale = canvas.clientWidth / canvas.width;
        const img = document.createElement('img');
        img.src = src; img.style = `position: absolute; left: ${s.x * vScale}px; top: ${s.y * vScale}px; width: ${w * s.scale * vScale}px; height: ${h * s.scale * vScale}px; max-width: none;`;
        const badge = document.createElement('div');
        badge.style = `position: absolute; top: 10px; left: 10px; background: rgba(26,26,26,0.9); border: 1px solid #3b82f6; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 8px; z-index: 10; pointer-events: auto;`;
        badge.innerHTML = `<span>GIF режим</span><button id="gif-rm" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:16px;">&times;</button>`;
        gifBox.appendChild(img); gifBox.appendChild(badge); container.appendChild(gifBox); canvas.style.opacity = "0.05";
        badge.querySelector('#gif-rm').onclick = () => { gifBox.remove(); canvas.style.opacity = "1"; State.lastUploadedGif = null; };
    }
	
	// --- SMART CURSOR LOGIC ---
    function initSmartCursor(modal, canvas) {
        // Проверяем, инициализирован ли уже курсор на этом канвасе
        if (canvas.dataset.cursorInit) return;
        canvas.dataset.cursorInit = "true";

        // 1. Создаем элемент курсора, если его нет в DOM
        let cursor = document.getElementById('dyatlo-cursor');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'dyatlo-cursor';
            // Используем класс из CSS, который уже есть в твоем коде (dyatlo-brush-cursor)
            cursor.className = 'dyatlo-brush-cursor'; 
            // Добавляем немного фона, чтобы инверсия цвета работала лучше
            cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            document.body.appendChild(cursor);
        }

        // 2. Основная функция обновления
        const update = (e) => {
            // Получаем текущие настройки (инструмент и размер)
            const s = getSettings(modal);
            
            // Скрываем нативный курсор браузера
            canvas.style.cursor = 'none';
            cursor.style.display = 'block';

            let currentSize;

            // ЛОГИКА РАЗМЕРА:
            // Если выбран Текст, Заливка ИЛИ Пипетка — ставим фиксированный размер 4px
            if (s.tool === 'Текст' || s.tool === 'Заливка' || s.tool === 'Пипетка') {
                currentSize = 4;
                // Для пипетки и спец. инструментов делаем курсор ярче
                cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'; 
                cursor.style.border = '1px solid #000'; // Добавим четкую границу для точности
            } else {
                // Иначе берем размер кисти
                currentSize = s.size;
                cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                cursor.style.border = '1px solid rgba(0, 0, 0, 0.5)'; // Возвращаем обычную границу
            }
            
            // Применяем размеры
            cursor.style.width = currentSize + 'px';
            cursor.style.height = currentSize + 'px';
            
            // Двигаем курсор (благодаря translate(-50%, -50%) в CSS он будет по центру)
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        };

        // 3. Навешиваем слушатели
        // Движение мыши
        canvas.addEventListener('mousemove', update);
        
        // Когда мышь уходит с холста — скрываем наш курсор
        canvas.addEventListener('mouseleave', () => {
             cursor.style.display = 'none';
        });
        
        // Когда возвращается — показываем
        canvas.addEventListener('mouseenter', () => {
             cursor.style.display = 'block';
        });

        // (Опционально) Обновление при прокрутке колесика, если меняешь размер
        canvas.addEventListener('wheel', (e) => {
             setTimeout(() => update({ clientX: e.clientX, clientY: e.clientY }), 10);
        }, { passive: true });
    }

    const observer = new MutationObserver(() => {
        const modal = document.querySelector(SEL.modal);
        const canvas = modal?.querySelector(SEL.canvas);
        
        if (modal && canvas) {
            injectNativeUI(modal);
            setupConfirmations(modal);
			initSmartCursor(modal, canvas);
            if (!canvas.dataset.drawingListener) {
                canvas.dataset.drawingListener = "true";
                canvas.addEventListener('pointerup', () => {
                    State.historyStep++; 
                });
            }
            
            // Инициализация контекста только для Текста и Заливки
            if (!canvas.dataset.dyatloContextSet) {
                canvas.dataset.dyatloContextSet = "true";
                const forceSize = (e) => {
                    const customBtn = document.getElementById('dyatlo-custom-size-btn');
                    if (customBtn && customBtn.classList.contains('active')) {
                        // Важно: обновляем lineWidth прямо перед рисованием
                        ctx.lineWidth = State.customSize;
                    }
                };
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                // Слушатель только для наших кастомных инструментов (Заливка / Текст)
                canvas.addEventListener('pointerdown', (e) => {
                    const s = getSettings(modal);
                    const rect = canvas.getBoundingClientRect();
                    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
                    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

                    if (s.tool === 'Текст') {
                        showTextDialog(x, y, ctx, canvas, modal);
                    } else if (s.tool === 'Заливка') {
                        floodFill(ctx, x, y, s.color);
                    }
                }, { capture: true }); // capture: true чтобы сработать раньше нативного кода
            }
        } else if (State.lastUploadedGif) {
            State.reset();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
