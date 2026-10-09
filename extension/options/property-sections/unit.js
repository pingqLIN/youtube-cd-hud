(function (root) {
    'use strict';
    const registry = root.YtCdHudPropertySections;
    if (!registry) throw new Error('Property section registry must load first');
    registry.register("unit", function renderSection(context) {
        const { rule, component, selectedPart, editor, composer, toolbar, commit, addLabel, addColorProperty, addSectionLabel, addFixedToken, addEffect, addStyleToggle, addLayerControls, addSplitControl } = context;
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
            addSplitControl(rule, component);
            addLayerControls(rule, component);

    });
})(globalThis);
