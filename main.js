import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---- Game State ----
const gameState = {
  isPaused: true,
  score: 0,
  health: 100,
};

// ---- Scene Setup ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508); // Deep space purple/black
scene.fog = new THREE.FogExp2(0x050508, 0.015);

// ---- Camera Setup ----
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6; // Average eye height

// ---- Renderer Setup ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// ---- Controls ----
const controls = new PointerLockControls(camera, document.body);

const blockMenu = document.createElement('div');
blockMenu.id = 'blocker';
blockMenu.style.position = 'absolute';
blockMenu.style.top = '0px';
blockMenu.style.left = '0px';
blockMenu.style.width = '100%';
blockMenu.style.height = '100%';
blockMenu.style.backgroundColor = 'rgba(0,0,0,0.5)';
blockMenu.style.display = 'flex';
blockMenu.style.flexDirection = 'column';
blockMenu.style.justifyContent = 'center';
blockMenu.style.alignItems = 'center';
blockMenu.style.color = '#fff';
blockMenu.style.zIndex = '20';

let difficultyMult = 1.0;
let currentGameMode = 'solo';
let hasStarted = false;
let currentMap = 'grid';

const instructions = document.createElement('div');
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
    currentMap = e.target.getAttribute('data-map');
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('selected'));
    e.target.classList.add('selected');
  } else if (e.target.classList.contains('difficulty-btn')) {
    currentGameMode = e.target.getAttribute('data-mode');
    
    if (!hasStarted) {
      buildEnvironment(currentMap);
      spawnEntities(currentGameMode);
      hasStarted = true;
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
scene.add(controls.getObject());

window.forceStart = function(map, mode) {
  currentMap = map; currentGameMode = mode;
  document.getElementById('blocker').style.display = 'none';
  if (!hasStarted) {
    buildEnvironment(currentMap); spawnEntities(currentGameMode);
    hasStarted = true;
    window.gameAgents = agents;
    window.gameCamera = camera;
    window.gameState = gameState;
    window.gameControls = controls;
    setInterval(() => {
       if (!agents.length) return;
       const a = agents[0];
       const dist = a.mesh.position.distanceTo(camera.position).toFixed(1);
       // Quick LOS test
       const eye = a.mesh.position.clone(); eye.y += 1.5;
       const dirToCam = new THREE.Vector3().subVectors(camera.position, eye).normalize();
       const ray = new THREE.Raycaster(eye, dirToCam);
       const hits = ray.intersectObjects(environmentGroup.children, true);
       let blocked = false;
       for (let h of hits) { if (h.object.userData.isSolid && h.distance < parseFloat(dist)) { blocked = true; break; } }
       console.log(`AI: wpn=${a.weapon?.name} dist=${dist} hasLOS=${!blocked} pos=Y${a.mesh.position.y.toFixed(1)},Z${a.mesh.position.z.toFixed(1)} playerY=${camera.position.y.toFixed(1)},Z=${camera.position.z.toFixed(1)}`);
    }, 2000);
  }
  gameState.isPaused = false;
  // Position camera to observe stairs
  camera.position.set(20, 15, 60);
  camera.lookAt(0, 5, 80);
};

// ---- Environment ----
const environmentGroup = new THREE.Group();
scene.add(environmentGroup);

const collidableBoxes = [];

function buildEnvironment(mapType) {
  // Clear existing
  while(environmentGroup.children.length > 0){ 
    const child = environmentGroup.children[0];
    environmentGroup.remove(child); 
  }

  // Common Wall Material
  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x050a15, roughness: 0.5, metalness: 0.8,
    emissive: 0x00ffff, emissiveIntensity: 0.02
  });
  const wallGeometry = new THREE.BoxGeometry(300, 40, 2);

  const wall1 = new THREE.Mesh(wallGeometry, wallMaterial);
  wall1.position.set(0, 20, -150);
  wall1.userData.isSolid = true;
  environmentGroup.add(wall1);

  const wall2 = new THREE.Mesh(wallGeometry, wallMaterial);
  wall2.position.set(0, 20, 150);
  wall2.userData.isSolid = true;
  environmentGroup.add(wall2);

  const wall3 = new THREE.Mesh(wallGeometry, wallMaterial);
  wall3.position.set(-150, 20, 0);
  wall3.rotation.y = Math.PI / 2;
  wall3.userData.isSolid = true;
  environmentGroup.add(wall3);

  const wall4 = new THREE.Mesh(wallGeometry, wallMaterial);
  wall4.position.set(150, 20, 0);
  wall4.rotation.y = Math.PI / 2;
  wall4.userData.isSolid = true;
  environmentGroup.add(wall4);

  // Floor
  let floorGeometry;
  if (mapType === 'hills') {
    floorGeometry = new THREE.PlaneGeometry(300, 300, 64, 64);
    const pos = floorGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
       const x = pos.getX(i);
       const y = pos.getY(i);
       const z = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 6;
       pos.setZ(i, z);
    }
    floorGeometry.computeVertexNormals();
  } else {
    floorGeometry = new THREE.PlaneGeometry(300, 300, 64, 64);
  }

  const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: mapType === 'hills' ? 0x2e0600 : 0x0a1128, 
    roughness: 0.2, metalness: 0.8,
  });

  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.isSolid = true;
  environmentGroup.add(floor);

  // Map specifics
  
  // Add universal physical invisible bounds to all maps so AI natively detects them via raycasting
  const boundVal = 150;
  const boundThick = 10;
  const boundMat = new THREE.MeshBasicMaterial({ visible: false }); // invisible physics barrier
  
  const walls = [
     { w: 320, h: 100, d: boundThick, x: 0, z: boundVal },
     { w: 320, h: 100, d: boundThick, x: 0, z: -boundVal },
     { w: boundThick, h: 100, d: 320, x: boundVal, z: 0 },
     { w: boundThick, h: 100, d: 320, x: -boundVal, z: 0 }
  ];
  walls.forEach(b => {
     const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), boundMat);
     wallMesh.position.set(b.x, b.h/2, b.z);
     wallMesh.userData.isSolid = true;
     environmentGroup.add(wallMesh);
  });

  if (mapType === 'grid') {
    const gridHelper = new THREE.GridHelper(300, 150, 0x00ffff, 0x002244);
    gridHelper.position.y = 0.05;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    environmentGroup.add(gridHelper);

    // Dynamic Fog: Dense for flatter maps to prevent cross-map sniping
    scene.fog.density = 0.025;

    // Add Energy Barricades for tactical cover
    const energyMat = new THREE.MeshStandardMaterial({ 
      color: 0x0088ff, emissive: 0x0088ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 
    });
    for (let i = 0; i < 20; i++) {
        const boxGeo = new THREE.BoxGeometry(4, 5, 4);
        const barricade = new THREE.Mesh(boxGeo, energyMat);
        barricade.position.set((Math.random()-0.5)*260, 2.5, (Math.random()-0.5)*260);
        barricade.userData.isSolid = true;
        environmentGroup.add(barricade);
    }
  } else if (mapType === 'hills') {
    scene.fog.density = 0.022; // Slightly clearer but still tactical

    // Add Tactical Boulders
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a1a00, roughness: 1.0 });
    for (let i = 0; i < 15; i++) {
        const rad = 3 + Math.random() * 4;
        const rockGeo = new THREE.SphereGeometry(rad, 8, 8);
        const rock = new THREE.Mesh(rockGeo, rockMat);
        const rx = (Math.random()-0.5)*260;
        const rz = (Math.random()-0.5)*260;
        const ry = Math.sin(rx * 0.05) * Math.cos(rz * 0.05) * 6; // align with hills
        rock.position.set(rx, ry + rad/2, rz);
        rock.userData.isSolid = true;
        environmentGroup.add(rock);
    }
  } else if (mapType === 'city') {
    scene.fog.density = 0.015; // Tight urban streets
  } else if (mapType === 'nest') {
    scene.fog.density = 0.006; // Must see across the sniper field
  } else {
    scene.fog.density = 0.010;
  }

  if (mapType === 'city') {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.8 });
    const blockSize = 40;
    const streetWidth = 15;
    const mapSize = 280;
    
    // Generate authentic city blocks with streets
    for (let x = -mapSize/2; x < mapSize/2; x += (blockSize + streetWidth)) {
       for (let z = -mapSize/2; z < mapSize/2; z += (blockSize + streetWidth)) {
          const cx = x + blockSize/2;
          const cz = z + blockSize/2;
          
          // Clear Plazas for North/South Team Spawns
          const distToSouth = Math.sqrt(cx*cx + (cz - 120)*(cz - 120));
          const distToNorth = Math.sqrt(cx*cx + (cz + 120)*(cz + 120));
          if (distToSouth < 60 || distToNorth < 60) continue;
          
          // Random middle plazas
          if (Math.random() < 0.25) continue;
          
          const h = 20 + Math.random() * 40; 
          const boxGeo = new THREE.BoxGeometry(blockSize, h, blockSize);
          const block = new THREE.Mesh(boxGeo, boxMat);
          block.position.set(cx, h/2, cz);
          
          block.userData.isSolid = true;
          block.castShadow = true;
          block.receiveShadow = true;
          environmentGroup.add(block);
       }
    }
  } else if (mapType === 'nest') {
    const matTower = new THREE.MeshStandardMaterial({ color: 0x112233, metalness: 0.8, roughness: 0.2, emissive: 0x001133, emissiveIntensity: 0.3 });
    const matStep = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.7, roughness: 0.3 });
    const matCQB = new THREE.MeshStandardMaterial({ color: 0x442222, metalness: 0.5, roughness: 0.6 });

    // Build a tower at a given Z origin
    function buildTower(zOrigin) {
       // Stepped fortress: 24 tiers × 1u, front face recedes 1u per tier
       // The tower IS the staircase — no separate stairs needed, no clipping possible
       const tierCount = 24;
       const tierH = 1;
       const tW = 20;
       const backZ = zOrigin + (zOrigin > 0 ? 10 : -10);
       const maxDepth = 34;

       for (let i = 0; i < tierCount; i++) {
          const depth = maxDepth - i;
          const y = i * tierH + tierH / 2;
          const frontZ = zOrigin > 0 ? backZ - depth : backZ + depth;
          const centerZ = (backZ + frontZ) / 2;
          const boxGeo = new THREE.BoxGeometry(tW, tierH, depth);
          const layer = new THREE.Mesh(boxGeo, matTower);
          layer.position.set(0, y, centerZ);
          layer.userData.isSolid = true;
          layer.receiveShadow = true;
          layer.castShadow = true;
          environmentGroup.add(layer);
       }
     }

    buildTower(-100); // North tower
    buildTower(100);  // South tower

    // CQB Zone (Center) - dense cover
    for (let i = 0; i < 30; i++) {
       const bw = 6 + Math.random() * 6;
       const bh = 3 + Math.random() * 5;
       const boxGeo = new THREE.BoxGeometry(bw, bh, bw);
       const cover = new THREE.Mesh(boxGeo, matCQB);
       cover.position.set((Math.random()-0.5)*80, bh/2, (Math.random()-0.5)*60);
       cover.userData.isSolid = true;
       cover.castShadow = true;
       cover.receiveShadow = true;
       environmentGroup.add(cover);
    }
  }

  // Generate Horizontal AABB Colliders (all solid non-plane meshes)
  collidableBoxes.length = 0;
  environmentGroup.traverse(child => {
     if (child.isMesh && child.userData && child.userData.isSolid && child.geometry.type !== 'PlaneGeometry') {
        child.updateMatrixWorld(true);
        collidableBoxes.push(new THREE.Box3().setFromObject(child));
     }
  });
}

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Boosted so all maps are visible
scene.add(ambientLight);

