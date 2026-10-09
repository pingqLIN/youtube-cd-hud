(function (root) {
    'use strict';
    // Each property section owns its controls; the editor remains the authority for layout and Skin.
    const ORDER = Object.freeze(['unit', 'appearance', 'text', 'effects']);
    const modules = new Map();
    function register(id, render) {
        if (!ORDER.includes(id) || modules.has(id) || typeof render !== 'function')
            throw new TypeError('Invalid or duplicate property section: ' + id);
        modules.set(id, render);
    }
    function validate() {
        const missing = ORDER.filter(id => !modules.has(id));
        if (missing.length) throw new Error('Missing property sections: ' + missing.join(', '));
        return true;
    }
    function render(id, context) {
        if (!modules.has(id)) throw new Error('Unregistered property section: ' + id);
        return modules.get(id)(context);
    }
    root.YtCdHudPropertySections = Object.freeze({
        order: ORDER, register, validate, render,
        list: () => ORDER.map(id => Object.freeze({ id, registered: modules.has(id) })),
    });
})(globalThis);
