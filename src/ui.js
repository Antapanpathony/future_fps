import { state, gameState, weapons } from './data.js';
import { controls } from './engine.js';

export let instructions = null;
let blockMenu = null;

// ---- Menu Setup ----
export function setupMenu(onBuildEnvironment, onSpawnEntities) {
  blockMenu = document.createElement('div');
  blockMenu.id = 'blocker';
  Object.assign(blockMenu.style, {
    position: 'absolute', top: '0px', left: '0px',
    width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
    color: '#fff', zIndex: '20',
  });

  instructions = document.createElement('div');
  instructions.innerHTML = `
    <h1 class="menu-title">PRIMAL SATELLITE</h1>
    <div class="menu-subtitle">
      [W A S D] MOVEMENT &nbsp;&nbsp;|&nbsp;&nbsp; [MOUSE] LOOK &nbsp;&nbsp;|&nbsp;&nbsp; [L-CLICK] FIRE<br>
      [1-5] WEAPONS &nbsp;&nbsp;|&nbsp;&nbsp; [R-CLICK] ADS &nbsp;&nbsp;|&nbsp;&nbsp; [SPACE] JUMP
    </div>
    <h3 style="color: cyan; text-align: center; margin-bottom: 10px;">SELECT ENVIRONMENT</h3>
    <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px;" id="map-select">
      <button class="map-btn selected" data-map="grid">NEON GRID</button>
      <button class="map-btn" data-map="hills">MARTIAN HILLS</button>
      <button class="map-btn" data-map="city">OBSTACLE CITY</button>
      <button class="map-btn" data-map="nest">SNIPER NEST</button>
    </div>
    <h3 style="color: cyan; text-align: center; margin-bottom: 10px;">SELECT COMBAT PROTOCOL</h3>
    <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px;">
      <button class="difficulty-btn" data-mode="solo">SOLO (1v5)</button>
      <button class="difficulty-btn" data-mode="1v1">DUEL (1v1)</button>
      <button class="difficulty-btn" data-mode="2v2">SKIRMISH (2v2)</button>
      <button class="difficulty-btn" data-mode="3v3">BATTLE (3v3)</button>
      <button class="difficulty-btn" data-mode="4v4">WARFARE (4v4)</button>
    </div>
  `;
  blockMenu.appendChild(instructions);
  document.body.appendChild(blockMenu);

  blockMenu.addEventListener('click', (e) => {
    if (gameState.health <= 0) return;

    if (e.target.classList.contains('map-btn')) {
      state.currentMap = e.target.getAttribute('data-map');
      document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('selected'));
      e.target.classList.add('selected');
    } else if (e.target.classList.contains('difficulty-btn')) {
      state.currentGameMode = e.target.getAttribute('data-mode');
      if (!state.hasStarted) {
        onBuildEnvironment(state.currentMap);
        onSpawnEntities(state.currentGameMode);
        state.hasStarted = true;
      }
      controls.lock();
    } else if (!e.target.closest('.difficulty-btn') && !e.target.closest('.map-btn')) {
      controls.lock();
    }
  });

  controls.addEventListener('lock', () => {
    blockMenu.style.display = 'none';
    gameState.isPaused = false;
  });

  controls.addEventListener('unlock', () => {
    blockMenu.style.display = 'flex';
    gameState.isPaused = true;
  });
}

// ---- Input Handlers ----
export function setupInput(onSwitchWeapon, onStartReload) {
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('mousedown', (event) => {
    if (gameState.isPaused) return;
    if (event.button === 0) state.isMouseDown = true;
    if (event.button === 2) state.isADS = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.isMouseDown = false;
    if (event.button === 2) state.isADS = false;
  });

  document.addEventListener('keydown', (e) => {
    state.mapKeys[e.code] = true;
    if (!gameState.isPaused) {
      if (e.code === 'Digit1') onSwitchWeapon('pistol');
      if (e.code === 'Digit2') onSwitchWeapon('rifle');
      if (e.code === 'Digit3') onSwitchWeapon('shotgun');
      if (e.code === 'Digit4') onSwitchWeapon('sniper');
      if (e.code === 'Digit5') onSwitchWeapon('launcher');
      if (e.code === 'KeyR')   onStartReload(state.currentWeapon);
      if (e.code === 'Space' && state.canJump) {
        state.velocity.y += 100;
        state.canJump = false;
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    state.mapKeys[e.code] = false;
  });
}

// ---- HUD Update (called every frame) ----
export function updateHUD(gunGroup) {
  // Score
  document.getElementById('score-val').innerText = gameState.score.toString().padStart(5, '0');

  // Health bar
  const hVal = Math.floor(Math.max(0, gameState.health));
  document.getElementById('health-val').innerText = hVal;
  const healthBar = document.getElementById('health-bar-fill');
  healthBar.style.width = hVal + '%';
  if (hVal < 30) {
    healthBar.style.backgroundColor = 'var(--danger-glow)';
    healthBar.style.boxShadow = '0 0 10px var(--danger-glow)';
    document.getElementById('health-val').style.color = 'var(--danger-glow)';
    document.getElementById('health-val').style.textShadow = '0 0 15px var(--danger-glow)';
  } else {
    healthBar.style.backgroundColor = 'var(--primary-glow)';
    healthBar.style.boxShadow = '0 0 10px var(--primary-glow)';
    document.getElementById('health-val').style.color = 'var(--primary-glow)';
    document.getElementById('health-val').style.textShadow = '0 0 15px var(--primary-glow)';
  }

  // Weapon name
  const weapon = state.currentWeapon;
  const hexColor = '#' + weapon.color.toString(16).padStart(6, '0');
  document.getElementById('weapon-val').innerText = weapon.name.toUpperCase();
  document.getElementById('weapon-val').style.color = hexColor;
  document.getElementById('weapon-val').style.textShadow = `0 0 10px ${hexColor}`;

  // Ammo
  const ammoEl = document.getElementById('ammo-val');
  if (ammoEl && !weapon.isReloading) {
    const ammoRatio = weapon.ammo / weapon.maxAmmo;
    let magColor;
    if (ammoRatio <= 0)         magColor = 'var(--danger-glow)';
    else if (ammoRatio <= 0.25) magColor = '#ffaa00';
    else                        magColor = hexColor;

    const reserveColor = weapon.reserveAmmo <= 0
      ? 'var(--danger-glow)'
      : (weapon.reserveAmmo <= weapon.maxAmmo ? '#ffaa00' : '#aaaaaa');

    ammoEl.innerHTML =
      `<span style="color:${magColor};text-shadow:0 0 10px ${magColor}">${weapon.ammo}</span>` +
      `<span style="color:#444;font-size:0.85em"> / </span>` +
      `<span style="color:${reserveColor};font-size:0.85em">${weapon.reserveAmmo}</span>`;
  }

  // Scope overlay
  const scopeDiv = document.getElementById('scope-overlay');
  if (scopeDiv) {
    const showScope = state.isADS && weapon.name === 'Rail-Sniper' && !gameState.isPaused;
    scopeDiv.style.display = showScope ? 'flex' : 'none';
    if (gunGroup) gunGroup.visible = !showScope;
  }
}
