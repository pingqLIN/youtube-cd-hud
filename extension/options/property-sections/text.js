(function (root) {
    'use strict';
    const registry = root.YtCdHudPropertySections;
    if (!registry) throw new Error('Property section registry must load first');
    registry.register("text", function renderSection(context) {
        const { rule, component, selectedPart, editor, composer, toolbar, commit, addLabel, addColorProperty, addSectionLabel, addFixedToken, addEffect, addStyleToggle, addLayerControls, addSplitControl } = context;
            if (rule.supportedTextProperties.length) {
                addSectionLabel('TEXT APPEARANCE');
                if (rule.supportedTextProperties.includes('color')) addColorProperty('Text color', 'color', component, component.textStyle, 'text');
                if (rule.supportedTextProperties.includes('opacity')) {
                    const input = document.createElement('input');
                    input.type = 'range';
                    input.dataset.lmTextProperty = 'opacity';
                    input.min = '0';
                    input.max = '1';
                    input.step = '.05';
                    input.value = component.textStyle.opacity;
                    input.addEventListener('input', () => {
                        component.textStyle.opacity = Number(input.value);
                        commit('text-property');
                    });
                    addLabel('文字色不透明度', input);
                }
                if (rule.supportedTextProperties.includes('font')) {
                    const input = document.createElement('select');
                    input.dataset.lmTextProperty = 'font';
                    Object.keys(composer.FONT_STACKS).forEach(font => {
                        const option = document.createElement('option');
                        option.value = font;
                        option.textContent = font;
                        input.appendChild(option);
                    });
                    input.value = component.textStyle.font;
                    input.addEventListener('change', () => {
                        component.textStyle.font = input.value;
                        commit('text-property');
                    });
                    addLabel('Text font', input);
                }
                if (rule.supportedTextProperties.includes('fontWeight')) {
                    const input = document.createElement('input');
                    input.type = 'range'; input.min = '100'; input.max = '900'; input.step = '100';
                    input.dataset.lmTextProperty = 'fontWeight';
                    input.value = String(component.textStyle.fontWeight ?? composer.defaultFontWeight(component.id));
                    const readout = document.createElement('output');
                    readout.value = input.value;
                    input.setAttribute('aria-valuetext', input.value);
                    input.title = '使用字型支援的最接近字重；不合成假粗體。';
                    input.addEventListener('input', () => {
                        component.textStyle.fontWeight = Number(input.value);
                        readout.value = input.value;
                        input.setAttribute('aria-valuetext', input.value);
                        commit('text-property');
                    });
                    addLabel('字重 / Weight · 400 標準 · 700 粗體', input);
                    toolbar.appendChild(readout);
                }
                if (rule.supportedTextProperties.includes('fontSize')) {
                    const input = document.createElement('input');
                    input.type = 'range';
                    input.dataset.lmTextProperty = 'fontSize';
                    const textLimits = composer.textSizeLimits(editor.state.layout.canvas);
                    input.min = '0';
                    input.max = '1000';
                    input.step = '1';
                    input.value = composer.fontSizeToSlider(component.textStyle.fontSize, textLimits.minimum, textLimits.maximum);
                    const readout = document.createElement('output');
                    readout.value = component.textStyle.fontSize + ' px';
                    input.addEventListener('input', () => {
                        component.textStyle.fontSize = composer.fontSizeFromSlider(Number(input.value), textLimits.minimum, textLimits.maximum);
                        readout.value = component.textStyle.fontSize + ' px';
                        input.setAttribute('aria-valuetext', readout.value);
                        composer.ensureTextFits(component, editor.state.layout.canvas);
                        commit('text-property');
                    });
                    addLabel('Text size · PX（左半 8–32）', input);
                    toolbar.appendChild(readout);
                }
                if (rule.supportedTextProperties.includes('textAlign')) {
                    const input = document.createElement('select');
                    input.dataset.lmTextProperty = 'textAlign';
                    const labels = { left: 'LFT', right: 'RGT', center: 'CTR', justify: 'JST' };
                    composer.TEXT_ALIGNMENTS.forEach(alignment => {
                        const option = document.createElement('option');
                        option.value = alignment;
                        option.textContent = labels[alignment];
                        input.appendChild(option);
                    });
                    input.value = component.textStyle.textAlign;
                    input.addEventListener('change', () => {
                        component.textStyle.textAlign = input.value;
                        commit('text-property');
                    });
                    addLabel('Text align', input);
                }
                addFixedToken('TEXT SHADOW / GLOW', 'SECONDARY');
            }
    });
})(globalThis);
