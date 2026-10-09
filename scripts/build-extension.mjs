import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.join(projectRoot, 'src', 'youtube-cd-hud.user.js');
const outputPath = path.join(projectRoot, 'extension', 'content', 'youtube-cd-hud.js');
const userscriptHeader = /^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/;
const generatedBanner = '// Generated from src/youtube-cd-hud.user.js. Run npm run build:extension after source changes.\n\n';

const skin = fs.readFileSync(path.join(projectRoot, 'extension/options/hud-skin.js'), 'utf8').replace(/\r\n?/g, '\n');
const embedded = '// BEGIN GENERATED HUD SKIN\n' + skin + '// END GENERATED HUD SKIN';
for (const target of [sourcePath, path.join(projectRoot, 'extension/options/live-monitor-composer.js')]) {
    const current = fs.readFileSync(target, 'utf8').replace(/\r\n?/g, '\n');
    const next = current.replace(new RegExp("// BEGIN GENERATED HUD SKIN[\\s\\S]*?// END GENERATED HUD SKIN"), () => embedded);
    if (current !== next) {
        if (process.argv.includes('--check')) { console.error('Shared Skin embedding is out of date: ' + path.relative(projectRoot, target)); process.exitCode = 1; }
        else fs.writeFileSync(target, next, 'utf8');
    }
}
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
const output = (generatedBanner + source.replace(userscriptHeader, '')).replace(/\r\n?/g, '\n');

if (process.argv.includes('--check')) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').replace(/\r\n?/g, '\n') : '';
    if (current !== output) {
        console.error('Extension HUD runtime is out of date. Run npm run build:extension.');
        process.exitCode = 1;
    }
} else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`Built ${path.relative(projectRoot, outputPath)}`);
}
