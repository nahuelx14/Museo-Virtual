import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_STL_BYTES,
  buildSTLStoragePath,
  shouldWarnPolygonCount,
  validateSTLFile,
} from '../src/backend/artworkStorage.js';

test('validateSTLFile acepta STL dentro del límite', () => {
  assert.deepEqual(validateSTLFile({ name: 'obra.STL', size: 1024 }), {
    name: 'obra.STL',
    size: 1024,
  });
});

test('validateSTLFile rechaza otra extensión y archivos demasiado grandes', () => {
  assert.throws(
    () => validateSTLFile({ name: 'obra.obj', size: 1024 }),
    /extensión \.stl/,
  );
  assert.throws(
    () => validateSTLFile({ name: 'obra.stl', size: MAX_STL_BYTES + 1 }),
    /50 MB/,
  );
});

test('buildSTLStoragePath genera una ruta estable y segura', () => {
  assert.equal(
    buildSTLStoragePath({
      roomId: 'muestra-2026',
      artworkId: 'obra_01',
      fileName: 'Árbol del río final.stl',
    }),
    'muestra-2026/obra_01/Arbol-del-rio-final.stl',
  );
});

test('la advertencia aparece solo por encima de 100.000 polígonos', () => {
  assert.equal(shouldWarnPolygonCount(100_000), false);
  assert.equal(shouldWarnPolygonCount(100_001), true);
});
