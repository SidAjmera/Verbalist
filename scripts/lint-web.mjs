import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { ESLint } = require('eslint');
const lint = new ESLint({ cwd: path.join(root, 'apps/web') });
// OneDrive reparse points can be skipped by directory-glob traversal on Windows.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter((file) => file.startsWith('apps/web/') && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file));
const results = [];
for (const file of new Set(files)) {
  const absolute = path.join(root, file);
  if (!(await lint.isPathIgnored(absolute)))
    results.push(
      ...(await lint.lintText(await readFile(absolute, 'utf8'), { filePath: absolute })),
    );
}
const output = await (await lint.loadFormatter('stylish')).format(results);
if (output) process.stdout.write(output);
const failures = results.reduce((sum, result) => sum + result.errorCount + result.warningCount, 0);
process.stdout.write(`Linted ${results.length} frontend files; ${failures} errors/warnings.\n`);
process.exitCode = failures ? 1 : 0;
