import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  countGeometryTriangles,
  prepareSTLGeometry,
  STLModelCache,
} from '../src/models/stlModelCache.js';

test('prepareSTLGeometry centra X/Z y apoya el modelo sobre Y=0', () => {
  const geometry = createTriangleGeometry();
  const result = prepareSTLGeometry(geometry);
  const center = result.geometry.boundingBox.getCenter(new THREE.Vector3());

  assert.equal(result.polygonCount, 1);
  assert.equal(result.shouldWarn, false);
  assert.equal(result.geometry.boundingBox.min.y, 0);
  assert.equal(center.x, 0);
  assert.equal(center.z, 0);

  result.geometry.dispose();
});

test('STLModelCache no vuelve a descargar una URL ya almacenada', async () => {
  let requests = 0;
  const loader = {
    async loadAsync() {
      requests += 1;
      return createTriangleGeometry();
    },
  };
  const cache = new STLModelCache({ maxEntries: 2, loader });
  const artwork = {
    id: 'prueba',
    modelUrl: '/modelo.stl',
    scale: 1,
    color: 0xffffff,
  };

  const first = await cache.createMesh(artwork);
  const second = await cache.createMesh(artwork);

  assert.equal(requests, 1);
  assert.notEqual(first.mesh.geometry, second.mesh.geometry);
  assert.equal(countGeometryTriangles(first.mesh.geometry), 1);

  first.mesh.geometry.dispose();
  first.mesh.material.dispose();
  second.mesh.geometry.dispose();
  second.mesh.material.dispose();
  cache.dispose();
});

function createTriangleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        2, 4, -1,
        4, 4, -1,
        3, 6, 1,
      ],
      3,
    ),
  );
  return geometry;
}
