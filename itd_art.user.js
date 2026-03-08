// ==UserScript==
// @name         ITD ART
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Новое окно рисования с расширением функционала. Новости и обновления: https://t.me/itd_art
// @author       TheBreakHikita
// @match        https://xn--d1ah4a.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=xn--d1ah4a.com
// @downloadURL  https://github.com/TheBreakHikita/itd-art/raw/refs/heads/main/itd_art.user.js
// @updateURL    https://github.com/TheBreakHikita/itd-art/raw/refs/heads/main/itd_art.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Константы и состояние
    let state = {
        isOpen: false,
        tool: 'brush',
        color: '#000000',
        lineWidth: 4,
        isDrawing: false,
		palettePinned: localStorage.getItem('itd_palette_pinned') === 'true',
        startX: 0,
        startY: 0,
        history: [],
        historyStep: -1,
		showConfirmations: localStorage.getItem('itd_show_confirmations') !== 'false' 
    };

    let canvas, ctx, overlayCanvas, oCtx, snapshot;

    // --- CSS СТИЛИ ---
    const styles = `
        .itd-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 999999;
            display: flex; align-items: center; justify-content: center;
            font-family: system-ui, -apple-system, sans-serif;
            backdrop-filter: blur(4px);
            pointer-events: all;
        }
        .itd-editor-container {
            background: #1c1c1e;
            border-radius: 12px;
            overflow: hidden;
            width: 1150px;
            display: flex;
            flex-direction: column;
            border: 1px solid #3a3a3c;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        .itd-toolbar {
            display: flex;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid #3a3a3c;
            gap: 15px;
            background: #1a1a1a;
        }
        .itd-tool-group {
            display: flex;
            gap: 6px;
            border-right: 1px solid #3a3a3c;
            padding-right: 12px;
        }
        /* Кнопки инструментов — светлые иконки на темном фоне */
        .itd-tool-btn {
            width: 36px; height: 36px; border: none; background: none; cursor: pointer;
            border-radius: 6px; display: flex; align-items: center; justify-content: center;
            color: #ebebf5; transition: 0.2s;
        }
        .itd-tool-btn:hover { background: #3a3a3c; }
        .itd-tool-btn:disabled { color: #48484a; cursor: not-allowed; }

        /* Активная кнопка — синий цвет как на сайте */
        .itd-tool-btn.active { background: rgba(0, 122, 255, 0.2); color: #0a84ff; }

        /* Зона холста — темная подложка */
        .itd-canvas-area { position: relative; background: #2a2a2a; padding: 20px; display: flex; justify-content: center; }

        .canvas-wrapper {
            position: relative;
            box-shadow: 0 0 30px rgba(0,0,0,0.5);
            line-height: 0;
            /* Шахматка Photoshop */
            background-color: #ffffff;
            background-image: 
                linear-gradient(45deg, #e0e0e0 25%, transparent 25%), 
                linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), 
                linear-gradient(45deg, transparent 75%, #e0e0e0 75%), 
                linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
            background-size: 20px 20px;
            background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
            border-radius: 4px;
        }
        #main-canvas { cursor: crosshair; border-radius: 4px; }
        #overlay-canvas { position: absolute; top: 0; left: 0; pointer-events: none; }

        /* Футер */
        .itd-footer { padding: 16px; border-top: 1px solid #3a3a3c; display: flex; justify-content: flex-end; gap: 12px; background: #1c1c1e; }

        /* Кнопки в футере */
        .itd-btn { padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 14px; transition: 0.2s; }
        .itd-btn-cancel { background: #3a3a3c; color: #fff; }
        .itd-btn-cancel:hover { background: #48484a; }
        .itd-btn-save { background: #007AFF; color: #fff; min-width: 180px; }
        .itd-btn-save:hover { background: #0a84ff; box-shadow: 0 0 15px rgba(0, 122, 255, 0.4); }
        .itd-btn-save:disabled { background: #48484a; color: #8e8e93; cursor: not-allowed; }

        /* Точки выбора цвета и размера */
        .color-dot { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: 0.2s; }
        .color-dot.active { border-color: #0a84ff; transform: scale(1.1); }
        .size-dot { background: #ebebf5; border-radius: 50%; cursor: pointer; }
        .size-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: none; background: none; }
        .size-btn.active { background: #3a3a3c; }
        .size-btn:hover:not(.active) { background: #2c2c2e; }

        #custom-color { border-radius: 4px; background: none; border: 1px solid #3a3a3c; }
        .itd-custom-draw-btn { color: #0a84ff !important; margin-right: 4px; }
        .itd-palette-trigger {
            width: 28px; 
            height: 28px; 
            border-radius: 50%;
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            
            /* Улучшенный градиент с большим количеством точек для максимальной плавности */
            background: conic-gradient(from 0deg, red, #ff8000, yellow, #80ff00, lime, #00ff80, cyan, #0080ff, blue, #8000ff, magenta, #ff0080, red);
            
            /* Убираем border совсем, чтобы не было полос по бокам */
            border: none; 
            
            /* Вместо border используем inset shadow — она ложится поверх градиента идеально ровно */
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2), 0 2px 5px rgba(0,0,0,0.4);
            
            transition: transform 0.2s, box-shadow 0.2s;
            /* Убираем любые возможные отступы */
            padding: 0;
            margin: 0;
            overflow: hidden;
        }

        .itd-palette-trigger:hover {
            transform: scale(1.1);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4), 0 4px 10px rgba(0,0,0,0.5);
        }
        .itd-palette-trigger:hover {
            transform: scale(1.1);
            box-shadow: inset 0 0 2px rgba(0,0,0,0.1), 0 3px 8px rgba(0,0,0,0.5);
        }
        .dyatlo-text-panel {
            backdrop-filter: blur(12px);
            background: rgba(10, 10, 10, 0.95) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5) !important;
            z-index: 1000000;
        }
        .dyatlo-sb-area { flex: 1; position: relative; border-radius: 6px; cursor: crosshair; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: red; }
        .dyatlo-sb-bg-white { position: absolute; inset: 0; background: linear-gradient(to right, #fff, transparent); }
        .dyatlo-sb-bg-black { position: absolute; inset: 0; background: linear-gradient(to top, #000, transparent); }
        .dyatlo-sb-cursor { position: absolute; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; transform: translate(-6px, -6px); pointer-events: none; }
        .dyatlo-hue-wrap { width: 24px; position: relative; border-radius: 6px; overflow: hidden; cursor: ns-resize; border: 1px solid rgba(255,255,255,0.1); }
        .dyatlo-hue-track { width: 100%; height: 100%; background: linear-gradient(to bottom, red 0%, #ff0 17%, lime 33%, cyan 50%, blue 67%, magenta 83%, red 100%); }
        .dyatlo-val-track { width: 100%; height: 100%; background: linear-gradient(to bottom, #fff, #000); }
        .dyatlo-slider-thumb-horz { position: absolute; left: 0; right: 0; height: 8px; background: transparent; border: 2px solid white; transform: translateY(-4px); pointer-events: none; }
        .dyatlo-input-tiny { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 11px; padding: 6px 4px; border-radius: 4px; text-align: center; }
        .dyatlo-swatch { aspect-ratio: 1; border-radius: 4px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
        .dyatlo-swatch.empty { background: repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 50% / 8px 8px; opacity: 0.5; }
		.dyatlo-cp-container { display: flex; flex-direction: column; gap: 12px; }
		.dyatlo-cp-top { display: flex; gap: 12px; height: 180px; }
		.dyatlo-sb-area { flex: 1; position: relative; background: red; border-radius: 6px; cursor: crosshair; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
		.dyatlo-sb-bg-white { position: absolute; inset: 0; background: linear-gradient(to right, #fff, transparent); }
		.dyatlo-sb-bg-black { position: absolute; inset: 0; background: linear-gradient(to top, #000, transparent); }
		.dyatlo-sb-cursor { position: absolute; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 3px rgba(0,0,0,0.8); transform: translate(-6px, -6px); pointer-events: none; }
		.dyatlo-hue-wrap { width: 35px; position: relative; border-radius: 6px; overflow: hidden; cursor: ns-resize; border: 1px solid rgba(255,255,255,0.1); }
		.dyatlo-hue-track { width: 100%; height: 100%; background: linear-gradient(to bottom, red 0%, #ff0 17%, lime 33%, cyan 50%, blue 67%, magenta 83%, red 100%); }
		.dyatlo-val-track { width: 100%; height: 100%; background: linear-gradient(to bottom, #fff, #000); }
		.dyatlo-slider-thumb-horz { position: absolute; left: 0; right: 0; height: 8px; background: transparent; border: 2px solid white; box-shadow: 0 0 2px rgba(0,0,0,0.5); transform: translateY(-4px); pointer-events: none; }
		.dyatlo-cp-mid { display: flex; gap: 10px; align-items: stretch; }
		.dyatlo-preview-block { width: 50px; border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.2); }
		.dyatlo-preview-color { flex: 1; position: relative; min-height: 20px; }
		.dyatlo-input-tiny { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 11px; padding: 6px 4px; border-radius: 4px; text-align: center; font-family: monospace; }
		.dyatlo-swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); }
		.dyatlo-swatch { aspect-ratio: 1; border-radius: 4px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); position: relative; overflow: hidden; transition: transform 0.1s; }
		.dyatlo-swatch:hover { transform: scale(1.15); border-color: #fff; z-index: 2; }
		.dyatlo-pipette-btn { 
			grid-column: span 1; 
			display: flex; 
			align-items: center; 
			justify-content: center; 
			background: #2c2c2e; 
			border: 1px solid #3a3a3c; 
			border-radius: 8px; 
			color: #ebebf5; 
			cursor: pointer; 
			transition: all 0.2s ease;
			width: 42px;
		}
		.dyatlo-pipette-btn:hover { 
			background: #3a3a3c; 
			color: #fff; 
			border-color: #48484a;
		}
		.dyatlo-pipette-btn.active { 
			background: #007AFF; 
			color: #fff; 
			border-color: #0a84ff; 
			box-shadow: 0 0 10px rgba(0, 122, 255, 0.4);
		}
		.dyatlo-pipette-btn.active { background: #3b82f6; color: white; border-color: #60a5fa; }
		.dyatlo-swatch.empty { background-image: linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%); background-size: 8px 8px; opacity: 0.5; }
		/* Стили окна подтверждения */
        .itd-confirm-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 2000000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(2px);
        }
        .itd-confirm-modal {
            background: #1c1c1e; padding: 24px; border-radius: 12px;
            border: 1px solid #3a3a3c; width: 350px; text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .itd-confirm-text { color: #fff; margin-bottom: 20px; font-size: 16px; line-height: 1.4; }
        .itd-confirm-buttons { display: flex; gap: 12px; justify-content: center; }
        .itd-btn-confirm-yes { background: #ff3b30; color: #fff; } /* Красная для отмены */
        .itd-btn-confirm-save { background: #34c759; color: #fff; } /* Зеленая для сохранения */
        .itd-btn-confirm-no { background: #3a3a3c; color: #fff; }
		/* Кнопка настроек */
        .itd-btn-settings { background: #3a3a3c; color: #fff; padding: 10px; display: flex; align-items: center; justify-content: center; }
        .itd-btn-settings:hover { background: #48484a; }
        
        /* Стили окна настроек */
        .itd-settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; color: #fff; }
        .itd-settings-title { font-size: 18px; font-weight: 600; }
        .itd-settings-close-x { background: none; border: none; color: #8e8e93; cursor: pointer; font-size: 20px; padding: 5px; }
        .itd-settings-close-x:hover { color: #fff; }
        .itd-settings-item { display: flex; align-items: center; gap: 12px; color: #ebebf5; margin-bottom: 15px; cursor: pointer; user-select: none; }
        .itd-settings-item input { width: 18px; height: 18px; cursor: pointer; }
		/* --- Обновленные стили настроек --- */
        .itd-settings-divider {
            height: 1px;
            background: #3a3a3c;
            margin: 0;
        }
        .itd-settings-body {
            padding: 15px 0;
        }
        /* Контейнер для каждого пункта (серый блок) */
        .itd-settings-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #2c2c2e;
            padding: 12px 16px;
            border-radius: 10px;
            margin-bottom: 8px;
            transition: background 0.2s;
            cursor: default;
        }
        .itd-settings-item:hover {
            background: #3a3a3c;
        }
        .itd-settings-item span {
            color: #ebebf5;
            font-size: 14px;
            font-weight: 500;
        }
        /* Стили модного переключателя (Toggle Switch) */
        .itd-switch {
            position: relative;
            display: inline-block;
            width: 42px;
            height: 24px;
            flex-shrink: 0;
        }
        .itd-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .itd-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #48484a;
            transition: .3s;
            border-radius: 24px;
        }
        .itd-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        input:checked + .itd-slider {
            background-color: #34c759; /* Зеленый при включении */
        }
        input:checked + .itd-slider:before {
            transform: translateX(18px);
        }
		/* Кнопка скрепки */
		.itd-pin-btn {
			background: none;
			border: none;
			color: #666;
			cursor: pointer;
			padding: 4px;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: 0.2s;
			border-radius: 4px;
			margin-right: 8px;
		}
		.itd-pin-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
		.itd-pin-btn.active { 
			color: #0a84ff; 
			background: rgba(10, 132, 255, 0.2); 
			box-shadow: inset 0 0 0 1px rgba(10, 132, 255, 0.3);
		}

		/* Наклоняем только саму иконку SVG внутри активной кнопки */
		.itd-pin-btn.active svg {
			transform: rotate(-25deg);
			transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		}

		/* Плавный переход для иконки в обычном состоянии */
		.itd-pin-btn svg {
			transition: transform 0.2s ease;
		}
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // --- ЛОГИКА РИСОВАНИЯ (БЕЗ ИЗМЕНЕНИЙ) ---

    function saveHistory() {
        state.historyStep++;
        if (state.historyStep < state.history.length) state.history.length = state.historyStep;
        state.history.push(canvas.toDataURL());
        updateUndoButtons();
    }

    function undo() {
        if (state.historyStep > 0) {
            state.historyStep--;
            let img = new Image();
            img.src = state.history[state.historyStep];
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
        }
        updateUndoButtons();
    }

    function redo() {
        if (state.historyStep < state.history.length - 1) {
            state.historyStep++;
            let img = new Image();
            img.src = state.history[state.historyStep];
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
        }
        updateUndoButtons();
    }

    function updateUndoButtons() {
        const btnUndo = document.querySelector('#btn-undo');
        const btnRedo = document.querySelector('#btn-redo');
        if (btnUndo) btnUndo.disabled = state.historyStep <= 0;
        if (btnRedo) btnRedo.disabled = state.historyStep >= state.history.length - 1;
    }

    function floodFill(startX, startY, fillRGB) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const pos = (startY * canvas.width + startX) * 4;
        const targetR = data[pos], targetG = data[pos+1], targetB = data[pos+2], targetA = data[pos+3];
        if (targetR === fillRGB[0] && targetG === fillRGB[1] && targetB === fillRGB[2] && targetA === 255) return;
        const stack = [[startX, startY]];
        while (stack.length) {
            const [x, y] = stack.pop();
            const i = (y * canvas.width + x) * 4;
            if (data[i] === targetR && data[i+1] === targetG && data[i+2] === targetB && data[i+3] === targetA) {
                data[i] = fillRGB[0]; data[i+1] = fillRGB[1]; data[i+2] = fillRGB[2]; data[i+3] = 255;
                if (x > 0) stack.push([x - 1, y]);
                if (x < canvas.width - 1) stack.push([x + 1, y]);
                if (y > 0) stack.push([x, y - 1]);
                if (y < canvas.height - 1) stack.push([x, y + 1]);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        saveHistory();
    }

    // --- СИСТЕМА ЗАГРУЗКИ (API BYPASS) ---

    async function getAuthToken() {
        const response = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Не удалось обновить сессию');
        const data = await response.json();
        return data.accessToken;
    }

    async function uploadToAPI(blob) {
        const token = await getAuthToken();
        const authHeader = { 'Authorization': `Bearer ${token}` };

        const formData = new FormData();
        formData.append('file', blob, 'banner_drawn.png');

        const uploadRes = await fetch('/api/files/upload', {
            method: 'POST',
            headers: authHeader,
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Ошибка при загрузке файла на сервер');
        const uploadData = await uploadRes.json();
        const fileId = uploadData.id;

        const updateRes = await fetch('/api/users/me', {
            method: 'PUT',
            headers: {
                ...authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bannerId: fileId })
        });

        if (!updateRes.ok) throw new Error('Не удалось привязать баннер к профилю');
        return true;
    }

	// --- МАТЕМАТИЧЕСКИЕ ФУНКЦИИ КОНВЕРТАЦИИ ---

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

	function toggleColorPanel() {
    // 1. Проверка на открытие
    const existing = document.getElementById('dyatlo-color-panel-overlay');
    if (existing) {
        existing.remove();
        return;
    }

    // 2. Получение данных из текущего состояния плагина
    const editorContainer = document.querySelector('.itd-editor-container');
    if (!editorContainer) return;
    const modalRect = editorContainer.getBoundingClientRect();
    
    const initialHex = state.color || '#000000';
    const initialRgb = hexToRgb(initialHex);
    let hsv = rgbToHsv(initialRgb.r, initialRgb.g, initialRgb.b);
    
    // Переводим в диапазон 0-1 для внутренней логики
    let colorState = { h: hsv.h / 360, s: hsv.s / 100, v: hsv.v / 100 };

    let swatches = JSON.parse(localStorage.getItem('itd_swatches') || '[]');
    if (swatches.length < 16) swatches = [...swatches, ...Array(16 - swatches.length).fill(null)];

    const overlay = document.createElement('div');
    overlay.id = 'dyatlo-color-panel-overlay';
    overlay.style = `position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 1000000;`;
    overlay.innerHTML = `
        <div id="color-panel" style="position: fixed; top: ${modalRect.top}px; left: ${modalRect.left - 320 - 15}px; width: 320px; padding: 12px; background: #1a1a1a; border-radius: 12px; border: 1px solid #333; color: white; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div id="color-panel-handle" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 12px;">
    <div style="display: flex; align-items: center;">
        <button id="cp-pin" class="itd-pin-btn ${state.palettePinned ? 'active' : ''}" title="Закрепить панель">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="17" x2="12" y2="22"></line>
        <path d="M5 17h14v-2l-1.8-1.2V5a2 2 0 0 0-2-2H8.8a2 2 0 0 0-2 2v8.8L5 15v2z"></path>
    </svg>
		</button>
        <span style="font-size: 10px; color: #3b82f6; font-weight: 800; letter-spacing: 1px;">ПАЛИТРА</span>
    </div>
                <button id="cp-close" style="background:none; border:none; color:#666; cursor:pointer; font-size: 16px;">✕</button>
            </div>
            <div class="dyatlo-cp-container">
                <div class="dyatlo-cp-top">
                    <div class="dyatlo-sb-area" id="cp-sb">
                        <div class="dyatlo-sb-bg-white"></div><div class="dyatlo-sb-bg-black"></div>
                        <div class="dyatlo-sb-cursor" id="cp-sb-cursor"></div>
                    </div>
                    <div class="dyatlo-hue-wrap" id="cp-hue"><div class="dyatlo-hue-track"></div><div class="dyatlo-slider-thumb-horz" id="cp-hue-thumb"></div></div>
                    <div class="dyatlo-hue-wrap" id="cp-val"><div class="dyatlo-val-track" id="cp-val-bg"></div><div class="dyatlo-slider-thumb-horz" id="cp-val-thumb"></div></div>
                </div>
                <div class="dyatlo-cp-mid">
                    <div class="dyatlo-preview-block">
                        <div class="dyatlo-preview-color" id="cp-prev-new"></div>
                        <div class="dyatlo-preview-color" id="cp-prev-old" style="background:${initialHex}; cursor: pointer;" title="Вернуть предыдущий цвет"></div>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                        <div style="display:flex; gap:6px;">
                            <input type="text" id="inp-hex" class="dyatlo-input-tiny" style="flex:1" maxlength="7">
                            <button id="cp-pipette" class="dyatlo-pipette-btn" title="Пипетка (выберите цвет на холсте)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="m2 22 1-1h3l9-9"></path>
                                    <path d="M3 21v-3l9-9"></path>
                                    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z"></path>
                                </svg>
                            </button>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px;">
                            <input type="number" id="inp-r" class="dyatlo-input-tiny" min="0" max="255">
                            <input type="number" id="inp-g" class="dyatlo-input-tiny" min="0" max="255">
                            <input type="number" id="inp-b" class="dyatlo-input-tiny" min="0" max="255">
                        </div>
                    </div>
                </div>
                <div id="cp-swatches" class="dyatlo-swatches"></div>
				<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 9px; color: #777; text-align: center; text-transform: uppercase; font-weight: 500;">
                    ЛКМ: сохранить/выбрать • Shift + ЛКМ: удалить
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const ui = {
        sb: overlay.querySelector('#cp-sb'),
        sbCursor: overlay.querySelector('#cp-sb-cursor'),
        hue: overlay.querySelector('#cp-hue'),
        hueThumb: overlay.querySelector('#cp-hue-thumb'),
        val: overlay.querySelector('#cp-val'),
        valThumb: overlay.querySelector('#cp-val-thumb'),
        valBg: overlay.querySelector('#cp-val-bg'),
        prevNew: overlay.querySelector('#cp-prev-new'),
		prevOld: overlay.querySelector('#cp-prev-old'),
        hex: overlay.querySelector('#inp-hex'),
        r: overlay.querySelector('#inp-r'), 
        g: overlay.querySelector('#inp-g'), 
        b: overlay.querySelector('#inp-b'),
        swatches: overlay.querySelector('#cp-swatches')
    };

    const updateUI = (skipInput = false) => {
        const rgb = hsvToRgb(colorState.h, colorState.s, colorState.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const hueRgb = hsvToRgb(colorState.h, 1, 1);
        
        state.color = hex; // Обновляем глобальный цвет плагина
        
        ui.sb.style.backgroundColor = `rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`;
        ui.valBg.style.background = `linear-gradient(to bottom, rgb(${hsvToRgb(colorState.h, colorState.s, 1).r}, ${hsvToRgb(colorState.h, colorState.s, 1).g}, ${hsvToRgb(colorState.h, colorState.s, 1).b}), #000)`;
        
        ui.sbCursor.style.left = (colorState.s * 100) + '%';
        ui.sbCursor.style.top = (100 - colorState.v * 100) + '%';
        ui.hueThumb.style.top = (colorState.h * 100) + '%';
        ui.valThumb.style.top = (100 - colorState.v * 100) + '%';
        ui.prevNew.style.backgroundColor = hex;
        
        if (!skipInput) {
            ui.hex.value = hex.toUpperCase(); 
            ui.r.value = rgb.r; 
            ui.g.value = rgb.g; 
            ui.b.value = rgb.b;
        }

        // Обновляем активный кружок в основной панели, если он есть
        document.querySelectorAll('.color-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.color.toLowerCase() === hex.toLowerCase());
        });
    };

    const initDrag = (el, cb) => {
        const move = (e) => {
            const r = el.getBoundingClientRect();
            cb(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
            updateUI();
        };
        el.onmousedown = (e) => { 
            move(e); 
            window.onmousemove = move; 
            window.onmouseup = () => window.onmousemove = null; 
        };
    };

    initDrag(ui.sb, (x, y) => { colorState.s = x; colorState.v = 1 - y; });
    initDrag(ui.hue, (x, y) => { colorState.h = y; });
    initDrag(ui.val, (x, y) => { colorState.v = 1 - y; });
	    ui.prevOld.onclick = () => {
        const oldRgb = hexToRgb(initialHex);
        const oldHsv = rgbToHsv(oldRgb.r, oldRgb.g, oldRgb.b);
        colorState = { 
            h: oldHsv.h / 360, 
            s: oldHsv.s / 100, 
            v: oldHsv.v / 100 
        };
        updateUI();
    };
	// --- Обработка ввода HEX ---
    ui.hex.addEventListener('input', (e) => {
        let val = e.target.value;
        
        // 1. Всегда держим решетку в начале
        if (!val.startsWith('#')) val = '#' + val.replace(/#/g, '');
        
        // 2. Ограничиваем только символами HEX и длиной 7 (с решеткой)
        val = '#' + val.slice(1, 7).replace(/[^0-9A-Fa-f]/g, '');
        e.target.value = val.toUpperCase();

        // 3. Если введено полное значение, обновляем палитру
        if (val.length === 7) {
            const rgb = hexToRgb(val);
            const newHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
            colorState = { h: newHsv.h / 360, s: newHsv.s / 100, v: newHsv.v / 100 };
            updateUI(true); // true, чтобы не перезаписывать значение в самом инпуте, пока мы пишем
        }
    });

    // Чтобы нельзя было удалить решетку через Backspace
    ui.hex.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.selectionStart === 1 && e.target.selectionEnd === 1) {
            e.preventDefault();
        }
    });

    // --- Обработка ввода RGB ---
    const updateFromRgbInputs = () => {
        let r = Math.min(255, Math.max(0, parseInt(ui.r.value) || 0));
        let g = Math.min(255, Math.max(0, parseInt(ui.g.value) || 0));
        let b = Math.min(255, Math.max(0, parseInt(ui.b.value) || 0));
        
        const newHsv = rgbToHsv(r, g, b);
        colorState = { h: newHsv.h / 360, s: newHsv.s / 100, v: newHsv.v / 100 };
        updateUI(true); 
    };

    [ui.r, ui.g, ui.b].forEach(input => {
        input.addEventListener('input', updateFromRgbInputs);
    });

    // Пипетка (адаптирована под ваш canvas)
    overlay.querySelector('#cp-pipette').onclick = () => {
        const mainCanvas = document.getElementById('main-canvas');
        if (!mainCanvas) return;
        
        const btn = overlay.querySelector('#cp-pipette');
        btn.classList.add('active');
        
        const pick = (ev) => {
            const r = mainCanvas.getBoundingClientRect();
            const x = (ev.clientX - r.left);
            const y = (ev.clientY - r.top);
            const p = ctx.getImageData(x, y, 1, 1).data;
            
            const newHsv = rgbToHsv(p[0], p[1], p[2]);
            colorState = { h: newHsv.h/360, s: newHsv.s/100, v: newHsv.v/100 };
            
            updateUI();
            btn.classList.remove('active');
            mainCanvas.style.cursor = 'crosshair';
            mainCanvas.removeEventListener('mousedown', pick, { capture: true });
        };
        
        mainCanvas.style.cursor = 'help';
        mainCanvas.addEventListener('mousedown', pick, { capture: true });
    };

    // Свотчи
    const renderSwatches = () => {
        ui.swatches.innerHTML = swatches.map((c, i) => `<div class="dyatlo-swatch ${c?'':'empty'}" data-idx="${i}" style="background:${c||''}"></div>`).join('');
        localStorage.setItem('itd_swatches', JSON.stringify(swatches));
    };

    ui.swatches.onclick = (e) => {
        const s = e.target.closest('.dyatlo-swatch');
        if (!s) return;
        const i = s.dataset.idx;
        if (e.shiftKey) {
            swatches[i] = null;
        } else if (!swatches[i]) {
            swatches[i] = state.color;
        } else {
            const rgb = hexToRgb(swatches[i]);
            const newHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
            colorState = { h: newHsv.h/360, s: newHsv.s/100, v: newHsv.v/100 };
        }
        renderSwatches(); 
        updateUI();
    };

	// Логика кнопки "Закрепить"
	const pinBtn = overlay.querySelector('#cp-pin');
	pinBtn.onclick = () => {
		state.palettePinned = !state.palettePinned;
		localStorage.setItem('itd_palette_pinned', state.palettePinned);
		pinBtn.classList.toggle('active', state.palettePinned);
	};
    overlay.querySelector('#cp-close').onclick = () => overlay.remove();

    renderSwatches();
    updateUI();
}
	function showConfirmDialog(message, confirmBtnText, isWarning, onConfirm) {
        const confirmOverlay = document.createElement('div');
        confirmOverlay.className = 'itd-confirm-overlay';
        
        // Кнопка подтверждения будет иметь разный цвет в зависимости от действия
        const confirmClass = isWarning ? 'itd-btn-confirm-yes' : 'itd-btn-confirm-save';
        
        confirmOverlay.innerHTML = `
            <div class="itd-confirm-modal">
                <div class="itd-confirm-text">${message}</div>
                <div class="itd-confirm-buttons">
                    <button class="itd-btn ${confirmClass}" id="confirm-yes">${confirmBtnText}</button>
                    <button class="itd-btn itd-btn-confirm-no" id="confirm-no">Нет</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmOverlay);

        confirmOverlay.querySelector('#confirm-yes').onclick = () => {
            confirmOverlay.remove();
            onConfirm();
        };
        confirmOverlay.querySelector('#confirm-no').onclick = () => {
            confirmOverlay.remove();
        };
    }
    function showSettingsDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'itd-confirm-overlay';
        overlay.innerHTML = `
            <div class="itd-confirm-modal" style="width: 420px; text-align: left; padding: 0; overflow: hidden;">
                <!-- Шапка -->
                <div class="itd-settings-header" style="padding: 20px 24px; margin-bottom: 0;">
                    <div class="itd-settings-title">Настройки</div>
                    <button class="itd-settings-close-x" id="settings-x">✕</button>
                </div>

                <!-- Верхняя линия -->
                <div class="itd-settings-divider"></div>

                <!-- Тело настроек -->
                <div class="itd-settings-body" style="padding: 16px 24px;">
                    <div class="itd-settings-item">
                        <span>Подтверждение при выходе и сохранении</span>
                        <label class="itd-switch">
                            <input type="checkbox" id="setting-confirm" ${state.showConfirmations ? 'checked' : ''}>
                            <span class="itd-slider"></span>
                        </label>
                    </div>
                    <!-- Тут можно добавлять новые блоки .itd-settings-item аналогично -->
                </div>

                <!-- Нижняя линия -->
                <div class="itd-settings-divider"></div>

                <!-- Футер -->
                <div class="itd-confirm-buttons" style="padding: 16px 24px; justify-content: flex-end;">
                    <button class="itd-btn itd-btn-confirm-no" id="settings-close" style="width: 100px;">Закрыть</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#settings-x').onclick = close;
        overlay.querySelector('#settings-close').onclick = close;
        
        const checkbox = overlay.querySelector('#setting-confirm');
        checkbox.onchange = (e) => {
            state.showConfirmations = e.target.checked;
            localStorage.setItem('itd_show_confirmations', e.target.checked);
        };
    }
	
	function openModal() {
        if (state.isOpen) return;
        state.isOpen = true;

		document.body.style.overflow = 'hidden';
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';

        const modalHtml = `
            <div class="itd-modal-overlay">
                <div class="itd-editor-container">
                    <div class="itd-toolbar">
                        <div class="itd-tool-group">
                            <button title="Кисть" class="itd-tool-btn active" data-tool="brush"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"></path><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"></path></svg></button>
                            <button title="Ластик" class="itd-tool-btn" data-tool="eraser"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg></button>
                            <button title="Линия" class="itd-tool-btn" data-tool="line"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"></line></svg></button>
                            <button title="Прямоугольник" class="itd-tool-btn" data-tool="rect"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg></button>
                            <button title="Круг" class="itd-tool-btn" data-tool="circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg></button>
                        </div>
                        <div class="itd-tool-group">
                            <button class="size-btn" data-size="2"><span class="size-dot" style="width:2px;height:2px"></span></button>
                            <button class="size-btn active" data-size="4"><span class="size-dot" style="width:4px;height:4px"></span></button>
                            <button class="size-btn" data-size="8"><span class="size-dot" style="width:8px;height:8px"></span></button>
                            <button class="size-btn" data-size="12"><span class="size-dot" style="width:12px;height:12px"></span></button>
                        </div>
                        <div class="itd-tool-group" id="color-palette">
                            <div class="color-dot active" style="background:#000000" data-color="#000000"></div>
                            <div class="color-dot" style="background:#FFFFFF; border: 1px solid #ddd" data-color="#FFFFFF"></div>
                            <div class="color-dot" style="background:#FF3B30" data-color="#FF3B30"></div>
                            <div class="color-dot" style="background:#34C759" data-color="#34C759"></div>
                            <div class="color-dot" style="background:#007AFF" data-color="#007AFF"></div>
                            <div id="itd-palette-btn" class="itd-palette-trigger" title="Расширенная палитра">
								<svg viewBox="0 0 24 24" width="16" height="16" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));">
								<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
								<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
								</svg>
							</div>
                        </div>
                        <div class="itd-tool-group">
                             <button title="Отменить" class="itd-tool-btn" id="btn-undo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg></button>
                             <button title="Повторить" class="itd-tool-btn" id="btn-redo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path></svg></button>
                             <button title="Очистить" class="itd-tool-btn" id="btn-clear"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button>
                        </div>
                    </div>
                    <div class="itd-canvas-area">
                        <div class="canvas-wrapper">
                            <canvas id="main-canvas" width="1100" height="450"></canvas>
                            <canvas id="overlay-canvas" width="1100" height="450"></canvas>
                        </div>
                    </div>
                    <div class="itd-footer">
                        <button class="itd-btn itd-btn-settings" title="Настройки">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </button>
                        <div style="flex-grow: 1;"></div>
                        <button class="itd-btn itd-btn-cancel">Отмена</button>
                        <button class="itd-btn itd-btn-save">Установить как баннер</button>
                    </div>
                </div>
            </div>
        `;

        const modalNode = document.createElement('div');
        modalNode.id = "itd-paint-modal";
        modalNode.innerHTML = modalHtml;
        document.body.appendChild(modalNode);

        initCanvasLogic();
        attachEvents(modalNode);
    }

    function initCanvasLogic() {
		canvas = document.getElementById('main-canvas');
		ctx = canvas.getContext('2d', { willReadFrequently: true });
		overlayCanvas = document.getElementById('overlay-canvas');
		oCtx = overlayCanvas.getContext('2d');
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		saveHistory();
	}

    function attachEvents(modal) {
		modal.querySelector('.itd-btn-settings').onclick = showSettingsDialog;
        modal.querySelector('.itd-btn-cancel').onclick = () => {
            const closeAll = () => {
                const cp = document.getElementById('dyatlo-color-panel-overlay');
                if (cp) cp.remove();
                modal.remove();
                state.isOpen = false;
                state.history = [];
                state.historyStep = -1;
                document.body.style.overflow = '';
                document.body.style.userSelect = '';
                document.body.style.touchAction = '';
            };

            if (state.showConfirmations) {
                showConfirmDialog("Вы уверены? Есть не сохраненные изменения.", "Да, выйти", true, closeAll);
            } else {
                closeAll();
            }
        };

        modal.querySelectorAll('.itd-tool-btn[data-tool]').forEach(btn => {
            btn.onclick = () => {
                modal.querySelectorAll('.itd-tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.tool = btn.dataset.tool;
            };
        });

        modal.querySelectorAll('.color-dot').forEach(dot => {
            dot.onclick = () => {
                modal.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
                dot.classList.add('active');
                state.color = dot.dataset.color;
            };
        });

        modal.querySelector('#itd-palette-btn').onclick = (e) => {
            toggleColorPanel(e.currentTarget);
        };

        modal.querySelectorAll('.size-btn').forEach(btn => {
            btn.onclick = () => {
                modal.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.lineWidth = parseInt(btn.dataset.size);
            };
        });

        modal.querySelector('#btn-undo').onclick = undo;
        modal.querySelector('#btn-redo').onclick = redo;
        modal.querySelector('#btn-clear').onclick = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			saveHistory();
		};

        const handleStart = (e) => {
            const rect = canvas.getBoundingClientRect();
			if (!state.palettePinned) {
				const cp = document.getElementById('dyatlo-color-panel-overlay');
				if (cp) cp.remove();
			}
            state.isDrawing = true;
            state.startX = e.clientX - rect.left;
            state.startY = e.clientY - rect.top;
            if (e.shiftKey) {
                const rgb = state.color.match(/[A-Za-z0-9]{2}/g).map(h => parseInt(h, 16));
                floodFill(Math.floor(state.startX), Math.floor(state.startY), rgb);
                state.isDrawing = false; return;
            }
            if (state.tool === 'brush' || state.tool === 'eraser') {
                ctx.beginPath();
                ctx.moveTo(state.startX, state.startY);
                ctx.lineWidth = state.lineWidth;
                if (state.tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = "rgba(0,0,0,1)";
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = state.color;
                }
            } else {
                ctx.globalCompositeOperation = 'source-over';
                snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
            }
        };

        const handleMove = (e) => {
            if (!state.isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (state.tool === 'brush' || state.tool === 'eraser') {
                ctx.lineTo(x, y); ctx.stroke();
            } else {
                ctx.putImageData(snapshot, 0, 0);
				ctx.globalCompositeOperation = 'source-over';
                ctx.beginPath(); ctx.strokeStyle = state.color; ctx.lineWidth = state.lineWidth;
                if (state.tool === 'line') { ctx.moveTo(state.startX, state.startY); ctx.lineTo(x, y); }
                else if (state.tool === 'rect') ctx.strokeRect(state.startX, state.startY, x - state.startX, y - state.startY);
                else if (state.tool === 'circle') {
                    let r = Math.sqrt(Math.pow(x - state.startX, 2) + Math.pow(y - state.startY, 2));
                    ctx.arc(state.startX, state.startY, r, 0, 2 * Math.PI);
                }
                ctx.stroke();
            }
        };

        const handleEnd = () => { if (state.isDrawing) { state.isDrawing = false; saveHistory(); } };
        canvas.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);

        modal.querySelector('.itd-btn-save').onclick = (e) => {
            const saveLogic = async () => {
                const btn = modal.querySelector('.itd-btn-save');
                const originalText = btn.innerText;
                btn.disabled = true;
                btn.innerText = "Загрузка...";
                
                canvas.toBlob(async (blob) => {
                    try {
                        await uploadToAPI(blob);
                        btn.innerText = "Готово!";
                        setTimeout(() => { location.reload(); }, 500);
                    } catch (err) {
                        alert("Ошибка загрузки: " + err.message);
                        btn.disabled = false;
                        btn.innerText = originalText;
                    }
                }, 'image/png');
            };

            if (state.showConfirmations) {
                showConfirmDialog("Вы уверены что хотите сохранить?", "Да, сохранить", false, saveLogic);
            } else {
                saveLogic();
            }
        };
    }

    // --- ОБНОВЛЕННАЯ ЛОГИКА ВСТАВКИ КНОПКИ (ЛЕВЕЕ ОРИГИНАЛА) ---
    function injectLauncher() {
        if (document.getElementById('itd-draw-trigger')) return;

        // Ищем оригинальную кнопку рисования
        const originalBtn = document.querySelector('button[title="Нарисовать баннер"]');

        if (originalBtn) {
            // Создаем нашу кнопку на базе оригинальной
            const myBtn = originalBtn.cloneNode(true);
            myBtn.id = 'itd-draw-trigger';
            myBtn.classList.add('itd-custom-draw-btn');
            myBtn.title = "ITD ART — Новый редактор";

            // Вставляем нашу кнопку СЛЕВА от оригинальной
            originalBtn.before(myBtn);

            myBtn.onclick = (e) => {
                e.preventDefault();
                openModal();
            };
        }
    }

    const observer = new MutationObserver(injectLauncher);
    observer.observe(document.body, { childList: true, subtree: true });

    injectLauncher();
    console.log("%c ITD+ Drawing Pro Loaded ", "background: #007aff; color: #fff; padding: 5px;");

})();
