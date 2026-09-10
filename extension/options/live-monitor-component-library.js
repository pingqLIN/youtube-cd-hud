(function () {
    'use strict';

    const composer = globalThis.YtCdHudLiveMonitorComposer;

    function createLibrary({ host, editor }) {
        if (!host) throw new Error('Live Monitor component library host is required.');
        host.classList.add('lm-component-library');

        function render() {
            host.replaceChildren();
            const available = composer.availableComponents(editor.state.layout);
            if (!available.length) {
                const empty = document.createElement('p');
                empty.className = 'lm-library-empty';
                empty.textContent = 'ALL UNITS MOUNTED / 所有功能單元已加入面板；移除後會回到此處。';
                host.appendChild(empty);
                return;
            }
            available.forEach(rule => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'lm-library-item';
                button.dataset.lmAdd = rule.type;
                const marker = document.createElement('span');
                marker.textContent = '+';
                marker.setAttribute('aria-hidden', 'true');
                const copy = document.createElement('span');
                const title = document.createElement('strong');
                title.textContent = rule.label;
                const detail = document.createElement('small');
                detail.textContent = rule.type;
                copy.append(title, detail);
                button.append(marker, copy);
                button.addEventListener('click', () => editor.add(rule.type));
                host.appendChild(button);
            });
        }

        render();
        return Object.freeze({ element: host, render });
    }

    globalThis.YtCdHudLiveMonitorComponentLibrary = Object.freeze({ createLibrary });
})();
