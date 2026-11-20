import * as THREE from 'three';
import type { ScreenBox } from './types';

/**
 * Projects a 3D world-space bounding box into 2D screen pixel coordinates [0..width, 0..height].
 */
export function projectBox3ToScreen(
  box: THREE.Box3,
  camera: THREE.Camera,
  width: number,
  height: number
): ScreenBox | undefined {
  if (box.isEmpty()) return undefined;
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of corners) {
    c.project(camera);
    const sx = (c.x * 0.5 + 0.5) * width;
    const sy = (-c.y * 0.5 + 0.5) * height;
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
    if (sx > maxX) maxX = sx;
    if (sy > maxY) maxY = sy;
  }

  return {
    x: Math.round(minX * 10) / 10,
    y: Math.round(minY * 10) / 10,
    width: Math.round(Math.max(0, maxX - minX) * 10) / 10,
    height: Math.round(Math.max(0, maxY - minY) * 10) / 10,
  };
}
