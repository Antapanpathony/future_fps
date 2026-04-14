import * as THREE from 'three';

// ---- Agent Geometries (shared, not cloned) ----
export const agentGeometry = new THREE.OctahedronGeometry(1.5, 2);
export const coreGeo = new THREE.OctahedronGeometry(0.8, 1);

// ---- Agent Materials ----
// Team 1 = Red (Enemies)
export const matEnemyShell = new THREE.MeshStandardMaterial({
  color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 0.5,
  roughness: 0.2, metalness: 0.8, wireframe: true
});
export const matEnemyCore = new THREE.MeshStandardMaterial({
  color: 0x220011, emissive: 0xff0055, emissiveIntensity: 0.8,
  roughness: 0.1, metalness: 0.9
});

// Team 0 = Blue (Allies)
export const matAllyShell = new THREE.MeshStandardMaterial({
  color: 0x0055ff, emissive: 0x0055ff, emissiveIntensity: 0.5,
  roughness: 0.2, metalness: 0.8, wireframe: true
});
export const matAllyCore = new THREE.MeshStandardMaterial({
  color: 0x001122, emissive: 0x0055ff, emissiveIntensity: 0.8,
  roughness: 0.1, metalness: 0.9
});
