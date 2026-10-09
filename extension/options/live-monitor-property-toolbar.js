(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;

    function createToolbar({ host, editor, onChange = () => {} }) {
        const toolbar = document.createElement('section');
        toolbar.className = 'lm-property-toolbar';
        toolbar.hidden = true;
        toolbar.setAttribute('aria-label', 'Selected component properties');
        host.appendChild(toolbar);

        function addLabel(text, control) {
            const label = document.createElement('label');
            label.className = 'lm-property-field';
            const caption = document.createElement('span');
            caption.textContent = text;
            label.append(caption, control);
            toolbar.appendChild(label);
        }

        function commit(reason = 'property') {
            composer.refreshSkin(editor.state.layout);
            composer.refreshBase(editor.state.layout);
            editor.recordHistory?.();
            onChange(editor.state.layout, reason);
            editor.render();
        }

        function addColorProperty(caption, property, component, target = component.style, scope = 'panel') {
            const input = document.createElement('input');
            input.type = 'color';
            if (scope === 'text') input.dataset.lmTextProperty = property;
            else input.dataset.lmProperty = property;
            input.value = target[property];
            input.addEventListener('input', () => {
                target[property] = input.value;
                commit(scope === 'text' ? 'text-property' : 'property');
            });
            addLabel(caption, input);
        }

        function addSectionLabel(text) {
            const label = document.createElement('div');
            label.className = 'lm-property-section-label';
            label.textContent = text;
            toolbar.appendChild(label);
        }

        function addFixedToken(label, token) {
            const note = document.createElement('p');
            note.className = 'lm-property-fixed-token';
            note.innerHTML = '<span></span><strong></strong>';
            note.querySelector('span').textContent = label;
            note.querySelector('strong').textContent = token;
            toolbar.appendChild(note);
        }

        function addEffect(name, component) {
            const label = document.createElement('label');
            label.className = 'lm-effect-field';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.lmEffect = name;
            input.checked = component.effects[name] === true;
            const caption = document.createElement('span');
            caption.textContent = name.replace(/([A-Z])/g, ' $1');
            input.addEventListener('change', () => {
                component.effects[name] = input.checked;
                commit('effect');
            });
            label.append(input, caption);
            toolbar.appendChild(label);
        }

        function addStyleToggle(caption, property, component) {
            const label = document.createElement('label');
            label.className = 'lm-effect-field';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.lmProperty = property;
            input.checked = component.style[property] === true;
            const text = document.createElement('span');
            text.textContent = caption;
            input.addEventListener('change', () => {
                component.style[property] = input.checked;
                commit('unit-appearance');
            });
            label.append(input, text);
            toolbar.appendChild(label);
        }

        function addLayerControls(rule, component) {
            if (!rule.supportsZAxis) return;
            if (!rule.zAxisAlways) {
                const label = document.createElement('label');
                label.className = 'lm-effect-field lm-layer-toggle';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.dataset.lmProperty = 'layerEnabled';
                input.checked = component.layer.enabled;
                const caption = document.createElement('span');
                caption.textContent = 'Enable Z axis';
                input.addEventListener('change', () => {
                    const result = editor.updateLayer(component.id, { enabled: input.checked, z: component.geometry.z });
                    if (!result.updated) {
                        input.checked = component.layer.enabled;
                        input.title = 'This layer would overlap another unit on Z=0.';
                    }
                });
                label.append(input, caption);
                toolbar.appendChild(label);
            }
            if (component.layer.enabled || rule.zAxisAlways) {
                const input = document.createElement('input');
                input.type = 'number';
                input.dataset.lmProperty = 'z';
                input.min = '-99';
                input.max = '99';
                input.step = '1';
                input.value = component.geometry.z;
                input.setAttribute('aria-label', 'Z axis layer');
                input.addEventListener('change', () => {
                    const result = editor.updateLayer(component.id, { enabled: true, z: Number(input.value) });
                    if (!result.updated) {
                        input.value = component.geometry.z;
                        input.title = 'Units on the same Z layer cannot overlap.';
                    }
                });
                addLabel(rule.zAxisAlways ? 'Z axis · always on' : 'Z axis', input);
            }
        }

        function addSplitControl(rule, component) {
            if (!rule.supportsSplit || !component.arrangement) return;
            const label = document.createElement('label');
            label.className = 'lm-effect-field lm-split-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.lmProperty = 'split';
            input.checked = component.arrangement.split;
            const caption = document.createElement('span');
            caption.textContent = '左右分離';
            input.addEventListener('change', () => {
                const result = editor.updateSplit(component.id, input.checked);
                if (!result.updated) {
                    input.checked = component.arrangement.split;
                    input.title = 'The requested arrangement would overlap another unit.';
                }
            });
            label.append(input, caption);
            toolbar.appendChild(label);
        }

        function update(_id, component, selectedPart = null) {
            toolbar.replaceChildren();
            if (!component) {
                toolbar.hidden = true;
                return;
            }
            toolbar.hidden = false;
            const rule = composer.registry[component.id];
            const heading = document.createElement('div');
            heading.className = 'lm-property-title';
            heading.innerHTML = '<span>SELECTED UNIT</span><strong></strong>';
            const partLabel = selectedPart === 'previous' ? ' · PREVIOUS' : selectedPart === 'next' ? ' · NEXT' : '';
            heading.querySelector('strong').textContent = rule.label + partLabel;
            toolbar.appendChild(heading);
            const hidden = document.createElement('input');
            hidden.type = 'checkbox'; hidden.checked = component.hidden === true;
            hidden.dataset.lmProperty = 'hidden';
            hidden.disabled = editor.state.layout.locked || component.locked;
            hidden.addEventListener('change', () => { component.hidden = hidden.checked; commit('visibility'); });
            addLabel('不顯示（保留位置）', hidden);

            const lock = document.createElement('button');
            lock.type = 'button';
            lock.textContent = component.locked ? 'UNLOCK · 解鎖元件' : 'LOCK · 定位元件';
            lock.dataset.lmLockState = String(component.locked || editor.state.layout.locked);
            lock.setAttribute('aria-pressed', String(component.locked || editor.state.layout.locked));
            lock.disabled = editor.state.layout.locked;
            lock.addEventListener('click', () => editor.toggleLock(component.id));
            toolbar.appendChild(lock);
            for (const dimension of ['width', 'height']) {
                const input = document.createElement('input');
                input.type = 'number'; input.step = '1';
                const limits = composer.sizeLimits(component, editor.state.layout.canvas);
                input.min = String(Math.ceil(dimension === 'width' ? limits.minWidth : limits.minHeight));
                input.max = String(Math.floor(dimension === 'width' ? limits.maxWidth : limits.maxHeight));
                input.value = String(Math.ceil(composer.interactionGeometry(component, selectedPart)[dimension]));
                input.disabled = editor.state.layout.locked || component.locked;
                input.addEventListener('change', () => {
                    const placement = composer.sizeFromInput(editor.state.layout, component.id, selectedPart, dimension, input.value);
                    if (placement.valid) { editor.state.layout.canvas.alignmentGrid.enabled = false; composer.applyInteractionGeometry(component, selectedPart, placement.geometry); commit(); }
                    input.value = String(Math.ceil(composer.interactionGeometry(component, selectedPart)[dimension]));
                });
                addLabel(dimension === 'width' ? '寬度 PX' : '高度 PX', input);
            }
            const detailStart = toolbar.children.length;
            addSplitControl(rule, component);
            addLayerControls(rule, component);

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
            rule.supportedEffects.forEach(name => addEffect(name, component));

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'lm-delete-button';
            deleteButton.textContent = rule.removable ? '移回元件庫 / DEL' : '永久底座';
            deleteButton.disabled = !composer.canDelete(component.id, editor.state.layout);
            deleteButton.addEventListener('click', () => editor.remove(component.id));
            const details = document.createElement('section');
            details.className = 'lm-unit-details';
            details.setAttribute('aria-label', '詳細設定 · 外觀、文字與效果');
            const summary = document.createElement('h3');
            summary.className = 'lm-unit-details-title';
            summary.textContent = '詳細設定 · 外觀、文字與效果';
            const body = document.createElement('div');
            body.className = 'lm-unit-detail-body';
            Array.from(toolbar.children).slice(detailStart).forEach(node => body.appendChild(node));
            if (component.locked || editor.state.layout.locked) body.querySelectorAll('input,select,button').forEach(node => { node.disabled = true; });
            details.append(summary, body);
            toolbar.append(details, deleteButton);
        }

        return Object.freeze({ element: toolbar, update });
    }

    globalThis.YtCdHudLiveMonitorPropertyToolbar = Object.freeze({ createToolbar });
})();
