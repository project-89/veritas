const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_PLUGINS_PATH = path.join(ROOT, 'private-plugins');
const PRIVATE_PACKAGES_PATH = path.join(PRIVATE_PLUGINS_PATH, 'packages');

function log(message) {
  console.log(`[bootstrap] ${message}`);
}

function warn(message) {
  console.warn(`[bootstrap] ${message}`);
}

function pathKind(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) return 'symlink';
    if (stat.isDirectory()) return 'directory';
    return 'file';
  } catch {
    return null;
  }
}

function hasPrivatePluginWorkspace() {
  const kind = pathKind(PRIVATE_PLUGINS_PATH);
  if (!kind) return false;
  return fs.existsSync(PRIVATE_PACKAGES_PATH);
}

function printPrivatePluginHint() {
  warn('No mounted private plugin workspace detected at ./private-plugins.');
  warn('Public builds will still work, but private plugins like MAGI will be unavailable.');
  warn('To mount the private workspace locally:');
  warn('  ln -s /Users/jakobgrant/Workspaces/veritas-private-plugins private-plugins');
}

function runPluginSync() {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'generate-plugin-registry.js')],
    {
      cwd: ROOT,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  if (hasPrivatePluginWorkspace()) {
    const kind = pathKind(PRIVATE_PLUGINS_PATH);
    log(`Detected private plugin workspace (${kind}) at ./private-plugins`);
  } else {
    printPrivatePluginHint();
  }

  runPluginSync();
}

main();
