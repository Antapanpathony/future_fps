import * as THREE from 'three';
import { scene, camera, environmentGroup } from './engine.js';
import { agents, collidableBoxes, activeProjectiles, lasers, state, gameState, weapons } from './data.js';
import { agentGeometry, coreGeo, matEnemyShell, matEnemyCore, matAllyShell, matAllyCore } from './theme.js';

// Module-level constant — avoids allocating new THREE.Vector3(0,1,0) inside hot loops
const _UP = new THREE.Vector3(0, 1, 0);

export class Agent {
  constructor(x, z, team) {
    this.team = team;
    this.mesh = new THREE.Group();

    this.health = 200 * state.difficultyMult;
    this.speed = (team === 0 ? 4 : 3) * state.difficultyMult;
    this.baseDamage = 10 * state.difficultyMult;
    this.lastFired = 0;
    this.velocityY = 0;
    this.stuckTimer = 0;
    this.stuckDir = new THREE.Vector3();
    this.nestBaseZ   = team === 0 ?  76 : -76;
    this.nestTargetZ = team === 0 ? 104 : -104;

    const weaponList = Object.values(weapons).filter(w => !w.isProjectile);
    this.primaryWeapon = JSON.parse(JSON.stringify(weaponList[Math.floor(Math.random() * weaponList.length)]));
    this.clonedSniper  = JSON.parse(JSON.stringify(weapons.sniper));
    this.clonedShotgun = JSON.parse(JSON.stringify(weapons.shotgun));
    this.weapon = this.primaryWeapon;

    this.isAlert = false;
    this.alertTimer = 0;
    this.visibilityThreshold = 150;
    this.lastTargetPos = null;

    // Pre-allocated scratch objects — reused every frame to avoid GC pressure
    this._raycaster    = new THREE.Raycaster();
    this._normalMatrix = new THREE.Matrix3();
    this._eyeLevel     = new THREE.Vector3();
    this._dirToTarget  = new THREE.Vector3();
    this._forward      = new THREE.Vector3();
    this._grenadeDir   = new THREE.Vector3();
    this._avoidNormal  = new THREE.Vector3();
    this._testDir      = new THREE.Vector3();
    this._moveDir      = new THREE.Vector3();
    // LOS throttle: only recheck every 3rd frame (staggered by id so agents don't all spike together)
    this._losFrame     = 0;
    this._cachedHasLOS = false;

    const shellMat = team === 0 ? matAllyShell : matEnemyShell;
    const coreMat  = team === 0 ? matAllyCore  : matEnemyCore;
    const shell = new THREE.Mesh(agentGeometry, shellMat.clone());
    const core  = new THREE.Mesh(coreGeo,       coreMat.clone());
    this.mesh.add(shell);
    this.mesh.add(core);
    this.shell = shell;
    this.core  = core;

    // Visual class differentiation
    const isLauncher = this.primaryWeapon.name === 'Grenade Launcher';
    const isSniper   = this.primaryWeapon.name === 'Rail-Sniper';
    const isShotgun  = this.primaryWeapon.name === 'Scatter Gun';

    if (isLauncher) {
      this.mesh.scale.set(1.3, 1.3, 1.3);
      shell.material.color.setHex(0xffaa00); shell.material.emissive.setHex(0xffaa00);
      core.material.color.setHex(0xff0000);  core.material.emissive.setHex(0xff0000);
    } else if (isSniper) {
      this.mesh.scale.set(0.8, 1.2, 0.8);
      shell.material.color.setHex(0x00ff00); shell.material.emissive.setHex(0x00ff00);
      core.material.color.setHex(0xccff00);  core.material.emissive.setHex(0xccff00);
    } else if (isShotgun) {
      this.mesh.scale.set(1.1, 0.9, 1.1);
      shell.material.color.setHex(0x0088ff); shell.material.emissive.setHex(0x0088ff);
      core.material.color.setHex(0x00ffff);  core.material.emissive.setHex(0x00ffff);
    }

    this.mesh.position.set(x, 2.5, z);

    const lightColor = isLauncher ? 0xffaa00 : (team === 0 ? 0x0055ff : 0xff0055);
    const lightIntensity = isLauncher ? 3 : 2;
    const lightRange     = isLauncher ? 15 : 10;
    this.mesh.add(new THREE.PointLight(lightColor, lightIntensity, lightRange));

    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  update(delta) {
    // Floor detection via AABB overlap
    const ax = this.mesh.position.x;
    const az = this.mesh.position.z;
    const ay = this.mesh.position.y;
    const agentFeetInit = ay - 2.0;
    const agentStep = state.currentMap === 'nest' ? 2.0 : 0.6;
    let agentFloorY = 0;

    for (let i = 0; i < collidableBoxes.length; i++) {
      const box = collidableBoxes[i];
      if (ax > box.min.x - 0.8 && ax < box.max.x + 0.8 && az > box.min.z - 0.8 && az < box.max.z + 0.8) {
        if (box.max.y <= agentFeetInit + agentStep + 0.1 && box.max.y > agentFloorY) {
          agentFloorY = box.max.y;
        }
      }
    }

    this.velocityY -= 300 * delta;
    this.mesh.position.y += this.velocityY * delta;
    if (this.mesh.position.y - 2.0 <= agentFloorY) {
      this.mesh.position.y = agentFloorY + 2.0;
      this.velocityY = Math.max(0, this.velocityY);
    }

    let closestHostile = null;
    let minDist = Infinity;
    let grenadeAvoidance = false; // true when _grenadeDir is valid
    let isSprinting = false;

    // Grenade avoidance — reuse _grenadeDir instead of cloning
    for (let i = 0; i < activeProjectiles.length; i++) {
      const p = activeProjectiles[i];
      if (p.team !== this.team) {
        const distToGrenade = this.mesh.position.distanceTo(p.mesh.position);
        if (distToGrenade < 20) {
          this._grenadeDir.subVectors(this.mesh.position, p.mesh.position).normalize();
          grenadeAvoidance = true;
          isSprinting = true;
          break;
        }
      }
    }

    // Find closest hostile
    if (this.team === 1) {
      const pDist = this.mesh.position.distanceTo(camera.position);
      if (pDist < minDist) {
        minDist = pDist;
        closestHostile = { isPlayer: true, position: camera.position };
      }
    }

    for (let i = 0; i < agents.length; i++) {
      const other = agents[i];
      if (other.team !== this.team) {
        const d = this.mesh.position.distanceTo(other.mesh.position);
        if (d < minDist) {
          minDist = d;
          closestHostile = { isPlayer: false, position: other.mesh.position, agent: other };
        }
      }
    }

    if (closestHostile) {
      // Smart weapon switch
      const isHeavy = this.primaryWeapon.name === 'Grenade Launcher';
      if (!isHeavy) {
        if (minDist > 35)     this.weapon = this.clonedSniper;
        else if (minDist < 8) this.weapon = this.clonedShotgun;
        else                  this.weapon = this.primaryWeapon;
      } else {
        this.weapon = minDist < 5 ? this.clonedSniper : this.primaryWeapon;
      }

      // Perception — reuse _eyeLevel and _dirToTarget
      const fogDensity = (scene.fog && scene.fog.density) ? scene.fog.density : 0.01;
      this.visibilityThreshold = 2.3 / Math.max(0.005, fogDensity);

      // LOS is expensive — only recheck every 3rd frame, staggered by agent id
      this._losFrame++;
      const shouldCheckLOS = (this._losFrame % 3) === (this.mesh.id % 3);

      if (shouldCheckLOS) {
        let hasLOS = true;
        let isVisible = false;
        this._eyeLevel.copy(this.mesh.position); this._eyeLevel.y += 1.5;
        this._dirToTarget.subVectors(closestHostile.position, this._eyeLevel).normalize();

        if (minDist < this.visibilityThreshold) {
          if (this.isAlert) {
            isVisible = true;
          } else {
            this._forward.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
            if (this._forward.angleTo(this._dirToTarget) < Math.PI / 1.5) isVisible = true;
          }
        }

        if (isVisible) {
          this._raycaster.set(this._eyeLevel, this._dirToTarget);
          const losHits = this._raycaster.intersectObjects(environmentGroup.children, true);
          for (let i = 0; i < losHits.length; i++) {
            if (losHits[i].object.userData.isSolid && losHits[i].distance < minDist) {
              hasLOS = false; break;
            }
          }
        } else {
          hasLOS = false;
        }

        this._cachedHasLOS = hasLOS;
        // Keep _dirToTarget valid for this frame's movement code
      } else {
        // Refresh _eyeLevel and _dirToTarget for movement even on skipped LOS frames
        this._eyeLevel.copy(this.mesh.position); this._eyeLevel.y += 1.5;
        this._dirToTarget.subVectors(closestHostile.position, this._eyeLevel).normalize();
      }

      const hasLOS = this._cachedHasLOS;

      // Alert state
      if (this.alertTimer > 0) {
        this.alertTimer -= delta * 1000;
        if (this.alertTimer <= 0) this.isAlert = false;
      }
      if (hasLOS) {
        this.isAlert = true;
        this.alertTimer = 8000;
        if (this.lastTargetPos) this.lastTargetPos.copy(closestHostile.position);
        else this.lastTargetPos = closestHostile.position.clone();
      }

      let currentSpeed = this.speed;
      const isAiming = (this.weapon === weapons.sniper && minDist > 20);
      isSprinting = false;

      if (hasLOS) this.mesh.lookAt(closestHostile.position.x, 2.5, closestHostile.position.z);

      // Heavy launcher strafe tactic — reuse _moveDir for tacticalStrafe
      const now = Date.now();
      let tacticalStrafe = false;
      if (this.primaryWeapon.name === 'Grenade Launcher' && now - this.lastFired < 2000) {
        this._moveDir.crossVectors(this._dirToTarget, _UP).normalize();
        if ((this.mesh.id % 2) === 0) this._moveDir.negate();
        tacticalStrafe = true;
        currentSpeed *= 1.5;
        isSprinting = true;
      }

      if (!hasLOS && minDist > 30)       { isSprinting = true; currentSpeed *= 2.5; }
      else if (hasLOS && isAiming)       { currentSpeed *= 0.5; }

      if (this.lastHitTime && now - this.lastHitTime < 2000 && this.lastHitDamage > 30) {
        isSprinting = true; currentSpeed *= 2.0;
      }

      if (minDist > 8 || !hasLOS || tacticalStrafe) {
        // _moveDir holds the final movement direction
        if (!tacticalStrafe) {
          this._moveDir.copy(this._dirToTarget); this._moveDir.y = 0;
        }

        if (grenadeAvoidance) {
          this._moveDir.copy(this._grenadeDir);
        } else if (!tacticalStrafe) {
          if (this.stuckTimer > 0) {
            this.stuckTimer -= delta;
            this._moveDir.copy(this.stuckDir);
          } else {
            let useProactivePathing = false;

            if (state.currentMap === 'nest') {
              const onRoof = this.mesh.position.y > 20;
              useProactivePathing = true;
              const targetX = (this.mesh.id % 5 - 2) * 4;

              if (!onRoof) {
                const needsBase = (this.team === 0) ? (this.mesh.position.z < 62) : (this.mesh.position.z > -62);
                if (Math.abs(this.mesh.position.x - targetX) > 4) {
                  this._moveDir.set(targetX - this.mesh.position.x, 0, 0).normalize();
                } else if (needsBase) {
                  this._moveDir.set(targetX - this.mesh.position.x, 0, this.nestBaseZ - this.mesh.position.z).normalize();
                } else {
                  this._moveDir.set(targetX - this.mesh.position.x, 0, this.nestTargetZ - this.mesh.position.z).normalize();
                }
              } else {
                const strafe = Math.sin(Date.now() * 0.002 + this.mesh.position.x) * 5;
                this._moveDir.set(targetX + strafe - this.mesh.position.x, 0, this.nestTargetZ - this.mesh.position.z).normalize();
                if (this._moveDir.length() < 0.1) this._moveDir.set(0, 0, 0);
              }
            }

            if (!useProactivePathing) {
              if (state.currentMap === 'nest' && closestHostile && closestHostile.position.y > 10 && !hasLOS) {
                const towerZ     = closestHostile.position.z < 0 ? -110 : 110;
                const stairZBase = closestHostile.position.z < 0 ? -50  : 50;
                const needsStairBase = (closestHostile.position.z < 0)
                  ? (this.mesh.position.z > -45)
                  : (this.mesh.position.z < 45);

                if (Math.abs(this.mesh.position.x) > 4) {
                  this._moveDir.set(0 - this.mesh.position.x, 0, 0).normalize();
                } else if (needsStairBase) {
                  this._moveDir.set(0 - this.mesh.position.x, 0, stairZBase - this.mesh.position.z).normalize();
                } else {
                  this._moveDir.set(0 - this.mesh.position.x, 0, towerZ - this.mesh.position.z).normalize();
                }
              } else {
                // Vector-based obstacle avoidance — reuse _raycaster, _avoidNormal
                this._raycaster.set(this.mesh.position, this._moveDir);
                const avoidHits = this._raycaster.intersectObjects(environmentGroup.children, true);
                if (avoidHits.length > 0 && avoidHits[0].distance < 4 && avoidHits[0].object.userData.isSolid) {
                  if (avoidHits[0].face) {
                    this._avoidNormal.copy(avoidHits[0].face.normal);
                  } else {
                    this._avoidNormal.set(0, 0, 1);
                  }
                  if (avoidHits[0].object.matrixWorld) {
                    this._normalMatrix.getNormalMatrix(avoidHits[0].object.matrixWorld);
                    this._avoidNormal.applyMatrix3(this._normalMatrix).normalize();
                  }
                  this._avoidNormal.y = 0; this._avoidNormal.normalize();
                  this._moveDir.crossVectors(this._avoidNormal, _UP).normalize();
                  if (this._moveDir.dot(this._dirToTarget) < 0) this._moveDir.negate();
                }
              }
            }
          }
        }

        if (this._moveDir.lengthSq() > 0.001) {
          this.mesh.lookAt(
            this.mesh.position.x + this._moveDir.x,
            2.5,
            this.mesh.position.z + this._moveDir.z
          );
        }

        // ---- Horizontal collision & movement (enemy team) ----
        const oldX = this.mesh.position.x;
        const oldZ = this.mesh.position.z;
        const pMinY = this.mesh.position.y - 1.0;
        const pMaxY = this.mesh.position.y + 1.5;

        // Step X
        let xStuck = false;
        this.mesh.position.x += this._moveDir.x * currentSpeed * delta;
        let agentFeet = this.mesh.position.y - 2.0;

        for (let i = 0; i < collidableBoxes.length; i++) {
          const box = collidableBoxes[i];
          if (agentFeet >= box.max.y - 0.05) continue;
          if (this.mesh.position.y + 1.5 > box.min.y) {
            if (this.mesh.position.x > box.min.x - 0.8 && this.mesh.position.x < box.max.x + 0.8 &&
                oldZ > box.min.z - 0.8 && oldZ < box.max.z + 0.8) {
              const stepH = box.max.y - agentFeet;
              if (state.currentMap === 'nest' && stepH > 0 && stepH <= 2.0) {
                this.mesh.position.y = box.max.y + 2; this.velocityY = 0;
              } else {
                this.mesh.position.x = oldX; xStuck = true;
              }
              break;
            }
          }
        }

        for (let i = 0; i < agents.length; i++) {
          const other = agents[i];
          if (other === this || other.health <= 0) continue;
          const oMinY = other.mesh.position.y - 2.0;
          const oMaxY = other.mesh.position.y + 1.5;
          if (pMaxY > oMinY && pMinY < oMaxY) {
            if (Math.abs(this.mesh.position.x - other.mesh.position.x) < 1.0 &&
                Math.abs(oldZ - other.mesh.position.z) < 1.0) {
              this.mesh.position.x = oldX; xStuck = true; break;
            }
          }
        }

        if (!gameState.isPaused && gameState.health > 0) {
          const playMinY = camera.position.y - 1.6;
          const playMaxY = camera.position.y + 0.2;
          if (pMaxY > playMinY && pMinY < playMaxY) {
            if (Math.abs(this.mesh.position.x - camera.position.x) < 0.9 &&
                Math.abs(oldZ - camera.position.z) < 0.9) {
              this.mesh.position.x = oldX; xStuck = true;
            }
          }
        }

        agentFeet = this.mesh.position.y - 2.0;

        // Step Z
        let zStuck = false;
        this.mesh.position.z += this._moveDir.z * currentSpeed * delta;

        for (let i = 0; i < collidableBoxes.length; i++) {
          const box = collidableBoxes[i];
          if (agentFeet >= box.max.y - 0.05) continue;
          if (this.mesh.position.y + 1.5 > box.min.y) {
            if (this.mesh.position.x > box.min.x - 0.8 && this.mesh.position.x < box.max.x + 0.8 &&
                this.mesh.position.z > box.min.z - 0.8 && this.mesh.position.z < box.max.z + 0.8) {
              const stepH = box.max.y - agentFeet;
              if (state.currentMap === 'nest' && stepH > 0 && stepH <= 2.0) {
                this.mesh.position.y = box.max.y + 2; this.velocityY = 0;
              } else {
                this.mesh.position.z = oldZ; zStuck = true;
              }
              break;
            }
          }
        }

        for (let i = 0; i < agents.length; i++) {
          const other = agents[i];
          if (other === this || other.health <= 0) continue;
          const oMinY = other.mesh.position.y - 2.0;
          const oMaxY = other.mesh.position.y + 1.5;
          if (pMaxY > oMinY && pMinY < oMaxY) {
            if (Math.abs(this.mesh.position.x - other.mesh.position.x) < 1.0 &&
                Math.abs(this.mesh.position.z - other.mesh.position.z) < 1.0) {
              this.mesh.position.z = oldZ; zStuck = true; break;
            }
          }
        }

        if (!gameState.isPaused && gameState.health > 0) {
          const playMinY = camera.position.y - 1.6;
          const playMaxY = camera.position.y + 0.2;
          if (pMaxY > playMinY && pMinY < playMaxY) {
            if (Math.abs(this.mesh.position.x - camera.position.x) < 0.9 &&
                Math.abs(this.mesh.position.z - camera.position.z) < 0.9) {
              this.mesh.position.z = oldZ; zStuck = true;
            }
          }
        }

        // Stuck detection — reuse _testDir and _raycaster
        if (this.stuckTimer <= 0) {
          const movedSq = Math.pow(this.mesh.position.x - oldX, 2) + Math.pow(this.mesh.position.z - oldZ, 2);
          if (movedSq < 0.0001 && currentSpeed > 0) {
            this.stuckTimer = 1.0;
            this._testDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
              this._testDir.set(Math.cos(a), 0, Math.sin(a));
              this._raycaster.set(this.mesh.position, this._testDir);
              const hts = this._raycaster.intersectObjects(environmentGroup.children, true);
              let blocked = false;
              for (let k = 0; k < hts.length; k++) {
                if (hts[k].object.userData.isSolid && hts[k].distance < 7) { blocked = true; break; }
              }
              if (!blocked) break;
            }
            this.stuckDir.copy(this._testDir);
          }
        }

        // Combat
        const suppressFire = isSprinting && this.weapon.name === 'Rail-Sniper';
        if (hasLOS && !suppressFire) {
          const rateMult = this.team === 0 ? 1.5 : 2.0;
          if (now - this.lastFired > this.weapon.fireRate * rateMult) {
            this.lastFired = now;
            this.shootAt(closestHostile);
          }
        }
      }

    } else if (this.team === 0) {
      // ---- Ally follow-player logic ----
      if (this.alertTimer > 0) {
        this.alertTimer -= delta * 1000;
        if (this.alertTimer <= 0) this.isAlert = false;
      }

      const distToPlayer = this.mesh.position.distanceTo(camera.position);
      if (distToPlayer > 5) {
        // Reuse _dirToTarget for dirToPlayer, _moveDir for movement direction
        this._dirToTarget.subVectors(camera.position, this.mesh.position).normalize();
        this._moveDir.copy(this._dirToTarget); this._moveDir.y = 0;

        this._raycaster.set(this.mesh.position, this._moveDir);
        const avoidHits = this._raycaster.intersectObjects(environmentGroup.children, true);
        if (avoidHits.length > 0 && avoidHits[0].distance < 4 && avoidHits[0].object.userData.isSolid) {
          if (avoidHits[0].face) {
            this._avoidNormal.copy(avoidHits[0].face.normal);
          } else {
            this._avoidNormal.set(0, 0, 1);
          }
          if (avoidHits[0].object.matrixWorld) {
            this._normalMatrix.getNormalMatrix(avoidHits[0].object.matrixWorld);
            this._avoidNormal.applyMatrix3(this._normalMatrix).normalize();
          }
          this._avoidNormal.y = 0; this._avoidNormal.normalize();
          this._moveDir.crossVectors(this._avoidNormal, _UP).normalize();
          if (this._moveDir.dot(this._dirToTarget) < 0) this._moveDir.negate();
        }

        const oldX = this.mesh.position.x;
        const oldZ = this.mesh.position.z;
        const pMinY = this.mesh.position.y - 1.0;
        const pMaxY = this.mesh.position.y + 1.5;

        this.mesh.position.x += this._moveDir.x * this.speed * delta;
        for (let i = 0; i < collidableBoxes.length; i++) {
          const box = collidableBoxes[i];
          if (pMinY < box.max.y && pMaxY > box.min.y) {
            if (this.mesh.position.x > box.min.x - 0.8 && this.mesh.position.x < box.max.x + 0.8 &&
                oldZ > box.min.z - 0.8 && oldZ < box.max.z + 0.8) {
              this.mesh.position.x = oldX; break;
            }
          }
        }

        this.mesh.position.z += this._moveDir.z * this.speed * delta;
        for (let i = 0; i < collidableBoxes.length; i++) {
          const box = collidableBoxes[i];
          if (pMinY < box.max.y && pMaxY > box.min.y) {
            if (this.mesh.position.x > box.min.x - 0.8 && this.mesh.position.x < box.max.x + 0.8 &&
                this.mesh.position.z > box.min.z - 0.8 && this.mesh.position.z < box.max.z + 0.8) {
              this.mesh.position.z = oldZ; break;
            }
          }
        }

        // Stuck detection — reuse _testDir and _raycaster
        if (this.stuckTimer <= 0) {
          const movedSq = Math.pow(this.mesh.position.x - oldX, 2) + Math.pow(this.mesh.position.z - oldZ, 2);
          if (movedSq < 0.0001 && this.speed > 0) {
            this.stuckTimer = 1.0;
            this._testDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
              this._testDir.set(Math.cos(a), 0, Math.sin(a));
              this._raycaster.set(this.mesh.position, this._testDir);
              const hts = this._raycaster.intersectObjects(environmentGroup.children, true);
              let blocked = false;
              for (let k = 0; k < hts.length; k++) {
                if (hts[k].object.userData.isSolid && hts[k].distance < 15) { blocked = true; break; }
              }
              if (!blocked) break;
            }
            this.stuckDir.copy(this._testDir);
          }
        }
      }
    }
  }

  shootAt(target) {
    if (this.weapon.isProjectile) {
      const pos = this.mesh.position.clone();
      pos.y += 1.5;

      const dir = target.position.clone().sub(pos).normalize();
      dir.x += (Math.random() - 0.5) * 0.1;
      dir.z += (Math.random() - 0.5) * 0.1;
      dir.normalize();

      const projColor = this.team === 0 ? 0x00ffff : 0xff0000;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshStandardMaterial({ color: projColor, emissive: projColor, emissiveIntensity: 1 })
      );
      mesh.position.copy(pos);
      scene.add(mesh);

      const velocity = dir.multiplyScalar(this.weapon.speed);
      velocity.y += 3 + Math.random() * 4;

      activeProjectiles.push({
        mesh, velocity,
        team: this.team, owner: this.mesh,
        damage: this.weapon.damage, blastRadius: this.weapon.blastRadius,
        born: Date.now(), bounces: 0, fuse: 2800
      });
      return;
    }

    const laserColor = this.weapon.color;
    for (let r = 0; r < this.weapon.rays; r++) {
      const aimPoint = target.position.clone();
      aimPoint.x += (Math.random() - 0.5) * this.weapon.spread * 10;
      aimPoint.y += (Math.random() - 0.5) * this.weapon.spread * 10;
      aimPoint.z += (Math.random() - 0.5) * this.weapon.spread * 10;

      const geometry = new THREE.BufferGeometry().setFromPoints([this.mesh.position.clone(), aimPoint]);
      const laser = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: laserColor, linewidth: 2 }));
      scene.add(laser);
      lasers.push({ mesh: laser, born: Date.now() });

      // Damage raycast from eye level
      const eyePos = this.mesh.position.clone(); eyePos.y += 1.5;
      const dir = new THREE.Vector3().subVectors(aimPoint, eyePos).normalize();
      const ray = new THREE.Raycaster();
      ray.set(eyePos, dir);

      let hitWall = false;
      const maxDist = eyePos.distanceTo(aimPoint);
      const envHits = ray.intersectObjects(environmentGroup.children, true);
      for (let i = 0; i < envHits.length; i++) {
        if (envHits[i].object.userData.isSolid && envHits[i].distance < maxDist) {
          hitWall = true; break;
        }
      }

      if (target.isPlayer) {
        const playerBox = new THREE.Box3(
          new THREE.Vector3(camera.position.x - 0.5, camera.position.y - 1.8, camera.position.z - 0.5),
          new THREE.Vector3(camera.position.x + 0.5, camera.position.y + 0.5, camera.position.z + 0.5)
        );
        if (ray.ray.intersectsBox(playerBox) && !hitWall) {
          gameState.health -= (this.weapon.damage * 0.5) * state.difficultyMult;
        }
      } else {
        const hits = ray.intersectObjects(target.agent.mesh.children, true);
        if ((hits.length > 0 || aimPoint.distanceTo(target.position) < 4) && !hitWall) {
          const dead = target.agent.takeDamage(this.weapon.damage);
          if (dead) {
            const index = agents.indexOf(target.agent);
            if (index > -1) agents.splice(index, 1);
          }
        }
      }
    }
  }

  takeDamage(amount) {
    this.health -= amount;
    this.lastHitTime = Date.now();
    this.lastHitDamage = amount;
    this.isAlert = true;
    this.alertTimer = 15000;

    this.shell.material.emissive.setHex(0xffffff);
    setTimeout(() => {
      if (this.shell && this.shell.material) {
        this.shell.material.emissive.setHex(this.team === 0 ? 0x0055ff : 0xff0055);
      }
    }, 100);

    if (this.health <= 0) {
      scene.remove(this.mesh);
      this.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      return true;
    }
    return false;
  }
}

