import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getArtworkForSlot,
  MUSEUM_SCENES,
  TABLE_SLOTS,
  validateMuseumCatalog,
} from '../src/data/museumCatalog.js';

test('el catálogo define 10 mesas físicas reutilizadas por 3 escenas', () => {
  assert.equal(TABLE_SLOTS.length, 10);
  assert.equal(MUSEUM_SCENES.length, 3);

  const expectedSlotIds = TABLE_SLOTS.map((slot) => slot.id);

  for (const scene of MUSEUM_SCENES) {
    assert.deepEqual(Object.keys(scene.assignments), expectedSlotIds);
  }

  assert.deepEqual(validateMuseumCatalog(), []);
});

test('cada escena puede rotar la obra sin modificar la identidad de la mesa', () => {
  const first = getArtworkForSlot('escena-1', 'mesa-01');
  const second = getArtworkForSlot('escena-2', 'mesa-01');
  const third = getArtworkForSlot('escena-3', 'mesa-01');

  assert.notEqual(first.id, second.id);
  assert.notEqual(second.id, third.id);
  assert.equal(getArtworkForSlot('escena-1', 'mesa-02'), null);
});
