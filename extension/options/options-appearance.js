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
        const btnDec = document.getElementById('settings-font-decrease');
        const btnInc = document.getElementById('settings-font-increase');

        function updateFont(value, persist = true) {
            fontScale = Math.min(150, Math.max(80, Number(value) || 100));
            applyFontScale();
            if (font) font.value = String(fontScale);
            if (output) output.textContent = fontScale + '%';
            if (btnDec) btnDec.disabled = fontScale <= 80;
            if (btnInc) btnInc.disabled = fontScale >= 150;
            if (persist) { try { localStorage.setItem('ytCdHudOptionsFontScale', String(fontScale)); } catch {} }
        }

        updateFont(fontScale, false);

        if (btnDec) {
            btnDec.addEventListener('click', () => updateFont(fontScale - 5));
        }
        if (btnInc) {
            btnInc.addEventListener('click', () => updateFont(fontScale + 5));
        }
        if (font) {
            font.addEventListener('input', () => updateFont(font.value));
        }

        const themeTarget = document.getElementById('interface-theme');
        if (!themeTarget) return;

        function updateThemeDisplay() {
            themeTarget.value = theme;
            themeTarget.setAttribute?.('data-theme', theme);
            const isDark = theme === 'dark';
            const icon = themeTarget.querySelector?.('.theme-icon') || themeTarget;
            if (icon && (themeTarget.tagName === 'BUTTON' || icon !== themeTarget)) {
                icon.textContent = isDark ? '☀' : '☾';
            }
            const label = isDark ? '切換至明亮主題' : '切換至黑暗主題';
            themeTarget.setAttribute?.('title', label);
            themeTarget.setAttribute?.('aria-label', label);
        }

        function setTheme(nextTheme) {
            theme = nextTheme === undefined ? (theme === 'light' ? 'dark' : 'light') : (nextTheme === 'light' ? 'light' : 'dark');
            document.documentElement.dataset.theme = theme;
            updateThemeDisplay();
            try { localStorage.setItem(key, theme); } catch { /* The choice still works for this page. */ }
        }

        updateThemeDisplay();

        if (themeTarget.tagName === 'BUTTON') {
            themeTarget.addEventListener('click', () => setTheme());
        }
        themeTarget.addEventListener('change', () => setTheme(themeTarget.value));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
