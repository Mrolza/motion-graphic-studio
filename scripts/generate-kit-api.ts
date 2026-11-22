import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getKitComponentByName } from '../src/core/kit/domain-registry';

interface ExtractedItem {
  category: string;
  name: string;
  kind: 'component' | 'function' | 'type';
  doc: string;
  signature: string;
  props?: Array<{ name: string; type: string; optional: boolean; doc: string }>;
}

function getJsDoc(node: ts.Node): string {
  const docs = ts.getJSDocCommentsAndTags(node);
  const parts: string[] = [];
  for (const d of docs) {
    if (ts.isJSDoc(d) && typeof d.comment === 'string') {
      parts.push(d.comment.trim());
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function categorize(relPath: string): string {
  if (relPath.includes('/tokens/')) return 'Tokens & Palettes';
  if (relPath.includes('/drivers/')) return 'Drivers & Kinematics';
  if (relPath.includes('/assemblies/')) return '3D Assemblies';
  if (relPath.includes('/primitives/') || relPath.includes('Primitives3D')) return '3D Primitives';
  if (relPath.includes('/hud/')) return 'HUD & Zone Layout';
  if (relPath.includes('/foreground/')) return 'Foreground & Parallax';
  if (relPath.includes('/transitions/')) return 'Transitions';
  if (relPath.includes('/telemetry/')) return 'Telemetry';
  if (relPath.includes('CameraRig')) return 'Camera';
  if (relPath.includes('BlueprintStage')) return 'Stage';
  return 'Motion & Core';
}

function walkKitFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkKitFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== 'index.ts') out.push(full);
  }
  return out;
}

function main() {
  const repoRoot = process.cwd();
  const kitDir = path.join(repoRoot, 'remotion', 'src', 'kit');
  const tsconfigPath = path.join(repoRoot, 'remotion', 'tsconfig.json');
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));

  const files = walkKitFiles(kitDir);
  const program = ts.createProgram(files, parsed.options);
  const checker = program.getTypeChecker();

  const items: ExtractedItem[] = [];
  const propsByName = new Map<string, Array<{ name: string; type: string; optional: boolean; doc: string }>>();

  for (const filePath of files) {
    const sf = program.getSourceFile(filePath);
    if (!sf) continue;
    const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const category = categorize(rel);

    sf.forEachChild((node) => {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!isExported) return;

      if (ts.isInterfaceDeclaration(node)) {
        const props = node.members
          .filter(ts.isPropertySignature)
          .map((m) => ({
            name: m.name.getText(sf),
            type: m.type ? m.type.getText(sf).replace(/\s+/g, ' ') : 'unknown',
            optional: Boolean(m.questionToken),
            doc: getJsDoc(m),
          }));
        propsByName.set(node.name.text, props);
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        const sym = checker.getSymbolAtLocation(node.name);
        const typeStr = sym ? checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, node)) : '';
        items.push({
          category,
          name: node.name.text,
          kind: 'function',
          doc: getJsDoc(node),
          signature: typeStr,
        });
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const name = decl.name.text;
          const typeText = decl.type ? decl.type.getText(sf) : '';
          const isComponent = typeText.includes('React.FC');
          if (!isComponent) continue;
          const propsMatch = typeText.match(/React\.FC<([A-Za-z0-9_]+)>/);
          const propsName = propsMatch?.[1];
          items.push({
            category,
            name,
            kind: 'component',
            doc: getJsDoc(node),
            signature: propsName ? `<${name} ...${propsName} />` : `<${name} />`,
            props: propsName ? propsByName.get(propsName) : undefined,
          });
        }
      }
    });
  }

  // Attach props if interface appeared after component in file
  for (const item of items) {
    if (item.kind === 'component' && !item.props) {
      const guess = `${item.name}Props`;
      if (propsByName.has(guess)) item.props = propsByName.get(guess);
    }
  }

  const byCat = new Map<string, ExtractedItem[]>();
  for (const item of items) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }

  const lines: string[] = [
    '# Motion-Graphic Studio Scene Kit API (`KIT-API.md`)',
    '',
    '> Dihasilkan otomatis oleh `scripts/generate-kit-api.ts` dari tipe TypeScript & JSDoc di `remotion/src/kit/`.',
    '',
    '## Contoh Singkat (Single Driver + Rakitan + HUD Zona)',
    '```tsx',
    'const crank = useDriver({ name: "crank_angle", from: 0, to: 720, unit: "°", durationSec: 16 });',
    '<BlueprintStage palette="industrial-orange" telemetry={telemetry} hud={',
    '  <HudLayout palette="industrial-orange">',
    '    <HudZone zone="title"><KineticTitle title="Mesin 4 Tak" palette="industrial-orange" /></HudZone>',
    '    <HudZone zone="callout"><StatCounter id="stat_crank_angle" label="Sudut" driver={crank} bindToDriver palette="industrial-orange" /></HudZone>',
    '  </HudLayout>',
    '}>',
    '  <CameraRig mode="frameEntities" focusBox={{ center: [0, 1.45, 0], size: [1.7, 3.1, 1.7] }} />',
    '  <PistonCrankAssembly entityId="piston_crank" crankAngleDeg={crank.value} palette="industrial-orange" />',
    '</BlueprintStage>',
    '```',
    '',
  ];

  for (const [cat, list] of byCat.entries()) {
    lines.push(`## ${cat}`, '');
    for (const item of list) {
      lines.push(`### \`${item.name}\``);
      if (item.doc) lines.push(item.doc);
      const domainSpec = getKitComponentByName(item.name);
      if (domainSpec) {
        lines.push(`- **Domain:** \`${domainSpec.domain}\``);
        if (domainSpec.entities.length > 0) {
          lines.push(`- **Entities:** ${domainSpec.entities.map((e) => `\`${e}\``).join(', ')}`);
        }
      }
      lines.push(`- **Signature:** \`${item.signature}\``);
      if (item.props && item.props.length > 0) {
        lines.push('- **Props:**');
        for (const p of item.props) {
          lines.push(
            `  - \`${p.name}${p.optional ? '?' : ''}: ${p.type}\`${p.doc ? ` — ${p.doc}` : ''}`
          );
        }
      }
      lines.push('');
    }
  }

  const outPath = path.join(kitDir, 'KIT-API.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`Generated ${outPath} (${items.length} items across ${byCat.size} categories).`);
}

main();