// ---- Entity Spawner ----
export function spawnEntities(mode) {
  let allyCount = 0, enemyCount = 0;
  if (mode === 'solo') enemyCount = 5;
  if (mode === '1v1')  enemyCount = 1;
  if (mode === '2v2')  { allyCount = 1; enemyCount = 2; }
  if (mode === '3v3')  { allyCount = 2; enemyCount = 3; }
  if (mode === '4v4')  { allyCount = 3; enemyCount = 4; }

  let playerSpawnX = 0, playerSpawnZ = 0;
  let allySpreadX = 20, allySpreadZ = 10, allyOffsetZ = 0;
  let enemySpreadX = 60, enemySpreadZ = 20, enemyOffsetZ = 0;

  if (state.currentMap === 'city') {
    playerSpawnZ = 120; allyOffsetZ = 120; enemyOffsetZ = -120; enemySpreadX = 100;
  } else if (state.currentMap === 'nest') {
    playerSpawnZ = 50; allyOffsetZ = 50; enemyOffsetZ = -50;
    allySpreadX = 30; enemySpreadX = 30;
  } else {
    playerSpawnZ = 100; allyOffsetZ = 100; enemyOffsetZ = -100; enemySpreadX = 80;
  }

  camera.position.set(playerSpawnX, 1.6, playerSpawnZ);
  state.velocity.set(0, 0, 0);

  for (let i = 0; i < allyCount; i++) {
    agents.push(new Agent(
      (Math.random() - 0.5) * allySpreadX,
      allyOffsetZ + (Math.random() - 0.5) * allySpreadZ,
      0
    ));
  }
  for (let i = 0; i < enemyCount; i++) {
    agents.push(new Agent(
      (Math.random() - 0.5) * enemySpreadX,
      enemyOffsetZ + (Math.random() - 0.5) * enemySpreadZ,
      1
    ));
  }

  // Force one grenadier per team in team modes (not solo or nest)
  if (mode !== 'solo' && state.currentMap !== 'nest') {
    let foundAlly = false, foundEnemy = false;
    for (let i = 0; i < agents.length; i++) {
      if (agents[i].team === 0 && !foundAlly) {
        agents[i].primaryWeapon = JSON.parse(JSON.stringify(weapons.launcher));
        agents[i].weapon = agents[i].primaryWeapon;
        foundAlly = true;
      }
      if (agents[i].team === 1 && !foundEnemy) {
        agents[i].primaryWeapon = JSON.parse(JSON.stringify(weapons.launcher));
        agents[i].weapon = agents[i].primaryWeapon;
        foundEnemy = true;
      }
    }
  }
}
