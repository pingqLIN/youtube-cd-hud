(function (root) {
    'use strict';
    const registry = root.YtCdHudPropertySections;
    if (!registry) throw new Error('Property section registry must load first');
    registry.register("appearance", function renderSection(context) {
        const { rule, component, selectedPart, editor, composer, toolbar, commit, addLabel, addColorProperty, addSectionLabel, addFixedToken, addEffect, addStyleToggle, addLayerControls, addSplitControl } = context;
            addSectionLabel('UNIT APPEARANCE');
            if (rule.supportedProperties.includes('color')) addColorProperty('Color', 'color', component);
            if (rule.supportedProperties.includes('backgroundColor')) addColorProperty('Unit BG', 'backgroundColor', component);
            if (rule.supportedProperties.includes('borderColor')) addColorProperty('Border', 'borderColor', component);
            if (rule.supportedProperties.includes('borderEnabled')) addStyleToggle('SHOW BORDER', 'borderEnabled', component);
            addFixedToken('BORDER COLOR', 'SECONDARY');
            const secondaryAlpha = document.createElement('input');
            secondaryAlpha.type = 'range'; secondaryAlpha.min = '0'; secondaryAlpha.max = '1'; secondaryAlpha.step = '.01';
            secondaryAlpha.value = String(component.style.secondaryOpacity ?? 1);
            secondaryAlpha.dataset.lmProperty = 'secondaryOpacity';
            secondaryAlpha.addEventListener('input', () => { component.style.secondaryOpacity = Number(secondaryAlpha.value); commit('color-alpha'); });
            addLabel('輔色不透明度 · 邊框／效果', secondaryAlpha);
            if (rule.fixedRoundShape) {
                addFixedToken('UNIT CORNER', 'FIXED CIRCLE');
            } else {
                if (rule.supportedProperties.includes('cornerEnabled')) addStyleToggle('ROUND CORNERS', 'cornerEnabled', component);
                if (rule.supportedProperties.includes('cornerRadiusLevel')) {
                    const input = document.createElement('input');
                    input.type = 'range';
                    input.dataset.lmProperty = 'cornerRadiusLevel';
                    input.min = String(composer.CORNER_RADIUS_LEVEL_MINIMUM);
                    input.max = String(composer.CORNER_RADIUS_LEVEL_MAXIMUM);
                    input.step = '1';
                    input.value = component.style.cornerRadiusLevel;
                    input.disabled = component.style.cornerEnabled !== true;
                    input.addEventListener('input', () => {
                        component.style.cornerRadiusLevel = Number(input.value);
                        commit('unit-appearance');
                    });
                    addLabel('Corner radius · 1–10', input);
                }
            }
            if (rule.supportedProperties.includes('backgroundBlurEnabled')) addStyleToggle('BG BLUR', 'backgroundBlurEnabled', component);
            if (rule.supportedProperties.includes('font')) {
                const input = document.createElement('select');
                input.dataset.lmProperty = 'font';
                Object.keys(composer.FONT_STACKS).forEach(font => {
                    const option = document.createElement('option');
                    option.value = font;
                    option.textContent = font;
                    input.appendChild(option);
                });
                input.value = component.style.font;
                input.addEventListener('change', () => {
                    component.style.font = input.value;
                    commit();
                });
                addLabel('Font', input);
            }
            if (rule.supportedProperties.includes('fontSize')) {
                const input = document.createElement('input');
                input.type = 'range';
                input.dataset.lmProperty = 'fontSize';
                input.min = '0';
                input.max = '1000';
                input.step = '1';
                input.value = composer.fontSizeToSlider(component.style.fontSize);
                input.addEventListener('input', () => {
                    component.style.fontSize = composer.fontSizeFromSlider(Number(input.value));
                    input.setAttribute('aria-valuetext', component.style.fontSize + ' px');
                    commit();
                });
                addLabel('Font size', input);
            }
            if (rule.supportedProperties.includes('textAlign')) {
                const input = document.createElement('select');
                input.dataset.lmProperty = 'textAlign';
                const labels = { left: 'LFT', right: 'RGT', center: 'CTR', justify: 'JST' };
                composer.TEXT_ALIGNMENTS.forEach(alignment => {
                    const option = document.createElement('option');
                    option.value = alignment;
                    option.textContent = labels[alignment];
                    input.appendChild(option);
                });
                input.value = component.style.textAlign;
                input.addEventListener('change', () => {
                    component.style.textAlign = input.value;
                    commit('text-align');
                });
                addLabel('Text align', input);
            }
            if (rule.supportedProperties.includes('opacity')) {
                const input = document.createElement('input');
                input.type = 'range';
                input.dataset.lmProperty = 'opacity';
                input.min = '0';
                input.max = '1';
                input.step = '.05';
                input.value = component.style.opacity;
                input.addEventListener('input', () => {
                    component.style.opacity = Number(input.value);
                    commit();
                });
                addLabel('底色不透明度', input);
            }
            if (rule.supportedProperties.includes('discOpacity')) {
                const input = document.createElement('input');
                input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.01';
                input.dataset.lmProperty = 'discOpacity';
                input.value = String(component.style.discOpacity ?? 1);
                const output = document.createElement('output');
                output.value = Math.round(Number(input.value) * 100) + '%';
                input.setAttribute('aria-valuetext', output.value);
                input.addEventListener('input', () => {
                    component.style.discOpacity = Number(input.value);
                    output.value = Math.round(Number(input.value) * 100) + '%';
                    input.setAttribute('aria-valuetext', output.value);
                    commit('disc-opacity');
                });
                addLabel('唱盤不透明度 · 0% 透明 / 100% 不透明', input);
                toolbar.appendChild(output);
            }
            if (rule.supportedProperties.includes('volumeStyle')) {
                const input = document.createElement('select'); input.dataset.lmProperty = 'volumeStyle';
                for (const [value, label] of [['fader', '音量推桿'], ['knob', '音量旋鈕（上下拖曳）']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; input.appendChild(option); }
                input.value = component.style.volumeStyle;
                input.addEventListener('change', () => { component.style.volumeStyle = input.value; commit('volumeStyle'); });
                addLabel('音量樣式', input);
            }
            if (rule.supportedProperties.includes('texture')) {
                const input = document.createElement('select');
                input.dataset.lmProperty = 'texture';
                const labels = { classic: '目前樣式', gold: '金色唱片', 'transparent-grooves': '透明同心刻痕' };
                composer.DISC_TEXTURES.forEach(texture => {
                    const option = document.createElement('option');
                    option.value = texture;
                    option.textContent = labels[texture];
                    input.appendChild(option);
                });
                input.value = component.style.texture;
                input.addEventListener('change', () => {
                    component.style.texture = input.value;
                    commit('texture');
                });
                addLabel('唱片紋理', input);
            }
            if (rule.supportedProperties.includes('size')) {
                const input = document.createElement('input');
                input.type = 'range';
                input.dataset.lmProperty = 'size';
                const splitPart = component.arrangement?.split ? (selectedPart || 'previous') : null;
                const geometry = composer.interactionGeometry(component, splitPart);
                const scale = composer.sizeScale(editor.state.layout.canvas);
                const limits = composer.sizeLimits(component, editor.state.layout.canvas);
                const minimum = splitPart ? 64 * scale : limits.minWidth;
                const maximum = splitPart ? 180 * scale : limits.maxWidth;
                const relative = editor.state.layout.canvas.sizingMode === 'relative';
                input.min = String(relative ? minimum / editor.state.layout.canvas.width * 100 : minimum);
                input.max = String(relative ? maximum / editor.state.layout.canvas.width * 100 : maximum);
                input.step = relative ? '.1' : '1';
                input.value = relative ? geometry.width / editor.state.layout.canvas.width * 100 : geometry.width;
                input.addEventListener('input', () => {
                    const current = composer.interactionGeometry(component, splitPart);
                    const ratio = current.height / Math.max(1, current.width);
                    const width = relative ? Number(input.value) / 100 * editor.state.layout.canvas.width : Number(input.value);
                    const candidate = {
                        ...current,
                        width,
                        height: width * ratio,
                    };
                    const placement = composer.canPlaceInteraction(editor.state.layout, component.id, splitPart, candidate);
                    if (!placement.valid) return;
                    composer.applyInteractionGeometry(component, splitPart, placement.geometry);
                    commit();
                });
                addLabel(relative ? 'Size · %' : 'Size · PX', input);
            }
            if (rule.supportedProperties.includes('padding')) {
                const input = document.createElement('input');
                input.type = 'range';
                input.dataset.lmProperty = 'padding';
                input.min = '0';
                input.max = '96';
                input.step = '2';
                input.value = component.boundary.padding;
                input.addEventListener('input', () => {
                    component.boundary.padding = Number(input.value);
                    commit();
                });
                addLabel('Envelope padding', input);
            }
    });
})(globalThis);
