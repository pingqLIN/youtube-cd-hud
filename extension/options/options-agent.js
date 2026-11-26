(function () {
    'use strict';
    const object = properties => ({ type: 'object', properties, additionalProperties: false });
    const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
    const color = { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' };
    const string = { type: 'string', minLength: 1, maxLength: 100 };
    function definitions(service) {
        const change = object({ componentId: string, hidden: { type: 'boolean' },
            geometry: object({ x: number(0, 1), y: number(0, 1), width: number(1, 4096), height: number(1, 2160), z: number(-99, 99) }),
            textStyle: object({ fontSize: number(8, 512), fontWeight: number(100, 900), color, opacity: number(0, 1), textAlign: { enum: ['left', 'center', 'right', 'justify'] } }),
            style: object({ backgroundColor: color, opacity: number(0, 1), discOpacity: number(0, 1) }),
            layer: object({ enabled: { type: 'boolean' } }),
        });
        change.required = ['componentId'];
        const specs = [
            ['panel_read', 'Read the current HUD layout, revision, user design request and component locks. Geometry x/y are normalized canvas coordinates; width/height and fontSize are pixels. No browser data is read.', {}, [], () => service.read(), true],
            ['panel_preview_patch', 'Create an isolated HUD draft. Does not change the workspace or YouTube. Use baseRevision from panel_read. Locked components cannot be edited.', { baseRevision: string, changes: { type: 'array', minItems: 1, maxItems: 40, items: change } }, ['baseRevision', 'changes'], input => service.preview(input)],
            ['panel_validate', 'Validate a draft against the latest workspace, locks, collision and connectivity rules.', { draftId: string }, ['draftId'], input => service.validate(input), true],
            ['panel_apply', 'Request user confirmation in the settings page to apply a validated draft. AWAITING_USER does not mean saved or applied.', { draftId: string }, ['draftId'], input => service.requestApply(input)],
            ['panel_undo', 'Create a draft restoring the last Agent transaction, only if no later human edit or storage change occurred. Then request panel_apply.', { baseRevision: string }, ['baseRevision'], input => service.requestUndo(input)],
            ['panel_slot', 'Read slot 0–9, load it into an isolated draft, or request confirmation to save the current workspace to one slot. baseRevision is required for load/save.', { action: { enum: ['read', 'load', 'save'] }, slot: { type: 'string', pattern: '^[0-9]$' }, baseRevision: string }, ['action', 'slot'], (input, options) => service.slot(input, options)],
        ];
        return specs.map(([name, description, properties, required, run, readOnlyHint = false]) => ({
            name, description, inputSchema: { ...object(properties), required },
            annotations: { readOnlyHint, untrustedContentHint: true },
            async execute(input = {}, { signal } = {}) {
                if (signal?.aborted) return { ok: false, error: 'CANCELLED' };
                try {
                    const result = await run(input, { signal });
                    return signal?.aborted ? { ok: false, error: 'CANCELLED' } : { ok: true, ...result };
                }
                catch (error) { return { ok: false, error: String(error.message || error) }; }
            },
        }));
    }
    async function register(modelContext, service, signal) {
        if (typeof modelContext?.registerTool !== 'function') throw new Error('WEBMCP_UNAVAILABLE');
        for (const tool of definitions(service)) {
            if (signal.aborted) throw new Error('CANCELLED');
            await modelContext.registerTool(tool, { signal });
        }
        if (signal.aborted) throw new Error('CANCELLED');
        return { status: 'REGISTERED', count: 6 };
    }
    function connectionFailure(error) {
        const message = String(error?.message || error);
        const domainBlocked = message.includes('document.modelContext cannot be used when document.domain is enabled');
        const boolean = value => typeof value === 'boolean' ? value : null;
        let manifest;
        try { manifest = globalThis.chrome?.runtime?.getManifest?.(); } catch {}
        return {
            status: domainBlocked ? 'WEBMCP_ORIGIN_ISOLATION_REQUIRED' : 'WEBMCP_CONNECTION_FAILED',
            error: { name: error?.name || 'Error', message },
            environment: {
                protocol: globalThis.location?.protocol || null,
                secureContext: boolean(globalThis.isSecureContext),
                originAgentCluster: boolean(globalThis.originAgentCluster),
                crossOriginIsolated: boolean(globalThis.crossOriginIsolated),
                extensionVersion: manifest?.version || null,
                openerPolicy: manifest?.cross_origin_opener_policy?.value || null,
                embedderPolicy: manifest?.cross_origin_embedder_policy?.value || null,
            },
            ...(domainBlocked ? { nextAction: '請在 Chrome 擴充功能管理頁重新載入此擴充，再關閉舊設定分頁並重新開啟。若仍失敗，請提供此診斷結果。此錯誤不代表程式一定寫入過 document.domain。' } : {}),
        };
    }
    function init(host) {
        const element = document.getElementById('panel-agent');
        if (!element) return null;
        const find = id => document.getElementById(id);
        const connection = find('agent-connection');
        const result = find('agent-result');
        const summary = find('agent-summary');
        const previewHost = find('agent-preview');
        const confirm = find('agent-confirm');
        let controller = null;
        const service = globalThis.YtCdHudPanelAgent.create({ ...host, onUpdate: render });
        function render() {
            const state = service.state();
            confirm.disabled = !state.pending || state.busy;
            find('agent-cancel').disabled = state.busy;
            summary.textContent = state.pending?.kind === 'slot-save'
                ? '等待確認：覆寫 ' + state.pending.slot + ' 號槽。'
                : state.draft ? '草稿：' + state.draft.summary.join('、') + (state.pending ? '；等待你確認套用。' : '；尚未套用。') : '尚無 Agent 草稿。';
            previewHost.replaceChildren();
            if (!state.draft) return;
            const source = find('hud-preview');
            const preview = source.cloneNode(true);
            preview.removeAttribute('id');
            preview.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
            preview.querySelectorAll('.lm-resize-handle').forEach(node => node.remove());
            preview.querySelectorAll('.youtube-reference').forEach(node => node.remove());
            const layout = state.draft.layout;
            preview.style.width = '100%'; preview.style.height = '100%';
            preview.style.left = '0'; preview.style.top = '0'; preview.style.transform = 'none';
            previewHost.style.aspectRatio = layout.canvas.width + ' / ' + layout.canvas.height;
            preview.querySelectorAll('[data-lm-component]').forEach(node => {
                const component = host.composer.getComponent(layout, node.dataset.lmComponent);
                Object.entries(host.composer.toCss(component, layout)).forEach(([key, value]) => node.style.setProperty(key, value));
                node.classList.remove('lm-component-selected');
                node.classList.remove('lm-component-locked');
                node.classList.remove('lm-component-invalid');
                node.classList.toggle('lm-component-hidden', !component.present || component.hidden);
                const split = component.arrangement?.split === true;
                node.classList.toggle('lm-transport-split', split);
                for (const [effect, className] of Object.entries({ shadow: 'shadow', accentRail: 'accent-rail', glow: 'glow', statusLamp: 'status-lamp', marquee: 'marquee' })) {
                    node.classList.toggle('lm-effect-' + className, component.effects[effect] === true);
                }
                node.dataset.lmTextAlign = component.textStyle?.textAlign || 'left';
                if (component.id === 'disc') node.dataset.lmTexture = component.style.texture;
                node.querySelectorAll('[data-lm-part]').forEach(part => {
                    part.removeAttribute('style');
                    part.classList.remove('lm-component-selected');
                    if (split) Object.entries(host.composer.toPartCss(component, part.dataset.lmPart, layout)).forEach(([key, value]) => part.style.setProperty(key, value));
                });
            });
            previewHost.appendChild(preview);
        }
        function show(value) { result.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
        find('agent-enable').addEventListener('change', async event => {
            controller?.abort();
            controller = null;
            if (!event.target.checked) { connection.textContent = 'WebMCP 已停用。'; try { service.cancel(); } catch {} return; }
            const active = new AbortController();
            controller = active;
            connection.textContent = '正在註冊工具…';
            try {
                await register(document.modelContext, service, active.signal);
                if (controller === active) connection.textContent = '6 個工具已註冊；等待支援 WebMCP 的 Agent 呼叫。';
            } catch (error) {
                active.abort();
                if (controller === active) {
                    event.target.checked = false;
                    const failure = connectionFailure(error);
                    connection.textContent = failure.status === 'WEBMCP_ORIGIN_ISOLATION_REQUIRED'
                        ? 'WebMCP 註冊被來源隔離條件阻擋。請重新載入擴充並重新開啟設定頁；詳細狀態如下。'
                        : error.message === 'WEBMCP_UNAVAILABLE' ? '此瀏覽器／頁面未提供 WebMCP；仍可手動編輯面板。' : '註冊未完成：' + error.message;
                    show(failure);
                }
            }
        });
        find('agent-request-save').addEventListener('click', () => {
            try { service.setRequest(find('agent-request').value); show('設計要求已更新；Agent 可透過 panel_read 讀取。尚未執行。'); } catch (error) { show(error.message); }
        });
        find('agent-native-check').addEventListener('click', async () => {
            const button = find('agent-native-check');
            button.disabled = true;
            try {
                const modelContext = document.modelContext;
                if (!controller || controller.signal.aborted) throw new Error('請先啟用本頁 WebMCP 工具');
                if (!modelContext?.getTools || !modelContext?.executeTool) throw new Error('NATIVE_CLIENT_UNAVAILABLE');
                const available = await modelContext.getTools();
                const expectedNames = definitions(service).map(tool => tool.name);
                if (!expectedNames.every(name => available.some(tool => tool.name === name))) throw new Error('TOOLS_INCOMPLETE');
                const read = available.find(tool => tool.name === 'panel_read');
                if (!read) throw new Error('TOOL_NOT_DISCOVERED');
                const rawResponse = await modelContext.executeTool(read, {});
                const response = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;
                if (response?.ok !== true || typeof response.revision !== 'string' || !response.layout) throw new Error('NATIVE_READ_INVALID_RESPONSE');
                show({ status: 'NATIVE_READ_COMPLETED', tools: available.filter(tool => tool.name.startsWith('panel_')).map(tool => tool.name), response,
                    note: '此結果僅驗證 Chrome 原生探索及唯讀呼叫，尚未驗證外部 Agent 或套用流程。' });
            } catch (error) { show(connectionFailure(error)); }
            finally { button.disabled = false; }
        });
        confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            try { show(await service.confirm()); } catch (error) { show('未完成：' + error.message); } finally { render(); }
        });
        find('agent-cancel').addEventListener('click', () => { try { show(service.cancel()); } catch (error) { show(error.message); } });
        find('agent-undo').addEventListener('click', () => {
            try { const draft = service.requestUndo({ baseRevision: service.read().revision }); show(service.requestApply({ draftId: draft.draftId })); } catch (error) { show(error.message); }
        });
        globalThis.addEventListener?.('pagehide', () => controller?.abort(), { once: true });
        render();
        return Object.freeze({ service });
    }
    globalThis.YtCdHudOptionsAgent = Object.freeze({ init, definitions, register, connectionFailure });
})();
