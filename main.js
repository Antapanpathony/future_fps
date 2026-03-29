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
    [1 2 3] WEAPON SYSTEMS &nbsp;&nbsp;|&nbsp;&nbsp; [R-CLICK] ADS &nbsp;&nbsp;|&nbsp;&nbsp; [SPACE] JUMP
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
  if (mapType === 'grid') {
    const gridHelper = new THREE.GridHelper(300, 150, 0x00ffff, 0x002244);
    gridHelper.position.y = 0.05;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    environmentGroup.add(gridHelper);
  } else if (mapType === 'city') {
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
    const matTower = new THREE.MeshStandardMaterial({ color: 0x112233, metalness: 0.8, roughness: 0.2 });
    const matCQB = new THREE.MeshStandardMaterial({ color: 0x442222, metalness: 0.5, roughness: 0.6 });
    
    // Tower 1 (North)
    for (let i = 0; i < 6; i++) {
       const w = 40 - (i * 6); 
       const y = i * 4 + 2;   
       const boxGeo = new THREE.BoxGeometry(w, 4, w);
       const layer = new THREE.Mesh(boxGeo, matTower);
       layer.position.set(0, y, -100); 
       layer.userData.isSolid = true;
       layer.receiveShadow = true;
       layer.castShadow = true;
       environmentGroup.add(layer);
    }
    // Ladder North
    for (let i = 0; i < 12; i++) {
       const stepGeom = new THREE.BoxGeometry(6, 2, 6);
       const step = new THREE.Mesh(stepGeom, matTower);
       step.position.set(0, (i*2)+1, -120 + (i*1.5)); 
       step.userData.isSolid = true;
       environmentGroup.add(step);
    }

    // Tower 2 (South)
    for (let i = 0; i < 6; i++) {
       const w = 40 - (i * 6); 
       const y = i * 4 + 2;   
       const boxGeo = new THREE.BoxGeometry(w, 4, w);
       const layer = new THREE.Mesh(boxGeo, matTower);
       layer.position.set(0, y, 100); 
       layer.userData.isSolid = true;
       layer.receiveShadow = true;
       layer.castShadow = true;
       environmentGroup.add(layer);
    }
    // Ladder South
    for (let i = 0; i < 12; i++) {
       const stepGeom = new THREE.BoxGeometry(6, 2, 6);
       const step = new THREE.Mesh(stepGeom, matTower);
       step.position.set(0, (i*2)+1, 120 - (i*1.5)); 
       step.userData.isSolid = true;
       environmentGroup.add(step);
    }

    // CQB Zone (Center)
    for(let i=0; i<30; i++) {
       const boxGeo = new THREE.BoxGeometry(6, 4 + Math.random()*6, 6);
       const cover = new THREE.Mesh(boxGeo, matCQB);
       cover.position.set((Math.random()-0.5)*80, 0, (Math.random()-0.5)*60);
       cover.position.y += cover.geometry.parameters.height / 2;
       cover.userData.isSolid = true;
       cover.castShadow = true;
       cover.receiveShadow = true;
       environmentGroup.add(cover);
    }
  }

  // Generate Horizontal AABB Colliders
  collidableBoxes.length = 0;
  environmentGroup.children.forEach(child => {
     if (child.userData && child.userData.isSolid && child.geometry.type !== 'PlaneGeometry') {
        child.updateMatrixWorld();
        collidableBoxes.push(new THREE.Box3().setFromObject(child));
     }
  });
}

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); 
scene.add(ambientLight);

