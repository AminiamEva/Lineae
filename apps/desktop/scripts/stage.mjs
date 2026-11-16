import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
const web = join(desktop, '..', 'web');
const dist = join(desktop, 'dist');
const entries = ['index.html', 'pages.css', 'source-workspace.css', 'project.css', 'editor.mjs', 'assets', 'vendor'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const entry of entries) {
  cpSync(join(web, entry), join(dist, entry), { recursive: true });
}
