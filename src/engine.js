import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---- Scene ----
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, 0.015);

// ---- Camera ----
export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6;

// ---- Renderer ----
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// ---- Pointer Lock Controls ----
export const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// ---- Environment Group (all map geometry lives here) ----
export const environmentGroup = new THREE.Group();
scene.add(environmentGroup);

// ---- Clock ----
export const clock = new THREE.Clock();
