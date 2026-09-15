(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;
    const resizeEngine = globalThis.YtCdHudLiveMonitorResizeEngine;

    function createEditor({ preview, layout, onChange = () => {}, onSelect = () => {}, onRender = () => {} }) {
        if (!preview) throw new Error('Live Monitor preview stage is required.');
        const state = { layout: composer.normalizeLayout(layout), selected: null, selectedPart: null, dragging: null, resizing: null, pending: null };
        let initialized = false;
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

        function renderOverlay(node, component) {
            let overlay = node.querySelector(':scope > .lm-lock-overlay');
            if (!overlay) { overlay = document.createElement('span'); overlay.className = 'lm-lock-overlay'; overlay.setAttribute('aria-hidden', 'true'); node.appendChild(overlay); }
            overlay.hidden = !(state.layout.locked || component.locked);
            const units = state.layout.components.filter(item => item.present && !item.hidden);
            const index = units.findIndex(item => item.id === component.id);
            const depth = index / Math.max(1, units.length - 1);
            overlay.style.setProperty('--lm-lock-shade', `color-mix(in srgb, ${state.layout.palette.primaryColor} ${depth <= .5 ? 40 + depth * 120 : 100 - (depth - .5) * 120}%, ${depth <= .5 ? 'white' : 'black'})`);
            overlay.dataset.order = String(index + 1);
        }

        function render() {
            composer.refreshBase(state.layout);
            preview.classList.add('lm-editor-stage');
            preview.style.width = state.layout.canvas.width + 'px';
            preview.style.height = state.layout.canvas.height + 'px';
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
                renderOverlay(node, component);
                node.querySelectorAll('[data-lm-part]').forEach(partNode => {
                    renderOverlay(partNode, component);
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
            state.pending = { ...start, handle: direction, timer: setTimeout(() => {
                if (!state.pending || state.layout.locked || component.locked) return;
                state.dragging = start;
                state.pending = null;
                render();
            }, 400) };
        }

        function onPointerMove(event) {
            if (state.pending && Math.hypot(event.clientX - state.pending.clientX, event.clientY - state.pending.clientY) > 3) {
                const pending = state.pending;
                clearPending();
                state.resizing = pending;
            }
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
            const result = resizeEngine.scaleGroup(state.layout, factor, ids);
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

        function centerView() {
            const base = componentFor('panel-base');
            const host = preview.parentElement;
            if (!host) return;
            host.scrollLeft = base.geometry.x * state.layout.canvas.width - host.clientWidth / 2;
            host.scrollTop = base.geometry.y * state.layout.canvas.height - host.clientHeight / 2;
        }

        function onKeyDown(event) {
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
            preview.addEventListener('pointerdown', onPointerDown);
            preview.addEventListener('pointermove', onPointerMove);
            preview.addEventListener('pointerup', finishGesture);
            preview.addEventListener('pointercancel', () => {
                const start = state.dragging || state.resizing;
                if (start) composer.applyInteractionGeometry(start.component, start.part, start.geometry);
                clearPending(); state.dragging = state.resizing = null; render();
            });
            preview.addEventListener('lostpointercapture', finishGesture);
            preview.addEventListener('wheel', onWheel, { passive: false });
            preview.addEventListener('click', onClick);
            document.addEventListener('keydown', onKeyDown);
            render();
            onSelect(state.selected, componentFor(state.selected), state.selectedPart);
            centerView();
            return api;
        }

        function setLayout(nextLayout) {
            clearPending();
            state.dragging = state.resizing = null;
            state.layout = composer.normalizeLayout(nextLayout);
            state.selected = null;
            state.selectedPart = null;
            render();
            onSelect(null, null);
            centerView();
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
            getLayout: () => composer.normalizeLayout(state.layout),
        };
        return api;
    }

    globalThis.YtCdHudLiveMonitorCanvasEditor = Object.freeze({ createEditor });
})();
