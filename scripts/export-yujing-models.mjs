// Copy the original Blender assets for editing; this never exports reader data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../SkipReader-art-lab/models');
fs.mkdirSync(output, { recursive: true });
for (const [relative, name] of [['refined/book-island.glb','book-island.glb'], ['ocean.glb','ocean.glb'], ['yuejing-scenes.blend','yuejing-scenes.blend'], ['refined/reading-garden.blend','reading-garden.blend']]) {
  const source = path.join(root, 'assets/yuejing', relative), bytes = fs.readFileSync(source);
  if (name.endsWith('.glb') && (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)) throw new Error('Invalid GLB: ' + name);
  fs.copyFileSync(source, path.join(output, name));
  console.log(name + ': ' + bytes.length + ' bytes');
}
