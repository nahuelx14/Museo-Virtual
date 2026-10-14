import * as THREE from 'three';
import {
  ARTWORKS,
  MUSEUM_SCENES,
  TABLE_SLOTS,
} from '../data/museumCatalog.js';
import { createRoomLayout } from '../anchors/roomPersistence.js';

const BASE_HEIGHT = 0.06;
const ARTWORK_Y = BASE_HEIGHT + 0.015;
const MIN_VISIBLE_DIMENSION_METERS = 0.01;
const MAX_VISIBLE_DIMENSION_METERS = 5;

export function createMuseumContent({
  scene,
  modelCache,
  resolveModelUrl = async (artwork) => artwork.modelUrl,
  onStatus = () => {},
}) {
  const roomRoot = new THREE.Group();
  roomRoot.name = 'contenido-sala';
  roomRoot.visible = false;
  scene.add(roomRoot);

  const baseGeometry = new THREE.CylinderGeometry(0.18, 0.2, BASE_HEIGHT, 36);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x153f31,
    metalness: 0.08,
    roughness: 0.62,
  });
  const accentGeometry = new THREE.RingGeometry(0.145, 0.17, 36);
  const accentMaterial = new THREE.MeshBasicMaterial({
    color: 0x72dbb4,
    side: THREE.DoubleSide,
  });
  const labelHitGeometry = new THREE.SphereGeometry(0.17, 12, 8);
  const labelHitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const slots = new Map();

  for (const definition of TABLE_SLOTS) {
    const root = new THREE.Group();
    root.name = definition.id;
    root.userData.slotId = definition.id;
    root.visible = false;

    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.name = `${definition.id}-base`;
    base.position.y = BASE_HEIGHT / 2;
    base.userData.slotId = definition.id;
    root.add(base);

    const accent = new THREE.Mesh(accentGeometry, accentMaterial);
    accent.name = `${definition.id}-acento`;
    accent.rotation.x = -Math.PI / 2;
    accent.position.y = BASE_HEIGHT + 0.001;
    accent.userData.slotId = definition.id;
    root.add(accent);

    const label = createLabelSprite(definition.label);
    label.sprite.name = `${definition.id}-etiqueta`;
    label.sprite.position.set(0, 0.16, 0);
    label.sprite.userData.slotId = definition.id;
    root.add(label.sprite);

    // El texto es un Sprite que siempre mira a la cámara. Usamos un volumen
    // invisible separado para que el cartel sea fácil de apuntar desde
    // cualquier ángulo con el controlador.
    const labelHitArea = new THREE.Mesh(labelHitGeometry, labelHitMaterial);
    labelHitArea.name = `${definition.id}-selector`;
    labelHitArea.position.copy(label.sprite.position);
    labelHitArea.userData.slotId = definition.id;
    root.add(labelHitArea);

    const artworkMount = new THREE.Group();
    artworkMount.name = `${definition.id}-obra`;
    artworkMount.position.y = ARTWORK_Y;
    artworkMount.userData.slotId = definition.id;
    root.add(artworkMount);

    roomRoot.add(root);
    slots.set(definition.id, {
      definition,
      root,
      artworkMount,
      artworkMesh: null,
      artworkId: null,
      placed: false,
      loadToken: 0,
      loadingArtworkId: null,
      loadingPromise: null,
      label,
      labelHitArea,
    });
  }

  let catalogScenes = MUSEUM_SCENES;
  let catalogArtworks = ARTWORKS;
  let activeSceneId = catalogScenes[0].id;

  function getMuseumScene(sceneId) {
    return catalogScenes.find((museumScene) => museumScene.id === sceneId) ?? null;
  }

  function getArtworkForSlot(sceneId, slotId) {
    const museumScene = getMuseumScene(sceneId);
    const artworkId = museumScene?.assignments?.[slotId];
    return artworkId ? catalogArtworks[artworkId] ?? null : null;
  }

  function setActiveScene(sceneId) {
    const nextScene = getMuseumScene(sceneId);

    if (!nextScene) {
      throw new Error(`La escena ${sceneId} no existe.`);
    }

    if (activeSceneId === sceneId) {
      return;
    }

    activeSceneId = sceneId;

    for (const slot of slots.values()) {
      slot.loadToken += 1;
      clearArtwork(slot);
    }

    onStatus(`${nextScene.name} activa. Las 10 posiciones físicas se conservan.`);
  }

  function placeSlotAtWorldPose(slotId, worldPosition, worldQuaternion) {
    const slot = slots.get(slotId);

    if (!slot) {
      throw new Error(`La mesa ${slotId} no existe.`);
    }

    roomRoot.updateWorldMatrix(true, false);

    const worldMatrix = new THREE.Matrix4().compose(
      worldPosition,
      worldQuaternion,
      new THREE.Vector3(1, 1, 1),
    );
    const localMatrix = roomRoot.matrixWorld.clone().invert().multiply(worldMatrix);
    localMatrix.decompose(slot.root.position, slot.root.quaternion, slot.root.scale);

    slot.placed = true;
    slot.root.visible = true;
    slot.root.updateMatrixWorld(true);

    return slot.definition;
  }

  async function loadSlotArtwork(slotId) {
    const slot = slots.get(slotId);

    if (!slot?.placed) {
      onStatus('Primero hay que colocar esa mesa mediante hit-test.');
      return null;
    }

    const activeScene = getMuseumScene(activeSceneId);
    const artwork = getArtworkForSlot(activeSceneId, slotId);

    if (!artwork) {
      onStatus(`${slot.definition.label} todavía no tiene una obra en ${activeScene.name}.`);
      return null;
    }

    if (slot.artworkId === artwork.id && slot.artworkMesh) {
      onStatus(`${artwork.name} ya está cargada.`);
      return slot.artworkMesh;
    }

    if (slot.loadingArtworkId === artwork.id && slot.loadingPromise) {
      return slot.loadingPromise;
    }

    const requestToken = ++slot.loadToken;
    const requestedSceneId = activeSceneId;
    clearArtwork(slot);
    onStatus(`Cargando ${artwork.name} bajo demanda…`);

    const loadingPromise = (async () => {
      const modelUrl = await resolveModelUrl(artwork);
      const result = await modelCache.createMesh({ ...artwork, modelUrl });

      if (requestToken !== slot.loadToken || requestedSceneId !== activeSceneId) {
        disposeMesh(result.mesh);
        return null;
      }

      result.mesh.userData.slotId = slotId;
      result.mesh.userData.artworkId = artwork.id;
      slot.artworkMount.add(result.mesh);
      slot.artworkMesh = result.mesh;
      slot.artworkId = artwork.id;
      slot.label.sprite.visible = false;

      const warning = result.shouldWarn
        ? ` Advertencia: contiene ${result.polygonCount.toLocaleString('es-AR')} polígonos.`
        : '';
      const scaleWarning = describeScaleWarning(result.sourceSize, result.mesh.scale);
      onStatus(
        `${artwork.name} reemplazó el cartel de ${slot.definition.label}.${warning}${scaleWarning}`,
      );

      return result.mesh;
    })().catch((error) => {
      if (requestToken === slot.loadToken) {
        slot.label.sprite.visible = true;
        onStatus(`No se pudo cargar ${artwork.name}: ${error.message ?? error}`);
      }

      return null;
    });

    slot.loadingArtworkId = artwork.id;
    slot.loadingPromise = loadingPromise;

    try {
      return await loadingPromise;
    } finally {
      if (slot.loadingPromise === loadingPromise) {
        slot.loadingArtworkId = null;
        slot.loadingPromise = null;
      }
    }
  }

  function clearArtwork(slot) {
    slot.label.sprite.visible = true;
    slot.loadingArtworkId = null;
    slot.loadingPromise = null;

    if (!slot.artworkMesh) {
      slot.artworkId = null;
      return;
    }

    slot.artworkMount.remove(slot.artworkMesh);
    disposeMesh(slot.artworkMesh);
    slot.artworkMesh = null;
    slot.artworkId = null;
  }

  function resetRoomRootTransform() {
    roomRoot.position.set(0, 0, 0);
    roomRoot.quaternion.identity();
    roomRoot.scale.set(1, 1, 1);
    roomRoot.updateMatrixWorld(true);
  }

  function resetSlots() {
    for (const slot of slots.values()) {
      slot.loadToken += 1;
      clearArtwork(slot);
      slot.placed = false;
      slot.root.visible = false;
      slot.root.position.set(0, 0, 0);
      slot.root.quaternion.identity();
      slot.root.scale.set(1, 1, 1);
    }
  }

  function applyLayout(layout) {
    resetSlots();

    if (!layout?.tables) {
      return 0;
    }

    let restored = 0;

    for (const [slotId, transform] of Object.entries(layout.tables)) {
      const slot = slots.get(slotId);

      if (!slot) {
        continue;
      }

      slot.root.position.fromArray(transform.position);
      slot.root.quaternion.fromArray(transform.quaternion).normalize();
      slot.root.scale.fromArray(transform.scale);
      slot.root.visible = true;
      slot.placed = true;
      restored += 1;
    }

    roomRoot.updateMatrixWorld(true);
    return restored;
  }

  function exportLayout() {
    const tables = {};

    for (const [slotId, slot] of slots) {
      if (!slot.placed) {
        continue;
      }

      tables[slotId] = {
        position: slot.root.position.toArray(),
        quaternion: slot.root.quaternion.toArray(),
        scale: slot.root.scale.toArray(),
      };
    }

    return createRoomLayout(tables);
  }

  return {
    roomRoot,
    attachRoomOrigin(parent) {
      parent.add(roomRoot);
      resetRoomRootTransform();
      roomRoot.visible = true;
    },
    detachRoomOrigin() {
      scene.add(roomRoot);
      resetRoomRootTransform();
      roomRoot.visible = false;
    },
    applyLayout,
    exportLayout,
    setCatalog(nextCatalog) {
      if (!Array.isArray(nextCatalog?.scenes) || nextCatalog.scenes.length === 0) {
        throw new Error('El catálogo debe contener al menos una escena.');
      }

      const previousScene = getMuseumScene(activeSceneId);
      const previousOrder = previousScene?.order ?? null;
      catalogScenes = nextCatalog.scenes;
      catalogArtworks = nextCatalog.artworks ?? {};

      const matchingScene = catalogScenes.find((museumScene) =>
        previousOrder === null ? false : museumScene.order === previousOrder,
      );
      activeSceneId = matchingScene?.id ?? catalogScenes[0].id;

      for (const slot of slots.values()) {
        slot.loadToken += 1;
        clearArtwork(slot);
      }

      return activeSceneId;
    },
    getScenes: () => catalogScenes,
    getActiveSceneId: () => activeSceneId,
    setActiveScene,
    getNextUnplacedSlotId() {
      return TABLE_SLOTS.find((definition) => !slots.get(definition.id).placed)?.id ?? null;
    },
    getPlacementProgress() {
      const placed = [...slots.values()].filter((slot) => slot.placed).length;
      return { placed, total: TABLE_SLOTS.length };
    },
    placeSlotAtWorldPose,
    loadSlotArtwork,
    resetSlots,
    resolveSlotId(object) {
      let current = object;

      while (current && current !== roomRoot) {
        if (current.userData.slotId) {
          return current.userData.slotId;
        }

        current = current.parent;
      }

      return null;
    },
    dispose() {
      for (const slot of slots.values()) {
        slot.loadToken += 1;
        clearArtwork(slot);
        slot.label.dispose();
      }

      baseGeometry.dispose();
      baseMaterial.dispose();
      accentGeometry.dispose();
      accentMaterial.dispose();
      labelHitGeometry.dispose();
      labelHitMaterial.dispose();
      modelCache.dispose();
      roomRoot.removeFromParent();
    },
  };
}

function createLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');

  context.fillStyle = 'rgba(5, 24, 18, 0.9)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#72dbb4';
  context.lineWidth = 8;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = '#f4fbf7';
  context.font = '700 54px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.32, 0.08, 1);
  // La selección se resuelve con el volumen invisible del slot; evitamos que
  // Sprite.raycast dependa de una cámara cuando el rayo nace del controlador.
  sprite.raycast = () => {};

  return {
    sprite,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export function describeScaleWarning(sourceSize, appliedScale) {
  if (!sourceSize || !appliedScale) {
    return '';
  }

  const dimensions = ['x', 'y', 'z'].map(
    (axis) => Number(sourceSize[axis]) * Number(appliedScale[axis]),
  );

  if (dimensions.some((value) => !Number.isFinite(value) || value < 0)) {
    return '';
  }

  const largestDimension = Math.max(...dimensions);

  if (largestDimension > MAX_VISIBLE_DIMENSION_METERS) {
    return ` Revisá la escala: el modelo mide aproximadamente ${formatMeters(largestDimension)} en su eje mayor.`;
  }

  if (largestDimension > 0 && largestDimension < MIN_VISIBLE_DIMENSION_METERS) {
    return ` Revisá la escala: el modelo mide aproximadamente ${formatMeters(largestDimension)} en su eje mayor.`;
  }

  return '';
}

function formatMeters(value) {
  if (value < 0.01) {
    return `${(value * 1000).toFixed(1)} mm`;
  }

  if (value < 1) {
    return `${(value * 100).toFixed(1)} cm`;
  }

  return `${value.toFixed(2)} m`;
}

function disposeMesh(mesh) {
  mesh.geometry?.dispose();

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((material) => material.dispose());
  } else {
    mesh.material?.dispose();
  }
}
