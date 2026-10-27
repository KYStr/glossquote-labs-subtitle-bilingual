import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPublic, checkPackage } from './check.mjs';
import { PUBLIC_FILES, inspectTree, snapshot } from './files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function build(source = resolve(root, 'public'), destination = resolve(root, 'dist')) {
  await checkPackage(); await checkPublic(source);
  // Unknown or linked output is an error. Never delete files to make a build pass.
  await inspectTree(destination, { allowMissing: true });
  const before = await snapshot(source);
  const bytes = await Promise.all(PUBLIC_FILES.map(path => readFile(resolve(source, path))));
  for (let i = 0; i < PUBLIC_FILES.length; i++) {
    const target = resolve(destination, PUBLIC_FILES[i]);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes[i]);
  }
  const output = await snapshot(destination);
  const after = await snapshot(source);
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(before) !== JSON.stringify(output)) throw new Error('SOURCE_OR_OUTPUT_DRIFT');
  return { status: 'PASS', files: output.length, bytes: output.reduce((sum, row) => sum + row.bytes, 0), manifest: output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await build(); console.log(JSON.stringify(result)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
