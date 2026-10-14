import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createControllerInteraction } from '../src/interaction/createControllerInteraction.js';

test('apuntar al cartel durante 300 ms carga el STL una sola vez', async () => {
  const originalDocument = globalThis.document;
  globalThis.document = createCanvasDocumentStub();

  try {
    const scene = new THREE.Scene();
    const controllers = [new THREE.Group(), new THREE.Group()];
    const xrEvents = new THREE.EventDispatcher();
    const renderer = {
      xr: Object.assign(xrEvents, {
        isPresenting: true,
        getController(index) {
          return controllers[index];
        },
      }),
    };
    const hitTestTarget = new THREE.Group();
    hitTestTarget.hitTestResultValid = false;
    const realityAccelerator = {
      async createHitTestTargetFromControllerSpace() {
        return hitTestTarget;
      },
      deleteHitTestTarget() {},
    };
    const roomRoot = new THREE.Group();
    const selector = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 6),
      new THREE.MeshBasicMaterial(),
    );
    selector.position.set(0, 0, -1);
    selector.userData.slotId = 'mesa-01';
    roomRoot.add(selector);
    scene.add(roomRoot);

    let loadRequests = 0;
    const museumContent = {
      roomRoot,
      getScenes: () => [],
      getActiveSceneId: () => null,
      resolveSlotId(object) {
        let current = object;

        while (current && current !== roomRoot) {
          if (current.userData.slotId) {
            return current.userData.slotId;
          }
          current = current.parent;
        }

        return null;
      },
      async loadSlotArtwork(slotId) {
        assert.equal(slotId, 'mesa-01');
        loadRequests += 1;
        return null;
      },
    };
    const roomCalibration = {
      isReady: () => true,
      getState: () => 'ready',
    };
    let frameCallback;
    const interaction = createControllerInteraction({
      scene,
      renderer,
      realityAccelerator,
      roomCalibration,
      museumContent,
      addFrameCallback(callback) {
        frameCallback = callback;
        return () => {};
      },
    });

    controllers[0].dispatchEvent({
      type: 'connected',
      data: { handedness: 'right' },
    });
    await Promise.resolve();
    scene.updateMatrixWorld(true);

    frameCallback({ time: 0 });
    frameCallback({ time: 299 });
    assert.equal(loadRequests, 0);

    frameCallback({ time: 300 });
    frameCallback({ time: 600 });
    await Promise.resolve();
    assert.equal(loadRequests, 1);

    interaction.dispose();
    selector.geometry.dispose();
    selector.material.dispose();
  } finally {
    globalThis.document = originalDocument;
  }
});

function createCanvasDocumentStub() {
  return {
    createElement(name) {
      assert.equal(name, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            clearRect() {},
            fillRect() {},
            strokeRect() {},
            fillText() {},
            measureText(text) {
              return { width: String(text).length * 20 };
            },
          };
        },
      };
    },
  };
}
