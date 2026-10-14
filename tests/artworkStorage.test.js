import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_STL_BYTES,
  buildSTLStoragePath,
  countSTLTriangles,
  inspectSTLFile,
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

test('countSTLTriangles reconoce STL binario y ASCII', () => {
  const binary = new ArrayBuffer(84 + 2 * 50);
  new DataView(binary).setUint32(80, 2, true);
  const ascii = new TextEncoder().encode(`
    solid ejemplo
      facet normal 0 0 1
      endfacet
      facet normal 0 1 0
      endfacet
      facet normal 1 0 0
      endfacet
    endsolid ejemplo
  `);

  assert.equal(countSTLTriangles(binary), 2);
  assert.equal(countSTLTriangles(ascii), 3);
});

test('inspectSTLFile devuelve el conteo y la advertencia antes de subir', async () => {
  const polygonCount = 100_001;
  const binary = new ArrayBuffer(84 + polygonCount * 50);
  new DataView(binary).setUint32(80, polygonCount, true);
  const result = await inspectSTLFile({
    name: 'obra-grande.stl',
    size: binary.byteLength,
    arrayBuffer: async () => binary,
  });

  assert.equal(result.polygonCount, polygonCount);
  assert.equal(result.shouldWarn, true);
});
