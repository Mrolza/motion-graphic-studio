import React from 'react';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import type { PaletteId } from '../tokens/index';
import { Arrow3D } from './LineAndLabel3D';

export interface MotionArrowProps {
  id?: string;
  bindToPart?: string;
  position?: [number, number, number];
  length?: number;
  velocity?: [number, number, number];
  direction?: [number, number, number];
  color?: string;
  palette?: PaletteId;
}

function normalizeVec(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * 3D motion arrow whose direction is derived from velocity sign/vector or explicit direction,
 * and reported to telemetry for VIS_ARROW_DIRECTION_MISMATCH verification.
 */
export const MotionArrow: React.FC<MotionArrowProps> = ({
  id = 'motion_arrow',
  bindToPart = 'piston',
  position = [0, 0, 0],
  length = 0.55,
  velocity,
  direction = [0, -1, 0],
  color,
  palette = 'blueprint-navy',
}) => {
  const velNorm = velocity ? normalizeVec(velocity) : [0, 0, 0];
  const hasVel = Math.hypot(velNorm[0], velNorm[1], velNorm[2]) > 1e-4;
  const dir = hasVel ? (velNorm as [number, number, number]) : normalizeVec(direction);
  const to: [number, number, number] = [
    position[0] + dir[0] * length,
    position[1] + dir[1] * length,
    position[2] + dir[2] * length,
  ];

  return (
    <TelemetryEntity
      id={id}
      role="prop"
      partStates={{
        arrow_dir_x: Number(dir[0].toFixed(3)),
        arrow_dir_y: Number(dir[1].toFixed(3)),
        arrow_dir_z: Number(dir[2].toFixed(3)),
        bind_to_part: bindToPart,
      }}
    >
      <Arrow3D from={position} to={to} color={color} palette={palette} />
    </TelemetryEntity>
  );
};
