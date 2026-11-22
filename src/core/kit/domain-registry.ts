export type KitDomain = 'rail' | 'engine' | 'generic';

export interface KitComponentSpec {
  name: string;
  kind: 'assembly' | 'overlay' | 'hud';
  domain: KitDomain;
  entities: string[];
  views?: Array<'3d' | 'section' | 'cutaway'>;
  shots?: string[];
}

export const KIT_COMPONENTS: KitComponentSpec[] = [
  {
    name: 'TrainCar',
    kind: 'assembly',
    domain: 'rail',
    entities: ['train_car', 'body'],
    views: ['3d'],
    shots: ['establishing'],
  },
  {
    name: 'WheelsetOnRail',
    kind: 'assembly',
    domain: 'rail',
    entities: ['wheelset', 'wheel_left', 'wheel_right', 'flange', 'rail_left', 'rail_right'],
    views: ['3d'],
    shots: ['closeup', 'comparison'],
  },
  {
    name: 'RailCrossSection',
    kind: 'assembly',
    domain: 'rail',
    entities: ['rail_cross_section', 'wheel_left', 'wheel_right', 'flange', 'rail_left', 'rail_right'],
    views: ['section'],
    shots: ['cross_section', 'comparison'],
  },
  {
    name: 'CurvedRail',
    kind: 'assembly',
    domain: 'rail',
    entities: ['curved_rail', 'rail_left', 'rail_right'],
    views: ['3d'],
  },
  {
    name: 'EngineBlock',
    kind: 'assembly',
    domain: 'engine',
    entities: ['engine_block', 'block'],
    views: ['3d', 'cutaway'],
    shots: ['establishing', 'cutaway'],
  },
  {
    name: 'PistonCrankAssembly',
    kind: 'assembly',
    domain: 'engine',
    entities: ['piston_crank', 'piston', 'crank', 'intake_valve', 'exhaust_valve', 'spark_plug'],
    views: ['3d', 'cutaway'],
    shots: ['closeup', 'cutaway'],
  },
  {
    name: 'CylinderSection',
    kind: 'assembly',
    domain: 'engine',
    entities: [
      'cylinder_section',
      'piston',
      'crank',
      'conrod',
      'intake_valve',
      'exhaust_valve',
      'spark_plug',
      'combustion_chamber',
    ],
    views: ['section'],
    shots: ['cross_section'],
  },
  {
    name: 'Suspension',
    kind: 'assembly',
    domain: 'generic',
    entities: ['suspension', 'spring', 'damper'],
    views: ['3d'],
    shots: ['closeup', 'summary'],
  },
  {
    name: 'RailCurveOverlay',
    kind: 'overlay',
    domain: 'rail',
    entities: ['curve_arc', 'inertia_arrow'],
    shots: ['diagram_overlay'],
  },
  {
    name: 'DiagramOverlay',
    kind: 'overlay',
    domain: 'generic',
    entities: ['grid_guide', 'axis_guide', 'highlight_ring'],
    shots: ['diagram_overlay'],
  },
  {
    name: 'EffectiveDiameterCompare',
    kind: 'hud',
    domain: 'rail',
    entities: ['wheel_left', 'wheel_right', 'effective_diameter'],
    shots: ['comparison'],
  },
];

const COMPONENT_MAP = new Map(KIT_COMPONENTS.map((c) => [c.name, c]));

export function getKitComponentByName(name: string): KitComponentSpec | undefined {
  return COMPONENT_MAP.get(name);
}

export function detectTopicDomain(topic: string): KitDomain {
  const t = topic.toLowerCase();
  if (/\b(kereta|rel|sepur|bogie|flens|wheelset)\b/.test(t)) return 'rail';
  if (/\b(mesin|piston|silinder|engkol|katup|4\s*tak|empat\s*tak|motor\s*bakar)\b/.test(t)) {
    return 'engine';
  }
  return 'generic';
}

export function isDomainAllowed(itemDomain: KitDomain, targetDomain: KitDomain): boolean {
  if (itemDomain === 'generic') return true;
  if (targetDomain === 'generic') return false;
  return itemDomain === targetDomain;
}

export function getAllowedComponentsForDomain(domain: KitDomain): KitComponentSpec[] {
  return KIT_COMPONENTS.filter((c) => isDomainAllowed(c.domain, domain));
}

export function getAllowedEntitiesForDomain(domain: KitDomain): Set<string> {
  const out = new Set<string>();
  for (const c of getAllowedComponentsForDomain(domain)) {
    for (const e of c.entities) out.add(e);
  }
  return out;
}

export function isEntityAllowedInDomain(entityId: string, domain: KitDomain): boolean {
  const allowed = getAllowedEntitiesForDomain(domain);
  if (allowed.has(entityId)) return true;
  // Check if entity belongs to another specific domain
  for (const c of KIT_COMPONENTS) {
    if (c.entities.includes(entityId) && !isDomainAllowed(c.domain, domain)) {
      return false;
    }
  }
  return true;
}

export function isComponentAllowedInDomain(componentName: string, domain: KitDomain): boolean {
  const spec = COMPONENT_MAP.get(componentName);
  if (!spec) return true;
  return isDomainAllowed(spec.domain, domain);
}

export function domainHasSectionView(domain: KitDomain): boolean {
  return getAllowedComponentsForDomain(domain).some((c) => c.views?.includes('section'));
}

export function getAvailableShotsForDomain(domain: KitDomain): string[] {
  const shots = new Set<string>(['establishing', 'closeup', 'diagram_overlay', 'summary']);
  for (const c of getAllowedComponentsForDomain(domain)) {
    for (const s of c.shots ?? []) shots.add(s);
  }
  if (!domainHasSectionView(domain)) {
    shots.delete('cross_section');
  }
  if (domain === 'engine') {
    shots.delete('comparison'); // EffectiveDiameterCompare is rail-only
  }
  return [...shots];
}
