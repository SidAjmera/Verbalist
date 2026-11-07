import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import * as prettier from 'prettier';

// Pass concrete files to Prettier: glob traversal skips OneDrive reparse points.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const write = process.argv.includes('--write');
let changed = 0;
for (const file of new Set(files)) {
  const info = await prettier.getFileInfo(file, { ignorePath: '.prettierignore' });
  if (info.ignored || !info.inferredParser) continue;
  const source = await readFile(file, 'utf8');
  const formatted = await prettier.format(source, {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
  if (source === formatted) continue;
  changed++;
  if (write) await writeFile(file, formatted);
  else process.stderr.write(`Needs formatting: ${file}\n`);
}
process.stdout.write(
  write
    ? `Formatted ${changed} files.\n`
    : changed
      ? `${changed} files need formatting.\n`
      : 'All source files are formatted.\n',
);
if (!write && changed) process.exitCode = 1;
