(function () {
    'use strict';

    const TYPE = 'YT_CD_HUD_SETTINGS';

    async function execute(request) {
        if (!globalThis.chrome?.runtime?.sendMessage) return { ok: false, error: 'SETTINGS_CLIENT_UNAVAILABLE' };
        try { return await chrome.runtime.sendMessage({ type: TYPE, ...request }); }
        catch (error) { return { ok: false, error: String(error?.message || error) }; }
    }

    globalThis.YtCdHudSettingsClient = Object.freeze({
        read: () => execute({ action: 'read' }),
        apply: request => execute({ action: 'apply', ...request }),
        operationStatus: operationId => execute({ action: 'operation.status', operationId }),
    });
})();
