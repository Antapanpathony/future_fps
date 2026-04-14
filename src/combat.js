import * as THREE from 'three';
import { scene, camera, environmentGroup } from './engine.js';
import { agents, lasers, activeProjectiles, explosions, collidableBoxes, state, gameState } from './data.js';

// ---- Gun Model ----
export let gunMaterialGlow = null;
export const gunGroup = new THREE.Group();
export let gunMesh = null;

export function initCombat() {
  gunMesh = buildPremiumWeapon();
  gunMesh.position.set(0.3, -0.25, -0.4);
  gunGroup.add(gunMesh);
  camera.add(gunGroup);
}

function buildPremiumWeapon() {
  const group = new THREE.Group();

  const matBody  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9 });

  gunMaterialGlow = new THREE.MeshStandardMaterial({
    color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.8
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.4), matBody);
  group.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 16), matMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.35);
  group.add(barrel);

  const ringGeo = new THREE.TorusGeometry(0.04, 0.015, 8, 16);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(ringGeo, gunMaterialGlow);
    ring.position.set(0, 0.02, -0.2 - (i * 0.08));
    group.add(ring);
  }

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), matBody);
  grip.rotation.x = Math.PI / 6;
  grip.position.set(0, -0.15, 0.1);
  group.add(grip);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.15), matMetal);
  sight.position.set(0, 0.1, -0.05);
  group.add(sight);

  return group;
}

// ---- Module-level scratch objects (reused every call — zero per-frame allocation) ----
const raycaster   = new THREE.Raycaster();
const _tmpPos     = new THREE.Vector3();
const _tmpDir     = new THREE.Vector3();
const _tmpNormal  = new THREE.Vector3();
const _tmpNormMat = new THREE.Matrix3();

// ---- Reload ----
export function startReload(weapon) {
  if (weapon.isReloading) return;
  if (weapon.ammo === weapon.maxAmmo) return;
  if (weapon.reserveAmmo <= 0) return;

  weapon.isReloading = true;
  const ammoEl = document.getElementById('ammo-val');
  if (ammoEl) {
    ammoEl.style.color = '#ffaa00';
    ammoEl.style.textShadow = '0 0 12px #ffaa00';
    ammoEl.innerText = 'RELOADING...';
  }
  setTimeout(() => {
    const needed = weapon.maxAmmo - weapon.ammo;
    const drawn  = Math.min(needed, weapon.reserveAmmo);
    weapon.ammo        += drawn;
    weapon.reserveAmmo -= drawn;
    weapon.isReloading  = false;
    if (ammoEl) {
      ammoEl.style.color = '#00ff88';
      ammoEl.style.textShadow = '0 0 12px #00ff88';
      setTimeout(() => { ammoEl.style.color = ''; ammoEl.style.textShadow = ''; }, 400);
    }
  }, weapon.reloadTime);
}

// ---- Player Shoot ----
export function shoot() {
  const weapon = state.currentWeapon;
  if (state.mapKeys['ShiftLeft'] && !state.isADS) return;
  if (weapon.isReloading) return;
  if (weapon.ammo <= 0) { startReload(weapon); return; }

  const now = Date.now();
  if (now - weapon.lastFired < weapon.fireRate) return;
  weapon.lastFired = now;

  weapon.ammo--;
  if (weapon.ammo === 0) startReload(weapon);

  gunGroup.rotation.x = Math.max(gunGroup.rotation.x + 0.1, 0.3);

  if (weapon.isProjectile) {
    const pos = new THREE.Vector3();
    camera.getWorldPosition(pos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    pos.add(dir.clone().multiplyScalar(0.6));
    pos.y -= 0.1;

    const projColor = 0x00ffff;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: projColor, emissive: projColor, emissiveIntensity: 1 })
    );
    mesh.position.copy(pos);
    scene.add(mesh);

    const velocity = dir.clone().multiplyScalar(weapon.speed);
    velocity.y += 5;
    activeProjectiles.push({ mesh, velocity, team: 0, owner: camera, damage: weapon.damage, blastRadius: weapon.blastRadius, born: now, bounces: 0, fuse: 2500 });
    return;
  }

  for (let r = 0; r < weapon.rays; r++) {
    const dir = new THREE.Vector3(0, 0, -1);

    let dynamicSpread = weapon.spread;
    if (weapon.name === 'Rail-Sniper') {
      if (state.velocity.length() > 10) dynamicSpread += 0.15;
    }

    dir.x += (Math.random() - 0.5) * dynamicSpread;
    dir.y += (Math.random() - 0.5) * dynamicSpread;
    dir.applyQuaternion(camera.quaternion).normalize();

    raycaster.set(camera.position, dir);

    const gunTip = new THREE.Vector3(0.3, -0.2, -0.6);
    gunTip.applyMatrix4(camera.matrixWorld);

    const intersects = raycaster.intersectObjects(scene.children, true);
    const validIntersects = intersects.filter(hit => {
      let isGun = false;
      gunMesh.traverse(child => { if (hit.object === child) isGun = true; });
      return !isGun;
    });

    let endPoint = new THREE.Vector3();
    raycaster.ray.at(100, endPoint);

    if (validIntersects.length > 0) {
      const hitAgents = new Set();

      for (let h = 0; h < validIntersects.length; h++) {
        const hitObject = validIntersects[h].object;
        let isAgentHit = false;

        for (let i = agents.length - 1; i >= 0; i--) {
          let agentMatched = false;
          agents[i].mesh.traverse(child => { if (child === hitObject) agentMatched = true; });

          if (agentMatched && !hitAgents.has(agents[i])) {
            isAgentHit = true;
            hitAgents.add(agents[i]);

            if (agents[i].team !== 0) {
              const dead = agents[i].takeDamage(weapon.damage);
              if (dead) {
                gameState.score += 100;
                agents.splice(i, 1);
              }
            }
            break;
          }
        }

        if (h === 0) endPoint.copy(validIntersects[h].point);

        if (!isAgentHit) {
          let isSolid = false;
          let curr = hitObject;
          while (curr) {
            if (curr.userData && curr.userData.isSolid) isSolid = true;
            curr = curr.parent;
          }
          if (isSolid) break;
        }

        if (!weapon.piercing) break;
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints([gunTip, endPoint]);
    const laser = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: weapon.color, linewidth: 2 }));
    scene.add(laser);
    lasers.push({ mesh: laser, born: now });
  }
}

