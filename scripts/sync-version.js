import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

if (!version) {
  console.error('No version found in package.json');
  process.exit(1);
}

function updateFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(
    /const DEFAULT_PLUGIN_VERSION = ['"][^'"]+['"];/,
    `const DEFAULT_PLUGIN_VERSION = '${version}';`
  );
  content = content.replace(
    /\/\* dsh-plugin-translator client bundle - v[^*]+ \*\//,
    `/* dsh-plugin-translator client bundle - v${version} */`
  );
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Synced version v${version} to ${path.relative(rootDir, filePath)}`);
}

updateFile(path.join(rootDir, 'lib/client.js'));
