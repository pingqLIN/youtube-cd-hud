(function () {
    'use strict';

    function geometryForSize(component, width, height, baseGeometry = component?.geometry) {
        if (!component) return null;
        return { ...baseGeometry, width, height };
    }

    function geometryFromHandle(component, startGeometry, handle, deltaX, deltaY, canvas) {
        const direction = String(handle || 'se').toLowerCase();
        const width = startGeometry.width + (direction.includes('e') ? deltaX : direction.includes('w') ? -deltaX : 0);
        const height = startGeometry.height + (direction.includes('s') ? deltaY : direction.includes('n') ? -deltaY : 0);
        const geometry = geometryForSize(component, width, height, startGeometry);
        if (canvas) {
            if (/[ew]/.test(direction)) geometry.x += deltaX / (2 * canvas.width);
            if (/[ns]/.test(direction)) geometry.y += deltaY / (2 * canvas.height);
        }
        return geometry;
    }

    // Transform a complete set atomically; never relocate individual members to
    // repair a failed scale, as that would silently break the composition.
    function scaleGroup(layout, factor, componentIds = null, { resolveCollisions = false } = {}) {
        const composer = globalThis.YtCdHudLiveMonitorComposer;
        const original = composer.normalizeLayout(layout);
        const fail = reason => ({ updated: false, layout: original, reason });
        if (!Number.isFinite(factor) || factor <= 0 || factor > 4) return fail('Use a scale greater than 0% and at most 400%.');
        const next = JSON.parse(JSON.stringify(original));
        const members = next.components.filter(item => item.present && item.id !== 'panel-base' && (!componentIds || componentIds.includes(item.id)));
        if (original.locked || members.some(item => item.locked) || (!componentIds && composer.getComponent(original, 'panel-base').locked)) return fail('請先解鎖面板與要縮放的元件。');
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
        const clampedIds = [];
        const scaledIds = [];
        function availableFactor(item) {
            if (factor >= 1) return factor;
            const limits = composer.sizeLimits(item, next.canvas);
            const fontFloor = composer.textSizeLimits(next.canvas).minimum;
            const textHeight = item.textStyle ? Math.ceil(fontFloor * 1.35 + 4 * composer.sizeScale(next.canvas)) : 0;
            const partMinimum = item.arrangement?.split
                ? Math.max(64 * composer.sizeScale(next.canvas) / item.arrangement.partSize.width,
                    24 * composer.sizeScale(next.canvas) / item.arrangement.partSize.height) : 0;
            return Math.min(1, Math.max(factor,
                limits.minWidth / item.geometry.width,
                limits.minHeight / item.geometry.height,
                textHeight / item.geometry.height,
                partMinimum));
        }
        for (const item of members) {
            const localFactor = availableFactor(item);
            if (factor < 1 && localFactor >= 1 - 1e-9) {
                clampedIds.push(item.id);
                continue; // At its minimum: leave size AND position unchanged.
            }
            scaledIds.push(item.id);
            move(item.geometry);
            item.geometry.width *= localFactor;
            item.geometry.height *= localFactor;
            if (item.arrangement) {
                item.arrangement.partSize.width *= localFactor;
                item.arrangement.partSize.height *= localFactor;
                Object.values(item.arrangement.positions).forEach(move);
            }
            if (item.textStyle) item.textStyle.fontSize = Math.max(composer.textSizeLimits(next.canvas).minimum, item.textStyle.fontSize * localFactor);
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
            if (base) {
                const baseFactor = availableFactor(base);
                if (baseFactor < 1 - 1e-9 || factor >= 1) {
                    move(base.geometry);
                    base.geometry.width *= baseFactor;
                    base.geometry.height *= baseFactor;
                    scaledIds.push(base.id);
                } else {
                    clampedIds.push(base.id);
                }
                const limits = composer.sizeLimits(base, next.canvas);
                if (base.geometry.width < limits.minWidth || base.geometry.height < limits.minHeight || base.geometry.width > limits.maxWidth || base.geometry.height > limits.maxHeight) return fail('底座尺寸超過上下限。');
            }
        }
        const layersAssigned = [];
        if (members.some(item => composer.collisionFor(item, next.components, next.canvas))) {
            if (!resolveCollisions) return { ...fail('The group would collide with another component.'), code: 'GROUP_COLLISION' };
            // Only change scaled, unlocked members. Unselected and locked neighbors
            // retain their layer and geometry, and the whole result stays atomic.
            for (const item of members) {
                if (!composer.collisionFor(item, next.components, next.canvas)) continue;
                if (!composer.registry[item.id].supportsZAxis) return fail('此元件無法自動分配 Z 軸；原配置已保留。');
                const occupied = new Set(composer.physicalOverlapsFor(item, next.components, next.canvas, false).map(composer.effectiveZ));
                const above = Math.max(...occupied) + 1;
                const available = above <= 99 ? above : Array.from({ length: 199 }, (_, index) => 99 - index).find(z => !occupied.has(z));
                if (available === undefined) return fail('沒有可用的 Z 軸層級；原配置已保留。');
                item.layer.enabled = true;
                item.geometry.z = available;
                layersAssigned.push(item.id);
            }
            if (members.some(item => composer.collisionFor(item, next.components, next.canvas))) return fail('Z 軸分配後仍有碰撞；原配置已保留。');
        }
        if (!scaledIds.length) return fail('所選元件皆已達最小尺寸，沒有可繼續縮小的元件。');
        if (!composer.connectedToBase(next, composer.getComponent(next, 'panel-base'))) return fail('縮放後元件會離開底座。');
        if (next.skin) composer.refreshSkin(next);
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
        return { updated: true, layout: normalized, componentIds: members.map(item => item.id),
            scaledIds, clampedIds, layersAssigned };
    }

    globalThis.YtCdHudLiveMonitorResizeEngine = Object.freeze({ geometryForSize, geometryFromHandle, scaleGroup });
})();