// ---- Laser Cleanup ----
export function updateLasers() {
  const now = Date.now();
  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    if (now - l.born > 100) {
      scene.remove(l.mesh);
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
      lasers.splice(i, 1);
    }
  }
}

// ---- Projectile System ----
export function updateProjectiles(delta) {
  const now = Date.now();
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    p.velocity.y -= 30 * delta;
    const stepVel = p.velocity.clone().multiplyScalar(delta);
    p.mesh.position.add(stepVel);

    const ray = new THREE.Raycaster(p.mesh.position, p.velocity.clone().normalize(), 0, stepVel.length() + 0.3);
    const envHits = ray.intersectObjects(environmentGroup.children, true);

    if (envHits.length > 0) {
      let isOwnerHit = false;
      if (now - p.born < 300 && p.owner && !(p.owner instanceof THREE.Camera)) {
        p.owner.traverse(child => { if (child === envHits[0].object) isOwnerHit = true; });
      }

      if (!isOwnerHit) {
        _tmpNormal.copy(envHits[0].face.normal);
        if (envHits[0].object.matrixWorld) {
          _tmpNormMat.getNormalMatrix(envHits[0].object.matrixWorld);
          _tmpNormal.applyMatrix3(_tmpNormMat).normalize();
        }
        p.velocity.reflect(_tmpNormal).multiplyScalar(0.6);
        p.bounces++;
        p.mesh.position.addScaledVector(_tmpNormal, 0.1);
      }
    }

    let exploded = false;

    for (let j = 0; j < agents.length; j++) {
      const ag = agents[j];
      if (ag.health > 0 && ag.team !== p.team && p.mesh.position.distanceTo(ag.mesh.position) < 1.5) {
        exploded = true;
        detonateGrenade(p, p.mesh.position.clone());
        break;
      }
    }

    if (!exploded && p.team !== 0 && p.mesh.position.distanceTo(camera.position) < 1.5) {
      exploded = true;
      detonateGrenade(p, p.mesh.position.clone());
    }

    if (!exploded && now - p.born > p.fuse) {
      exploded = true;
      detonateGrenade(p, p.mesh.position.clone());
    }

    if (exploded) {
      scene.remove(p.mesh);
      activeProjectiles.splice(i, 1);
    }
  }
}

export function detonateGrenade(p, impactPoint) {
  const pDist = camera.position.distanceTo(impactPoint);
  if (p.team !== 0 && pDist < p.blastRadius) {
    gameState.health -= p.damage * (1 - (pDist / p.blastRadius));
  }

  for (let i = 0; i < agents.length; i++) {
    const ag = agents[i];
    if (ag.health <= 0) continue;
    if (ag.team === p.team) continue;
    const d = ag.mesh.position.distanceTo(impactPoint);
    if (d < p.blastRadius) {
      ag.health -= p.damage * (1 - (d / p.blastRadius));
      if (ag.health <= 0) gameState.score += 100;
    }
  }

  const expMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 })
  );
  expMesh.position.copy(impactPoint);
  scene.add(expMesh);
  explosions.push({ mesh: expMesh, born: Date.now(), maxScale: p.blastRadius * 0.7 });
}

export function updateExplosions(delta) {
  const now = Date.now();
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    const age = now - e.born;
    if (age > 400) {
      scene.remove(e.mesh);
      explosions.splice(i, 1);
    } else {
      const t = age / 400;
      const s = 1 + t * e.maxScale;
      e.mesh.scale.set(s, s, s);
      e.mesh.material.opacity = (1 - t) * 0.8;
    }
  }
}
