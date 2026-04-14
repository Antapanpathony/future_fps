import * as THREE from 'three';
import { scene, environmentGroup } from './engine.js';
import { collidableBoxes } from './data.js';

// ---- Lighting (called once at init) ----
export function setupLighting() {
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0xff0055, 1.0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
  dirLight.position.set(30, 80, 30);
  dirLight.castShadow = true;
  dirLight.shadow.camera.top = 200;
  dirLight.shadow.camera.bottom = -200;
  dirLight.shadow.camera.left = -200;
  dirLight.shadow.camera.right = 200;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);
}

// ---- Map Builder ----
export function buildEnvironment(mapType) {
  // Clear existing geometry
  while (environmentGroup.children.length > 0) {
    environmentGroup.remove(environmentGroup.children[0]);
  }

  // Common perimeter walls (visible)
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

  // Invisible physics bounds (so AI raycasts detect walls reliably)
  const boundVal = 150;
  const boundThick = 10;
  const boundMat = new THREE.MeshBasicMaterial({ visible: false });

  [
    { w: 320, h: 100, d: boundThick, x: 0,        z: boundVal  },
    { w: 320, h: 100, d: boundThick, x: 0,        z: -boundVal },
    { w: boundThick, h: 100, d: 320, x: boundVal,  z: 0         },
    { w: boundThick, h: 100, d: 320, x: -boundVal, z: 0         },
  ].forEach(b => {
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), boundMat);
    wallMesh.position.set(b.x, b.h / 2, b.z);
    wallMesh.userData.isSolid = true;
    environmentGroup.add(wallMesh);
  });

  // ---- Map-specific geometry ----
  if (mapType === 'grid') {
    const gridHelper = new THREE.GridHelper(300, 150, 0x00ffff, 0x002244);
    gridHelper.position.y = 0.05;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    environmentGroup.add(gridHelper);

    scene.fog.density = 0.025;

    const energyMat = new THREE.MeshStandardMaterial({
      color: 0x0088ff, emissive: 0x0088ff, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.7
    });
    for (let i = 0; i < 20; i++) {
      const barricade = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), energyMat);
      barricade.position.set((Math.random() - 0.5) * 260, 2.5, (Math.random() - 0.5) * 260);
      barricade.userData.isSolid = true;
      environmentGroup.add(barricade);
    }

  } else if (mapType === 'hills') {
    scene.fog.density = 0.022;

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a1a00, roughness: 1.0 });
    for (let i = 0; i < 15; i++) {
      const rad = 3 + Math.random() * 4;
      const rock = new THREE.Mesh(new THREE.SphereGeometry(rad, 8, 8), rockMat);
      const rx = (Math.random() - 0.5) * 260;
      const rz = (Math.random() - 0.5) * 260;
      const ry = Math.sin(rx * 0.05) * Math.cos(rz * 0.05) * 6;
      rock.position.set(rx, ry + rad / 2, rz);
      rock.userData.isSolid = true;
      environmentGroup.add(rock);
    }

  } else if (mapType === 'city') {
    scene.fog.density = 0.015;

    const boxMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.8 });
    const blockSize = 40;
    const streetWidth = 15;
    const mapSize = 280;

    for (let x = -mapSize / 2; x < mapSize / 2; x += (blockSize + streetWidth)) {
      for (let z = -mapSize / 2; z < mapSize / 2; z += (blockSize + streetWidth)) {
        const cx = x + blockSize / 2;
        const cz = z + blockSize / 2;

        const distToSouth = Math.sqrt(cx * cx + (cz - 120) * (cz - 120));
        const distToNorth = Math.sqrt(cx * cx + (cz + 120) * (cz + 120));
        if (distToSouth < 60 || distToNorth < 60) continue;
        if (Math.random() < 0.25) continue;

        const h = 20 + Math.random() * 40;
        const block = new THREE.Mesh(new THREE.BoxGeometry(blockSize, h, blockSize), boxMat);
        block.position.set(cx, h / 2, cz);
        block.userData.isSolid = true;
        block.castShadow = true;
        block.receiveShadow = true;
        environmentGroup.add(block);
      }
    }

  } else if (mapType === 'nest') {
    scene.fog.density = 0.006;

    const matTower = new THREE.MeshStandardMaterial({
      color: 0x112233, metalness: 0.8, roughness: 0.2,
      emissive: 0x001133, emissiveIntensity: 0.3
    });
    const matCQB = new THREE.MeshStandardMaterial({ color: 0x442222, metalness: 0.5, roughness: 0.6 });

    function buildTower(zOrigin) {
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
        const layer = new THREE.Mesh(new THREE.BoxGeometry(tW, tierH, depth), matTower);
        layer.position.set(0, y, centerZ);
        layer.userData.isSolid = true;
        layer.receiveShadow = true;
        layer.castShadow = true;
        environmentGroup.add(layer);
      }
    }

    buildTower(-100);
    buildTower(100);

    for (let i = 0; i < 30; i++) {
      const bw = 6 + Math.random() * 6;
      const bh = 3 + Math.random() * 5;
      const cover = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), matCQB);
      cover.position.set((Math.random() - 0.5) * 80, bh / 2, (Math.random() - 0.5) * 60);
      cover.userData.isSolid = true;
      cover.castShadow = true;
      cover.receiveShadow = true;
      environmentGroup.add(cover);
    }

  } else {
    scene.fog.density = 0.010;
  }

  // Rebuild AABB colliders for all solid non-plane meshes
  collidableBoxes.length = 0;
  environmentGroup.traverse(child => {
    if (child.isMesh && child.userData && child.userData.isSolid && child.geometry.type !== 'PlaneGeometry') {
      child.updateMatrixWorld(true);
      collidableBoxes.push(new THREE.Box3().setFromObject(child));
    }
  });
}