// Hemisphere light for better reflections
const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0xff0055, 0.5);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(30, 80, 30);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 200;    // Expanded to cover all maps
dirLight.shadow.camera.bottom = -200;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const weapons = {
  pistol: {
    name: 'Laser Pistol',
    color: 0x00ffff,
    fireRate: 200,
    damage: 30,
    lastFired: 0,
    rays: 1,
    spread: 0,
    zoomFov: 55,
    ammo: 15,
    maxAmmo: 15,
    reserveAmmo: 90,   // 6 extra reloads
    reloadTime: 1000,
    isReloading: false
  },
  rifle: {
    name: 'Plasma Auto-Rifle',
    color: 0xff00ff,
    fireRate: 90,
    damage: 15,
    lastFired: 0,
    rays: 1,
    spread: 0.005, 
    zoomFov: 45,
    ammo: 30,
    maxAmmo: 30,
    reserveAmmo: 210,  // 7 extra reloads
    reloadTime: 1500,
    isReloading: false
  },
  shotgun: {
    name: 'Scatter Gun',
    color: 0xffaa00,
    fireRate: 600,
    damage: 8,
    lastFired: 0,
    rays: 15,
    spread: 0.10, 
    zoomFov: 65,
    piercing: false,
    ammo: 8,
    maxAmmo: 8,
    reserveAmmo: 48,   // 6 extra reloads
    reloadTime: 2000,
    isReloading: false
  },
  sniper: {
    name: 'Rail-Sniper',
    color: 0x00ff00,
    fireRate: 1200,
    damage: 65,
    lastFired: 0,
    rays: 1,
    spread: 0,
    zoomFov: 15,
    piercing: false,
    ammo: 5,
    maxAmmo: 5,
    reserveAmmo: 25,   // 5 extra reloads
    reloadTime: 2500,
    isReloading: false
  },
  launcher: {
    name: 'Grenade Launcher',
    color: 0xffaa00,
    fireRate: 800,
    damage: 80,
    lastFired: 0,
    isProjectile: true,
    blastRadius: 12,
    speed: 60,
    zoomFov: 60,
    ammo: 4,
    maxAmmo: 4,
    reserveAmmo: 20,
    reloadTime: 3000,
    isReloading: false
  }
};
let currentWeapon = weapons.pistol;

// Gun Model
const gunGroup = new THREE.Group();
camera.add(gunGroup); // Attach to camera so it moves with view
scene.add(camera);

let gunMaterialGlow;

function buildPremiumWeapon() {
  const group = new THREE.Group();
  
  const matBody = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9 });
  
  gunMaterialGlow = new THREE.MeshStandardMaterial({ 
     color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.8 
  });
  
  // Body (Main Chassis)
  const bodyGeo = new THREE.BoxGeometry(0.12, 0.15, 0.4);
  const body = new THREE.Mesh(bodyGeo, matBody);
  group.add(body);
  
  // Barrel
  const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 16);
  const barrel = new THREE.Mesh(barrelGeo, matMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.35);
  group.add(barrel);
  
  // Glowing Accelerator Rings on Barrel
  const ringGeo = new THREE.TorusGeometry(0.04, 0.015, 8, 16);
  for(let i=0; i<4; i++) {
    const ring = new THREE.Mesh(ringGeo, gunMaterialGlow);
    ring.position.set(0, 0.02, -0.2 - (i*0.08));
    group.add(ring);
  }
  
  // Grip
  const gripGeo = new THREE.BoxGeometry(0.08, 0.2, 0.12);
  const grip = new THREE.Mesh(gripGeo, matBody);
  grip.rotation.x = Math.PI / 6;
  grip.position.set(0, -0.15, 0.1);
  group.add(grip);
  
  // Top scope/sight
  const sightGeo = new THREE.BoxGeometry(0.04, 0.05, 0.15);
  const sight = new THREE.Mesh(sightGeo, matMetal);
  sight.position.set(0, 0.1, -0.05);
  group.add(sight);
  
  return group;
}

const gunMesh = buildPremiumWeapon();
gunMesh.position.set(0.3, -0.25, -0.4);
gunGroup.add(gunMesh);

