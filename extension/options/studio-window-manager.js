(function (root) {
    'use strict';

    // Studio workspace shell: three fixed regions (left tool dock · canvas · right inspector dock).
    // Every tool panel is docked by default so nothing covers the HUD canvas; a panel may still be
    // popped out as a bounded floating window and docked back. Only presentation state is stored.
    const STORAGE_KEY = 'youtube-cd-hud:studio-windows:v2';
    const STORAGE_VERSION = 2;
    const GROUPS = Object.freeze([
        { id: 'layout', title: '版面' },
        { id: 'style', title: '外觀' },
        { id: 'advanced', title: '進階' },
    ]);
    const SPECS = Object.freeze([
        { id: 'properties', title: '屬性', hint: '選取元件的尺寸、文字與效果', group: 'style', side: 'right', selector: '#live-monitor-properties', width: 520, height: 560, minWidth: 440, minHeight: 420, x: 64, y: 48, visible: true, docked: true, collapsed: false },
        { id: 'layout', title: '排版工具', hint: '選取元件、對齊格線與群組縮放', group: 'layout', side: 'left', selector: '#live-monitor-layout-controls', width: 360, x: 48, y: 72, visible: true, docked: true, collapsed: false },
        { id: 'theme', title: '主題與文字', hint: '全面板配色、透明度與字體', group: 'style', side: 'left', selector: '.theme-strip', width: 480, x: 48, y: 128, visible: true, docked: true, collapsed: true },
        { id: 'library', title: '元件庫', hint: '加入或移除可選元件', group: 'layout', side: 'left', selector: '.component-library-shell', width: 380, x: 78, y: 172, visible: true, docked: true, collapsed: true },
        { id: 'agent', title: 'Agent / WebMCP', hint: '經授權的 Agent 設計草稿', group: 'advanced', side: 'left', selector: '#panel-agent', width: 420, x: 108, y: 210, visible: false, docked: true, collapsed: false },
        { id: 'code', title: '面板 JSON', hint: '匯出或匯入完整面板程式碼', group: 'advanced', side: 'left', selector: '.panel-code-section', width: 480, x: 138, y: 245, visible: false, docked: true, collapsed: false },
    ]);
    const DRAG_THRESHOLD = 6;

    function bounded(value, min, max, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
    }

    function normalizeState(data, spec, bounds = { width: 1280, height: 720 }) {
        const raw = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const maxWidth = Math.max(220, Number(bounds.width) || 1280);
        const maxHeight = Math.max(280, Number(bounds.height) || 720);
        const width = bounded(raw.width, Math.min(spec.minWidth || 220, maxWidth), maxWidth, Math.min(spec.width, maxWidth));
        const maxWindowHeight = Math.max(80, maxHeight - 24);
        const height = bounded(raw.height, Math.min(spec.minHeight || 80, maxWindowHeight), maxWindowHeight, Math.min(spec.height || 320, maxWindowHeight));
        return {
            visible: typeof raw.visible === 'boolean' ? raw.visible : Boolean(spec.visible),
            docked: typeof raw.docked === 'boolean' ? raw.docked : Boolean(spec.docked),
            collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : Boolean(spec.collapsed),
            x: bounded(raw.x, 0, Math.max(0, maxWidth - 72), Math.min(spec.x, Math.max(0, maxWidth - 72))),
            y: bounded(raw.y, 48, Math.max(48, maxHeight - 36), Math.min(spec.y, Math.max(48, maxHeight - 36))),
            width,
            height,
        };
    }

    function loadSaved(storage) {
        try {
            const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
            return parsed && parsed.version === STORAGE_VERSION && parsed.panels && typeof parsed.panels === 'object' ? parsed.panels : {};
        } catch (_) { return {}; }
    }

    function init(documentRef = root.document, storage = root.localStorage) {
        if (!documentRef) return null;
        const studio = documentRef.getElementById('panel-studio');
        const bench = studio?.querySelector('.preview-workbench');
        if (!studio || !bench || bench.dataset.studioWindowsReady === 'true') return null;

        const saved = loadSaved(storage);
        const records = new Map();
        const make = (tag, className, attrs = {}) => {
            const node = documentRef.createElement(tag);
            if (className) node.className = className;
            for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
            return node;
        };

        const launcher = make('nav', 'studio-window-launcher', { 'aria-label': 'Studio 面板顯示' });
        const launcherGroups = new Map();
        for (const group of GROUPS) {
            const box = make('div', 'studio-launcher-group', { role: 'group', 'aria-label': group.title });
            box.dataset.group = group.id;
            const label = make('span', 'studio-launcher-label');
            label.textContent = group.title;
            box.append(label);
            launcher.append(box);
            launcherGroups.set(group.id, box);
        }

        function makeDock(side, label) {
            const dock = make('aside', 'studio-window-dock studio-dock-' + side, { 'aria-label': label });
            dock.dataset.side = side;
            const scroll = make('div', 'studio-dock-scroll');
            dock.append(scroll);
            return { dock, scroll };
        }
        const left = makeDock('left', '工具面板');
        const right = makeDock('right', '屬性面板');
        const overlay = make('div', 'studio-window-overlay');
        bench.prepend(left.dock);
        bench.append(right.dock, overlay);
        bench.parentElement.insertBefore(launcher, bench);

        function bounds() {
            return { width: bench.clientWidth || 1280, height: bench.clientHeight || 720 };
        }
        function save() {
            const panels = {};
            for (const [id, record] of records) panels[id] = { ...record.state };
            try { storage?.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, panels })); }
            catch (_) { /* storage may be unavailable; controls still work */ }
        }
        function syncDocks() {
            for (const side of ['left', 'right']) {
                const used = [...records.values()].some(r => r.spec.side === side && r.state.visible && r.state.docked);
                bench.dataset[side === 'left' ? 'leftDock' : 'rightDock'] = used ? 'open' : 'empty';
            }
        }
        function bringFront(record) {
            for (const item of records.values()) item.node.style.removeProperty('--studio-window-order');
            record.node.style.setProperty('--studio-window-order', String(Date.now() % 100000));
        }
        function apply(record) {
            const { node, state, spec, trigger, collapse, pin } = record;
            const parent = state.docked ? (spec.side === 'right' ? right.scroll : left.scroll) : overlay;
            if (node.parentNode !== parent) {
                // Keep docked panels in their declared order regardless of toggle history.
                const after = [...parent.children].find(child => {
                    const other = records.get(child.dataset.studioId);
                    return other && SPECS.indexOf(other.spec) > SPECS.indexOf(spec);
                });
                parent.insertBefore(node, after || null);
            }
            node.hidden = !state.visible;
            node.classList.toggle('is-floating', !state.docked);
            node.classList.toggle('is-docked', state.docked);
            node.classList.toggle('is-collapsed', state.collapsed);
            node.dataset.studioId = spec.id;
            node.style.left = state.docked ? '' : state.x + 'px';
            node.style.top = state.docked ? '' : state.y + 'px';
            node.style.width = state.docked ? '' : state.width + 'px';
            node.style.height = state.docked || state.collapsed ? '' : state.height + 'px';
            trigger.setAttribute('aria-pressed', String(state.visible));
            collapse.setAttribute('aria-expanded', String(!state.collapsed));
            collapse.textContent = state.collapsed ? '▸' : '▾';
            collapse.title = (state.collapsed ? '展開 ' : '收合 ') + spec.title;
            collapse.setAttribute('aria-label', collapse.title);
            pin.textContent = state.docked ? '⧉' : '⇲';
            pin.title = state.docked ? '改為浮動視窗：' + spec.title : '停駐回側欄：' + spec.title;
            pin.setAttribute('aria-label', pin.title);
            syncDocks();
        }
        function change(record, partial) {
            Object.assign(record.state, partial);
            record.state = normalizeState(record.state, record.spec, bounds());
            apply(record);
            save();
        }
        function reveal(id) {
            const record = records.get(id);
            if (!record) return false;
            change(record, { visible: true, collapsed: false });
            if (record.state.docked) record.node.scrollIntoView?.({ block: 'nearest' });
            else bringFront(record);
            return true;
        }

        for (const spec of SPECS) {
            const source = studio.querySelector(spec.selector);
            if (!source) continue;
            const node = spec.id === 'properties' ? source : make('section');
            node.classList.add('studio-floating-panel');
            node.id ||= 'studio-window-' + spec.id;
            node.setAttribute('aria-label', spec.title + '設定面板');
            const bar = make('div', 'studio-window-bar' + (spec.id === 'properties' ? ' preview-properties-header' : ''));
            const handle = make('span', 'studio-window-handle', { role: 'button', tabindex: '0', 'aria-label': spec.title + '：Enter 收合或展開；浮動時方向鍵微調位置' });
            const name = make('b', 'studio-window-title');
            name.textContent = spec.title;
            const hint = make('small', 'studio-window-hint');
            hint.textContent = spec.hint;
            handle.append(name, hint);
            const collapse = make('button', 'studio-window-collapse' + (spec.id === 'properties' ? ' preview-properties-toggle' : ''), { type: 'button' });
            const pin = make('button', 'studio-window-pin', { type: 'button' });
            const close = make('button', 'studio-window-close', { type: 'button', 'aria-label': '隱藏 ' + spec.title, title: '隱藏 ' + spec.title });
            close.textContent = '×';
            bar.append(handle, collapse, pin, close);
            if (node !== source) {
                const body = make('div', 'studio-window-body');
                body.append(source);
                node.append(bar, body);
                if (source.tagName === 'DETAILS') source.open = true;
            } else {
                node.prepend(bar);
            }

            const trigger = make('button', 'studio-window-trigger', { type: 'button', 'aria-controls': node.id, title: spec.hint });
            trigger.textContent = spec.title;
            (launcherGroups.get(spec.group) || launcher).append(trigger);
            const persisted = saved[spec.id];
            // Inspectors open fully expanded, even if a previous session left them collapsed.
            const initial = spec.id === 'properties' && persisted ? { ...persisted, collapsed: false } : persisted;
            const record = { node, spec, bar, handle, collapse, pin, trigger, state: normalizeState(initial, spec, bounds()) };
            records.set(spec.id, record);
            trigger.addEventListener('click', () => {
                if (record.state.visible) change(record, { visible: false });
                else reveal(spec.id);
            });
            collapse.addEventListener('click', () => change(record, { collapsed: !record.state.collapsed }));
            pin.addEventListener('click', () => {
                const b = bounds();
                // Pop out next to the left dock instead of on top of the canvas tools.
                const partial = record.state.docked ? { docked: false, collapsed: false, x: Math.min(b.width - record.state.width, (left.dock.clientWidth || 0) + 24), y: 56 } : { docked: true };
                change(record, partial);
                bringFront(record);
            });
            close.addEventListener('click', () => change(record, { visible: false }));
            node.addEventListener('pointerdown', () => { if (!record.state.docked) bringFront(record); });

            let dragging = null;
            handle.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, left: record.state.x, top: record.state.y, moved: false };
                handle.setPointerCapture?.(event.pointerId);
            });
            handle.addEventListener('pointermove', event => {
                if (!dragging || dragging.id !== event.pointerId) return;
                const dx = event.clientX - dragging.x;
                const dy = event.clientY - dragging.y;
                if (!dragging.moved) {
                    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                    dragging.moved = true;
                    bar.classList.add('is-dragging');
                    if (record.state.docked) {
                        // Dragging a docked header tears it off as a floating window at the pointer.
                        const benchRect = bench.getBoundingClientRect();
                        const nodeRect = node.getBoundingClientRect();
                        record.state.docked = false;
                        record.state.collapsed = false;
                        record.state.x = Math.max(0, nodeRect.left - benchRect.left);
                        record.state.y = Math.max(48, nodeRect.top - benchRect.top);
                        record.state = normalizeState(record.state, spec, bounds());
                        dragging.left = record.state.x;
                        dragging.top = record.state.y;
                        apply(record);
                    }
                    bringFront(record);
                }
                const b = bounds();
                record.state.x = bounded(dragging.left + dx, 0, Math.max(0, b.width - 72), 0);
                record.state.y = bounded(dragging.top + dy, 48, Math.max(48, b.height - 36), 48);
                node.style.left = record.state.x + 'px';
                node.style.top = record.state.y + 'px';
            });
            function finishDrag(event) {
                if (!dragging || dragging.id !== event.pointerId) return;
                const wasClick = !dragging.moved;
                dragging = null;
                bar.classList.remove('is-dragging');
                if (wasClick && event.type === 'pointerup') change(record, { collapsed: !record.state.collapsed });
                else save();
            }
            handle.addEventListener('pointerup', finishDrag);
            handle.addEventListener('pointercancel', finishDrag);
            handle.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault(); change(record, { collapsed: !record.state.collapsed }); return;
                }
                if (record.state.docked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                const step = event.shiftKey ? 10 : 1;
                const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
                const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
                change(record, { x: record.state.x + dx, y: record.state.y + dy });
            });
            node.addEventListener('pointerup', event => {
                if (record.state.docked || record.state.collapsed || handle.contains(event.target)) return;
                const rect = node.getBoundingClientRect();
                if (rect.width !== record.state.width || rect.height !== record.state.height) {
                    change(record, { width: rect.width, height: rect.height });
                }
            });
            apply(record);
        }
        const tools = make('div', 'studio-launcher-tools');
        const reset = make('button', 'studio-window-trigger studio-window-reset', { type: 'button', 'aria-label': '重設所有 Studio 面板的停駐、收合及顯示狀態', title: '恢復預設面板配置' });
        reset.textContent = '重設面板配置';
        reset.addEventListener('click', () => {
            for (const record of records.values()) {
                record.state = normalizeState(null, record.spec, bounds());
                apply(record);
            }
            save();
        });
        tools.append(reset);
        launcher.append(tools);
        syncDocks();
        bench.dataset.studioWindowsReady = 'true';
        // Re-clamp floating windows when workbench dimensions change, without touching HUD layout.
        root.addEventListener?.('resize', () => {
            for (const record of records.values()) {
                record.state = normalizeState(record.state, record.spec, bounds());
                apply(record);
            }
        });
        return Object.freeze({ reveal, getState: id => records.has(id) ? { ...records.get(id).state } : null, storageKey: STORAGE_KEY });
    }

    const api = Object.freeze({ init, normalizeState, loadSaved, STORAGE_KEY, STORAGE_VERSION, SPECS, GROUPS });
    root.YtCdHudStudioWindowManager = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root.document) {
        const initialize = () => { root.YtCdHudStudioWindows = init(); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initialize, { once: true });
        else initialize();
    }
})(globalThis);
