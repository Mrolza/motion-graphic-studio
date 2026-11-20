import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface GeneratedCompMeta {
  id: string;
  importPath: string;
  exportName: string;
  durationInFrames: number;
}

/**
 * Rebuilds remotion/src/scenes/generated/registry.tsx from all generated project meta.json files.
 */
export async function syncGeneratedRegistry(repoRoot = process.cwd()): Promise<void> {
  const genRoot = path.join(repoRoot, 'remotion', 'src', 'scenes', 'generated');
  await mkdir(genRoot, { recursive: true });
  const entries = await readdir(genRoot, { withFileTypes: true });
  const comps: GeneratedCompMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(genRoot, entry.name, 'meta.json');
    try {
      const list = JSON.parse(await readFile(metaPath, 'utf-8')) as GeneratedCompMeta[];
      for (const c of list) {
        comps.push({
          ...c,
          importPath: `./${entry.name}/${c.importPath.replace(/^\.\//, '')}`,
        });
      }
    } catch {
      // ignore dirs without meta.json
    }
  }

  const imports = comps
    .map((c, idx) => `import { ${c.exportName} as Comp_${idx} } from '${c.importPath}';`)
    .join('\n');

  const jsx = comps
    .map(
      (c, idx) =>
        `      <Composition id="${c.id}" component={Comp_${idx}} durationInFrames={${c.durationInFrames}} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />`
    )
    .join('\n');

  const remotionPkg = 'remo' + 'tion';
  const content =
    comps.length === 0
      ? `import React from 'react';\n\nexport const GeneratedCompositions: React.FC = () => null;\n`
      : `import React from 'react';\nimport { Composition } from '${remotionPkg}';\n${imports}\n\nexport const GeneratedCompositions: React.FC = () => (\n  <>\n${jsx}\n  </>\n);\n`;

  await writeFile(path.join(genRoot, 'registry.tsx'), content, 'utf-8');
}
