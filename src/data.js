import * as THREE from 'three';

// ---- Static Weapon Definitions ----
export const weapons = {
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
    reserveAmmo: 90,
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
    reserveAmmo: 210,
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
    reserveAmmo: 48,
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
    reserveAmmo: 25,
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

// ---- Game State ----
export const gameState = {
  isPaused: true,
  score: 0,
  health: 100,
};

// ---- Shared Mutable Arrays ----
// Exported by reference — all modules mutate these in place
export const agents = [];
export const lasers = [];
export const activeProjectiles = [];
export const explosions = [];
export const collidableBoxes = [];

// ---- Mutable Singleton State ----
// Grouped into one object so cross-module reassignment works cleanly
export const state = {
  currentWeapon: null,       // set below after weapons are defined
  currentMap: 'grid',
  hasStarted: false,
  difficultyMult: 1.0,
  currentGameMode: 'solo',
  isMouseDown: false,
  isADS: false,
  canJump: false,
  velocity: new THREE.Vector3(),
  mapKeys: {},
};

state.currentWeapon = weapons.pistol;
