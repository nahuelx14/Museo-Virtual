import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoomId, persistRoomId, readRoomId } from '../src/anchors/roomReference.js';
import {
  assessPolygonCount,
  STL_POLYGON_WARNING_THRESHOLD,
} from '../src/models/modelPolicy.js';

test('normalizeRoomId acepta IDs seguros y conserva mayúsculas', () => {
  assert.equal(normalizeRoomId('  Muestra-3_A  '), 'Muestra-3_A');
});

test('normalizeRoomId rechaza espacios internos y símbolos', () => {
  assert.equal(normalizeRoomId('muestra 3A'), null);
  assert.equal(normalizeRoomId('../sala'), null);
  assert.equal(normalizeRoomId(''), null);
});

test('readRoomId prioriza la URL sobre el almacenamiento local', () => {
  const roomId = readRoomId({
    location: { search: '?room=sala-url' },
    storage: { getItem: () => 'sala-local' },
  });

  assert.equal(roomId, 'sala-url');
});

test('persistRoomId guarda el ID y normaliza el parámetro de URL', () => {
  let storedValue;
  let replacedUrl;

  const roomId = persistRoomId('muestra-2026', {
    location: { href: 'https://example.test/?sala=vieja' },
    storage: { setItem: (_key, value) => (storedValue = value) },
    history: { replaceState: (_state, _title, url) => (replacedUrl = String(url)) },
  });

  assert.equal(roomId, 'muestra-2026');
  assert.equal(storedValue, 'muestra-2026');
  assert.equal(replacedUrl, 'https://example.test/?room=muestra-2026');
});

test('la advertencia STL aparece solo al superar 100.000 polígonos', () => {
  assert.equal(assessPolygonCount(STL_POLYGON_WARNING_THRESHOLD).shouldWarn, false);
  assert.equal(assessPolygonCount(STL_POLYGON_WARNING_THRESHOLD + 1).shouldWarn, true);
});
