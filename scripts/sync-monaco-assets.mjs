import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const sourceDir = resolve(projectRoot, 'node_modules/monaco-editor/min/vs');
const targetDir = resolve(projectRoot, 'public/monaco/vs');

if (!existsSync(sourceDir)) {
  console.error(`[sync-monaco-assets] Source not found: ${sourceDir}`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });
console.log(`[sync-monaco-assets] Synced Monaco assets to ${targetDir}`);
