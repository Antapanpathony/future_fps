import * as THREE from 'three';
import { camera } from './engine.js';
import { collidableBoxes, agents, state, gameState } from './data.js';

export const PLAYER_SPEED = 60.0;
export const GRAVITY = 300.0;

// ---- Player Movement & Collision ----
export function updatePlayerPhysics(delta) {
  const { velocity, mapKeys, isADS, isMouseDown } = state;

  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;
  velocity.y -= GRAVITY * delta;

  const lookDir = new THREE.Vector3();
  camera.getWorldDirection(lookDir);
  lookDir.y = 0;
  lookDir.normalize();

  const rightDir = new THREE.Vector3();
  rightDir.crossVectors(camera.up, lookDir).negate();

  const moveInput = new THREE.Vector3();
  if (mapKeys['KeyW'] || mapKeys['ArrowUp'])    moveInput.add(lookDir);
  if (mapKeys['KeyS'] || mapKeys['ArrowDown'])  moveInput.sub(lookDir);
  if (mapKeys['KeyD'] || mapKeys['ArrowRight']) moveInput.add(rightDir);
  if (mapKeys['KeyA'] || mapKeys['ArrowLeft'])  moveInput.sub(rightDir);

  if (moveInput.lengthSq() > 0) {
    moveInput.normalize();
    const isSprinting = mapKeys['ShiftLeft'] && !isADS && !isMouseDown;
    const currentSpeed = isSprinting ? PLAYER_SPEED * 2.5 : (isADS ? PLAYER_SPEED * 0.4 : PLAYER_SPEED);
    velocity.x += moveInput.x * currentSpeed * delta;
    velocity.z += moveInput.z * currentSpeed * delta;
  }

  const maxStepUp = state.currentMap === 'nest' ? 1.2 : 0.5;
  const pMinY = camera.position.y - 1.6;
  const pMaxY = camera.position.y + 0.2;

  // ---- Step X ----
  const oldX = camera.position.x;
  const oldZ = camera.position.z;
  camera.position.x += velocity.x * delta;

  for (let i = 0; i < collidableBoxes.length; i++) {
    const box = collidableBoxes[i];
    if (pMinY < box.max.y && pMaxY > box.min.y) {
      if (camera.position.x > box.min.x - 0.4 && camera.position.x < box.max.x + 0.4 &&
          oldZ > box.min.z - 0.4 && oldZ < box.max.z + 0.4) {
        const stepUp = box.max.y - pMinY;
        if (stepUp > 0 && stepUp <= maxStepUp) {
          continue;
        } else {
          camera.position.x = oldX;
          velocity.x = 0;
          break;
        }
      }
    }
  }

  // Player vs Agent X collision
  for (let i = 0; i < agents.length; i++) {
    const other = agents[i];
    if (other.health <= 0) continue;
    const otherMinY = other.mesh.position.y - 1.0;
    const otherMaxY = other.mesh.position.y + 1.5;
    if (pMinY < otherMaxY && pMaxY > otherMinY) {
      if (Math.abs(camera.position.x - other.mesh.position.x) < 0.9 &&
          Math.abs(oldZ - other.mesh.position.z) < 0.9) {
        camera.position.x = oldX;
        velocity.x = 0;
        break;
      }
    }
  }

  // ---- Step Z ----
  const newOldX = camera.position.x;
  camera.position.z += velocity.z * delta;
  const pMinY2 = camera.position.y - 1.6;
  const pMaxY2 = camera.position.y + 0.2;

  for (let i = 0; i < collidableBoxes.length; i++) {
    const box = collidableBoxes[i];
    if (pMinY2 < box.max.y && pMaxY2 > box.min.y) {
      if (newOldX > box.min.x - 0.4 && newOldX < box.max.x + 0.4 &&
          camera.position.z > box.min.z - 0.4 && camera.position.z < box.max.z + 0.4) {
        const stepUp = box.max.y - pMinY2;
        if (stepUp > 0 && stepUp <= maxStepUp) {
          continue;
        } else {
          camera.position.z = oldZ;
          velocity.z = 0;
          break;
        }
      }
    }
  }

  // Player vs Agent Z collision
  for (let i = 0; i < agents.length; i++) {
    const other = agents[i];
    if (other.health <= 0) continue;
    const otherMinY = other.mesh.position.y - 1.0;
    const otherMaxY = other.mesh.position.y + 1.5;
    if (pMinY2 < otherMaxY && pMaxY2 > otherMinY) {
      if (Math.abs(newOldX - other.mesh.position.x) < 0.9 &&
          Math.abs(camera.position.z - other.mesh.position.z) < 0.9) {
        camera.position.z = oldZ;
        velocity.z = 0;
        break;
      }
    }
  }

  // ---- Vertical / Floor ----
  const px = camera.position.x;
  const pz = camera.position.z;
  const py = camera.position.y;
  const pFeet = py - 1.6;
  let floorHeight = 0;

  for (let i = 0; i < collidableBoxes.length; i++) {
    const box = collidableBoxes[i];
    if (px > box.min.x - 0.4 && px < box.max.x + 0.4 &&
        pz > box.min.z - 0.4 && pz < box.max.z + 0.4) {
      if (box.max.y <= pFeet + maxStepUp + 0.1 && box.max.y > floorHeight) {
        floorHeight = box.max.y;
      }
    }
  }

  camera.position.y += velocity.y * delta;

  if (camera.position.y <= floorHeight + 1.6) {
    velocity.y = Math.max(0, velocity.y);
    camera.position.y = floorHeight + 1.6;
    state.canJump = true;
  }

  // Hard bounds
  if (camera.position.x < -148) camera.position.x = -148;
  if (camera.position.x >  148) camera.position.x =  148;
  if (camera.position.z < -148) camera.position.z = -148;
  if (camera.position.z >  148) camera.position.z =  148;
}
