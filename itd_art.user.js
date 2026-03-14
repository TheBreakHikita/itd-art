// ==UserScript==
// @name         ITD ART
// @namespace    http://tampermonkey.net/
// @version      2.3
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
		showConfirmations: localStorage.getItem('itd_show_confirmations') !== 'false',
		dynamicCursor: localStorage.getItem('itd_dynamic_cursor') !== 'false',
		isPreview: false,
		isCropping: false,
        cropImg: null,
        cropParams: { x: 0, y: 0, w: 0, h: 0, ratio: true },
		autoSaveEnabled: localStorage.getItem('itd_auto_save') !== 'false',
        autoSaveTimer: null,
		autoSaveInterval: parseInt(localStorage.getItem('itd_auto_save_interval')) || 60,
		saveIndicatorEnabled: localStorage.getItem('itd_save_indicator') !== 'false',
    };

    let canvas, ctx, overlayCanvas, oCtx, snapshot;

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
			overflow: hidden;
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
		/* Стили для режима предпросмотра */
        .itd-modal-overlay.preview-active {
            background: rgba(0,0,0,0.5); /* Затемняем сайт чуть меньше */
            backdrop-filter: none;
        }
        .preview-active .itd-editor-container {
            background: transparent;
            border: none;
            box-shadow: none;
            position: absolute;
            transition: all 0.3s ease;
        }
        .preview-active .itd-toolbar, 
        .preview-active .itd-canvas-area {
            padding: 0;
            background: transparent;
        }
        .preview-active .itd-toolbar { display: none; }
        .preview-active-site-interface {
            position: relative !important;
            z-index: 1000001 !important;
            pointer-events: none !important; /* Чтобы клики проходили сквозь текст на холст */
        }
        /* Отключаем клики для всего интерфейса в режиме превью */
        .preview-active-site-interface * {
            pointer-events: none !important;
        }
        /* Если нужно, чтобы текст всё же можно было выделить, 
           но кнопки (верификация, редактировать, подписки) не нажимались: */
        .preview-active-site-interface .WsNIl9yN, 
        .preview-active-site-interface .hSN99swS {
            pointer-events: none !important;
            cursor: default !important;
            opacity: 0.8; /* Немного приглушим их визуально */
        }
        .preview-active .itd-footer {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #1c1c1e; /* Темный фон как в редакторе */
            border: 1px solid #3a3a3c;
            border-radius: 16px;
            padding: 12px 20px;
            display: flex;
            gap: 12px;
            align-items: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            z-index: 1000002;
            width: auto;
        }
        /* Делаем кнопки в превью чуть компактнее */
        .preview-active .itd-btn {
            padding: 8px 16px;
        }
        .itd-btn-preview.active {
            background: #ff9500;
            color: white;
            box-shadow: 0 0 15px rgba(255, 149, 0, 0.4);
        }
        .preview-active .canvas-wrapper {
            box-shadow: 0 0 20px rgba(0,0,0,0.8);
        }
        .itd-brush-cursor {
            position: fixed;
            pointer-events: none;
			background: white;
            border: 1px solid rgba(255, 255, 255, 0.8);
            box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
            border-radius: 50%;
            z-index: 2000001;
            display: none;
            transform: translate(-50%, -50%);
            mix-blend-mode: difference;
        }
        #main-canvas {
            cursor: none !important; /* Скрываем стандартный курсор над холстом */
        }
        .itd-size-dynamic {
            width: 36px; height: 36px; 
            border: 1px solid #3a3a3c; 
            border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            color: #ebebf5; font-size: 12px; font-weight: 700; 
            cursor: pointer; transition: 0.2s; background: #2c2c2e;
            position: relative;
            box-sizing: border-box;
        }
        .itd-size-dynamic.active { border-color: #0a84ff; color: #0a84ff; background: rgba(0, 122, 255, 0.1); }
        .itd-size-dynamic:hover { background: #3a3a3c; border-color: #48484a; }

        /* Новое современное окно */
        .itd-size-popup {
            position: fixed;
            background: rgba(28, 28, 30, 0.95);
            backdrop-filter: blur(15px);
            border: 1px solid #48484a;
            padding: 16px;
            border-radius: 14px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.6);
            display: none; 
            flex-direction: column;
            align-items: center;
            gap: 12px;
            z-index: 2000005;
            pointer-events: all;
            animation: itdFadeIn 0.2s ease-out;
        }
        @keyframes itdFadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .itd-size-popup.show { display: flex; }
        
        /* Заголовок в окошке */
        .itd-size-popup-header {
            display: flex; justify-content: space-between; width: 100%;
            color: #8e8e93; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
        }

        /* Контейнер управления (минус, слайдер, плюс) */
        .itd-size-controls { display: flex; align-items: center; gap: 10px; }
        .itd-size-step-btn {
            width: 28px; height: 28px; border-radius: 6px; border: none;
            background: #3a3a3c; color: white; cursor: pointer;
            display: flex; align-items: center; justify-content: center; font-size: 16px; transition: 0.2s;
        }
        .itd-size-step-btn:hover { background: #48484a; }
        .itd-size-step-btn:active { transform: scale(0.9); }

        /* Ползунок */
        .itd-range-input {
            -webkit-appearance: none;
            width: 130px; height: 4px;
            background: #48484a; border-radius: 2px; outline: none;
        }
        .itd-range-input::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 18px; height: 18px;
            background: #0a84ff; border-radius: 50%;
            box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid #fff; cursor: pointer;
        }
        .itd-range-input::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px; height: 16px;
            background: #0a84ff;
            border-radius: 50%;
            box-shadow: 0 0 5px rgba(0,0,0,0.3);
        }
        .itd-editor-container.cropping,
        .canvas-wrapper.cropping {
            overflow: visible !important;
        }
        
        .itd-crop-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: none; z-index: 50;
        }
        .itd-crop-overlay.active { display: block; }

        /* 1. Темный фон ВОКРУГ холста (box-shadow не пускает тень внутрь холста) */
        .itd-crop-backdrop {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.85);
            pointer-events: none; z-index: 1;
        }
        
        /* 2. Картинка (будет летать над тёмным фоном, но ПОД пунктиром) */
        .itd-crop-canvas-wrapper {
            position: absolute; cursor: move; z-index: 2;
            border: none; /* Убрали старую рамку у самой картинки */
        }
        
        /* 3. Синий пунктир строго по контуру холста (ПОВЕРХ картинки) */
        .itd-crop-dashed {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            border: 2px dashed #0a84ff;
            pointer-events: none; z-index: 3;
        }

        /* Ручки масштабирования (z-index 15, чтобы всегда можно было ухватить) */
        .crop-handle {
            position: absolute; width: 14px; height: 14px; background: #0a84ff;
            border: 2px solid #fff; border-radius: 50%; z-index: 15;
        }
        .handle-nw { left: -7px; top: -7px; cursor: nwse-resize; }
        .handle-ne { right: -7px; top: -7px; cursor: nesw-resize; }
        .handle-sw { left: -7px; bottom: -7px; cursor: nesw-resize; }
        .handle-se { right: -7px; bottom: -7px; cursor: nwse-resize; }

        .itd-crop-controls {
            position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: #1c1c1e; padding: 10px 16px; border-radius: 14px;
            display: flex; align-items: center; gap: 12px; border: 1px solid #3a3a3c;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8); z-index: 1000; min-width: 400px; justify-content: space-between;
        }
        .itd-crop-label { color: #ebebf5; font-size: 13px; display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; padding-right: 12px; border-right: 1px solid #3a3a3c; height: 30px; }
        .itd-crop-label input { width: 16px; height: 16px; cursor: pointer; }
        .itd-crop-btn-group { display: flex; gap: 8px; }
        .itd-crop-controls .itd-btn { padding: 8px 16px; font-size: 13px; height: 36px; display: flex; align-items: center; justify-content: center; }
        .handle-se { right: -7px; bottom: -7px; cursor: nwse-resize; }
		.itd-archive-list {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            max-height: 400px;
            overflow-y: auto;
            padding: 10px;
        }
        .itd-archive-item {
            background: #2c2c2e;
            border: 1px solid #3a3a3c;
            border-radius: 8px;
            padding: 8px;
            cursor: pointer;
            transition: 0.2s;
        }
        .itd-archive-item:hover { border-color: #0a84ff; background: #3a3a3c; }
        .itd-archive-item img { width: 100%; border-radius: 4px; margin-bottom: 6px; background: #fff; }
        .itd-archive-item span { color: #8e8e93; font-size: 11px; display: block; text-align: center; }
		/* Анимация раскрытия интервала автосохранения */
		.itd-settings-collapsible {
			max-height: 0;
			overflow: hidden;
			transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
			opacity: 0;
			background: #242426; /* Чуть темнее основного фона для эффекта вложенности */
			border-radius: 0 0 10px 10px;
			margin-top: -8px;
			margin-bottom: 8px;
		}
		.itd-settings-collapsible.expanded {
			max-height: 120px; /* Достаточно для одной строки */
			opacity: 1;
			padding: 12px 16px;
			margin-bottom: 8px;
		}
		/* Скругление углов родителя, когда открыто подменю */
		.itd-settings-item.has-sub.expanded {
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
			margin-bottom: 0;
		}
		.itd-archive-item { position: relative; }
        .itd-archive-download-btn {
            position: absolute; top: 8px; right: 8px;
            background: rgba(0,0,0,0.6); color: #fff;
            border: none; border-radius: 6px; padding: 6px;
            cursor: pointer; opacity: 0; transition: 0.2s;
            display: flex; align-items: center; justify-content: center;
        }
        .itd-archive-item:hover .itd-archive-download-btn { opacity: 1; }
        .itd-archive-download-btn:hover { background: #0a84ff; }
        .itd-btn-danger { background: #3a3a3c; color: #ff3b30; display: flex; align-items: center; gap: 8px; }
        .itd-btn-danger:hover { background: #ff3b30; color: #fff; }
		@keyframes itd-save-flash {
			0% { background: #3a3a3c; }
			50% { background: rgba(255, 214, 10, 0.3); }
			100% { background: #3a3a3c; }
		}
		.itd-save-anim {
			animation: itd-save-flash 1.5s ease-in-out;
		}
        .itd-archive-item.pinned {
            border: 2px solid #ffd60a !important;
            box-shadow: 0 0 15px rgba(255, 214, 10, 0.3);
        }
        .itd-archive-pin-btn {
            position: absolute; top: 8px; left: 8px;
            background: rgba(0,0,0,0.6); color: #8e8e93;
            border: none; border-radius: 6px; padding: 6px;
            cursor: pointer; opacity: 1; transition: 0.3s;
            display: flex; align-items: center; justify-content: center;
            z-index: 10;
        }
        .itd-archive-item.pinned .itd-archive-pin-btn {
            color: #ffd60a;
            background: rgba(0,0,0,0.8);
        }
        .itd-archive-item.pinned .itd-archive-pin-btn svg {
            fill: #ffd60a; /* Заливка звезды цветом */
            filter: drop-shadow(0 0 5px rgba(255, 214, 10, 0.5));
            transform: scale(1.1);
        }
        .itd-archive-pin-btn svg {
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .itd-archive-pin-btn:hover { background: #3a3a3c; color: #fff; }
        .itd-archive-pin-btn:hover { background: #3a3a3c; color: #fff; }
		/* Оверлей загрузки */
        .itd-loading-blocker {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(2px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 2000000;
            border-radius: 12px;
            color: #fff;
            gap: 15px;
            cursor: wait;
        }
        .itd-loading-spinner {
            width: 40px; height: 40px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top: 4px solid #0a84ff;
            border-radius: 50%;
            animation: itd-spin 1s linear infinite;
        }
        @keyframes itd-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

	// --- ЛОГИКА АВТОСОХРАНЕНИЯ (IndexedDB) ---
    const DB_NAME = 'ITD_ART_ARCHIVE';
    const STORE_NAME = 'autosaves';

    function initDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
        });
    }

    async function saveToArchive() {
        if (!state.isOpen || !canvas) return;
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const allRecords = await new Promise(r => {
            const req = store.getAll();
            req.onsuccess = () => r(req.result);
        });

        if (allRecords.length >= 10) {
            // Ищем незакрепленные, чтобы удалить самое старое из них
            const unpinned = allRecords.filter(r => !r.isPinned);
            if (unpinned.length > 0) {
                store.delete(unpinned[0].id);
            } else {
                return; // Если всё закреплено, не сохраняем (лимит 10)
            }
        }

        const data = {
            image: canvas.toDataURL('image/png'),
            date: new Date().toLocaleString(),
            isPinned: false 
        };
        store.add(data);
        
        if (state.saveIndicatorEnabled) {
            const archiveBtn = document.querySelector('.itd-btn-archive');
            if (archiveBtn) {
                archiveBtn.classList.remove('itd-save-anim');
                void archiveBtn.offsetWidth;
                archiveBtn.classList.add('itd-save-anim');
            }
        }
    }

    async function getArchive() {
        const db = await initDB();
        return new Promise(r => {
            const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
            req.onsuccess = () => r(req.result.reverse()); // Сначала новые
        });
    }
	
	async function clearArchive() {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const allRecords = await new Promise(r => {
            const req = store.getAll();
            req.onsuccess = () => r(req.result);
        });

        allRecords.forEach(record => {
            if (!record.isPinned) store.delete(record.id);
        });
        
        return new Promise(r => { transaction.oncomplete = () => r(); });
    }

    function startAutoSaveTimer() {
    if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
    if (state.autoSaveEnabled) {
        state.autoSaveTimer = setInterval(() => {
            if (state.isOpen) saveToArchive();
        }, state.autoSaveInterval * 1000); // Используем значение из настроек (в мс)
    }
}

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
    // Пипетка (адаптирована под ваш canvas)
    overlay.querySelector('#cp-pipette').onclick = () => {
        const mainCanvas = document.getElementById('main-canvas');
        const brushCursor = document.getElementById('itd-brush-cursor'); // Находим наш круглый курсор
        if (!mainCanvas) return;
        
        const btn = overlay.querySelector('#cp-pipette');
        btn.classList.add('active');
        
        // 1. ПРИ АКТИВАЦИИ: Скрываем круг кисти и ставим стандартный крестик
        if (brushCursor) brushCursor.style.display = 'none';
        mainCanvas.style.setProperty('cursor', 'crosshair', 'important');
        
        const pick = (ev) => {
            const r = mainCanvas.getBoundingClientRect();
            const x = (ev.clientX - r.left);
            const y = (ev.clientY - r.top);
            const p = ctx.getImageData(x, y, 1, 1).data;
            
            const newHsv = rgbToHsv(p[0], p[1], p[2]);
            colorState = { h: newHsv.h/360, s: newHsv.s/100, v: newHsv.v/100 };
            
            updateUI();
            btn.classList.remove('active');

            // 2. ПОСЛЕ ВЫБОРА: Возвращаем настройки курсора в зависимости от текущего инструмента
            if (state.dynamicCursor && state.tool !== 'fill') {
                mainCanvas.style.setProperty('cursor', 'none', 'important');
                if (brushCursor) brushCursor.style.display = 'block';
            } else {
                mainCanvas.style.setProperty('cursor', 'crosshair', 'important');
            }

            mainCanvas.removeEventListener('mousedown', pick, { capture: true });
        };
        
        // Удаляем старую строку mainCanvas.style.cursor = 'help';
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
                <div class="itd-settings-header" style="padding: 20px 24px; margin-bottom: 0;">
                    <div class="itd-settings-title">Настройки</div>
                    <button class="itd-settings-close-x" id="settings-x">✕</button>
                </div>
                <div class="itd-settings-divider"></div>
                <div class="itd-settings-body" style="padding: 16px 24px;">
                    <div class="itd-settings-item">
                        <span>Подтверждение при выходе и сохранении</span>
                        <label class="itd-switch">
                            <input type="checkbox" id="setting-confirm" ${state.showConfirmations ? 'checked' : ''}>
                            <span class="itd-slider"></span>
                        </label>
                    </div>
                    <div class="itd-settings-item">
                        <span>Динамический курсор</span>
                        <label class="itd-switch">
                            <input type="checkbox" id="setting-cursor" ${state.dynamicCursor ? 'checked' : ''}>
                            <span class="itd-slider"></span>
                        </label>
                    </div>
				<div class="itd-settings-item has-sub ${state.autoSaveEnabled ? 'expanded' : ''}" id="autosave-parent">
					<span>Авто-сохранение рисунка</span>
					<label class="itd-switch">
						<input type="checkbox" id="setting-autosave" ${state.autoSaveEnabled ? 'checked' : ''}>
						<span class="itd-slider"></span>
					</label>
				</div>
				<div class="itd-settings-collapsible ${state.autoSaveEnabled ? 'expanded' : ''}" id="autosave-child">
					<div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
						<span style="font-size: 13px; color: #8e8e93;">Интервал сохранения:</span>
						<div style="display: flex; align-items: center; gap: 8px;">
							<input type="number" id="setting-autosave-interval" class="dyatlo-input-tiny" 
								   style="width: 65px; background: rgba(0,0,0,0.5);" 
								   min="5" max="3600" value="${state.autoSaveInterval}">
							<span style="font-size: 12px; color: #8e8e93;">сек</span>
						</div>
					</div>
					<div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
					<span style="font-size: 13px; color: #8e8e93;">Индикатор сохранения:</span>
					<label class="itd-switch">
						<input type="checkbox" id="setting-save-indicator" ${state.saveIndicatorEnabled ? 'checked' : ''}>
						<span class="itd-slider"></span>
					</label>
				</div>
				</div>
                </div>
                <div class="itd-settings-divider"></div>
                <div class="itd-confirm-buttons" style="padding: 16px 24px; justify-content: flex-end;">
                    <button class="itd-btn itd-btn-confirm-no" id="settings-close" style="width: 100px;">Закрыть</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#settings-x').onclick = close;
        overlay.querySelector('#settings-close').onclick = close;
        
        // 1. Подтверждения
        overlay.querySelector('#setting-confirm').onchange = (e) => {
            state.showConfirmations = e.target.checked;
            localStorage.setItem('itd_show_confirmations', e.target.checked);
        };

        // 2. Динамический курсор
        overlay.querySelector('#setting-cursor').onchange = (e) => {
            state.dynamicCursor = e.target.checked;
            localStorage.setItem('itd_dynamic_cursor', e.target.checked);

            const brushCursor = document.getElementById('itd-brush-cursor');
            const mainCanvas = document.getElementById('main-canvas');
            if (!mainCanvas) return;

            if (state.dynamicCursor) {
                if (state.tool !== 'fill') {
                    mainCanvas.style.setProperty('cursor', 'none', 'important');
                    if (brushCursor) brushCursor.style.display = 'block';
                }
            } else {
                mainCanvas.style.setProperty('cursor', 'crosshair', 'important');
                if (brushCursor) brushCursor.style.display = 'none';
            }
        };

        // 3. Логика автосохранения (Переключатель + Интервал)
		const autoSaveCheck = overlay.querySelector('#setting-autosave');
		const autoSaveChild = overlay.querySelector('#autosave-child');
		const autoSaveParent = overlay.querySelector('#autosave-parent');
		const intervalInput = overlay.querySelector('#setting-autosave-interval');

		autoSaveCheck.onchange = (e) => {
			const isChecked = e.target.checked;
			state.autoSaveEnabled = isChecked;
			localStorage.setItem('itd_auto_save', isChecked);
			
			// Управление анимацией
			if (isChecked) {
				autoSaveChild.classList.add('expanded');
				autoSaveParent.classList.add('expanded');
			} else {
				autoSaveChild.classList.remove('expanded');
				autoSaveParent.classList.remove('expanded');
			}
			
			startAutoSaveTimer();
		};

		intervalInput.onchange = (e) => {
			let val = parseInt(e.target.value);
			
			// Валидация: минимум 5, максимум 3600
			if (isNaN(val) || val < 5) val = 5;
			if (val > 3600) val = 3600;
			
			e.target.value = val;
			state.autoSaveInterval = val;
			localStorage.setItem('itd_auto_save_interval', val);
			
			// Перезапуск таймера с новым временем, если функция включена
			if (state.autoSaveEnabled) {
				startAutoSaveTimer();
			}
		};
		overlay.querySelector('#setting-save-indicator').onchange = (e) => {
            state.saveIndicatorEnabled = e.target.checked;
            localStorage.setItem('itd_save_indicator', e.target.checked);
        };
    }
	
	async function showArchiveDialog() {
        const saves = await getArchive();
        const overlay = document.createElement('div');
        overlay.className = 'itd-confirm-overlay';
        overlay.innerHTML = `
            <div class="itd-confirm-modal" style="width: 500px; text-align: left; padding: 0;">
                <div class="itd-settings-header" style="padding: 20px 24px; margin-bottom: 0;">
                    <div class="itd-settings-title">История автосохранений</div>
                    <button class="itd-settings-close-x" id="archive-x">✕</button>
                </div>
                <div class="itd-settings-divider"></div>
                <div class="itd-archive-list">
                    ${saves.length ? saves.map(s => `
                        <div class="itd-archive-item ${s.isPinned ? 'pinned' : ''}" data-id="${s.id}">
                            <img src="${s.image}">
                            
                            <button class="itd-archive-pin-btn" data-id="${s.id}" title="${s.isPinned ? 'Убрать из избранного' : 'Добавить в избранное'}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                            </button>

                            <button class="itd-archive-download-btn" data-img="${s.image}" title="Скачать на ПК">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </button>
                            <span>${s.date}</span>
                        </div>
                    `).join('') : '<div style="color:#666; grid-column: span 2; text-align:center; padding: 40px;">Записей пока нет...</div>'}
                </div>
                <div class="itd-settings-divider"></div>
                <div class="itd-confirm-buttons" style="padding: 16px 24px; display: flex; justify-content: space-between; align-items: center;">
                    <button class="itd-btn itd-btn-danger" id="archive-clear-all" title="Очистить всё (кроме избранных)" style="width: 42px; height: 42px; padding: 0; display: flex; align-items: center; justify-content: center; ${!saves.length ? 'display:none' : ''}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                    <div style="display: flex; gap: 10px;">
                        <button class="itd-btn" id="archive-manual-save" style="background: #007AFF; color: #fff; display: flex; align-items: center; gap: 8px; padding: 0 20px; height: 42px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="12" y1="18" x2="12" y2="12"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            <span style="font-weight: 600;">Сохранить холст</span>
                        </button>
                        <button class="itd-btn itd-btn-confirm-no" id="archive-close" style="height: 42px; padding: 0 20px;">Закрыть</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#archive-x').onclick = overlay.querySelector('#archive-close').onclick = close;

        // Восстановление на холст
        overlay.querySelectorAll('.itd-archive-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.closest('button')) return;
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    saveHistory();
                    close();
                };
                img.src = item.querySelector('img').src;
            };
        });

        // Скачивание
        overlay.querySelectorAll('.itd-archive-download-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.download = `itd-art-save-${Date.now()}.png`;
                link.href = btn.dataset.img;
                link.click();
            };
        });

        // Кнопка избранного (скрепка)
        overlay.querySelectorAll('.itd-archive-pin-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const db = await initDB();
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const record = await new Promise(r => {
                    const req = store.get(id);
                    req.onsuccess = () => r(req.result);
                });
                if (record) {
                    record.isPinned = !record.isPinned;
                    store.put(record);
                    transaction.oncomplete = () => {
                        overlay.remove();
                        showArchiveDialog();
                    };
                }
            };
        });

        // Очистка
        overlay.querySelector('#archive-clear-all').onclick = () => {
            showConfirmDialog("Удалить все незакрепленные сохранения?", "Да, удалить", true, async () => {
                await clearArchive();
                overlay.remove();
                showArchiveDialog();
            });
        };

        // Ручное сохранение
        overlay.querySelector('#archive-manual-save').onclick = async () => {
            await saveToArchive();
            overlay.remove();
            showArchiveDialog();
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
							<button title="Заливка" class="itd-tool-btn" data-tool="fill">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"></path>
									<path d="m5 2 5 5"></path>
									<path d="M2 13h15"></path>
									<path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"></path>
								</svg>
							</button>
						</div>
                        <div class="itd-tool-group" style="position: relative;">
                            <button class="size-btn" data-size="2"><span class="size-dot" style="width:2px;height:2px"></span></button>
                            <button class="size-btn active" data-size="4"><span class="size-dot" style="width:4px;height:4px"></span></button>
                            <button class="size-btn" data-size="8"><span class="size-dot" style="width:8px;height:8px"></span></button>
                            <button class="size-btn" data-size="12"><span class="size-dot" style="width:12px;height:12px"></span></button>
                            <div class="itd-size-dynamic" id="itd-size-trigger" title="Настроить размер">
                                <span id="itd-size-val">4</span>
                                <div class="itd-size-popup" id="itd-size-pop">
                                    <div class="itd-size-popup-header">
                                        <span>Размер</span>
                                        <b id="itd-pop-val" style="color:#0a84ff">4</b>
                                    </div>
                                    <div class="itd-size-controls">
                                        <button class="itd-size-step-btn" id="itd-size-minus">−</button>
                                        <input type="range" class="itd-range-input" id="itd-size-slider" min="1" max="100" value="4">
                                        <button class="itd-size-step-btn" id="itd-size-plus">+</button>
                                    </div>
                                </div>
                            </div>
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
                        <div class="itd-tool-group" style="border: none; padding-left: 12px;">
                             <button title="Загрузить картинку" class="itd-tool-btn" id="btn-upload">
                                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                     <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                     <polyline points="17 8 12 3 7 8"></polyline>
                                     <line x1="12" y1="3" x2="12" y2="15"></line>
                                 </svg>
                             </button>
                             <input type="file" id="itd-file-input" style="display:none" accept="image/*">
                        </div>
                    </div>
                    <div class="itd-canvas-area">
                        <div class="canvas-wrapper">
                            <canvas id="main-canvas" width="1100" height="450"></canvas>
                            <canvas id="overlay-canvas" width="1100" height="450"></canvas>
							<div id="itd-crop-layer" class="itd-crop-overlay">
                                <div class="itd-crop-backdrop"></div>
                                <div class="itd-crop-dashed"></div>
                                <div class="itd-crop-controls">
                                    <label class="itd-crop-label">
                                        <input type="checkbox" id="crop-prop" checked>
                                        <span>Сохранять пропорции</span>
                                    </label>
                                    <div class="itd-crop-btn-group">
                                        <button class="itd-btn itd-btn-cancel" id="crop-cancel">Отмена</button>
                                        <button class="itd-btn itd-btn-save" id="crop-confirm">Добавить на холст</button>
                                    </div>
                                </div>
                            </div>
                    </div>
					</div>
                    <div class="itd-footer">
                        <button class="itd-btn itd-btn-settings" title="Настройки">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </button>
						<button class="itd-btn itd-btn-settings itd-btn-preview" title="Предпросмотр на сайте">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
						<button class="itd-btn itd-btn-settings itd-btn-archive" title="История сохранений">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"></path><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"></path></svg>
                        </button>
                        <div style="flex-grow: 1;"></div>
                        <button class="itd-btn itd-btn-cancel" id="itd-btn-footer-cancel">Отмена</button>
						<button class="itd-btn itd-btn-save" id="itd-btn-footer-save">Установить как баннер</button>
                    </div>
                </div>
            </div>
        `;

        const modalNode = document.createElement('div');
        modalNode.id = "itd-paint-modal";
        modalNode.innerHTML = modalHtml;
        document.body.appendChild(modalNode);

        // 1. Сначала создаем курсор
        let cursor = document.getElementById('itd-brush-cursor');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'itd-brush-cursor';
            cursor.className = 'itd-brush-cursor';
            document.body.appendChild(cursor);
        }

        // 2. Только потом инициализируем логику и события
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

	function togglePreviewMode(modal) {
        const overlay = modal.querySelector('.itd-modal-overlay');
        const container = modal.querySelector('.itd-editor-container');
        const bannerImg = document.querySelector('.BLErSWUX img'); 
        const profileInfo = document.querySelector('.-D3fn7RS');
        const previewBtn = modal.querySelector('.itd-btn-preview');
        const spacer = modal.querySelector('.itd-footer div[style*="flex-grow"]'); // Находим распорку здесь

        state.isPreview = !state.isPreview;

        if (state.isPreview && bannerImg) {
            const rect = bannerImg.getBoundingClientRect();
            
            overlay.classList.add('preview-active');
            previewBtn.classList.add('active');
            
            container.dataset.oldStyle = container.getAttribute('style') || '';
            
            container.style.position = 'fixed';
            container.style.top = rect.top + 'px';
            container.style.left = rect.left + 'px';
            container.style.width = rect.width + 'px';
            container.style.height = rect.height + 'px';
            container.style.zIndex = '1000000';

            bannerImg.style.opacity = '0';

            if (profileInfo) {
                profileInfo.classList.add('preview-active-site-interface');
            }
            
            const cp = document.getElementById('dyatlo-color-panel-overlay');
            if (cp && !state.palettePinned) cp.remove();

        } else {
            // ЛОГИКА ВЫХОДА ИЗ ПРЕДПРОСМОТРА
            overlay.classList.remove('preview-active');
            previewBtn.classList.remove('active');
            container.setAttribute('style', container.dataset.oldStyle || '');

            if (bannerImg) bannerImg.style.opacity = '1';

            if (profileInfo) {
                profileInfo.classList.remove('preview-active-site-interface');
            }
        }

        // ЭТА СТРОКА ТЕПЕРЬ ВНЕ УСЛОВИЯ: она работает и на вход, и на выход
        if (spacer) spacer.style.display = state.isPreview ? 'none' : 'block';
    }

	function updateCropUI() {
        const layer = document.getElementById('itd-crop-layer');
        let wrapper = layer.querySelector('.itd-crop-canvas-wrapper');
        
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'itd-crop-canvas-wrapper';
            layer.appendChild(wrapper);
        }

        // Вставляем ручки и холст только 1 раз
        if (!wrapper.querySelector('.handle-nw')) {
            wrapper.innerHTML = `
                <div class="crop-handle handle-nw" data-handle="nw"></div>
                <div class="crop-handle handle-ne" data-handle="ne"></div>
                <div class="crop-handle handle-sw" data-handle="sw"></div>
                <div class="crop-handle handle-se" data-handle="se"></div>
                <canvas></canvas>
            `;
        }

        const p = state.cropParams;
        wrapper.style.left = p.x + 'px';
        wrapper.style.top = p.y + 'px';
        wrapper.style.width = p.w + 'px';
        wrapper.style.height = p.h + 'px';
        
        let tempCanvas = wrapper.querySelector('canvas');
        tempCanvas.width = p.w;
        tempCanvas.height = p.h;
        tempCanvas.style.width = '100%';
        tempCanvas.style.height = '100%';
        tempCanvas.style.display = 'block';
        
        const tCtx = tempCanvas.getContext('2d');
        tCtx.imageSmoothingEnabled = true;
        tCtx.imageSmoothingQuality = 'high';
        tCtx.drawImage(state.cropImg, 0, 0, p.w, p.h);
	}

    function attachEvents(modal) {
		modal.querySelector('.itd-btn-archive').onclick = showArchiveDialog;
        startAutoSaveTimer(); // Запускаем цикл при открытии редактора
        modal.querySelector('.itd-btn-settings').onclick = showSettingsDialog;
        modal.querySelector('.itd-btn-preview').onclick = () => togglePreviewMode(modal);
        modal.querySelector('#itd-btn-footer-cancel').onclick = () => {
            const closeAll = () => {
                const brushCursor = document.getElementById('itd-brush-cursor');
                if (brushCursor) brushCursor.remove();
				if (state.autoSaveTimer) clearInterval(state.autoSaveTimer);
                if (state.isPreview) {
                    const bannerImg = document.querySelector('.BLErSWUX img');
                    const profileInfo = document.querySelector('.-D3fn7RS');
                    if (bannerImg) bannerImg.style.opacity = '1';
                    if (profileInfo) profileInfo.classList.remove('preview-active-site-interface');
                    state.isPreview = false;
                }
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

                const brushCursor = document.getElementById('itd-brush-cursor');
                const mainCanvas = document.getElementById('main-canvas');

                if (state.tool === 'fill') {
                    if (brushCursor) brushCursor.style.display = 'none';
                    mainCanvas.style.setProperty('cursor', 'crosshair', 'important');
                } else {
                    if (state.dynamicCursor) {
                        mainCanvas.style.setProperty('cursor', 'none', 'important');
                        if (brushCursor) brushCursor.style.display = 'block';
                    } else {
                        mainCanvas.style.setProperty('cursor', 'crosshair', 'important');
                        if (brushCursor) brushCursor.style.display = 'none';
                    }
                }
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
        const sizeTrigger = modal.querySelector('#itd-size-trigger'); 
        const sizePopup = modal.querySelector('#itd-size-pop');       
        const sizeSlider = modal.querySelector('#itd-size-slider');   
        const sizeValText = modal.querySelector('#itd-size-val');     
        const popValText = modal.querySelector('#itd-pop-val');       
        
        // Находим новые кнопки плюс и минус
        const btnMinus = modal.querySelector('#itd-size-minus');
        const btnPlus = modal.querySelector('#itd-size-plus');

        const updateBrushSize = (newSize) => {
            let val = Math.max(1, Math.min(100, parseInt(newSize))); // Ограничение 1-100
            state.lineWidth = val;
            sizeValText.innerText = val;
            popValText.innerText = val;
            sizeSlider.value = val;

            // Подсвечиваем пресеты (2, 4, 8, 12), если выбраны они
            modal.querySelectorAll('.size-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.size) === state.lineWidth);
            });
            
            // Если выбран кастомный размер, подсвечиваем саму кнопку размера синим
            const isPreset = [2, 4, 8, 12].includes(state.lineWidth);
            sizeTrigger.classList.toggle('active', !isPreset);
        };

        // Логика открытия окошка
        sizeTrigger.onclick = (e) => {
            // Если кликнули внутри всплывающего окна (по ползунку или кнопкам), ничего не делаем
            if (e.target.closest('#itd-size-pop')) return;
            
            e.stopPropagation();
            const isOpen = sizePopup.classList.contains('show');
            
            if (!isOpen) {
                const rect = sizeTrigger.getBoundingClientRect();
                // Позиционируем окно точно над кнопкой
                sizePopup.style.bottom = (window.innerHeight - rect.top + 10) + 'px'; 
                sizePopup.style.left = (rect.left + rect.width / 2 - 95) + 'px'; // 95 - половина ширины окна (190/2)
                sizePopup.classList.add('show');
            } else {
                sizePopup.classList.remove('show');
            }
        };

        // Закрытие при клике вне области кнопки или окна
        const handleOutsideClickSize = (e) => {
            if (sizePopup.classList.contains('show')) {
                if (!sizeTrigger.contains(e.target)) {
                    sizePopup.classList.remove('show');
                }
            }
        };
        document.addEventListener('mousedown', handleOutsideClickSize);

        // Изменение размера ползунком
        sizeSlider.oninput = (e) => {
            updateBrushSize(e.target.value);
        };

        // Логика кнопок "+" и "-"
        btnMinus.onclick = (e) => {
            e.stopPropagation();
            updateBrushSize(state.lineWidth - 1);
        };

        btnPlus.onclick = (e) => {
            e.stopPropagation();
            updateBrushSize(state.lineWidth + 1);
        };

        // Быстрые кнопки выбора размера (2, 4, 8, 12)
        modal.querySelectorAll('.size-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation(); 
                updateBrushSize(btn.dataset.size);
                sizePopup.classList.remove('show'); // Закрываем окно при выборе пресета
            };
        });
        // --- КОНЕЦ НОВОГО БЛОКА ---

        modal.querySelector('#btn-undo').onclick = undo;
        modal.querySelector('#btn-redo').onclick = redo;
        modal.querySelector('#btn-clear').onclick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            saveHistory();
        };
		
        const fileInput = modal.querySelector('#itd-file-input');
        const uploadBtn = modal.querySelector('#btn-upload');

        uploadBtn.onclick = () => {
            fileInput.value = '';
            fileInput.click();
        };

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    state.cropImg = img;
                    state.isCropping = true;
                    
                    // Начальные размеры: вписываем в холст
                    let ratio = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
                    state.cropParams = {
                        x: (canvas.width - img.width * ratio) / 2,
                        y: (canvas.height - img.height * ratio) / 2,
                        w: img.width * ratio,
                        h: img.height * ratio,
                        origRatio: img.width / img.height,
                        ratio: true
                    };

                    document.getElementById('itd-crop-layer').classList.add('active');
					document.querySelector('.canvas-wrapper').classList.add('cropping');
					document.querySelector('.itd-editor-container').classList.add('cropping');
                    updateCropUI();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };

        const handleStart = (e) => {
            if (state.isPreview || state.isCropping) return;
            const rect = canvas.getBoundingClientRect();
            if (!state.palettePinned) {
                const cp = document.getElementById('dyatlo-color-panel-overlay');
                if (cp) cp.remove();
            }
            state.isDrawing = true;
            state.startX = e.clientX - rect.left;
            state.startY = e.clientY - rect.top;
            if (e.shiftKey || state.tool === 'fill') {
                const rgb = state.color.match(/[A-Za-z0-9]{2}/g).map(h => parseInt(h, 16));
                floodFill(Math.floor(state.startX), Math.floor(state.startY), rgb);
                state.isDrawing = false; 
                return;
            }
            if (state.tool === 'brush' || state.tool === 'eraser') {
                ctx.beginPath();
                ctx.moveTo(state.startX, state.startY);
                ctx.lineTo(state.startX, state.startY); 
                
                ctx.lineWidth = state.lineWidth;
                if (state.tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = "rgba(0,0,0,1)";
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = state.color;
                }
                ctx.stroke(); 
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
        const brushCursor = document.getElementById('itd-brush-cursor');
        const updateCursor = (e) => {
			if (!brushCursor || state.tool === 'fill' || !state.dynamicCursor) {
				if (brushCursor) brushCursor.style.display = 'none';
				return;
			}
			brushCursor.style.display = 'block';
			brushCursor.style.left = e.clientX + 'px';
			brushCursor.style.top = e.clientY + 'px';
			brushCursor.style.width = state.lineWidth + 'px';
			brushCursor.style.height = state.lineWidth + 'px';
		};
        canvas.addEventListener('mousemove', updateCursor);
        canvas.addEventListener('mouseenter', () => { 
            if (!state.isPreview && state.tool !== 'fill' && state.dynamicCursor) {
                brushCursor.style.display = 'block';
            } 
        });
        canvas.addEventListener('mouseleave', () => { 
            brushCursor.style.display = 'none'; 
        });
        canvas.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);

        modal.querySelector('#itd-btn-footer-save').onclick = (e) => {
            const saveLogic = async () => {
                const btn = modal.querySelector('.itd-btn-save');
                const container = modal.querySelector('.itd-editor-container');
                const originalText = btn.innerText;
                
                // Создаем оверлей блокировки
                const loader = document.createElement('div');
                loader.className = 'itd-loading-blocker';
                loader.innerHTML = `
                    <div class="itd-loading-spinner"></div>
                    <div style="font-size: 18px; font-weight: 600;">Подождите, идет загрузка...</div>
                    <div style="font-size: 13px; color: #8e8e93;">Ваш баннер обновляется</div>
                `;
                
                // Блокируем кнопку и добавляем оверлей
                btn.disabled = true;
                btn.innerText = "Загрузка...";
                container.appendChild(loader);
                
                canvas.toBlob(async (blob) => {
                    try {
                        await uploadToAPI(blob);
                        btn.innerText = "Готово!";
                        // При успехе оставляем оверлей до перезагрузки
                        setTimeout(() => { location.reload(); }, 500);
                    } catch (err) {
                        // В случае ошибки убираем блокировку
                        loader.remove();
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
		const cropLayer = modal.querySelector('#itd-crop-layer');
        const cropConfirm = modal.querySelector('#crop-confirm');
        const cropCancel = modal.querySelector('#crop-cancel');
        const cropProp = modal.querySelector('#crop-prop');

        cropProp.onchange = (e) => { 
    state.cropParams.ratio = e.target.checked; 
    
    // Если пользователь включил сохранение пропорций
		if (state.cropParams.ratio) {
			// Рассчитываем новую высоту на основе текущей ширины и оригинального соотношения сторон
			state.cropParams.h = state.cropParams.w / state.cropParams.origRatio;
			
			// Проверяем, не вылезла ли картинка за нижнюю границу холста после изменения высоты
			if (state.cropParams.y + state.cropParams.h > canvas.height) {
				// Если вылезла — сдвигаем её вверх насколько возможно
				state.cropParams.y = canvas.height - state.cropParams.h;
				
				// Если даже со сдвигом не влезает (картинка выше самого холста), масштабируем по высоте холста
				if (state.cropParams.y < 0) {
					state.cropParams.y = 0;
					state.cropParams.h = canvas.height;
					state.cropParams.w = state.cropParams.h * state.cropParams.origRatio;
				}
			}
			
			// Моментально перерисовываем рамку кадрирования
			updateCropUI();
		}
		};

        cropCancel.onclick = () => {
            cropLayer.classList.remove('active');
            document.querySelector('.canvas-wrapper').classList.remove('cropping');
            document.querySelector('.itd-editor-container').classList.remove('cropping');
            state.isCropping = false;
            const wrp = cropLayer.querySelector('.itd-crop-canvas-wrapper');
            if (wrp) wrp.remove();
        };

        cropConfirm.onclick = () => {
            const p = state.cropParams;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(state.cropImg, p.x, p.y, p.w, p.h);
            saveHistory();
            cropCancel.click(); // Закрываем режим
        };
        // Логика перетаскивания и изменения размера
        let isDragging = false, isResizing = false, startX, startY, startParams;
        let activeHandle = null; // Запоминаем за какой угол тянем

        cropLayer.onmousedown = (e) => {
            const wrapper = cropLayer.querySelector('.itd-crop-canvas-wrapper');
            if (!wrapper) return;
            
            const handle = e.target.closest('.crop-handle');
            startX = e.clientX;
            startY = e.clientY;
            startParams = { ...state.cropParams };

            if (handle) {
                isResizing = true;
                activeHandle = handle.dataset.handle; // Получаем nw, ne, sw или se
            } else if (e.target.closest('.itd-crop-canvas-wrapper') || e.target.tagName === 'CANVAS') {
                isDragging = true;
            }
            e.stopPropagation();
        };

        window.addEventListener('mousemove', (e) => {
            if (!state.isCropping || (!isDragging && !isResizing)) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (isDragging) {
                state.cropParams.x = startParams.x + dx;
                state.cropParams.y = startParams.y + dy;
            } else if (isResizing) {
                let newW = startParams.w;
                let newH = startParams.h;
                let newX = startParams.x;
                let newY = startParams.y;

                // Изменяем размеры в зависимости от угла, за который тянем
                if (activeHandle === 'se') {
                    newW = startParams.w + dx;
                    newH = startParams.h + dy;
                } else if (activeHandle === 'nw') {
                    newW = startParams.w - dx;
                    newH = startParams.h - dy;
                    newX = startParams.x + dx;
                    newY = startParams.y + dy;
                } else if (activeHandle === 'ne') {
                    newW = startParams.w + dx;
                    newH = startParams.h - dy;
                    newY = startParams.y + dy;
                } else if (activeHandle === 'sw') {
                    newW = startParams.w - dx;
                    newH = startParams.h + dy;
                    newX = startParams.x + dx;
                }

                // Защита от выворачивания картинки наизнанку (минимум 20px)
                if (newW < 20) {
                    newW = 20;
                    if (activeHandle === 'nw' || activeHandle === 'sw') newX = startParams.x + startParams.w - 20;
                }
                if (newH < 20) {
                    newH = 20;
                    if (activeHandle === 'nw' || activeHandle === 'ne') newY = startParams.y + startParams.h - 20;
                }

                // Строгое сохранение пропорций (по ширине)
                if (state.cropParams.ratio) {
                    let propH = newW / state.cropParams.origRatio;
                    
                    if (activeHandle === 'se') {
                        newH = propH;
                    } else if (activeHandle === 'nw') {
                        newY = startParams.y + (startParams.h - propH);
                        newH = propH;
                    } else if (activeHandle === 'ne') {
                        newY = startParams.y + (startParams.h - propH);
                        newH = propH;
                    } else if (activeHandle === 'sw') {
                        newH = propH;
                    }
                }

                state.cropParams.w = newW;
                state.cropParams.h = newH;
                state.cropParams.x = newX;
                state.cropParams.y = newY;
            }
            updateCropUI();
        });

        window.addEventListener('mouseup', () => { 
            isDragging = isResizing = false; 
            activeHandle = null;
        });
		cropLayer.addEventListener('wheel', (e) => {
			if (!state.isCropping) return;
			e.preventDefault(); // Запрещаем прокрутку страницы

			const scaleAmount = 0.1; // На сколько процентов менять размер за один шаг
			const delta = e.deltaY > 0 ? -scaleAmount : scaleAmount;

			// Рассчитываем новый размер
			let newW = state.cropParams.w * (1 + delta);
			let newH = state.cropParams.h * (1 + delta);

			// Минимальный размер (например, 20 пикселей), чтобы картинка не исчезла
			if (newW < 20 || newH < 20) return;

			// Если включено сохранение пропорций
			if (state.cropParams.ratio) {
				if (newW / newH !== state.cropParams.origRatio) {
					newH = newW / state.cropParams.origRatio;
				}
			}

			// Чтобы картинка масштабировалась относительно своего центра:
			state.cropParams.x -= (newW - state.cropParams.w) / 2;
			state.cropParams.y -= (newH - state.cropParams.h) / 2;

			state.cropParams.w = newW;
			state.cropParams.h = newH;

			updateCropUI();
		}, { passive: false });
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