function switchWeapon(key) {
  if (weapons[key]) {
    currentWeapon = weapons[key];
    if (gunMaterialGlow) {
       gunMaterialGlow.color.setHex(currentWeapon.color);
       gunMaterialGlow.emissive.setHex(currentWeapon.color);
    }
  }
}

const raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0);

// Projectile and Laser arrays
const lasers = [];
const activeProjectiles = [];
const explosions = [];

let isMouseDown = false;
let isADS = false;

document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', (event) => {
  if (gameState.isPaused) return;
  if (event.button === 0) isMouseDown = true;
  if (event.button === 2) isADS = true;
});
document.addEventListener('mouseup', (event) => {
  if (event.button === 0) isMouseDown = false;
  if (event.button === 2) isADS = false;
});

function startReload(weapon) {
  if (weapon.isReloading) return;
  if (weapon.ammo === weapon.maxAmmo) return;
  if (weapon.reserveAmmo <= 0) return; // Out of reserve — can't reload

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
    // Flash green on complete
    if (ammoEl) {
      ammoEl.style.color = '#00ff88';
      ammoEl.style.textShadow = '0 0 12px #00ff88';
      setTimeout(() => { ammoEl.style.color = ''; ammoEl.style.textShadow = ''; }, 400);
    }
  }, weapon.reloadTime);
}

