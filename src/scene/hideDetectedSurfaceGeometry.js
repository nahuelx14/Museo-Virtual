export function hideDetectedSurfaceGeometry(realityAccelerator) {
  const previousPlaneAdded = realityAccelerator.onPlaneAdded;
  const previousMeshAdded = realityAccelerator.onMeshAdded;

  const hidePlane = (plane) => {
    if (plane?.planeMesh) {
      plane.planeMesh.visible = false;
    }
  };
  const hideMesh = (mesh) => {
    if (mesh?.meshMesh) {
      mesh.meshMesh.visible = false;
    }
  };

  for (const plane of realityAccelerator.planes ?? []) {
    hidePlane(plane);
  }

  for (const mesh of realityAccelerator.meshes ?? []) {
    hideMesh(mesh);
  }

  realityAccelerator.onPlaneAdded = (plane) => {
    previousPlaneAdded?.call(realityAccelerator, plane);
    hidePlane(plane);
  };
  realityAccelerator.onMeshAdded = (mesh) => {
    previousMeshAdded?.call(realityAccelerator, mesh);
    hideMesh(mesh);
  };
}
