import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createMuseumContent,
  describeScaleWarning,
} from '../src/scene/createMuseumContent.js';

test('el STL reemplaza el cartel de mesa y una carga simultánea se reutiliza', async () => {
  const originalDocument = globalThis.document;
  globalThis.document = createCanvasDocumentStub();

  try {
    const scene = new THREE.Scene();
    let requests = 0;
    const modelCache = {
      async createMesh() {
        requests += 1;
        return {
          mesh: new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.3, 0.2),
            new THREE.MeshStandardMaterial(),
          ),
          polygonCount: 12,
          shouldWarn: false,
          sourceSize: new THREE.Vector3(0.2, 0.3, 0.2),
        };
      },
      dispose() {},
    };
    const content = createMuseumContent({
      scene,
      modelCache,
      resolveModelUrl: async () => 'https://example.test/obra.stl',
    });

    content.setCatalog(createCatalog());
    content.attachRoomOrigin(scene);
    content.placeSlotAtWorldPose(
      'mesa-01',
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion(),
    );

    const firstLoad = content.loadSlotArtwork('mesa-01');
    const secondLoad = content.loadSlotArtwork('mesa-01');
    const [firstMesh, secondMesh] = await Promise.all([firstLoad, secondLoad]);
    const label = content.roomRoot.getObjectByName('mesa-01-etiqueta');
    const selector = content.roomRoot.getObjectByName('mesa-01-selector');

    assert.equal(requests, 1);
    assert.equal(firstMesh, secondMesh);
    assert.equal(label.visible, false);
    assert.equal(selector.visible, true);
    assert.equal(firstMesh.parent.name, 'mesa-01-obra');

    content.setActiveScene('scene-2');

    assert.equal(label.visible, true);
    assert.equal(firstMesh.parent, null);
    content.dispose();
  } finally {
    globalThis.document = originalDocument;
  }
});

test('describeScaleWarning avisa sin modificar modelos gigantes o microscópicos', () => {
  assert.match(
    describeScaleWarning(new THREE.Vector3(100, 50, 25), new THREE.Vector3(1, 1, 1)),
    /100\.00 m/,
  );
  assert.match(
    describeScaleWarning(
      new THREE.Vector3(0.001, 0.0005, 0.00025),
      new THREE.Vector3(1, 1, 1),
    ),
    /1\.0 mm/,
  );
  assert.equal(
    describeScaleWarning(
      new THREE.Vector3(100, 50, 25),
      new THREE.Vector3(0.001, 0.001, 0.001),
    ),
    '',
  );
});

function createCatalog() {
  const emptyAssignments = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      `mesa-${String(index + 1).padStart(2, '0')}`,
      null,
    ]),
  );

  return {
    artworks: {
      'artwork-1': {
        id: 'artwork-1',
        name: 'Obra de prueba',
        author: 'Estudiante',
        scale: 1,
        color: 0xffffff,
        storagePath: 'sala/artwork-1/obra.stl',
      },
    },
    scenes: [
      {
        id: 'scene-1',
        name: 'Escena 1',
        order: 1,
        assignments: { ...emptyAssignments, 'mesa-01': 'artwork-1' },
      },
      {
        id: 'scene-2',
        name: 'Escena 2',
        order: 2,
        assignments: { ...emptyAssignments },
      },
      {
        id: 'scene-3',
        name: 'Escena 3',
        order: 3,
        assignments: { ...emptyAssignments },
      },
    ],
  };
}

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
          };
        },
      };
    },
  };
}
