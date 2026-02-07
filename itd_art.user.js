// ==UserScript==
// @name         ITD ART
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Расширение функционала окна рисования.
// @author       TheBreakHikita
// @match        https://xn--d1ah4a.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=xn--d1ah4a.com
// @downloadURL  https://github.com/TheBreakHikita/itd-art/raw/refs/heads/main/itd_art.user.js
// @updateURL    https://github.com/TheBreakHikita/itd-art/raw/refs/heads/main/itd_art.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIG & CONSTANTS ---
    const CONFIG = {
        historyLimit: 30, // Ограничение истории для экономии памяти
        fontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap'
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
        actionBtns: `.toolbar-section--actions.${SVELTE_CLASS}`
    };

    // --- STATE MANAGEMENT ---
    const State = {
        historyStack: [],
        historyStep: -1,
        lastUploadedGif: null,
        lastActiveToolTitle: 'Кисть',
        cropListeners: null, // Хранилище для удаления слушателей

        reset() {
            this.historyStack = [];
            this.historyStep = -1;
            this.lastUploadedGif = null;
            this.cleanCropListeners();
        },

        cleanCropListeners() {
            if (this.cropListeners) {
                window.removeEventListener('mousemove', this.cropListeners.move);
                window.removeEventListener('mouseup', this.cropListeners.up);
                this.cropListeners = null;
            }
        },

        hasUnsavedChanges() {
            return this.historyStep > 0 || this.lastUploadedGif !== null;
        }
    };

    // --- INIT RESOURCES ---
    if (!document.getElementById('dyatlo-font-montserrat')) {
        const link = document.createElement('link');
        link.id = 'dyatlo-font-montserrat';
        link.href = CONFIG.fontUrl;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }

    // --- NATIVE PROTOTYPE PATCH (GIF SUPPORT) ---
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        if (this.classList.contains('drawing-canvas') && State.lastUploadedGif) {
            console.log('[Dyatlo] Uploading replaced GIF blob');
            callback(State.lastUploadedGif);
            return;
        }
        return originalToBlob.apply(this, arguments);
    };

    // --- HISTORY SYSTEM ---
    const History = {
        save(ctx, canvas) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (State.historyStep < State.historyStack.length - 1) {
                State.historyStack = State.historyStack.slice(0, State.historyStep + 1);
            }
            State.historyStack.push(imageData);

            if (State.historyStack.length > CONFIG.historyLimit) {
                State.historyStack.shift();
            } else {
                State.historyStep++;
            }
            this.updateUI();
        },

        updateUI() {
            const btnUndo = document.querySelector(SEL.undoBtn);
            const btnRedo = document.querySelector(SEL.redoBtn);
            if (btnUndo) {
                const disabled = State.historyStep <= 0;
                btnUndo.disabled = disabled;
                btnUndo.style.opacity = disabled ? "0.4" : "1";
            }
            if (btnRedo) {
                const disabled = State.historyStep >= State.historyStack.length - 1;
                btnRedo.disabled = disabled;
                btnRedo.style.opacity = disabled ? "0.4" : "1";
            }
        }
    };

    // --- CONFIRMATION LOGIC ---
    function setupConfirmations(modal) {
        if (modal.dataset.confirmSetup) return;
        modal.dataset.confirmSetup = "true";

        const confirmAction = (e, message) => {
            if (!confirm(message)) {
                e.stopImmediatePropagation();
                e.preventDefault();
                return false;
            }
            return true;
        };

        const handleUnsavedExit = (e) => {
            if (State.hasUnsavedChanges()) {
                confirmAction(e, "У вас есть несохраненные изменения. Вы уверены, что хотите выйти? Прогресс будет потерян.");
            }
        };

        modal.querySelector(SEL.closeBtn)?.addEventListener('click', handleUnsavedExit, true);
        modal.querySelector(SEL.cancelBtn)?.addEventListener('click', handleUnsavedExit, true);

        modal.querySelector(SEL.saveBtn)?.addEventListener('click', (e) => {
            confirmAction(e, "Вы уверены, что хотите сохранить этот рисунок?");
        }, true);

        const overlay = document.querySelector(SEL.overlay);
        if (overlay) {
            overlay.addEventListener('mousedown', (e) => {
                if (e.target === overlay) handleUnsavedExit(e);
            }, true);
        }
    }

    // --- DRAWING ENGINE ---
    function initDrawingLogic(canvas, modal) {
        if (canvas.dataset.dyatloLogic) return;
        canvas.dataset.dyatloLogic = "true";

        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        History.save(ctx, canvas);

        let isDrawing = false;
        let p1 = { x: 0, y: 0 }, p2 = { x: 0, y: 0 }, snapshot;

        const getCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        const stopDrawing = () => {
            if (isDrawing) {
                isDrawing = false;
                History.save(ctx, canvas);
            }
        };

        canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || document.getElementById('dyatlo-crop-overlay') || document.getElementById('dyatlo-text-overlay')) return;

            const s = getSettings(modal);
            const coords = getCoords(e);

            if (s.tool === 'Текст') {
                showTextDialog(coords.x, coords.y, ctx, canvas, modal);
                return;
            }

            isDrawing = true;
            canvas.setPointerCapture(e.pointerId);
            p1 = p2 = coords;

            ctx.lineWidth = s.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = s.color;
            ctx.fillStyle = s.color;
            ctx.globalCompositeOperation = (s.tool === 'Ластик') ? 'destination-out' : 'source-over';

            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

            if (!['Линия', 'Прямоугольник', 'Круг'].includes(s.tool)) {
                ctx.beginPath();
                ctx.arc(coords.x, coords.y, s.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isDrawing) return;
            const coords = getCoords(e);
            const s = getSettings(modal);

            if (['Линия', 'Прямоугольник', 'Круг'].includes(s.tool)) {
                ctx.putImageData(snapshot, 0, 0);
                ctx.beginPath();
                if (s.tool === 'Линия') {
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(coords.x, coords.y);
                } else if (s.tool === 'Прямоугольник') {
                    ctx.strokeRect(p1.x, p1.y, coords.x - p1.x, coords.y - p1.y);
                } else if (s.tool === 'Круг') {
                    const r = Math.sqrt(Math.pow(coords.x - p1.x, 2) + Math.pow(coords.y - p1.y, 2));
                    ctx.arc(p1.x, p1.y, r, 0, 2 * Math.PI);
                }
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(p2.x, p2.y);
                const midX = (p1.x + coords.x) / 2;
                const midY = (p1.y + coords.y) / 2;
                ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
                ctx.stroke();
                p2 = { x: midX, y: midY };
                p1 = coords;
            }
        });

        canvas.addEventListener('pointerup', stopDrawing);
        canvas.addEventListener('pointercancel', stopDrawing);
    }

    // --- UI HELPERS ---
    function getSettings(modal) {
        const textBtn = document.getElementById('dyatlo-text-btn');
        if (textBtn && textBtn.classList.contains('active')) {
            return { tool: 'Текст', size: getActiveSize(modal), color: getActiveColor(modal) };
        }
        const activeToolBtn = modal.querySelector('button.tool-btn.active');
        const tool = activeToolBtn ? (activeToolBtn.getAttribute('title') || 'Кисть') : 'Кисть';
        return { tool, size: getActiveSize(modal), color: getActiveColor(modal) };
    }

    function getActiveSize(modal) {
        const activeSizeBtn = modal.querySelector(`${SEL.sizeBtns}.active`);
        if (!activeSizeBtn) return 5;
        const match = (activeSizeBtn.getAttribute('aria-label') || "").match(/(\d+)/);
        return match ? parseInt(match[1]) : 5;
    }

    function getActiveColor(modal) {
        return modal.querySelector(SEL.colorInput)?.value || '#000000';
    }

    function revertToLastTool(modal) {
        const textBtn = document.getElementById('dyatlo-text-btn');
        if (textBtn) textBtn.classList.remove('active');
        const prevBtn = modal.querySelector(`button.tool-btn[title="${State.lastActiveToolTitle}"]`);
        if (prevBtn) {
            prevBtn.click();
            setTimeout(() => { if (!prevBtn.classList.contains('active')) prevBtn.classList.add('active'); }, 20);
        }
    }

    // --- INJECT CUSTOM UI ---
    function injectNativeUI(modal) {
        if (modal.dataset.dyatloUi) return;
        modal.dataset.dyatloUi = "true";

        const toolContainer = modal.querySelector('.toolbar-tools');
        if (toolContainer) {
            const textBtn = document.createElement('button');
            textBtn.title = 'Текст';
            textBtn.className = `tool-btn ${SVELTE_CLASS}`;
            textBtn.id = 'dyatlo-text-btn';
            textBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`;

            toolContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button.tool-btn');
                if (!btn) return;

                if (btn.id === 'dyatlo-text-btn') {
                    const currentActive = modal.querySelector('button.tool-btn.active:not(#dyatlo-text-btn)');
                    if (currentActive) State.lastActiveToolTitle = currentActive.getAttribute('title') || 'Кисть';
                    modal.querySelectorAll('button.tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                } else {
                    textBtn.classList.remove('active');
                    State.lastActiveToolTitle = btn.getAttribute('title') || 'Кисть';
                    setTimeout(() => {
                        const anyActive = modal.querySelector('button.tool-btn.active:not(#dyatlo-text-btn)');
                        if (!anyActive) btn.classList.add('active');
                    }, 10);
                }
            }, true);
            toolContainer.appendChild(textBtn);
        }

        const toolbar = modal.querySelector(SEL.toolbar);
        const extraSection = document.createElement('div');
        extraSection.className = `toolbar-section ${SVELTE_CLASS}`;
        extraSection.innerHTML = `
            <span class="toolbar-label ${SVELTE_CLASS}">Плагин</span>
            <div class="toolbar-tools ${SVELTE_CLASS}">
                <button id="dyatlo-upload" title="Загрузить изображение / GIF" class="tool-btn ${SVELTE_CLASS}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                </button>
                <button id="dyatlo-download" title="Скачать как PNG" class="tool-btn ${SVELTE_CLASS}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
                <input type="file" id="dyatlo-file-input" accept="image/gif,image/png,image/jpeg" style="display:none">
            </div>
        `;

        const actionsSection = modal.querySelector(SEL.actionBtns);
        if (actionsSection) toolbar.insertBefore(extraSection, actionsSection);

        extraSection.querySelector('#dyatlo-upload').onclick = () => extraSection.querySelector('#dyatlo-file-input').click();

        extraSection.querySelector('#dyatlo-file-input').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    if (file.type === 'image/gif') State.lastUploadedGif = file;
                    startCropping(img, modal, file.type === 'image/gif');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        };

        extraSection.querySelector('#dyatlo-download').onclick = () => {
            const canvas = modal.querySelector(SEL.canvas);
            const link = document.createElement('a');
            link.download = `art-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };
    }

    // --- TEXT TOOL DIALOG ---
    function showTextDialog(initialX, initialY, ctx, canvas, modal) {
        if (document.getElementById('dyatlo-text-overlay')) return;

        const container = modal.querySelector(SEL.canvasContainer);
        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let curX = initialX, curY = initialY;

        const overlay = document.createElement('div');
        overlay.id = 'dyatlo-text-overlay';
        overlay.style = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2000; pointer-events: none; font-family: 'Montserrat', sans-serif;`;

        const blueStyle = "accent-color: #3b82f6; cursor: pointer;";
        overlay.innerHTML = `
            <div id="text-panel" style="position: absolute; top: 10px; right: 10px; pointer-events: auto; background: #1a1a1a; color: #fff; padding: 16px; border-radius: 12px; width: 240px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px; border: 1px solid #444;">
                <h3 style="margin: 0; font-size: 12px; color: #3b82f6; text-transform: uppercase; letter-spacing: 1px;">Настройка текста</h3>
                <input type="text" id="t-val" placeholder="Введите текст..." style="padding: 8px; border-radius: 6px; border: 1px solid #333; background: #000; color: #fff; outline: none; font-family: 'Montserrat';">

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #aaa;">Масштаб <span id="t-size-val">50</span></div>
                <input type="range" id="t-size" min="10" max="300" value="50" style="width:100%; ${blueStyle}">

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #aaa;">Прозрачность <span id="t-alpha-val">100%</span></div>
                <input type="range" id="t-alpha" min="0" max="100" value="100" style="width:100%; ${blueStyle}">

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #222; padding: 8px; border-radius: 8px;">
                    <label style="font-size: 10px; display: flex; align-items: center; gap: 5px; cursor: pointer;"><input type="checkbox" id="t-bg"> Фон</label>
                    <label style="font-size: 10px; display: flex; align-items: center; gap: 5px; cursor: pointer;"><input type="checkbox" id="t-stroke"> Контур</label>
                    <label style="font-size: 10px; display: flex; align-items: center; gap: 5px; cursor: pointer;"><input type="checkbox" id="t-shadow"> Тень</label>
                </div>

                <div style="display: flex; gap: 8px; margin-top: 5px;">
                    <button id="t-cancel" style="flex: 1; padding: 8px; background: #444; border: none; color: white; border-radius: 6px; cursor: pointer; font-size: 11px;">Отмена</button>
                    <button id="t-ok" style="flex: 1; padding: 8px; background: #3b82f6; border: none; color: white; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 11px;">Готово</button>
                </div>
            </div>`;

        container.appendChild(overlay);
        const input = overlay.querySelector('#t-val');
        input.focus();

        const render = () => {
            ctx.putImageData(snapshot, 0, 0);
            const text = input.value;
            if (!text) return;

            const size = parseInt(overlay.querySelector('#t-size').value);
            const alpha = parseInt(overlay.querySelector('#t-alpha').value) / 100;

            overlay.querySelector('#t-size-val').innerText = size;
            overlay.querySelector('#t-alpha-val').innerText = Math.round(alpha*100) + '%';

            const hasBg = overlay.querySelector('#t-bg').checked;
            const hasStroke = overlay.querySelector('#t-stroke').checked;
            const hasShadow = overlay.querySelector('#t-shadow').checked;
            const color = getActiveColor(modal);

            ctx.save();
            ctx.font = `bold ${size}px Montserrat`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.globalAlpha = alpha;

            if (hasBg) {
                const m = ctx.measureText(text);
                const w = m.width + 30, h = size + 15;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(curX - w/2, curY - h/2, w, h, 12);
                else ctx.rect(curX - w/2, curY - h/2, w, h);
                ctx.fill();
            }
            if (hasShadow) {
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = size/6;
                ctx.shadowOffsetX = size/15;
                ctx.shadowOffsetY = size/15;
            }
            if (hasStroke) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = size * 0.06;
                ctx.lineJoin = 'round';
                ctx.strokeText(text, curX, curY);
            }
            ctx.fillStyle = color;
            ctx.fillText(text, curX, curY);
            ctx.restore();
        };

        const handleCanvasClick = (e) => {
            if (e.target.closest('#text-panel')) return;
            const rect = canvas.getBoundingClientRect();
            curX = (e.clientX - rect.left) * (canvas.width / rect.width);
            curY = (e.clientY - rect.top) * (canvas.height / rect.height);
            render();
        };

        container.addEventListener('mousedown', handleCanvasClick);
        overlay.addEventListener('input', render);

        const closeText = () => {
            container.removeEventListener('mousedown', handleCanvasClick);
            overlay.remove();
            revertToLastTool(modal);
        };

        overlay.querySelector('#t-ok').onclick = (e) => { e.stopPropagation(); render(); History.save(ctx, canvas); closeText(); };
        overlay.querySelector('#t-cancel').onclick = (e) => { e.stopPropagation(); ctx.putImageData(snapshot, 0, 0); closeText(); };

        render();
    }

    // --- CROP & GIF LOGIC ---
    function startCropping(img, modal, isGif = false) {
        document.getElementById('dyatlo-crop-overlay')?.remove();
        State.cleanCropListeners();

        const canvas = modal.querySelector(SEL.canvas), container = modal.querySelector(SEL.canvasContainer);
        const overlay = document.createElement('div');
        overlay.id = 'dyatlo-crop-overlay';
        overlay.style = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: move;`;

        const viewW = canvas.clientWidth, viewH = canvas.clientHeight;
        const cropArea = document.createElement('div');
        cropArea.style = `position: relative; width: ${viewW}px; height: ${viewH}px; overflow: hidden; outline: 2px dashed gold; border-radius: 4px; background: #111;`;

        const cropImg = document.createElement('img');
        cropImg.src = img.src;
        cropImg.style = `position: absolute; display: block; max-width: none; user-select: none; pointer-events: none;`;
        cropArea.appendChild(cropImg);

        const ui = document.createElement('div');
        ui.style = "margin-top: 20px; display: flex; gap: 10px;";
        ui.innerHTML = `<button id="crop-cancel" class="drawing-btn drawing-btn--cancel ${SVELTE_CLASS}">Отмена</button>
                        <button id="crop-ok" class="drawing-btn drawing-btn--save ${SVELTE_CLASS}">${isGif ? 'Вставить GIF' : 'Наложить'}</button>`;

        overlay.appendChild(cropArea);
        overlay.appendChild(ui);
        container.appendChild(overlay);

        const vScale = viewW / canvas.width;
        let cropSettings = {
            scale: Math.max(canvas.width / img.width, canvas.height / img.height),
            x: 0, y: 0,
            isDragging: false,
            lastMouseX: 0, lastMouseY: 0
        };
        cropSettings.x = (canvas.width - img.width * cropSettings.scale) / 2;
        cropSettings.y = (canvas.height - img.height * cropSettings.scale) / 2;

        const redraw = () => {
            cropImg.style.width = (img.width * cropSettings.scale * vScale) + 'px';
            cropImg.style.height = (img.height * cropSettings.scale * vScale) + 'px';
            cropImg.style.left = (cropSettings.x * vScale) + 'px';
            cropImg.style.top = (cropSettings.y * vScale) + 'px';
        };
        redraw();

        overlay.onmousedown = (e) => {
            if(e.target.closest('button')) return;
            cropSettings.isDragging = true;
            cropSettings.lastMouseX = e.clientX;
            cropSettings.lastMouseY = e.clientY;
        };

        overlay.onwheel = (e) => {
            e.preventDefault();
            const f = e.deltaY > 0 ? 0.95 : 1.05;
            cropSettings.scale *= f;
            redraw();
        };

        const onMove = (e) => {
            if (!cropSettings.isDragging) return;
            cropSettings.x += (e.clientX - cropSettings.lastMouseX) / vScale;
            cropSettings.y += (e.clientY - cropSettings.lastMouseY) / vScale;
            cropSettings.lastMouseX = e.clientX;
            cropSettings.lastMouseY = e.clientY;
            redraw();
        };

        const onUp = () => cropSettings.isDragging = false;

        State.cropListeners = { move: onMove, up: onUp };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        overlay.querySelector('#crop-ok').onclick = () => {
            if (isGif) {
                applyGif(modal, img.src, cropSettings, img.width, img.height);
            } else {
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, cropSettings.x, cropSettings.y, img.width * cropSettings.scale, img.height * cropSettings.scale);
                History.save(ctx, canvas);
            }
            cleanUp();
        };

        overlay.querySelector('#crop-cancel').onclick = () => {
            State.lastUploadedGif = null;
            cleanUp();
        };

        function cleanUp() {
            State.cleanCropListeners();
            overlay.remove();
        }
    }

    function applyGif(modal, src, cropSettings, width, height) {
        const canvas = modal.querySelector(SEL.canvas), container = modal.querySelector(SEL.canvasContainer);
        modal.querySelector('#dyatlo-gif-container')?.remove();

        const gifContainer = document.createElement('div');
        gifContainer.id = 'dyatlo-gif-container';
        gifContainer.style = `position: absolute; top: ${canvas.offsetTop}px; left: ${canvas.offsetLeft}px; width: ${canvas.clientWidth}px; height: ${canvas.clientHeight}px; overflow: hidden; pointer-events: none; background: #fff; z-index: 5; border-radius: 4px;`;

        const vScale = canvas.clientWidth / canvas.width;
        const liveGif = document.createElement('img');
        liveGif.src = src;
        liveGif.style = `position: absolute; left: ${cropSettings.x * vScale}px; top: ${cropSettings.y * vScale}px; width: ${width * cropSettings.scale * vScale}px; height: ${height * cropSettings.scale * vScale}px; max-width: none;`;

        // --- GIF ИНДИКАТОР ---
        const badge = document.createElement('div');
        badge.id = 'dyatlo-gif-badge';
        badge.style = `position: absolute; top: 10px; left: 10px; background: rgba(26, 26, 26, 0.9); border: 1px solid #3b82f6; color: #fff; padding: 4px 8px; border-radius: 6px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: bold; display: flex; align-items: center; gap: 8px; z-index: 10; pointer-events: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.3);`;
        badge.innerHTML = `
            <span style="display: flex; align-items: center; gap: 4px;">
                <span style="width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; display: inline-block;"></span>
                GIF режим
            </span>
            <button id="dyatlo-gif-remove" title="Убрать GIF" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; transition: color 0.2s;">&times;</button>
        `;

        gifContainer.appendChild(liveGif);
        gifContainer.appendChild(badge);
        container.appendChild(gifContainer);
        canvas.style.opacity = "0.05";

        // Логика удаления GIF
        badge.querySelector('#dyatlo-gif-remove').onclick = () => {
            gifContainer.remove();
            canvas.style.opacity = "1";
            State.lastUploadedGif = null;
        };

        badge.querySelector('#dyatlo-gif-remove').onmouseenter = (e) => e.target.style.color = '#fff';
        badge.querySelector('#dyatlo-gif-remove').onmouseleave = (e) => e.target.style.color = '#aaa';
    }

    // --- INIT OBSERVER ---
    const observer = new MutationObserver(() => {
        const modal = document.querySelector(SEL.modal);
        if (modal) {
            const canvas = modal.querySelector(SEL.canvas);
            if (canvas) {
                initDrawingLogic(canvas, modal);
                injectNativeUI(modal);
                setupConfirmations(modal);
            }
        } else {
            if (State.historyStack.length > 0) {
                 State.reset();
                 document.getElementById('dyatlo-gif-container')?.remove();
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });


})();
