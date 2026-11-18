import fs from 'node:fs';
import { validateSceneCode, ValidationResult } from './validator';

const FORBIDDEN_TRAIN_COMPONENTS = [
  'Rail',
  'Wheel',
  'Axle',
  'TrainCar',
  'Pole',
  'Spring',
];

const RAW_THREE_REGEX = /<(mesh|group|boxGeometry|cylinderGeometry|sphereGeometry|torusGeometry|coneGeometry|meshStandardMaterial)\b/;

export function validateP0bSceneCode(
  filePath: string,
  expectedComponentName: string
): ValidationResult {
  const base = validateSceneCode(filePath, expectedComponentName);
  const errors = [...base.errors];
  const code = fs.readFileSync(filePath, 'utf-8');

  for (const comp of FORBIDDEN_TRAIN_COMPONENTS) {
    const regex = new RegExp(`\\b${comp}\\b`);
    if (regex.test(code)) {
      errors.push(`Forbidden train-specific component "${comp}" used in P0b.`);
    }
  }

  if (RAW_THREE_REGEX.test(code)) {
    errors.push('Raw Three.js JSX element used; compose strictly with @kit primitives.');
  }

  if (!/\bsolveCrankSlider\s*\(/.test(code)) {
    errors.push('Missing solveCrankSlider(...) call; piston position must be computed from crank angle.');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
