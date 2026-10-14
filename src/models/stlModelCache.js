import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { assessPolygonCount } from './modelPolicy.js';

export class STLModelCache {
  constructor({ maxEntries = 4, loader = new STLLoader() } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError('maxEntries debe ser un entero positivo.');
    }

    this.maxEntries = maxEntries;
    this.loader = loader;
    this.records = new Map();
    this.useCounter = 0;
  }

  async load(modelUrl) {
    if (typeof modelUrl !== 'string' || modelUrl.trim() === '') {
      throw new TypeError('La URL del STL es obligatoria.');
    }

    const cached = this.records.get(modelUrl);

    if (cached) {
      cached.lastUsed = ++this.useCounter;
      return cached.promise;
    }

    const record = {
      lastUsed: ++this.useCounter,
      promise: this.loader.loadAsync(modelUrl).then(prepareSTLGeometry),
    };

    this.records.set(modelUrl, record);

    try {
      const result = await record.promise;
      this.evictUnused(modelUrl);
      return result;
    } catch (error) {
      this.records.delete(modelUrl);
      throw error;
    }
  }

  async createMesh(artwork) {
    const asset = await this.load(artwork.modelUrl);
    const geometry = asset.geometry.clone();
    const material = new THREE.MeshStandardMaterial({
      color: artwork.color ?? 0x72dbb4,
      metalness: 0.08,
      roughness: 0.48,
      // Los STL escolares pueden traer winding o normales inconsistentes.
      // DoubleSide evita que un modelo válido quede invisible desde afuera.
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const scale = normalizeArtworkScale(artwork.scale);

    mesh.name = `obra-${artwork.id}`;
    mesh.scale.set(scale.x, scale.y, scale.z);

    return {
      mesh,
      polygonCount: asset.polygonCount,
      shouldWarn: asset.shouldWarn,
      sourceSize: asset.sourceSize.clone(),
    };
  }

  evictUnused(protectedUrl) {
    while (this.records.size > this.maxEntries) {
      const candidates = [...this.records.entries()]
        .filter(([url]) => url !== protectedUrl)
        .sort(([, first], [, second]) => first.lastUsed - second.lastUsed);
      const oldest = candidates[0];

      if (!oldest) {
        return;
      }

      const [url, record] = oldest;
      this.records.delete(url);
      record.promise.then(({ geometry }) => geometry.dispose()).catch(() => {});
    }
  }

  dispose() {
    for (const record of this.records.values()) {
      record.promise.then(({ geometry }) => geometry.dispose()).catch(() => {});
    }

    this.records.clear();
  }
}

export function countGeometryTriangles(geometry) {
  const position = geometry.getAttribute('position');

  if (!position) {
    return 0;
  }

  const elementCount = geometry.index?.count ?? position.count;
  return Math.floor(elementCount / 3);
}

export function prepareSTLGeometry(geometry) {
  const position = geometry.getAttribute('position');

  if (!position || position.count < 3) {
    geometry.dispose();
    throw new Error('El STL no contiene triángulos renderizables.');
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const sourceSize = geometry.boundingBox.getSize(new THREE.Vector3());
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const floorY = geometry.boundingBox.min.y;

  geometry.translate(-center.x, -floorY, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const polygonCount = countGeometryTriangles(geometry);
  const { shouldWarn } = assessPolygonCount(polygonCount);

  return {
    geometry,
    polygonCount,
    shouldWarn,
    sourceSize,
  };
}

function normalizeArtworkScale(scale) {
  if (Number.isFinite(scale) && scale > 0) {
    return new THREE.Vector3(scale, scale, scale);
  }

  if (
    scale &&
    Number.isFinite(scale.x) &&
    Number.isFinite(scale.y) &&
    Number.isFinite(scale.z) &&
    scale.x > 0 &&
    scale.y > 0 &&
    scale.z > 0
  ) {
    return new THREE.Vector3(scale.x, scale.y, scale.z);
  }

  throw new TypeError('La escala de la obra debe ser positiva y explícita.');
}
