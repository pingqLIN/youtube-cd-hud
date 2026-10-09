(function (root) {
    'use strict';
    const registry = root.YtCdHudPropertySections;
    if (!registry) throw new Error('Property section registry must load first');
    registry.register("effects", function renderSection(context) {
        const { rule, component, selectedPart, editor, composer, toolbar, commit, addLabel, addColorProperty, addSectionLabel, addFixedToken, addEffect, addStyleToggle, addLayerControls, addSplitControl } = context;
            rule.supportedEffects.forEach(name => addEffect(name, component));

    });
})(globalThis);
