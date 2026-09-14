import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = fs.readFileSync('images/logo.svg');
const render = (size: number) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

// Extension (Marketplace) icon.
fs.writeFileSync('images/logo.png', render(512));

// Azure DevOps requires the task icon to be a 32x32 icon.png next to task.json.
const taskDirectory = 'tasks/AuthenticatedScripts';
fs.writeFileSync(`${taskDirectory}/icon.png`, render(32));
fs.copyFileSync('images/logo.svg', `${taskDirectory}/icon.svg`);

console.log(`Rendered images/logo.png (512x512) and ${taskDirectory}/icon.png (32x32).`);
