import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRoomCalibration,
  deriveRoomOriginQuaternion,
  ROOM_CALIBRATION_STATES,
} from '../src/anchors/createRoomCalibration.js';
import {
  createRoomLayout,
  normalizeRoomLayout,
  readRoomAnchorId,
  readRoomLayout,
  removeRoomAnchorId,
  writeRoomAnchorId,
  writeRoomLayout,
} from '../src/anchors/roomPersistence.js';

test('el handle persistente queda asociado solamente a su sala', () => {
  const storage = createMemoryStorage();

  assert.equal(writeRoomAnchorId('sala-a', 'anchor-a', { storage }), true);
  assert.equal(writeRoomAnchorId('sala-b', 'anchor-b', { storage }), true);
  assert.equal(readRoomAnchorId('sala-a', { storage }), 'anchor-a');
  assert.equal(readRoomAnchorId('sala-b', { storage }), 'anchor-b');

  removeRoomAnchorId('sala-a', { storage });
  assert.equal(readRoomAnchorId('sala-a', { storage }), null);
  assert.equal(readRoomAnchorId('sala-b', { storage }), 'anchor-b');
});

test('la distribución serializa transforms relativos finitos', () => {
  const storage = createMemoryStorage();
  const layout = createRoomLayout({
    'mesa-01': {
      position: [1.25, -0.8, 2.5],
      quaternion: [0, 0, 0, 2],
      scale: [1, 1, 1],
    },
  });

  assert.deepEqual(layout.tables['mesa-01'].quaternion, [0, 0, 0, 1]);
  assert.equal(writeRoomLayout('muestra-2026', layout, { storage }), true);
  assert.deepEqual(readRoomLayout('muestra-2026', { storage }), layout);
});

test('la distribución rechaza coordenadas no finitas y escalas inválidas', () => {
  assert.equal(
    normalizeRoomLayout({
      version: 1,
      tables: {
        'mesa-01': {
          position: [0, Number.POSITIVE_INFINITY, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    }),
    null,
  );
  assert.equal(
    normalizeRoomLayout({
      version: 1,
      tables: {
        'mesa-01': {
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 0, 1],
        },
      },
    }),
    null,
  );
  assert.equal(
    normalizeRoomLayout({
      version: 1,
      tables: {
        'mesa-99': {
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    }),
    null,
  );
});

test('la orientación del QR conserva Y vertical y apunta hacia el interior', () => {
  const hitPosition = new THREE.Vector3(0, 1.4, 0);
  const controllerPosition = new THREE.Vector3(2, 1.1, 0);
  const quaternion = deriveRoomOriginQuaternion(controllerPosition, hitPosition);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);

  assert.ok(forward.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9);
  assert.ok(up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9);

  const oppositeQuaternion = deriveRoomOriginQuaternion(
    new THREE.Vector3(0, 1.1, -2),
    hitPosition,
  );
  const oppositeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(oppositeQuaternion);

  assert.ok(oppositeUp.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9);
});

test('la confirmación del QR crea un solo anchor y guarda su handle por sala', async () => {
  const storage = createMemoryStorage();
  const session = {};
  const events = new EventTarget();
  const root = new THREE.Group();
  const persistentAnchors = new Set();
  let frameCallback;
  let createdAnchors = 0;
  let attachedAnchor = null;

  const renderer = {
    xr: {
      getSession: () => session,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
  };
  const realityAccelerator = {
    root,
    persistentAnchors,
    async restorePersistentAnchors() {},
    async createAnchor() {
      createdAnchors += 1;
      const anchor = new THREE.Group();
      anchor.makePersistent = async () => {
        anchor.anchorID = 'anchor-qr-1';
        persistentAnchors.add(anchor);
      };
      root.add(anchor);
      return anchor;
    },
    async deleteAnchor() {},
  };
  const museumContent = {
    attachRoomOrigin(anchor) {
      attachedAnchor = anchor;
    },
    detachRoomOrigin() {},
    applyLayout: () => 0,
    exportLayout: () => createRoomLayout({}),
  };
  const calibration = createRoomCalibration({
    renderer,
    realityAccelerator,
    museumContent,
    addFrameCallback(callback) {
      frameCallback = callback;
      return () => {};
    },
    getRoomId: () => 'muestra-2026',
    storage,
  });

  frameCallback();
  await flushPromises();
  assert.equal(calibration.getState(), ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION);

  const confirmed = calibration.requestCalibration({
    hitPosition: new THREE.Vector3(0, 1.4, 0),
    controllerPosition: new THREE.Vector3(0, 1.2, 2),
  });
  frameCallback();

  assert.equal(await confirmed, true);
  assert.equal(createdAnchors, 1);
  assert.equal(calibration.getState(), ROOM_CALIBRATION_STATES.READY);
  assert.equal(attachedAnchor?.anchorID, 'anchor-qr-1');
  assert.equal(readRoomAnchorId('muestra-2026', { storage }), 'anchor-qr-1');
  calibration.dispose();
});

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}
