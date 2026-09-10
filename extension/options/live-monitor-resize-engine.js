(function () {
    'use strict';

    function geometryForSize(component, width, height, baseGeometry = component?.geometry) {
        if (!component) return null;
        return { ...baseGeometry, width, height };
    }

    function geometryFromHandle(component, startGeometry, handle, deltaX, deltaY) {
        const direction = String(handle || 'se').toLowerCase();
        const width = startGeometry.width + (direction.includes('e') ? deltaX : direction.includes('w') ? -deltaX : 0);
        const height = startGeometry.height + (direction.includes('s') ? deltaY : direction.includes('n') ? -deltaY : 0);
        return geometryForSize(component, width, height, startGeometry);
    }

    // Transform a complete set atomically; never relocate individual members to
    // repair a failed scale, as that would silently break the composition.
    function scaleGroup(layout, factor, componentIds = null) {
        const composer = globalThis.YtCdHudLiveMonitorComposer;
        const original = composer.normalizeLayout(layout);
        const fail = reason => ({ updated: false, layout: original, reason });
        if (!Number.isFinite(factor) || factor <= 0 || factor > 4) return fail('Use a scale greater than 0% and at most 400%.');
        const next = JSON.parse(JSON.stringify(original));
        const members = next.components.filter(item => item.present && item.id !== 'panel-base' && (!componentIds || componentIds.includes(item.id)));
        if (!members.length) return fail('Select a component or choose all components.');
        if (factor === 1) return { updated: true, layout: original, componentIds: members.map(item => item.id) };
        const boxes = members.flatMap(item => composer.componentRects(item, next.canvas));
        const cx = (Math.min(...boxes.map(box => box.left)) + Math.max(...boxes.map(box => box.right))) / 2 / next.canvas.width;
        const cy = (Math.min(...boxes.map(box => box.top)) + Math.max(...boxes.map(box => box.bottom))) / 2 / next.canvas.height;
        const move = geometry => {
            geometry.x = cx + (geometry.x - cx) * factor;
            geometry.y = cy + (geometry.y - cy) * factor;
        };
        // Independent grid rounding would change distances and aspect ratios on
        // save/reload. Keep exact geometry until the user enables alignment again.
        next.canvas.alignmentGrid.enabled = false;
        for (const item of members) {
            move(item.geometry);
            item.geometry.width *= factor;
            item.geometry.height *= factor;
            if (item.arrangement) {
                item.arrangement.partSize.width *= factor;
                item.arrangement.partSize.height *= factor;
                Object.values(item.arrangement.positions).forEach(move);
            }
            if (item.textStyle) item.textStyle.fontSize = Math.max(composer.textSizeLimits(next.canvas).minimum, item.textStyle.fontSize * factor);
            const limits = composer.sizeLimits(item, next.canvas);
            if (item.geometry.width < limits.minWidth - 1e-7 || item.geometry.height < limits.minHeight - 1e-7
                || item.geometry.width > limits.maxWidth + 1e-7 || item.geometry.height > limits.maxHeight + 1e-7) {
                return fail('A component would exceed its size limits. Try a smaller change.');
            }
            const outside = composer.componentRects(item, next.canvas).some(box => box.left < -1e-7 || box.top < -1e-7 || box.right > next.canvas.width + 1e-7 || box.bottom > next.canvas.height + 1e-7);
            if (outside) return fail('The group would extend outside the canvas.');
        }
        if (!componentIds) {
            const base = next.components.find(item => item.id === 'panel-base');
            if (base?.boundary) base.boundary.padding = Math.min(96, base.boundary.padding * factor);
        }
        if (members.some(item => composer.collisionFor(item, next.components, next.canvas))) return fail('The group would collide with another component.');
        const normalized = composer.normalizeLayout(next);
        const same = (a, b) => ['x', 'y', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) < 1e-7);
        for (const item of members) {
            const saved = composer.getComponent(normalized, item.id);
            if (!same(item.geometry, saved.geometry)) return fail('The requested scale leaves too little room for text or controls.');
            if (item.arrangement?.split && (!same({ ...item.arrangement.partSize, x: 0, y: 0 }, { ...saved.arrangement.partSize, x: 0, y: 0 })
                || Object.keys(item.arrangement.positions).some(key => !same({ ...item.arrangement.positions[key], width: 0, height: 0 }, { ...saved.arrangement.positions[key], width: 0, height: 0 })))) {
                return fail('The split controls would exceed their size limits.');
            }
        }
        return { updated: true, layout: normalized, componentIds: members.map(item => item.id) };
    }

    globalThis.YtCdHudLiveMonitorResizeEngine = Object.freeze({ geometryForSize, geometryFromHandle, scaleGroup });
})();
