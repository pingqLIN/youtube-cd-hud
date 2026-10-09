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
            const sections = globalThis.YtCdHudPropertySections;
            sections.validate();
            const context = { rule, component, selectedPart, editor, composer, toolbar, commit,
                addLabel, addColorProperty, addSectionLabel, addFixedToken, addEffect,
                addStyleToggle, addLayerControls, addSplitControl };
            sections.render('unit', context);
            const detailStart = toolbar.children.length;
            for (const id of ['appearance', 'text', 'effects']) sections.render(id, context);

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
