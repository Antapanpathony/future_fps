import * as THREE from 'three';
import { scene, camera, renderer, controls, clock, environmentGroup } from './src/engine.js';
import { weapons, agents, state, gameState } from './src/data.js';
import { setupLighting, buildEnvironment } from './src/environment.js';
import { updatePlayerPhysics } from './src/physics.js';
import { initCombat, gunGroup, gunMaterialGlow, shoot, startReload, updateLasers, updateProjectiles, updateExplosions } from './src/combat.js';
import { spawnEntities } from './src/agents.js';
import { setupMenu, setupInput, updateHUD, instructions } from './src/ui.js';

// ---- Initialization ----
setupLighting();
initCombat();

setupMenu(buildEnvironment, spawnEntities);
setupInput(switchWeapon, startReload);

function switchWeapon(key) {
  if (weapons[key]) {
    state.currentWeapon = weapons[key];
    // Sync gun glow color to active weapon
    if (gunMaterialGlow) {
      gunMaterialGlow.color.setHex(state.currentWeapon.color);
      gunMaterialGlow.emissive.setHex(state.currentWeapon.color);
    }
  }
}

// ---- Animation Loop ----
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // ADS zoom lerp
  const targetFov = state.isADS && !gameState.isPaused ? (state.currentWeapon.zoomFov || 50) : 75;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 15 * delta);
  camera.updateProjectionMatrix();

  if (!gameState.isPaused && controls.isLocked) {
    updatePlayerPhysics(delta);
    if (state.isMouseDown) shoot();
  }

  // Win condition
  if (!gameState.isPaused && state.hasStarted && gameState.health > 0) {
    let enemiesLeft = false;
    for (let i = agents.length - 1; i >= 0; i--) {
      if (agents[i].team === 1) { enemiesLeft = true; break; }
    }
    if (!enemiesLeft) {
      gameState.isPaused = true;
      controls.unlock();
      instructions.innerHTML = `
        <h1 class="menu-title" style="color: #0ff; text-shadow: 0 0 30px #0ff, 0 0 10px #0ff; animation: none;">MISSION ACCOMPLISHED</h1>
        <div class="menu-subtitle" style="font-size: 24px;">ALL HOSTILES ELIMINATED<br>FINAL SCORE: ${gameState.score.toString().padStart(5, '0')}</div>
        <div style="display: flex; gap: 20px; justify-content: center; margin-top: 30px;">
          <button class="difficulty-btn" onclick="location.reload()">NEXT DEPLOYMENT</button>
        </div>
      `;
    }
  }

  // Game over condition
  if (gameState.health <= 0 && controls.isLocked) {
    gameState.isPaused = true;
    controls.unlock();
    instructions.innerHTML = `
      <h1 class="menu-title" style="color: var(--danger-glow); text-shadow: 0 0 30px var(--danger-glow), 0 0 10px var(--danger-glow); animation: none;">SYSTEM FAILURE</h1>
      <div class="menu-subtitle" style="font-size: 24px;">FINAL SCORE: ${gameState.score.toString().padStart(5, '0')}</div>
      <div style="display: flex; gap: 20px; justify-content: center;">
        <button class="difficulty-btn" onclick="location.reload()">REBOOT SYSTEM</button>
      </div>
    `;
  }

  // Update agents
  if (!gameState.isPaused) {
    for (let i = agents.length - 1; i >= 0; i--) {
      agents[i].update(delta);
    }
  }

  // Gun recoil recovery
  gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, 0, 10 * delta);

  updateLasers();
  updateProjectiles(delta);
  updateExplosions(delta);
  updateHUD(gunGroup);

  renderer.render(scene, camera);
}

// ---- Resize Handler ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Debug / Testing Globals ----
window.forceStart = function (map, mode) {
  state.currentMap = map;
  state.currentGameMode = mode;
  document.getElementById('blocker').style.display = 'none';
  if (!state.hasStarted) {
    buildEnvironment(state.currentMap);
    spawnEntities(state.currentGameMode);
    state.hasStarted = true;
    window.gameAgents  = agents;
    window.gameCamera  = camera;
    window.gameState   = gameState;
    window.gameControls = controls;

    setInterval(() => {
      if (!agents.length) return;
      const a = agents[0];
      const dist = a.mesh.position.distanceTo(camera.position).toFixed(1);
      const eye = a.mesh.position.clone(); eye.y += 1.5;
      const dirToCam = new THREE.Vector3().subVectors(camera.position, eye).normalize();
      const hits = new THREE.Raycaster(eye, dirToCam).intersectObjects(environmentGroup.children, true);
      let blocked = false;
      for (let h of hits) {
        if (h.object.userData.isSolid && h.distance < parseFloat(dist)) { blocked = true; break; }
      }
      console.log(`AI: wpn=${a.weapon?.name} dist=${dist} hasLOS=${!blocked} pos=Y${a.mesh.position.y.toFixed(1)},Z${a.mesh.position.z.toFixed(1)} playerY=${camera.position.y.toFixed(1)},Z=${camera.position.z.toFixed(1)}`);
    }, 2000);
  }
  gameState.isPaused = false;
  camera.position.set(20, 15, 60);
  camera.lookAt(0, 5, 80);
};

window.subagentTestStart = function () {
  const menu = document.getElementById('menu');
  if (menu) menu.style.display = 'none';
  if (!state.hasStarted) {
    buildEnvironment('city');
    spawnEntities('4v4');
    state.hasStarted = true;
  }
  gameState.isPaused = false;
  controls.isLocked = true;
};

// ---- Start ----
animate();