function shoot() {
  if (mapKeys['ShiftLeft'] && !isADS) return; // Cannot shoot while sprinting
  if (currentWeapon.isReloading) return;       // Busy reloading
  if (currentWeapon.ammo <= 0) {
    startReload(currentWeapon);
    return;
  }

  const now = Date.now();
  if (now - currentWeapon.lastFired < currentWeapon.fireRate) return;
  currentWeapon.lastFired = now;

  // Decrement ammo
  currentWeapon.ammo--;
  if (currentWeapon.ammo === 0) {
    startReload(currentWeapon);
  }

  // Add recoil animation
  gunGroup.rotation.x = Math.max(gunGroup.rotation.x + 0.1, 0.3);

  if (currentWeapon.isProjectile) {
    const pos = new THREE.Vector3();
    camera.getWorldPosition(pos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    
    // Offset from camera to represent gun barrel
    pos.add(dir.clone().multiplyScalar(0.6));
    pos.y -= 0.1;

    const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const projColor = 0x00ffff; // Allies
    const projMat = new THREE.MeshStandardMaterial({ 
       color: projColor, 
       emissive: projColor, 
       emissiveIntensity: 1 
    });
    const mesh = new THREE.Mesh(projGeo, projMat);
    mesh.position.copy(pos);
    scene.add(mesh);

    const velocity = dir.clone().multiplyScalar(currentWeapon.speed);
    velocity.y += 5; // Initial upward lob

    activeProjectiles.push({
       mesh,
       velocity,
       team: 0, // Player team
       owner: camera, // Player owner
       damage: currentWeapon.damage,
       blastRadius: currentWeapon.blastRadius,
       born: now,
       bounces: 0,
       fuse: 2500 // 2.5s fuse
    });
    return;
  }

  for (let r = 0; r < currentWeapon.rays; r++) {
    const dir = new THREE.Vector3(0, 0, -1);
    
    // Accuracy Penalty for movement (especially for Sniper)
    let dynamicSpread = currentWeapon.spread;
    if (currentWeapon.name === 'Rail-Sniper') {
      const moveSpeed = velocity.length();
      if (moveSpeed > 10) dynamicSpread += 0.15; // Major penalty for strafe-sniping
    }

    dir.x += (Math.random() - 0.5) * dynamicSpread;
    dir.y += (Math.random() - 0.5) * dynamicSpread;
    dir.applyQuaternion(camera.quaternion).normalize();
    
    raycaster.set(camera.position, dir);
    
    // Create laser visual
    const material = new THREE.LineBasicMaterial({ color: currentWeapon.color, linewidth: 2 });
    const points = [];
    
    const gunTip = new THREE.Vector3(0.3, -0.2, -0.6);
    gunTip.applyMatrix4(camera.matrixWorld);
    points.push(gunTip);
    
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    const validIntersects = intersects.filter(hit => {
      let isGun = false;
      gunMesh.traverse(child => {
        if (hit.object === child) isGun = true;
      });
      return !isGun;
    });
    
    let endPoint = new THREE.Vector3();
    raycaster.ray.at(100, endPoint); // default far point
  
    if (validIntersects.length > 0) {
      const hitAgents = new Set();
      
      // Iterate through interesections for piercing
      for (let h = 0; h < validIntersects.length; h++) {
        const hitObject = validIntersects[h].object;
        let isAgentHit = false;
        
        for (let i = agents.length - 1; i >= 0; i--) {
          let agentMatched = false;
          agents[i].mesh.traverse(child => {
            if (child === hitObject) agentMatched = true;
          });
          
          if (agentMatched && !hitAgents.has(agents[i])) {
            isAgentHit = true;
            hitAgents.add(agents[i]);
            
            if (agents[i].team !== 0) { 
              const dead = agents[i].takeDamage(currentWeapon.damage);
              if (dead) {
                gameState.score += 100;
                agents.splice(i, 1);
              }
            }
            break; // found the agent associated with this object
          }
        }
        
        // Target point for visual laser
        if (h === 0) {
           endPoint.copy(validIntersects[h].point);
        }
        
        if (!isAgentHit) {
           let isSolid = false;
           let curr = hitObject;
           while(curr) {
              if (curr.userData && curr.userData.isSolid) isSolid = true;
              curr = curr.parent;
           }
           if (isSolid) break; // End piercing ray if hitting solid environment (walls/buildings/floor)
        }
        
        if (!currentWeapon.piercing) {
           break;
        }
      }
    }
  
    points.push(endPoint);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const laser = new THREE.Line(geometry, material);
    scene.add(laser);
  
    lasers.push({
      mesh: laser,
      born: now
    });
  }
}

// ---- Agents (AI) ----
const agents = [];

// Shared Geometries
const agentGeometry = new THREE.OctahedronGeometry(1.5, 2); 
const coreGeo = new THREE.OctahedronGeometry(0.8, 1);

// Team 0 = Blue (Allies), Team 1 = Red (Enemies)
const matEnemyShell = new THREE.MeshStandardMaterial({ 
  color: 0xff0055, emissive: 0xff0055, emissiveIntensity: 0.5,
  roughness: 0.2, metalness: 0.8, wireframe: true 
});
const matEnemyCore = new THREE.MeshStandardMaterial({
  color: 0x220011, emissive: 0xff0055, emissiveIntensity: 0.8,
  roughness: 0.1, metalness: 0.9
});

const matAllyShell = new THREE.MeshStandardMaterial({ 
  color: 0x0055ff, emissive: 0x0055ff, emissiveIntensity: 0.5,
  roughness: 0.2, metalness: 0.8, wireframe: true 
});
const matAllyCore = new THREE.MeshStandardMaterial({
  color: 0x001122, emissive: 0x0055ff, emissiveIntensity: 0.8,
  roughness: 0.1, metalness: 0.9
});

class Agent {
  constructor(x, z, team) {
    this.team = team;
    this.mesh = new THREE.Group();

    // Assign weapon FIRST so visual checks below can use it
    this.health = 200 * difficultyMult;
    this.speed = (team === 0 ? 4 : 3) * difficultyMult;
    this.baseDamage = 10 * difficultyMult;
    this.lastFired = 0;
    this.velocityY = 0;
    this.stuckTimer = 0;
    this.stuckDir = new THREE.Vector3();
    this.nestBaseZ = team === 0 ? 76 : -76;
    this.nestTargetZ = team === 0 ? 104 : -104;

    const weaponList = Object.values(weapons).filter(w => !w.isProjectile);
    this.primaryWeapon = JSON.parse(JSON.stringify(weaponList[Math.floor(Math.random() * weaponList.length)]));
    // Also pre-clone a sniper and shotgun for range-based switching (avoids sharing player's state)
    this.clonedSniper = JSON.parse(JSON.stringify(weapons.sniper));
    this.clonedShotgun = JSON.parse(JSON.stringify(weapons.shotgun));
    this.weapon = this.primaryWeapon;

    const shellMat = team === 0 ? matAllyShell : matEnemyShell;
    const coreMat = team === 0 ? matAllyCore : matEnemyCore;
    const shell = new THREE.Mesh(agentGeometry, shellMat.clone());
    const core = new THREE.Mesh(coreGeo, coreMat.clone());
    this.mesh.add(shell);
    this.mesh.add(core);
    this.shell = shell;
    this.core = core;

    // Visual Class Differentiation (weapon is now assigned above)
    const isLauncher = this.primaryWeapon.name === 'Grenade Launcher';
    const isSniper   = this.primaryWeapon.name === 'Rail-Sniper';
    const isShotgun  = this.primaryWeapon.name === 'Scatter Gun';
    if (isLauncher) {
       this.mesh.scale.set(1.3, 1.3, 1.3);
       shell.material.color.setHex(0xffaa00);
       shell.material.emissive.setHex(0xffaa00);
       core.material.color.setHex(0xff0000);
       core.material.emissive.setHex(0xff0000);
    } else if (isSniper) {
       this.mesh.scale.set(0.8, 1.2, 0.8);
       shell.material.color.setHex(0x00ff00);
       shell.material.emissive.setHex(0x00ff00);
       core.material.color.setHex(0xccff00);
       core.material.emissive.setHex(0xccff00);
    } else if (isShotgun) {
       this.mesh.scale.set(1.1, 0.9, 1.1);
       shell.material.color.setHex(0x0088ff);
       shell.material.emissive.setHex(0x0088ff);
       core.material.color.setHex(0x00ffff);
       core.material.emissive.setHex(0x00ffff);
    }

    this.mesh.position.set(x, 2.5, z);
    const lightColor = team === 0 ? 0x0055ff : 0xff0055;
    if (isLauncher) {
       const agentLight = new THREE.PointLight(0xffaa00, 3, 15);
       this.mesh.add(agentLight);
    } else {
       const agentLight = new THREE.PointLight(lightColor, 2, 10);
       this.mesh.add(agentLight);
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  update(delta) {
    // Floor detection: use AABB overlapping to match horizontal collision perfectly, avoiding ledge/raycast vibration
    let agentFloorY = 0;
    const ax = this.mesh.position.x;
    const az = this.mesh.position.z;
    const ay = this.mesh.position.y;
    const agentFeet = ay - 2.0; // feet of the agent capsule
    const agentStep = currentMap === 'nest' ? 2.0 : 0.6;
    for (let i = 0; i < collidableBoxes.length; i++) {
       const box = collidableBoxes[i];
       if (ax > box.min.x - 0.8 && ax < box.max.x + 0.8 && az > box.min.z - 0.8 && az < box.max.z + 0.8) {
          // Only count this box as the floor if it is no higher than one step above the agent's feet
          if (box.max.y <= agentFeet + agentStep + 0.1 && box.max.y > agentFloorY) {
             agentFloorY = box.max.y;
          }
       }
    }

    // Apply Gravity to Agent
    this.velocityY -= 300 * delta; 
    this.mesh.position.y += this.velocityY * delta;
    if (this.mesh.position.y - 2.0 <= agentFloorY) {
      this.mesh.position.y = agentFloorY + 2.0;
      this.velocityY = Math.max(0, this.velocityY);
    }

    let closestHostile = null;
    let minDist = Infinity;
    let grenadeAvoidance = null;
    let isSprinting = false;

    // AI Dodge/Scattering logic for Grenades
    for (let i = 0; i < activeProjectiles.length; i++) {
       const p = activeProjectiles[i];
       if (p.team !== this.team) {
          const distToGrenade = this.mesh.position.distanceTo(p.mesh.position);
          if (distToGrenade < 20) {
             grenadeAvoidance = this.mesh.position.clone().sub(p.mesh.position).normalize();
             isSprinting = true;
             break;
          }
       }
    }

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
      // Smart Weapon Switch: use agent's own cloned weapons, not the player's global objects
      const isHeavy = this.primaryWeapon.name === 'Grenade Launcher';
      if (!isHeavy) {
        if (minDist > 35) this.weapon = this.clonedSniper;
        else if (minDist < 8) this.weapon = this.clonedShotgun;
        else this.weapon = this.primaryWeapon;
      } else {
        // Heavy bots switch to their primary if enemy is not right on top of them
        if (minDist < 5) this.weapon = this.clonedSniper; // use sniper as sidearm
        else this.weapon = this.primaryWeapon;
      }

      // Check Line of Sight (LOS)
      let hasLOS = true;
      const eyeLevel = this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      const dirToTarget = new THREE.Vector3().subVectors(closestHostile.position, eyeLevel).normalize();
      const losRay = new THREE.Raycaster(eyeLevel, dirToTarget);
      const losHits = losRay.intersectObjects(environmentGroup.children, true);
      for (let i = 0; i < losHits.length; i++) {
         if (losHits[i].object.userData.isSolid && losHits[i].distance < minDist) {
            hasLOS = false;
            break;
         }
      }

      // (No random jumping - causes AI to get stuck bouncing in corners)

      // Movement logic
      let currentSpeed = this.speed;
      const isAiming = (this.weapon === weapons.sniper && minDist > 20);
      let isSprinting = false;

      // Heavy Launcher Tactics: Strafe after firing
      const now = Date.now();
      let tacticalStrafe = null;
      if (this.primaryWeapon === weapons.launcher && now - this.lastFired < 2000) {
         // Perpendicular movement to target
         tacticalStrafe = new THREE.Vector3().crossVectors(dirToTarget, new THREE.Vector3(0, 1, 0)).normalize();
         if ((this.mesh.id % 2) === 0) tacticalStrafe.negate();
         currentSpeed *= 1.5;
         isSprinting = true;
      }

      // Tactical Sprint - AI sprints if far and out of sight
      if (!hasLOS && minDist > 30) {
         isSprinting = true;
         currentSpeed *= 2.5;
      } else if (hasLOS && isAiming) {
         currentSpeed *= 0.5;
      }

      // Sniper/Heavy Awareness: Sprint if recently hit by high damage
      if (this.lastHitTime && now - this.lastHitTime < 2000 && this.lastHitDamage > 30) {
         isSprinting = true;
         currentSpeed *= 2.0;
      }

      if (minDist > 8 || !hasLOS || tacticalStrafe) {
        let dir = dirToTarget.clone();
        dir.y = 0;

       if (tacticalStrafe) {
          dir.copy(tacticalStrafe);
       } else if (grenadeAvoidance) {
          dir.copy(grenadeAvoidance);
       } else if (this.stuckTimer > 0) {
          this.stuckTimer -= delta;
          dir.copy(this.stuckDir);
       } else {
           // Proactive vs Reactive Pathing
           let useProactivePathing = false;
           
           if (currentMap === 'nest') {
              const onRoof = this.mesh.position.y > 20;
              
              if (!onRoof) {
                 useProactivePathing = true;
                 // Detailed Stair Logic: move to x=targetX first, then push Z-axis
                 const needsBase = (this.team === 0) ? (this.mesh.position.z < 62) : (this.mesh.position.z > -62);
                 const targetX = (this.mesh.id % 5 - 2) * 4; // Spread across roof width
                 if (Math.abs(this.mesh.position.x - targetX) > 4) {
                    dir.set(targetX - this.mesh.position.x, 0, 0).normalize();
                 } else if (needsBase) {
                    dir.set(targetX - this.mesh.position.x, 0, this.nestBaseZ - this.mesh.position.z).normalize();
                 } else {
                    dir.set(targetX - this.mesh.position.x, 0, this.nestTargetZ - this.mesh.position.z).normalize();
                 }
              } else if (onRoof) {
                 // Roof behavior: Strafe slightly but stay near targetZ
                 useProactivePathing = true;
                 const strafe = Math.sin(Date.now() * 0.002 + this.mesh.position.x) * 5;
                 const targetX = (this.mesh.id % 5 - 2) * 4;
                 dir.set(targetX + strafe - this.mesh.position.x, 0, this.nestTargetZ - this.mesh.position.z).normalize();
                 if (dir.length() < 0.1) dir.set(0,0,0);
              }
           }

           if (!useProactivePathing) {
              // Reactive: Standard LOS/Stuck Pathing
              if (currentMap === 'nest' && closestHostile && closestHostile.position.y > 10 && !hasLOS) {
                 // Target is high up (likely on a tower)
                 const towerZ = closestHostile.position.z < 0 ? -110 : 110;
                 const stairZBase = closestHostile.position.z < 0 ? -50 : 50;
                 const needsStairBase = (closestHostile.position.z < 0) ? (this.mesh.position.z > -45) : (this.mesh.position.z < 45);
                 if (Math.abs(this.mesh.position.x) > 4) {
                    dir.set(0 - this.mesh.position.x, 0, 0).normalize();
                 } else if (needsStairBase) {
                   dir.set(0 - this.mesh.position.x, 0, stairZBase - this.mesh.position.z).normalize();
                 } else {
                   dir.set(0 - this.mesh.position.x, 0, towerZ - this.mesh.position.z).normalize();
                 }
              } else {
                 // Vector-based Obstacle Avoidance
                 const avoidRay = new THREE.Raycaster(this.mesh.position, dir);
                 const avoidHits = avoidRay.intersectObjects(environmentGroup.children, true);
                 if (avoidHits.length > 0 && avoidHits[0].distance < 4 && avoidHits[0].object.userData.isSolid) {
                    const hitNormal = avoidHits[0].face ? avoidHits[0].face.normal.clone() : new THREE.Vector3(0,0,1);
                    if (avoidHits[0].object.matrixWorld) {
                       hitNormal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(avoidHits[0].object.matrixWorld)).normalize();
                    }
                    hitNormal.y = 0; hitNormal.normalize();
                    dir.crossVectors(hitNormal, new THREE.Vector3(0,1,0)).normalize();
                    if (dir.dot(dirToTarget) < 0) dir.negate();
                 }
              }
           }
        }

        // Apply Horizontal Collisions for Agent (Uncoupled)
        const oldX = this.mesh.position.x;
        const oldZ = this.mesh.position.z;
        const pMinY = this.mesh.position.y - 1.0;
        const pMaxY = this.mesh.position.y + 1.5;

        // Step X — step-up: climb tier faces within threshold
        let xStuck = false;
        this.mesh.position.x += dir.x * currentSpeed * delta;
        let agentFeet = this.mesh.position.y - 2.0;
        for (let i = 0; i < collidableBoxes.length; i++) {
           const box = collidableBoxes[i];
           if (agentFeet >= box.max.y - 0.05) continue;
           if (this.mesh.position.y + 1.5 > box.min.y) {
               if (this.mesh.position.x > box.min.x-0.8 && this.mesh.position.x < box.max.x+0.8 && oldZ > box.min.z-0.8 && oldZ < box.max.z+0.8) {
                   const stepH = box.max.y - agentFeet;
                   if (currentMap === 'nest' && stepH > 0 && stepH <= 2.0) {
                      this.mesh.position.y = box.max.y + 2; this.velocityY = 0;
                   } else {
                      this.mesh.position.x = oldX; xStuck = true;
                   }
                   break;
               }
           }
        }

        // Entity-Entity X collision (Agent vs Agent)
        for (let i = 0; i < agents.length; i++) {
           const other = agents[i];
           if (other === this || other.health <= 0) continue;
           const otherMinY = other.mesh.position.y - 2.0;
           const otherMaxY = other.mesh.position.y + 1.5;
           if (pMaxY > otherMinY && pMinY < otherMaxY) {
              if (Math.abs(this.mesh.position.x - other.mesh.position.x) < 1.0 && Math.abs(oldZ - other.mesh.position.z) < 1.0) {
                 this.mesh.position.x = oldX; xStuck = true; break;
              }
           }
        }
        
        // Entity-Entity X collision (Agent vs Player)
        if (!gameState.isPaused && gameState.health > 0) {
           const playMinY = camera.position.y - 1.6;
           const playMaxY = camera.position.y + 0.2;
           if (pMaxY > playMinY && pMinY < playMaxY) {
              if (Math.abs(this.mesh.position.x - camera.position.x) < 0.9 && Math.abs(oldZ - camera.position.z) < 0.9) {
                 this.mesh.position.x = oldX; xStuck = true;
              }
           }
        }

        // Recompute agentFeet after possible X step-up
        agentFeet = this.mesh.position.y - 2.0;

        // Step Z — same step-up logic
        let zStuck = false;
        this.mesh.position.z += dir.z * currentSpeed * delta;
        for (let i = 0; i < collidableBoxes.length; i++) {
           const box = collidableBoxes[i];
           if (agentFeet >= box.max.y - 0.05) continue;
           if (this.mesh.position.y + 1.5 > box.min.y) {
               if (this.mesh.position.x > box.min.x-0.8 && this.mesh.position.x < box.max.x+0.8 && this.mesh.position.z > box.min.z-0.8 && this.mesh.position.z < box.max.z+0.8) {
                   const stepH = box.max.y - agentFeet;
                   if (currentMap === 'nest' && stepH > 0 && stepH <= 2.0) {
                      this.mesh.position.y = box.max.y + 2; this.velocityY = 0;
                   } else {
                      this.mesh.position.z = oldZ; zStuck = true;
                   }
                   break;
               }
           }
        }
        
        // Entity-Entity Z collision (Agent vs Agent)
        for (let i = 0; i < agents.length; i++) {
           const other = agents[i];
           if (other === this || other.health <= 0) continue;
           const otherMinY = other.mesh.position.y - 2.0;
           const otherMaxY = other.mesh.position.y + 1.5;
           if (pMaxY > otherMinY && pMinY < otherMaxY) {
              if (Math.abs(this.mesh.position.x - other.mesh.position.x) < 1.0 && Math.abs(this.mesh.position.z - other.mesh.position.z) < 1.0) {
                 this.mesh.position.z = oldZ; zStuck = true; break;
              }
           }
        }
        
        // Entity-Entity Z collision (Agent vs Player)
        if (!gameState.isPaused && gameState.health > 0) {
           const playMinY = camera.position.y - 1.6;
           const playMaxY = camera.position.y + 0.2;
           if (pMaxY > playMinY && pMinY < playMaxY) {
              if (Math.abs(this.mesh.position.x - camera.position.x) < 0.9 && Math.abs(this.mesh.position.z - camera.position.z) < 0.9) {
                 this.mesh.position.z = oldZ; zStuck = true;
              }
           }
        }

        // (Step-up handles tier climbing; no random jumping needed)

      // Stuck detection
      if (this.stuckTimer <= 0) {
         const movedSq = Math.pow(this.mesh.position.x - oldX, 2) + Math.pow(this.mesh.position.z - oldZ, 2);
         if (movedSq < 0.0001 && currentSpeed > 0) {
            this.stuckTimer = 1.0; 
            let bestDir = new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
               const testDir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
               const testRay = new THREE.Raycaster(this.mesh.position, testDir);
               const hts = testRay.intersectObjects(environmentGroup.children, true);
               let blocked = false;
               for (let k = 0; k < hts.length; k++) {
                  // A clearance of 7 units allows the AI to navigate 15-unit wide city streets 
                  // without detecting walls on both sides and giving up.
                  if (hts[k].object.userData.isSolid && hts[k].distance < 7) { blocked = true; break; }
               }
               if (!blocked) { bestDir = testDir; break; }
            }
            this.stuckDir.copy(bestDir);
         }
      }

      }
      
      // Decoupled Combat Logic: fire if we have LOS. LOS raycast already prevents through-wall shots.
      // Only suppress fire when sniping while sprinting (unrealistic), not for other weapons.
      const suppressFire = isSprinting && this.weapon.name === 'Rail-Sniper';
      if (hasLOS && !suppressFire) {
        const now = Date.now();
        const rateMult = this.team === 0 ? 1.5 : 2.0;
        if (now - this.lastFired > this.weapon.fireRate * rateMult) {
          this.lastFired = now;
          this.shootAt(closestHostile);
        }
      }
    } else if (this.team === 0) {
      const distToPlayer = this.mesh.position.distanceTo(camera.position);
      if (distToPlayer > 5) {
        const dirToPlayer = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        let dir = dirToPlayer.clone();
        dir.y = 0;

        // Vector-based Obstacle Avoidance for Allies
        const avoidRay = new THREE.Raycaster(this.mesh.position, dir);
        const avoidHits = avoidRay.intersectObjects(environmentGroup.children, true);
        if (avoidHits.length > 0 && avoidHits[0].distance < 4 && avoidHits[0].object.userData.isSolid) {
           const hitNormal = avoidHits[0].face ? avoidHits[0].face.normal.clone() : new THREE.Vector3(0,0,1);
           if (avoidHits[0].object.matrixWorld) {
              hitNormal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(avoidHits[0].object.matrixWorld)).normalize();
           }
           hitNormal.y = 0; hitNormal.normalize();
           dir.crossVectors(hitNormal, new THREE.Vector3(0,1,0)).normalize();
           if (dir.dot(dirToPlayer) < 0) dir.negate();
        }

        // Apply Horizontal Collisions for Agent (Uncoupled)
        const oldX = this.mesh.position.x;
        const oldZ = this.mesh.position.z;
        const pMinY = this.mesh.position.y - 1.0;
        const pMaxY = this.mesh.position.y + 1.5;
        
        // Step X
        this.mesh.position.x += dir.x * this.speed * delta;
        for (let i = 0; i < collidableBoxes.length; i++) {
           const box = collidableBoxes[i];
           if (pMinY < box.max.y && pMaxY > box.min.y) {
               if (this.mesh.position.x > box.min.x-0.8 && this.mesh.position.x < box.max.x+0.8 && oldZ > box.min.z-0.8 && oldZ < box.max.z+0.8) {
                   this.mesh.position.x = oldX; break;
               }
           }
        }
        
        // Step Z
        this.mesh.position.z += dir.z * this.speed * delta;
        for (let i = 0; i < collidableBoxes.length; i++) {
           const box = collidableBoxes[i];
           if (pMinY < box.max.y && pMaxY > box.min.y) {
               if (this.mesh.position.x > box.min.x-0.8 && this.mesh.position.x < box.max.x+0.8 && this.mesh.position.z > box.min.z-0.8 && this.mesh.position.z < box.max.z+0.8) {
                   this.mesh.position.z = oldZ; break;
               }
           }
        }

        // Stuck detection
        if (this.stuckTimer <= 0) {
           const movedSq = Math.pow(this.mesh.position.x - oldX, 2) + Math.pow(this.mesh.position.z - oldZ, 2);
           if (movedSq < 0.0001 && this.speed > 0) {
              this.stuckTimer = 1.0; 
              let bestDir = new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize();
              for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
                 const testDir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
                 const testRay = new THREE.Raycaster(this.mesh.position, testDir);
                 const hts = testRay.intersectObjects(environmentGroup.children, true);
                 let blocked = false;
                 for (let k = 0; k < hts.length; k++) {
                    if (hts[k].object.userData.isSolid && hts[k].distance < 15) { blocked = true; break; }
                 }
                 if (!blocked) { bestDir = testDir; break; }
              }
              this.stuckDir.copy(bestDir);
           }
        }
      }
      // (No random jumping for allies either)
    }
  }

  shootAt(target) {
    if (this.weapon.isProjectile) {
       const pos = this.mesh.position.clone();
       pos.y += 1.5; // From chest level
       
       const dir = target.position.clone().sub(pos).normalize();
       
       // Add slight randomization to AI grenades
       dir.x += (Math.random() - 0.5) * 0.1;
       dir.z += (Math.random() - 0.5) * 0.1;
       dir.normalize();

       const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
       const projColor = this.team === 0 ? 0x00ffff : 0xff0000;
       const projMat = new THREE.MeshStandardMaterial({ 
          color: projColor, 
          emissive: projColor, 
          emissiveIntensity: 1 
       });
       const mesh = new THREE.Mesh(projGeo, projMat);
       mesh.position.copy(pos);
       scene.add(mesh);

       const velocity = dir.multiplyScalar(this.weapon.speed);
       velocity.y += 3 + Math.random() * 4; // Randomized lob for AI

       activeProjectiles.push({
          mesh,
          velocity,
          team: this.team,
          owner: this.mesh,
          damage: this.weapon.damage,
          blastRadius: this.weapon.blastRadius,
          born: Date.now(),
          bounces: 0,
          fuse: 2800 
       });
       return;
    }

    const laserColor = this.weapon.color;
    
    // Fire weapon rays
    for (let r=0; r<this.weapon.rays; r++) {
       const material = new THREE.LineBasicMaterial({ color: laserColor, linewidth: 2 });
       const points = [];
       points.push(this.mesh.position.clone());
       
       const aimPoint = target.position.clone();
       aimPoint.x += (Math.random() - 0.5) * this.weapon.spread * 10;
       aimPoint.y += (Math.random() - 0.5) * this.weapon.spread * 10;
       aimPoint.z += (Math.random() - 0.5) * this.weapon.spread * 10;
       
       points.push(aimPoint);
       
       const geometry = new THREE.BufferGeometry().setFromPoints(points);
       const laser = new THREE.Line(geometry, material);
       scene.add(laser);
       lasers.push({ mesh: laser, born: Date.now() });

       // Damage check — raycast from EYE LEVEL (matches LOS check origin) to avoid terrain false-blocks
       const ray = new THREE.Raycaster();
       const eyePos = this.mesh.position.clone(); eyePos.y += 1.5;
       const dir = new THREE.Vector3().subVectors(aimPoint, eyePos).normalize();
       ray.set(eyePos, dir);

       // Physical wall-hack prevention: perfectly ensure the laser doesn't clip through an intermediate object
       let hitWall = false;
       const envHits = ray.intersectObjects(environmentGroup.children, true);
       const maxDist = eyePos.distanceTo(aimPoint);
       for (let i = 0; i < envHits.length; i++) {
          if (envHits[i].object.userData.isSolid && envHits[i].distance < maxDist) {
             hitWall = true; break;
          }
       }

       if (target.isPlayer) {
         // Full body hitbox: foot level to slightly above head
         const playerBox = new THREE.Box3(
           new THREE.Vector3(camera.position.x - 0.5, camera.position.y - 1.8, camera.position.z - 0.5),
           new THREE.Vector3(camera.position.x + 0.5, camera.position.y + 0.5, camera.position.z + 0.5)
         );
         if (ray.ray.intersectsBox(playerBox) && !hitWall) {
            const finalDamage = (this.weapon.damage * 0.5) * difficultyMult;
            gameState.health -= finalDamage;
         }
       } else {
          // Check if any ray intersects the target agent's mesh
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
    this.shell.material.emissive.setHex(0xffffff);
    setTimeout(() => {
      if(this.shell && this.shell.material) {
        this.shell.material.emissive.setHex(this.team === 0 ? 0x0055ff : 0xff0055);
      }
    }, 100);

    if (this.health <= 0) {
      scene.remove(this.mesh);
      // Ensure memory freed
      this.mesh.traverse(child => {
         if (child.geometry) child.geometry.dispose();
         if (child.material) child.material.dispose();
      });
      return true;
    }
    return false;
  }
}

function spawnEntities(mode) {
  let allyCount = 0; let enemyCount = 0;
  if(mode === 'solo') enemyCount = 5;
  if(mode === '1v1') enemyCount = 1;
  if(mode === '2v2') { allyCount = 1; enemyCount = 2; }
  if(mode === '3v3') { allyCount = 2; enemyCount = 3; }
  if(mode === '4v4') { allyCount = 3; enemyCount = 4; }

  // Map-aware spawn positions
  let playerSpawnX = 0, playerSpawnZ = 0;
  let allySpreadX = 20, allySpreadZ = 10, allyOffsetZ = 0;
  let enemySpreadX = 60, enemySpreadZ = 20, enemyOffsetZ = 0;

  if (currentMap === 'city') {
    playerSpawnZ = 120;
    allyOffsetZ = 120;
    enemyOffsetZ = -120;
    enemySpreadX = 100;
  } else if (currentMap === 'nest') {
    // Spawn both teams in the open CQB zone at ground level
    playerSpawnZ = 50;    // South side of center open zone
    allyOffsetZ = 50;
    enemyOffsetZ = -50;   // North side of center open zone
    allySpreadX = 30;
    enemySpreadX = 30;
  } else {
    // grid / hills: spread across the map
    playerSpawnZ = 100;
    allyOffsetZ = 100;
    enemyOffsetZ = -100;
    enemySpreadX = 80;
  }

  camera.position.set(playerSpawnX, 1.6, playerSpawnZ);
  velocity.set(0, 0, 0);

  for (let i = 0; i < allyCount; i++) {
    agents.push(new Agent(
      (Math.random()-0.5) * allySpreadX,
      allyOffsetZ + (Math.random()-0.5) * allySpreadZ,
      0
    ));
  }
  for (let i = 0; i < enemyCount; i++) {
    agents.push(new Agent(
      (Math.random()-0.5) * enemySpreadX,
      enemyOffsetZ + (Math.random()-0.5) * enemySpreadZ,
      1
    ));
  }

  // Force at least one "Grenadier" role per team in team modes only (not solo duel)
  let foundAllyGrenadier = false;
  let foundEnemyGrenadier = false;
  
  // In solo mode or Sniper Nest skip the forced grenadier 
  // (Nest is too long range for grenades to be effective, solo is just annoying with only grenades)
  if (mode !== 'solo' && currentMap !== 'nest') {
    for (let i = 0; i < agents.length; i++) {
       if (agents[i].team === 0 && !foundAllyGrenadier) {
          agents[i].primaryWeapon = JSON.parse(JSON.stringify(weapons.launcher));
          agents[i].weapon = agents[i].primaryWeapon;
          foundAllyGrenadier = true;
       }
       if (agents[i].team === 1 && !foundEnemyGrenadier) {
          agents[i].primaryWeapon = JSON.parse(JSON.stringify(weapons.launcher));
          agents[i].weapon = agents[i].primaryWeapon;
          foundEnemyGrenadier = true;
       }
    }
  }
}

// ---- Keyboard Controls ----
const mapKeys = {};
let canJump = false;

document.addEventListener('keydown', (e) => {
  mapKeys[e.code] = true;
  if (!gameState.isPaused) {
    if (e.code === 'Digit1') switchWeapon('pistol');
    if (e.code === 'Digit2') switchWeapon('rifle');
    if (e.code === 'Digit3') switchWeapon('shotgun');
    if (e.code === 'Digit4') switchWeapon('sniper');
    if (e.code === 'Digit5') switchWeapon('launcher');
    if (e.code === 'KeyR') startReload(currentWeapon);
    if (e.code === 'Space' && canJump) {
      velocity.y += 100; // Floaty jump speed (lower than 180)
      canJump = false;
    }
  }
});
document.addEventListener('keyup', (e) => {
  mapKeys[e.code] = false;
});

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const playerSpeed = 60.0; // Slow tactical pace (sprint is 150)
const gravity = 300.0; // Lower gravity for floaty jump

// ---- Game Loop ----
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  
  // ADS Lerp
  const targetFov = isADS && !gameState.isPaused ? (currentWeapon.zoomFov || 50) : 75;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 15 * delta);
  camera.updateProjectionMatrix();

  if (!gameState.isPaused && controls.isLocked) {
    // Movement logic with damping (World Space)
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= gravity * delta; // Gravity

    // Calculate World Space direction from camera orientation
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);
    lookDir.y = 0; lookDir.normalize();
    const rightDir = new THREE.Vector3();
    rightDir.crossVectors(camera.up, lookDir).negate(); 

    // Sum input forces
    const moveInput = new THREE.Vector3(0, 0, 0);
    if (mapKeys['KeyW'] || mapKeys['ArrowUp']) moveInput.add(lookDir);
    if (mapKeys['KeyS'] || mapKeys['ArrowDown']) moveInput.sub(lookDir);
    if (mapKeys['KeyD'] || mapKeys['ArrowRight']) moveInput.add(rightDir);
    if (mapKeys['KeyA'] || mapKeys['ArrowLeft']) moveInput.sub(rightDir);
    
    if (moveInput.lengthSq() > 0) {
      moveInput.normalize();
      const isSprinting = mapKeys['ShiftLeft'] && !isADS && !isMouseDown;
      const currentSpeed = isSprinting ? playerSpeed * 2.5 : (isADS ? playerSpeed * 0.4 : playerSpeed);
      velocity.x += moveInput.x * currentSpeed * 10.0 * delta; 
      velocity.z += moveInput.z * currentSpeed * 10.0 * delta;
    }

    // Apply Horizontal Collisions (Independent World Axes)
    const oldX = camera.position.x;
    const oldZ = camera.position.z;
    const pMinY = camera.position.y - 1.6; // feet
    const pMaxY = camera.position.y + 0.2; // head
    const maxStepUp = currentMap === 'nest' ? 1.2 : 0.5;

    // Step World X 
    camera.position.x += velocity.x * delta;
    const newX = camera.position.x;

    for (let i = 0; i < collidableBoxes.length; i++) {
       const box = collidableBoxes[i];
       if (pMinY < box.max.y && pMaxY > box.min.y) {
          if (newX > box.min.x - 0.4 && newX < box.max.x + 0.4 &&
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
    
    // Player vs Agent X Collision
    for (let i = 0; i < agents.length; i++) {
       const other = agents[i];
       if (other.health <= 0) continue;
       const otherMinY = other.mesh.position.y - 1.0;
       const otherMaxY = other.mesh.position.y + 1.5;
       if (pMinY < otherMaxY && pMaxY > otherMinY) {
          if (Math.abs(camera.position.x - other.mesh.position.x) < 0.9 && Math.abs(oldZ - other.mesh.position.z) < 0.9) {
             camera.position.x = oldX; velocity.x = 0; break;
          }
       }
    }

    // Step World Z
    camera.position.z += velocity.z * delta;
    const newZ = camera.position.z;
    const pMinY2 = camera.position.y - 1.6;
    const pMaxY2 = camera.position.y + 0.2;

    for (let i = 0; i < collidableBoxes.length; i++) {
       const box = collidableBoxes[i];
       if (pMinY2 < box.max.y && pMaxY2 > box.min.y) {
          if (camera.position.x > box.min.x - 0.4 && camera.position.x < box.max.x + 0.4 &&
              newZ > box.min.z - 0.4 && newZ < box.max.z + 0.4) {
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
    
    // Player vs Agent Z Collision
    for (let i = 0; i < agents.length; i++) {
       const other = agents[i];
       if (other.health <= 0) continue;
       const otherMinY = other.mesh.position.y - 1.0;
       const otherMaxY = other.mesh.position.y + 1.5;
       if (pMinY2 < otherMaxY && pMaxY2 > otherMinY) {
          if (Math.abs(camera.position.x - other.mesh.position.x) < 0.9 && Math.abs(camera.position.z - other.mesh.position.z) < 0.9) {
             camera.position.z = oldZ; velocity.z = 0; break;
          }
       }
    }

    // Now recalculate robust AABB floor overlap AT NEW POSITION
    let floorHeight = 0;
    const px = camera.position.x;
    const pz = camera.position.z;
    const py = camera.position.y;
    const pFeet = py - 1.6;
    for (let i = 0; i < collidableBoxes.length; i++) {
       const box = collidableBoxes[i];
       if (px > box.min.x - 0.4 && px < box.max.x + 0.4 && pz > box.min.z - 0.4 && pz < box.max.z + 0.4) {
          // Only snap floorHeight if the box top is not higher than our current feet + maxStepUp
          if (box.max.y <= pFeet + maxStepUp + 0.1 && box.max.y > floorHeight) {
             floorHeight = box.max.y;
          }
       }
    }

    camera.position.y += velocity.y * delta;

    // Tactical Collision with solid geometry below
    if (camera.position.y <= floorHeight + 1.6) {
      velocity.y = Math.max(0, velocity.y);
      camera.position.y = floorHeight + 1.6;
      canJump = true;
    }

    // Keep player within bounds (rough AABB)
    if (camera.position.x < -148) camera.position.x = -148;
    if (camera.position.x > 148) camera.position.x = 148;
    if (camera.position.z < -148) camera.position.z = -148;
    if (camera.position.z > 148) camera.position.z = 148;

    if (isMouseDown) {
      shoot();
    }
  }
  
  // Win condition
  if (!gameState.isPaused && hasStarted && gameState.health > 0) {
    let enemiesLeft = false;
    for (let i = agents.length - 1; i >= 0; i--) {
       if (agents[i].team === 1) enemiesLeft = true;
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

  // Scope overlay
  const scopeDiv = document.getElementById('scope-overlay');
  if (scopeDiv) {
    if (isADS && currentWeapon.name === 'Rail-Sniper' && !gameState.isPaused) {
      scopeDiv.style.display = 'flex';
      gunGroup.visible = false;
    } else {
      scopeDiv.style.display = 'none';
      gunGroup.visible = true;
    }
  }

  // Always run these visual updates
  // Update agents
  if (!gameState.isPaused) {
    for (let i = agents.length - 1; i >= 0; i--) {
      agents[i].update(delta);
    }
  }

  // Weapon recoil recovery
  gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, 0, 10 * delta);

  // Update lasers (fade and remove after 100ms)
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

  updateProjectiles(delta);
  updateExplosions(delta);

  // Update HUD
  document.getElementById('score-val').innerText = gameState.score.toString().padStart(5, '0');
  
  const hVal = Math.floor(Math.max(0, gameState.health));
  document.getElementById('health-val').innerText = hVal;
  const healthBar = document.getElementById('health-bar-fill');
  healthBar.style.width = hVal + '%';
  if(hVal < 30) {
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

  const wStr = currentWeapon.name.toUpperCase();
  document.getElementById('weapon-val').innerText = wStr;
  document.getElementById('weapon-val').style.color = '#' + currentWeapon.color.toString(16).padStart(6, '0');
  document.getElementById('weapon-val').style.textShadow = '0 0 10px #' + currentWeapon.color.toString(16).padStart(6, '0');

  // Ammo HUD
  const ammoEl = document.getElementById('ammo-val');
  if (ammoEl && !currentWeapon.isReloading) {
    const hexColor = '#' + currentWeapon.color.toString(16).padStart(6, '0');
    const ammoRatio = currentWeapon.ammo / currentWeapon.maxAmmo;
    let magColor;
    if (ammoRatio <= 0)        { magColor = 'var(--danger-glow)'; }
    else if (ammoRatio <= 0.25){ magColor = '#ffaa00'; }
    else                        { magColor = hexColor; }

    const reserveColor = currentWeapon.reserveAmmo <= 0
      ? 'var(--danger-glow)'
      : (currentWeapon.reserveAmmo <= currentWeapon.maxAmmo ? '#ffaa00' : '#aaaaaa');

    ammoEl.innerHTML =
      `<span style="color:${magColor};text-shadow:0 0 10px ${magColor}">${currentWeapon.ammo}</span>` +
      `<span style="color:#444;font-size:0.85em"> / </span>` +
      `<span style="color:${reserveColor};font-size:0.85em">${currentWeapon.reserveAmmo}</span>`;
  }

  // Game Over logic
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

  renderer.render(scene, camera);
}

// ---- Resize Handler ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start loop
animate();

// Subagent testing bypass
window.subagentTestStart = function() {
   const menu = document.getElementById('menu');
   if (menu) menu.style.display = 'none';
   if (!hasStarted) {
      buildEnvironment('city');
      spawnEntities('4v4');
      hasStarted = true;
   }
   gameState.isPaused = false;
   // Force lock bypass for animate loop
   controls.isLocked = true;
};
function updateProjectiles(delta) {
  const now = Date.now();
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    p.velocity.y -= 30 * delta; 
    const stepVel = p.velocity.clone().multiplyScalar(delta);
    p.mesh.position.add(stepVel);

    const ray = new THREE.Raycaster(p.mesh.position, p.velocity.clone().normalize(), 0, stepVel.length() + 0.3);
    const envHits = ray.intersectObjects(environmentGroup.children, true);
    
    if (envHits.length > 0) {
       // Safety check: ignore collision ONLY if hit object is part of the owner
       let isOwnerHit = false;
       if (now - p.born < 300 && p.owner) {
          if (p.owner instanceof THREE.Camera) {
             // Camera has no mesh for envHits to catch, but we check if it hits any agent part of owner team
             // Actually environmentGroup doesn't contain agents, so envHits only hits walls/floors.
          } else {
             p.owner.traverse(child => { if (child === envHits[0].object) isOwnerHit = true; });
          }
       }

       if (!isOwnerHit) {
          // Bouncing physics: Grenades bounce off environment until fuse expires
          const hit = envHits[0];
          const normal = hit.face.normal.clone();
          if (hit.object.matrixWorld) normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
          
          // Reflect and dampen velocity
          p.velocity.reflect(normal).multiplyScalar(0.6); 
          p.bounces++;
          
          // Prevent getting stuck in floor
          p.mesh.position.add(normal.multiplyScalar(0.1));
       }
    }

    let exploded = false;
    // Explode on direct contact with hostiles
    for (let j = 0; j < agents.length; j++) {
       const ag = agents[j];
       if (ag.health > 0 && ag.team !== p.team && p.mesh.position.distanceTo(ag.mesh.position) < 1.5) {
          exploded = true;
          detonateGrenade(p, p.mesh.position);
          break;
       }
    }
    
    // Only detonate on player if it's an enemy grenade
    if (!exploded && p.team !== 0 && p.mesh.position.distanceTo(camera.position) < 1.5) {
       exploded = true;
       detonateGrenade(p, p.mesh.position);
    }

    // Explode on fuse
    if (!exploded && now - p.born > p.fuse) {
       exploded = true;
       detonateGrenade(p, p.mesh.position);
    }

    if (exploded) {
       scene.remove(p.mesh);
       activeProjectiles.splice(i, 1);
    }
  }
}

function detonateGrenade(p, impactPoint) {
  // Damage Loop with Team Immunity
  const pDist = camera.position.distanceTo(impactPoint);
  // Remove self-damage for team 0 (player)
  if (p.team !== 0 && pDist < p.blastRadius) {
     gameState.health -= p.damage * (1 - (pDist / p.blastRadius));
  }
  
  for (let i = 0; i < agents.length; i++) {
     const ag = agents[i];
     if (ag.health <= 0) continue;
     // Friendly fire protection (team based)
     if (ag.team === p.team) continue;

     const d = ag.mesh.position.distanceTo(impactPoint);
     if (d < p.blastRadius) {
        ag.health -= p.damage * (1 - (d / p.blastRadius));
        if (ag.health <= 0) gameState.score += 100;
     }
  }

  // Visuals
  const expGeo = new THREE.SphereGeometry(1, 12, 12);
  const expMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 });
  const expMesh = new THREE.Mesh(expGeo, expMat);
  expMesh.position.copy(impactPoint);
  scene.add(expMesh);
  explosions.push({ mesh: expMesh, born: Date.now(), maxScale: p.blastRadius * 0.7 });
}

function updateExplosions(delta) {
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