// Hemisphere light for better reflections
const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0xff0055, 0.3);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const weapons = {
  pistol: {
    name: 'Laser Pistol',
    color: 0x00ffff,
    fireRate: 250, 
    damage: 25,    
    lastFired: 0,
    rays: 1,
    spread: 0,
    zoomFov: 55
  },
  rifle: {
    name: 'Plasma Auto-Rifle',
    color: 0xff00ff,
    fireRate: 100, 
    damage: 12,
    lastFired: 0,
    rays: 1,
    spread: 0.005, 
    zoomFov: 45
  },
  shotgun: {
    name: 'Scatter Gun',
    color: 0xffaa00,
    fireRate: 700, 
    damage: 6, // 15 * 6 = 90 max damage (no longer a guaranteed 1-hit)
    lastFired: 0,
    rays: 15,      
    spread: 0.10, // Slightly wider to require closer range for full damage
    zoomFov: 65,
    piercing: false
  },
  sniper: {
    name: 'Rail-Sniper',
    color: 0x00ff00,
    fireRate: 1500, 
    damage: 80, // Heavy damage but leaves you with 20 HP
    lastFired: 0,
    rays: 1,
    spread: 0,
    zoomFov: 15,
    piercing: true
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

// Laser array
const lasers = [];

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

function shoot() {
  if (mapKeys['ShiftLeft'] && !isADS) return; // Cannot shoot while sprinting

  const now = Date.now();
  if (now - currentWeapon.lastFired < currentWeapon.fireRate) return;
  currentWeapon.lastFired = now;

  // Add recoil animation
  gunGroup.rotation.x = Math.max(gunGroup.rotation.x + 0.1, 0.3);

  for (let r = 0; r < currentWeapon.rays; r++) {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.x += (Math.random() - 0.5) * currentWeapon.spread;
    dir.y += (Math.random() - 0.5) * currentWeapon.spread;
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
    
    const shellMat = team === 0 ? matAllyShell : matEnemyShell;
    const coreMat = team === 0 ? matAllyCore : matEnemyCore;

    const shell = new THREE.Mesh(agentGeometry, shellMat.clone());
    const core = new THREE.Mesh(coreGeo, coreMat.clone());
    this.mesh.add(shell);
    this.mesh.add(core);
    this.shell = shell; 

    this.mesh.position.set(x, 2.5, z); 
    
    const lightColor = team === 0 ? 0x0055ff : 0xff0055;
    const agentLight = new THREE.PointLight(lightColor, 2, 10);
    this.mesh.add(agentLight);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    
    this.health = 100 * difficultyMult;
    this.speed = (team === 0 ? 8 : 6) * difficultyMult; 
    this.baseDamage = 10 * difficultyMult;
    this.lastFired = 0;
    this.weapon = weapons.rifle; // Assigned dynamically
    this.velocityY = 0;
    this.stuckTimer = 0;
    this.stuckDir = new THREE.Vector3();
  }

  update(delta) {
    // Determine Top Surface Height
    let agentFloorY = 2; // default
    const origin = this.mesh.position.clone();
    origin.y += 100; // start way up
    const downRay = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
    const hits = downRay.intersectObjects(environmentGroup.children, true);
    for(let i=0; i<hits.length; i++) {
       if (hits[i].object.userData.isSolid) {
          agentFloorY = hits[i].point.y + 2; 
          break;
       }
    }

    // Apply Gravity to Agent
    this.velocityY -= 300 * delta; 
    this.mesh.position.y += this.velocityY * delta;
    if (this.mesh.position.y <= agentFloorY) {
      this.mesh.position.y = agentFloorY;
      this.velocityY = Math.max(0, this.velocityY);
    }

    let closestHostile = null;
    let minDist = Infinity;

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
      // Smart Weapon Switch
      if (minDist > 30) this.weapon = weapons.sniper;
      else if (minDist < 12) this.weapon = weapons.shotgun;
      else this.weapon = weapons.rifle;

      // Check Line of Sight (LOS)
      let hasLOS = true;
      const dirToTarget = new THREE.Vector3().subVectors(closestHostile.position, this.mesh.position).normalize();
      const losRay = new THREE.Raycaster(this.mesh.position, dirToTarget);
      const losHits = losRay.intersectObjects(environmentGroup.children, true);
      for (let i = 0; i < losHits.length; i++) {
         if (losHits[i].object.userData.isSolid && losHits[i].distance < minDist) {
            hasLOS = false;
            break;
         }
      }

      // Smart Jump - Only if they have LOS
      if (hasLOS && Math.random() < 0.005 && this.mesh.position.y <= agentFloorY + 0.1) {
         this.velocityY = 100;
      }

      // Movement logic
      let currentSpeed = this.speed;
      const isAiming = (this.weapon === weapons.sniper && minDist > 20);
      let isSprinting = false;

      // Tactical Sprint - AI sprints if far and out of sight
      if (!hasLOS && minDist > 30) {
         isSprinting = true;
         currentSpeed *= 2.5;
      } else if (hasLOS && isAiming) {
         currentSpeed *= 0.5;
      }

      if (minDist > 8 || !hasLOS) {
        let dir = dirToTarget.clone();
        dir.y = 0;

        if (this.stuckTimer > 0) {
           this.stuckTimer -= delta;
           dir.copy(this.stuckDir);
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

        // Apply Horizontal Collisions for Agent (Uncoupled)
        const oldX = this.mesh.position.x;
        const oldZ = this.mesh.position.z;
        const pMinY = this.mesh.position.y - 1.0;
        const pMaxY = this.mesh.position.y + 1.5;

        // Step X
        this.mesh.position.x += dir.x * currentSpeed * delta;
        for (let i = 0; i < collidableBoxes.length; i++) {
           const box = collidableBoxes[i];
           if (pMinY < box.max.y && pMaxY > box.min.y) {
               if (this.mesh.position.x > box.min.x-0.8 && this.mesh.position.x < box.max.x+0.8 && oldZ > box.min.z-0.8 && oldZ < box.max.z+0.8) {
                   this.mesh.position.x = oldX; break;
               }
           }
        }

        // Step Z
        this.mesh.position.z += dir.z * currentSpeed * delta;
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
           if (movedSq < 0.0001 && currentSpeed > 0) {
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

      } else if (hasLOS && !isSprinting) {
        const now = Date.now();
        if (now - this.lastFired > this.weapon.fireRate * (this.team === 0 ? 1 : 1.5)) {
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
      if (Math.random() < 0.002 && this.mesh.position.y <= 2.1) {
         this.velocityY = 100;
      }
    }
  }

  shootAt(target) {
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

       // Damage logic based on target
       const ray = new THREE.Raycaster();
       const dir = new THREE.Vector3().subVectors(aimPoint, this.mesh.position).normalize();
       ray.set(this.mesh.position, dir);
       
       if (target.isPlayer) {
         const playerBox = new THREE.Box3(
           new THREE.Vector3(camera.position.x - 0.5, camera.position.y - 1.6, camera.position.z - 0.5),
           new THREE.Vector3(camera.position.x + 0.5, camera.position.y + 0.4, camera.position.z + 0.5)
         );
         if (ray.ray.intersectsBox(playerBox)) {
            // AI deals 50% damage to players to prevent instantly being aimbotted
            const finalDamage = (this.weapon.damage * 0.5) * difficultyMult;
            gameState.health -= finalDamage;
         }
       } else {
          if (aimPoint.distanceTo(target.position) < 2) { 
             const dead = target.agent.takeDamage(this.weapon.damage * difficultyMult);
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
  // Logic from top
  let allyCount = 0; let enemyCount = 0;
  if(mode === 'solo') enemyCount = 5;
  if(mode === '1v1') enemyCount = 1;
  if(mode === '2v2') { allyCount = 1; enemyCount = 2; }
  if(mode === '3v3') { allyCount = 2; enemyCount = 3; }
  if(mode === '4v4') { allyCount = 3; enemyCount = 4; }

  // Set player spawn to South edge
  camera.position.set(0, 1.6, 120); 
  velocity.set(0,0,0); // reset velocity
  
  // Allies spawning near player (South Edge)
  for(let i=0; i<allyCount; i++){
    agents.push(new Agent((Math.random()-0.5)*40, 120 + (Math.random()-0.5)*10, 0));
  }
  // Enemies spawned at opposite edge (North Edge)
  for(let i=0; i<enemyCount; i++){
    agents.push(new Agent((Math.random()-0.5)*100, -120 + (Math.random()-0.5)*20, 1));
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
    // Determine floor height based on Environment
    let floorHeight = 0;
    const cOrigin = camera.position.clone();
    cOrigin.y += 100;
    const cRay = new THREE.Raycaster(cOrigin, new THREE.Vector3(0, -1, 0));
    const cHits = cRay.intersectObjects(environmentGroup.children, true);
    for(let i=0; i<cHits.length; i++) {
       if (cHits[i].object.userData.isSolid) {
          floorHeight = cHits[i].point.y;
          break;
       }
    }

    // Movement logic with damping
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= gravity * delta; // Gravity

    // Fixed WASD directions
    direction.z = Number(mapKeys['KeyW'] || mapKeys['ArrowUp'] || false) - Number(mapKeys['KeyS'] || mapKeys['ArrowDown'] || false);
    direction.x = Number(mapKeys['KeyD'] || mapKeys['ArrowRight'] || false) - Number(mapKeys['KeyA'] || mapKeys['ArrowLeft'] || false);
    direction.normalize();

    const isSprinting = mapKeys['ShiftLeft'] && !isADS && !isMouseDown;
    const currentSpeed = isSprinting ? playerSpeed * 2.5 : (isADS ? playerSpeed * 0.4 : playerSpeed);

    if (mapKeys['KeyW'] || mapKeys['ArrowUp'] || mapKeys['KeyS'] || mapKeys['ArrowDown']) velocity.z -= direction.z * currentSpeed * delta;
    if (mapKeys['KeyA'] || mapKeys['ArrowLeft'] || mapKeys['KeyD'] || mapKeys['ArrowRight']) velocity.x -= direction.x * currentSpeed * delta;

    // Apply Horizontal Collisions with Sliding
    const oldX = camera.position.x;
    const oldZ = camera.position.z;
    
    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
    
    const newX = camera.position.x;
    const newZ = camera.position.z;
    const pMinY = camera.position.y - 1.5; // feet
    const pMaxY = camera.position.y + 0.4; // head
    
    let colX = false, colZ = false;
    for (let i = 0; i < collidableBoxes.length; i++) {
        const box = collidableBoxes[i];
        if (pMinY < box.max.y && pMaxY > box.min.y) {
           if (newX > box.min.x - 0.4 && newX < box.max.x + 0.4 && oldZ > box.min.z - 0.4 && oldZ < box.max.z + 0.4) colX = true;
           if (oldX > box.min.x - 0.4 && oldX < box.max.x + 0.4 && newZ > box.min.z - 0.4 && newZ < box.max.z + 0.4) colZ = true;
        }
    }
    
    // Slide mechanic: Revert only the blocked axis
    camera.position.x = colX ? oldX : newX;
    camera.position.z = colZ ? oldZ : newZ;

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
