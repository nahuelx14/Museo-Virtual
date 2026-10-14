import assert from 'node:assert/strict';
import test from 'node:test';
import { createSceneMenu } from '../src/interaction/createSceneMenu.js';

test('el menú XR muestra las escenas y conserva una única selección activa', () => {
  const originalDocument = globalThis.document;
  globalThis.document = createCanvasDocumentStub();

  try {
    const scenes = [
      { id: 'escena-1', name: 'Escena 1' },
      { id: 'escena-2', name: 'Escena 2' },
      { id: 'escena-3', name: 'Escena 3' },
    ];
    const menu = createSceneMenu({ scenes, activeSceneId: 'escena-2' });

    assert.equal(menu.group.children.length, 4);
    assert.equal(menu.getScene('escena-2').name, 'Escena 2');
    assert.equal(menu.setActiveScene('escena-3'), true);
    assert.equal(menu.setActiveScene('inexistente'), false);

    const selectedAfterRefresh = menu.setScenes(scenes, 'escena-3');
    assert.equal(selectedAfterRefresh, 'escena-3');
    assert.equal(menu.group.children.length, 4);

    menu.dispose();
    assert.equal(menu.group.parent, null);
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
          };
        },
      };
    },
  };
}
