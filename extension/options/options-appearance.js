(function () {
    'use strict';

    // This is a local preference for the settings UI, independent of HUD colors.
    const key = 'ytCdHudOptionsTheme';
    let theme = 'dark';
    try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch { /* Storage may be unavailable. */ }
    document.documentElement.dataset.theme = theme;

    let fontScale = 100;
    try { fontScale = Math.min(150, Math.max(80, Number(localStorage.getItem('ytCdHudOptionsFontScale')) || 100)); } catch {}
    const applyFontScale = () => document.documentElement.style?.setProperty('--settings-font-scale', String(fontScale / 100));
    applyFontScale();

    function bind() {
        const font = document.getElementById('settings-font-size');
        const output = document.getElementById('settings-font-size-output');
        if (font) {
            font.value = String(fontScale);
            if (output) output.textContent = fontScale + '%';
            font.addEventListener('input', () => {
                fontScale = Math.min(150, Math.max(80, Number(font.value) || 100));
                applyFontScale();
                if (output) output.textContent = fontScale + '%';
                try { localStorage.setItem('ytCdHudOptionsFontScale', String(fontScale)); } catch {}
            });
        }

        const select = document.getElementById('interface-theme');
        if (!select) return;
        select.value = theme;
        select.addEventListener('change', () => {
            theme = select.value === 'light' ? 'light' : 'dark';
            document.documentElement.dataset.theme = theme;
            try { localStorage.setItem(key, theme); } catch { /* The choice still works for this page. */ }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
