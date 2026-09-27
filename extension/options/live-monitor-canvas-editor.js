(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const resizeEngine = globalThis.YtCdHudLiveMonitorResizeEngine;

    function referencePlayerRect(canvas) {
        const pageWidth = Math.min(canvas.width, 1800);
        const left = (canvas.width - pageWidth) / 2 + 24;
        const width = Math.min(pageWidth - 372, (canvas.height - 160) * 16 / 9);
        return { left, top: 80, width, height: width * 9 / 16 };
    }

    function createEditor({ preview, layout, onChange = () => {}, onSelect = () => {}, onRender = () => {} }) {
        if (!preview) throw new Error('Live Monitor preview stage is required.');
        const state = { layout: composer.normalizeLayout(layout), selected: null, selectedPart: null, dragging: null, resizing: null, pending: null };
        const history = [];
        let committedLayout = JSON.stringify(state.layout);
        const notifyChange = onChange;
        onChange = (nextLayout, reason) => {
            recordHistory();
            notifyChange(nextLayout, reason);
        };
        function recordHistory() {
            const next = JSON.stringify(state.layout);
            if (next === committedLayout) return;
            history.push(committedLayout);
            if (history.length > 100) history.shift();
            committedLayout = next;
        }
        function undo() {
            if (!history.length || state.dragging || state.resizing) return false;
            clearPending();
            state.layout = JSON.parse(history.pop());
            committedLayout = JSON.stringify(state.layout);
            if (!componentFor(state.selected)?.present) { state.selected = null; state.selectedPart = null; }
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            notifyChange(state.layout, 'undo');
            return true;
        }
        let initialized = false;
        const view = { x: 0, y: 0 };
        let panning = null;
        const componentFor = id => composer.getComponent(state.layout, id);

        function ensureHandle(node, direction) {
            let handle = node.querySelector('[data-lm-handle="' + direction + '"]');
            if (!handle) {
                handle = document.createElement('span');
                handle.className = 'lm-resize-handle';
                handle.dataset.lmHandle = direction;
                handle.setAttribute('role', 'presentation');
                handle.setAttribute('aria-label', 'Resize ' + direction);
                node.appendChild(handle);
            }
            return handle;
        }

        function render() {
            composer.refreshBase(state.layout);
            preview.classList.add('lm-editor-stage');
            preview.style.width = state.layout.canvas.width + 'px';
            preview.style.height = state.layout.canvas.height + 'px';
            const player = referencePlayerRect(state.layout.canvas);
            preview.style.setProperty('--yt-ref-left', player.left + 'px');
            preview.style.setProperty('--yt-ref-width', player.width + 'px');
            preview.style.setProperty('--yt-ref-height', player.height + 'px');
            preview.dataset.lmSizingMode = state.layout.canvas.sizingMode;
            preview.style.setProperty('--lm-primary-color', state.layout.palette.primaryColor);
            preview.style.setProperty('--lm-secondary-color', state.layout.palette.secondaryColor);
            preview.querySelectorAll('[data-lm-component]').forEach(node => {
                const component = componentFor(node.dataset.lmComponent);
                if (!component) return;
                Object.entries(composer.toCss(component, state.layout)).forEach(([key, value]) => node.style.setProperty(key, value));
                const split = component.arrangement?.split === true;
                node.classList.toggle('lm-transport-split', split);
                node.classList.toggle('lm-component-selected', !split && state.selected === component.id);
                node.classList.toggle('lm-component-locked', state.layout.locked || component.locked);
                node.classList.toggle('lm-component-hidden', component.present === false || component.hidden === true);

                node.classList.toggle('lm-component-invalid', component._lmInvalid === true);
                node.classList.toggle('lm-effect-shadow', component.effects.shadow === true);
                node.classList.toggle('lm-effect-accent-rail', component.effects.accentRail === true);
                node.classList.toggle('lm-effect-glow', component.effects.glow === true);
                node.classList.toggle('lm-effect-status-lamp', component.effects.statusLamp === true);
                node.classList.toggle('lm-effect-marquee', component.effects.marquee === true);
                node.dataset.lmTextAlign = component.textStyle?.textAlign || 'left';
                if (component.id === 'disc') node.dataset.lmTexture = component.style.texture;
                node.setAttribute('aria-selected', state.selected === component.id ? 'true' : 'false');
                node.querySelectorAll('[data-lm-part]').forEach(partNode => {
                    const part = partNode.dataset.lmPart;
                    if (split) Object.entries(composer.toPartCss(component, part, state.layout)).forEach(([key, value]) => partNode.style.setProperty(key, value));
                    const selected = split && state.selected === component.id && state.selectedPart === part;
                    partNode.classList.toggle('lm-component-selected', selected);
                    partNode.setAttribute('aria-selected', selected ? 'true' : 'false');
                    if (selected && !state.layout.locked && !component.locked) ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(direction => { ensureHandle(partNode, direction).hidden = false; });
                    else partNode.querySelectorAll('.lm-resize-handle').forEach(handle => { handle.hidden = true; });
                });
                const resizable = !split && state.selected === component.id && !state.layout.locked && !component.locked;
                if (resizable) ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(direction => { ensureHandle(node, direction).hidden = false; });
                else node.querySelectorAll(':scope > .lm-resize-handle').forEach(handle => { handle.hidden = true; });
            });
            preview.classList.toggle('lm-drag-mode', Boolean(state.dragging));
            applyView();
            onRender(state.layout);
        }

        function select(id, part = null) {
            state.selected = composer.registry[id] ? id : null;
            const component = componentFor(state.selected);
            state.selectedPart = component?.arrangement?.split && component.arrangement.positions[part] ? part : null;
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
        }

        function proposedGeometry(start, clientX, clientY) {
            const rect = preview.getBoundingClientRect();
            return {
                ...start.geometry,
                x: start.geometry.x + (clientX - start.clientX) / rect.width,
                y: start.geometry.y + (clientY - start.clientY) / rect.height,
            };
        }

        function updatePosition(component, clientX, clientY, start) {
            if (component.id === 'panel-base') {
                const next = JSON.parse(JSON.stringify(start.originalLayout));
                const rect = preview.getBoundingClientRect();
                const grid = next.canvas.alignmentGrid;
                let pixelsX = (clientX - start.clientX) * next.canvas.width / rect.width;
                let pixelsY = (clientY - start.clientY) * next.canvas.height / rect.height;
                // Snap the shared delta so saving cannot snap individual units apart.
                if (grid.enabled) {
                    pixelsX = Math.round(pixelsX / grid.unitWidth) * grid.unitWidth;
                    pixelsY = Math.round(pixelsY / grid.unitHeight) * grid.unitHeight;
                }
                const dx = pixelsX / next.canvas.width, dy = pixelsY / next.canvas.height;
                for (const item of next.components.filter(item => item.present)) {
                    item.geometry.x += dx; item.geometry.y += dy;
                    if (item.arrangement?.split) for (const position of Object.values(item.arrangement.positions)) {
                        position.x += dx; position.y += dy;
                    }
                    const geometries = item.arrangement?.split ? Object.values(item.arrangement.positions).map(position => ({ ...item.arrangement.partSize, ...position })) : [item.geometry];
                    for (const geometry of geometries) {
                        const bounds = composer.componentRect(geometry, next.canvas);
                        if (composer.registry[item.id].allowCanvasOverflow
                            ? geometry.x < 0 || geometry.x > 1 || geometry.y < 0 || geometry.y > 1
                            : bounds.left < 0 || bounds.top < 0 || bounds.right > next.canvas.width || bounds.bottom > next.canvas.height) return;
                    }
                }
                next.manualBase = true;
                state.layout = next;
                return;
            }
            const geometry = composer.fitInteractionGeometry(
                state.layout,
                component.id,
                start.part,
                proposedGeometry(start, clientX, clientY),
            );
            const candidate = JSON.parse(JSON.stringify(component));
            composer.applyInteractionGeometry(candidate, start.part, geometry);
            if (!composer.connectedToBase(state.layout, candidate)) return;
            composer.applyInteractionGeometry(component, start.part, geometry);
            delete component._lmInvalid;
        }

        function updateSize(component, clientX, clientY, start) {
            const rect = preview.getBoundingClientRect();
            const deltaX = (clientX - start.clientX) * state.layout.canvas.width / rect.width;
            const deltaY = (clientY - start.clientY) * state.layout.canvas.height / rect.height;
            const candidate = resizeEngine.geometryFromHandle(component, start.geometry, start.handle, deltaX, deltaY, state.layout.canvas);
            const placement = composer.canPlaceInteraction(state.layout, component.id, start.part, candidate);
            component._lmInvalid = !placement.valid;
            if (placement.valid) composer.applyInteractionGeometry(component, start.part, placement.geometry);
        }

        function clearPending() {
            if (state.pending) clearTimeout(state.pending.timer);
            state.pending = null;
        }

        function finishGesture() {
            clearPending();
            const drag = state.dragging;
            const component = drag?.component || state.resizing?.component;
            if (!component) return;
            delete component._lmInvalid;
            state.dragging = null;
            state.resizing = null;
            if (drag) {
                const overlaps = composer.overlapGroupFor(state.layout, component.id);
                if (overlaps.some(item => item.locked)) {
                    composer.applyInteractionGeometry(component, drag.part, drag.geometry);
                    render();
                    return;
                }
                if (overlaps.length) {
                    const labels = overlaps.map(item => composer.registry[item.id].label).join(', ');
                    const enableLayers = globalThis.confirm(
                        '偵測到同層元件重疊：' + labels + '\n\n'
                        + '按「確定」自動開啟層次功能並配置 Z 軸；按「取消」會將所有衝突元件移出面板。',
                    );
                    const result = enableLayers
                        ? composer.optimizeOverlapLayers(state.layout, component.id)
                        : composer.removeOverlapGroup(state.layout, component.id);
                    state.layout = result.layout;
                    if (enableLayers && !result.optimized) {
                        const restored = componentFor(component.id);
                        if (restored) composer.applyInteractionGeometry(restored, drag.part, drag.geometry);
                    }
                    state.selected = enableLayers && result.optimized ? component.id : null;
                    if (!state.selected) state.selectedPart = null;
                    composer.refreshBase(state.layout);
                    render();
                    onSelect(state.selected, componentFor(state.selected), state.selectedPart);
                    onChange(state.layout, enableLayers ? 'overlap-layer-optimization' : 'overlap-remove');
                    return;
                }
            }
            composer.refreshBase(state.layout);
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'gesture');
        }

        function onPointerDown(event) {
            const handle = event.target.closest('[data-lm-handle]');
            const target = event.target.closest('[data-lm-component]');
            if (event.button !== 0 || event.isPrimary === false || !target || !preview.contains(target)) return;
            const component = componentFor(target.dataset.lmComponent);
            if (!component) return;
            event.preventDefault();
            const partNode = event.target.closest('[data-lm-part]');
            const part = component.arrangement?.split && partNode ? partNode.dataset.lmPart : null;
            select(component.id, part);
            target.focus({ preventScroll: true });
            if (state.layout.locked || component.locked) return;
            (partNode || target).setPointerCapture?.(event.pointerId);
            const start = {
                component,
                part,
                clientX: event.clientX,
                clientY: event.clientY,
                geometry: composer.interactionGeometry(component, part),
                originalLayout: component.id === 'panel-base' ? JSON.parse(JSON.stringify(state.layout)) : null,
            };
            const rect = (partNode || target).getBoundingClientRect();
            const edge = (event.clientY - rect.top <= 8 ? 'n' : rect.bottom - event.clientY <= 8 ? 's' : '')
                + (event.clientX - rect.left <= 8 ? 'w' : rect.right - event.clientX <= 8 ? 'e' : '');
            let direction = handle?.dataset.lmHandle || edge;
            if (!direction && component.id === 'disc') {
                const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
                const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
                if (Math.hypot(dx, dy) >= .85) direction = (Math.abs(dy) > .35 ? dy < 0 ? 'n' : 's' : '') + (Math.abs(dx) > .35 ? dx < 0 ? 'w' : 'e' : '');
            }
            if (!direction) return;
            clearPending();
            if (handle || event.altKey) state.resizing = { ...start, handle: direction };
            else state.dragging = start;
        }

        function onPointerMove(event) {
            if (state.dragging) updatePosition(state.dragging.component, event.clientX, event.clientY, state.dragging);
            if (state.resizing) updateSize(state.resizing.component, event.clientX, event.clientY, state.resizing);
            if (state.dragging || state.resizing) render();
        }

        function onWheel(event) {
            const target = event.target.closest('[data-lm-component]');
            if (!target || target.dataset.lmComponent !== state.selected || state.selected === 'panel-base') return;
            const component = componentFor(state.selected);
            if (!component || state.layout.locked || component.locked) return;
            const factor = event.deltaY < 0 ? 1.05 : .95;
            const geometry = composer.interactionGeometry(component, state.selectedPart);
            const candidate = resizeEngine.geometryForSize(component, geometry.width * factor, geometry.height * factor, geometry);
            const placement = composer.canPlaceInteraction(state.layout, component.id, state.selectedPart, candidate);
            if (!placement.valid) return;
            composer.applyInteractionGeometry(component, state.selectedPart, placement.geometry);
            event.preventDefault();
            render();
            onChange(state.layout, 'wheel');
        }

        function onClick(event) {
            if (event.target === preview || event.target.classList.contains('preview-grid')) select(null);
        }

        function remove(componentId) {
            const result = composer.removeComponent(state.layout, componentId);
            state.layout = result.layout;
            if (!result.removed) return false;
            if (state.selected === componentId) state.selected = null;
            if (!state.selected) state.selectedPart = null;
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'remove');
            return true;
        }

        function add(componentId) {
            const result = composer.addComponent(state.layout, componentId);
            state.layout = result.layout;
            if (!result.added) return false;
            state.selected = componentId;
            state.selectedPart = null;
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'add');
            return true;
        }

        function updateLayer(componentId, requested) {
            const result = composer.updateLayer(state.layout, componentId, requested);
            if (!result.updated) return result;
            state.layout = result.layout;
            state.selected = componentId;
            render();
            onSelect(componentId, componentFor(componentId), state.selectedPart);
            onChange(state.layout, 'layer');
            return result;
        }

        function updateAlignment(enabled) {
            state.layout = composer.updateAlignment(state.layout, enabled);
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'alignment');
        }

        function updatePalette(requested) {
            state.layout = composer.applyPalette(state.layout, requested);
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'palette');
        }

        function updateSizingMode(mode) {
            state.layout = composer.updateSizingMode(state.layout, mode);
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'sizing-mode');
        }

        function updateViewport(width, height) {
            state.layout = composer.updateViewport(state.layout, width, height);
            render();
            centerPlayer();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'viewport');
        }

        function scaleGroup(factor, scope = 'all') {
            let ids = null;
            if (scope !== 'all') {
                ids = state.selected && state.selected !== 'panel-base' ? [state.selected] : [];
                if (scope === 'group' && ids.length) {
                    const group = composer.overlapGroupFor(state.layout, state.selected, false);
                    if (group.length) ids = group.map(item => item.id);
                }
            }
            let result = resizeEngine.scaleGroup(state.layout, factor, ids);
            if (result.code === 'GROUP_COLLISION') {
                const layered = resizeEngine.scaleGroup(state.layout, factor, ids, { resolveCollisions: true });
                if (!layered.updated) return layered;
                const accepted = globalThis.confirm?.('縮放後元件會在同一層重疊。是否自動分配 Z 軸層級並完成縮放？\n只調整本次縮放元件的層級；可用 UNDO 一併還原。\n取消會保留原配置。');
                if (!accepted) return { ...result, reason: '已取消 Z 軸自動分配；原配置已保留。' };
                result = layered;
            }
            if (!result.updated) return result;
            state.layout = result.layout;
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'group-scale');
            return result;
        }

        function updateSplit(componentId, enabled) {
            const result = composer.updateSplit(state.layout, componentId, enabled);
            if (!result.updated) return result;
            state.layout = result.layout;
            state.selected = componentId;
            state.selectedPart = null;
            render();
            onSelect(componentId, componentFor(componentId), null);
            onChange(state.layout, 'split');
            return result;
        }

        function toggleLock(id = state.selected) {
            if (state.layout.locked) return;
            const component = componentFor(id);
            if (!component) return;
            component.locked = !component.locked;
            render();
            onSelect(id, component, state.selectedPart);
            onChange(state.layout, 'unit-lock');
        }

        function setLocked(locked) {
            clearPending();
            state.layout.locked = Boolean(locked);
            state.dragging = state.resizing = null;
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            onChange(state.layout, 'panel-lock');
        }

        function applyView() {
            preview.style.transform = 'none';
            preview.style.left = view.x + 'px';
            preview.style.top = view.y + 'px';
        }

        function centerView(componentId = null) {
            const host = preview.parentElement;
            if (!host) return;
            const width = host.clientWidth || state.layout.canvas.width;
            const height = host.clientHeight || state.layout.canvas.height;
            const units = componentId ? [componentFor(componentId)].filter(Boolean)
                : state.layout.components.filter(item => item.present && !item.hidden);
            const bounds = units.flatMap(item => composer.componentRects(item, state.layout.canvas));
            const centerX = bounds.length ? (Math.min(...bounds.map(r => r.left)) + Math.max(...bounds.map(r => r.right))) / 2 : state.layout.canvas.width / 2;
            const centerY = bounds.length ? (Math.min(...bounds.map(r => r.top)) + Math.max(...bounds.map(r => r.bottom))) / 2 : state.layout.canvas.height / 2;
            view.x = width / 2 - centerX;
            view.y = height / 2 - centerY;
            applyView();
        }

        function centerPlayer() {
            const host = preview.parentElement;
            if (!host) return;
            const player = referencePlayerRect(state.layout.canvas);
            view.x = (host.clientWidth || state.layout.canvas.width) / 2 - player.left - player.width / 2;
            view.y = (host.clientHeight || state.layout.canvas.height) / 2 - player.top - player.height / 2;
            applyView();
        }

        function bindViewPanning() {
            const host = preview.parentElement;
            if (!host?.addEventListener) return;
            host.addEventListener('pointerdown', event => {
                if (event.button !== 0 || event.isPrimary === false || event.target.closest('[data-lm-component]')) return;
                const rect = host.getBoundingClientRect();
                // Leave the native viewport resize corner available.
                if (event.clientX >= rect.right - 20 && event.clientY >= rect.bottom - 20) return;
                event.preventDefault();
                panning = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, ...view };
                host.setPointerCapture?.(event.pointerId);
                host.classList.add('lm-view-panning');
            });
            host.addEventListener('pointermove', event => {
                if (!panning || event.pointerId !== panning.pointerId) return;
                view.x = panning.x + event.clientX - panning.clientX;
                view.y = panning.y + event.clientY - panning.clientY;
                applyView();
            });
            const finish = (event, cancel = false) => {
                if (!panning || event.pointerId !== panning.pointerId) return;
                if (cancel) { view.x = panning.x; view.y = panning.y; applyView(); }
                panning = null;
                host.classList.remove('lm-view-panning');
            };
            host.addEventListener('pointerup', event => finish(event));
            host.addEventListener('pointercancel', event => finish(event, true));
            host.addEventListener('lostpointercapture', event => finish(event));
        }

        function onKeyDown(event) {
            const focused = document.activeElement;
            const editingText = focused?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(focused?.tagName)
                || (focused?.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(focused.type));
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key?.toLowerCase() === 'z') {
                if (!editingText && undo()) event.preventDefault();
                return;
            }
            if (!preview.contains(document.activeElement) || document.activeElement?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
            if (event.key === 'Escape') return select(null);
            if (!state.selected || state.layout.locked) return;
            if (event.key === 'Enter') { event.preventDefault(); toggleLock(); return; }
            const component = componentFor(state.selected);
            if (component.locked) return;
            if (event.key === 'Delete') { event.preventDefault(); remove(state.selected); return; }
            const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const direction = directions[event.key];
            if (!direction || event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            const geometry = composer.interactionGeometry(component, state.selectedPart);
            const pixels = event.shiftKey ? 10 : 1;
            const candidate = { ...geometry, x: geometry.x + direction[0] * pixels / state.layout.canvas.width, y: geometry.y + direction[1] * pixels / state.layout.canvas.height };
            const unsnapped = JSON.parse(JSON.stringify(state.layout));
            unsnapped.canvas.alignmentGrid.enabled = false;
            const placement = composer.canPlaceInteraction(unsnapped, component.id, state.selectedPart, candidate);
            if (!placement.valid) return;
            state.layout.canvas.alignmentGrid.enabled = false;
            composer.applyInteractionGeometry(component, state.selectedPart, placement.geometry);
            render();
            onChange(state.layout, 'keyboard-nudge');
        }

        function init() {
            if (initialized) return api;
            initialized = true;
            if (globalThis.ResizeObserver && preview.parentElement) {
                const viewObserver = new ResizeObserver(applyView);
                viewObserver.observe(preview.parentElement);
            }
            bindViewPanning();
            preview.addEventListener('pointerdown', onPointerDown);
            preview.addEventListener('pointermove', onPointerMove);
            preview.addEventListener('pointerup', finishGesture);
            preview.addEventListener('pointercancel', () => {
                const start = state.dragging || state.resizing;
                if (start?.originalLayout) state.layout = start.originalLayout;
                else if (start) composer.applyInteractionGeometry(start.component, start.part, start.geometry);
                clearPending(); state.dragging = state.resizing = null; render();
                onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            });
            preview.addEventListener('lostpointercapture', finishGesture);
            preview.addEventListener('wheel', onWheel, { passive: false });
            preview.addEventListener('click', onClick);
            document.addEventListener('keydown', onKeyDown);
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            centerPlayer();
            return api;
        }

        function setLayout(nextLayout, { record = true, resetHistory = false } = {}) {
            clearPending();
            state.dragging = state.resizing = null;
            state.layout = composer.normalizeLayout(nextLayout);
            if (resetHistory) history.length = 0;
            if (record && !resetHistory) recordHistory();
            else committedLayout = JSON.stringify(state.layout);
            state.selected = null;
            state.selectedPart = null;
            render();
            onSelect(null, null);
            centerPlayer();
        }

        const api = {
            state,
            toggleLock, setLocked, centerView,
            init,
            render,
            select,
            add,
            remove,
            updateLayer,
            updateAlignment,
            updatePalette,
            updateSizingMode,
            updateViewport,
            scaleGroup,
            updateSplit,
            setLayout,
            undo, recordHistory,
            getLayout: () => composer.normalizeLayout(state.layout),
        };
        return api;
    }

    globalThis.YtCdHudLiveMonitorCanvasEditor = Object.freeze({ createEditor, referencePlayerRect });
})();
