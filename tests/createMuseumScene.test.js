import test from 'node:test';
import assert from 'node:assert/strict';
import { hideDetectedSurfaceGeometry } from '../src/scene/hideDetectedSurfaceGeometry.js';

test('oculta la geometría de diagnóstico de RATK sin desactivar la detección', () => {
  const existingPlane = { planeMesh: { visible: true } };
  const existingMesh = { meshMesh: { visible: true } };
  let planeCallbackCalls = 0;
  let meshCallbackCalls = 0;
  const realityAccelerator = {
    planes: new Set([existingPlane]),
    meshes: new Set([existingMesh]),
    onPlaneAdded() {
      planeCallbackCalls += 1;
    },
    onMeshAdded() {
      meshCallbackCalls += 1;
    },
  };

  hideDetectedSurfaceGeometry(realityAccelerator);

  assert.equal(existingPlane.planeMesh.visible, false);
  assert.equal(existingMesh.meshMesh.visible, false);

  const addedPlane = { planeMesh: { visible: true } };
  const addedMesh = { meshMesh: { visible: true } };
  realityAccelerator.onPlaneAdded(addedPlane);
  realityAccelerator.onMeshAdded(addedMesh);

  assert.equal(addedPlane.planeMesh.visible, false);
  assert.equal(addedMesh.meshMesh.visible, false);
  assert.equal(planeCallbackCalls, 1);
  assert.equal(meshCallbackCalls, 1);
});
