async function send(action,challenge) {
    const response = await chrome.runtime.sendMessage({type:'TUNNAL_P0',action,challenge});
    if(!response?.ok) throw new Error(response?.error || '無法讀取 Adapter');
    return response;
}
async function render() {
    try {
        const value = await send('list');
        document.getElementById('build').textContent = '執行中 Adapter build：'+value.adapterBuild;
        const container = document.getElementById('pairs'); container.replaceChildren();
        document.getElementById('status').textContent = value.pairs.length ? '請確認本機連接頁的唯讀請求' : '目前沒有配對請求；請先在 Chrome 連接頁提出配對';
        for(const pair of value.pairs) {
            const article = document.createElement('article');
            const description = document.createElement('p');
            const scopes = (pair.approved ? pair.approvedCapabilities : pair.requestedCapabilities) || ['build.read'];
            description.textContent = pair.origin + ' · '+(pair.approved ? '已配對：' : '等待確認：') + scopes.join(', ');
            article.append(description);
            if(!pair.approved) {
                const button = document.createElement('button');
                const settings = pair.mode === 'settings';
                button.textContent = settings ? '允許 HUD 設定讀寫' : '允許唯讀 build 回報';
                button.dataset.scope = settings ? 'settings' : 'build';
                const action = settings ? 'approveSettings' : 'approve';
                button.onclick = async()=>{ try { await send(action,pair.challenge); await render(); } catch(error) { document.getElementById('status').textContent = error.message; } };
                article.append(button);
            }
            container.append(article);
        }
    } catch(error) { document.getElementById('status').textContent = 'INCOMPLETE · '+error.message; }
}
document.getElementById('refresh').onclick = render;
document.getElementById('revoke').onclick = async()=>{ await send('revokeAll'); await render(); };
render();
