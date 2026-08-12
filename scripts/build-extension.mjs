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

const source = fs.readFileSync(sourcePath, 'utf8');
const output = generatedBanner + source.replace(userscriptHeader, '');

if (process.argv.includes('--check')) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (current !== output) {
        console.error('Extension HUD runtime is out of date. Run npm run build:extension.');
        process.exitCode = 1;
    }
} else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`Built ${path.relative(projectRoot, outputPath)}`);
}
