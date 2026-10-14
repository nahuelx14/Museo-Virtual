import * as THREE from 'three';

const MENU_X = 0.18;
const MENU_Z = -0.34;
const BUTTON_WIDTH = 0.46;
const BUTTON_HEIGHT = 0.068;
const BUTTON_GAP = 0.012;

export function createSceneMenu({ scenes = [], activeSceneId = null } = {}) {
  const group = new THREE.Group();
  group.name = 'menu-escenas-controlador-izquierdo';
  group.position.set(MENU_X, -0.015, MENU_Z);

  const geometry = new THREE.PlaneGeometry(1, 1);
  let buttons = [];
  let header = null;
  let currentScenes = [];
  let currentSceneId = null;

  function setScenes(nextScenes, preferredSceneId = currentSceneId) {
    clearPanels();
    currentScenes = Array.isArray(nextScenes) ? [...nextScenes] : [];
    currentSceneId = currentScenes.some((scene) => scene.id === preferredSceneId)
      ? preferredSceneId
      : currentScenes[0]?.id ?? null;
    group.visible = currentScenes.length > 0;

    if (!group.visible) {
      return currentSceneId;
    }

    header = createTextPanel({
      geometry,
      text: 'ELEGIR ESCENA',
      width: BUTTON_WIDTH,
      height: 0.052,
      header: true,
    });
    header.mesh.position.y = 0;
    header.mesh.raycast = () => {};
    group.add(header.mesh);

    buttons = currentScenes.map((scene, index) => {
      const panel = createTextPanel({
        geometry,
        text: scene.name,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        active: scene.id === currentSceneId,
      });
      panel.mesh.name = `escena-${scene.id}`;
      panel.mesh.position.y = -0.064 - index * (BUTTON_HEIGHT + BUTTON_GAP);
      panel.mesh.userData.sceneId = scene.id;
      group.add(panel.mesh);
      return { ...panel, scene };
    });

    return currentSceneId;
  }

  function setActiveScene(sceneId) {
    if (!currentScenes.some((scene) => scene.id === sceneId)) {
      return false;
    }

    currentSceneId = sceneId;

    for (const button of buttons) {
      button.setActive(button.scene.id === sceneId);
    }

    return true;
  }

  function raycast(raycaster) {
    group.updateWorldMatrix(true, true);
    const intersections = raycaster.intersectObjects(
      buttons.map((button) => button.mesh),
      false,
    );
    return intersections[0]?.object?.userData?.sceneId ?? null;
  }

  function getScene(sceneId) {
    return currentScenes.find((scene) => scene.id === sceneId) ?? null;
  }

  function clearPanels() {
    header?.dispose();
    header = null;

    for (const button of buttons) {
      button.dispose();
    }

    buttons = [];
    group.clear();
  }

  setScenes(scenes, activeSceneId);

  return {
    group,
    setScenes,
    setActiveScene,
    getScene,
    raycast,
    dispose() {
      group.removeFromParent();
      clearPanels();
      geometry.dispose();
    },
  };
}

function createTextPanel({ geometry, text, width, height, active = false, header = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = header ? 96 : 128;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(width, height, 1);
  mesh.renderOrder = 1000;

  function draw(isActive = false) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = header
      ? 'rgba(5, 24, 18, 0.96)'
      : isActive
        ? 'rgba(242, 184, 75, 0.96)'
        : 'rgba(15, 52, 40, 0.96)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = header ? '#72dbb4' : isActive ? '#ffe0a0' : '#72dbb4';
    context.lineWidth = 7;
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = isActive ? '#241703' : '#f4fbf7';
    context.font = header
      ? '800 36px system-ui, sans-serif'
      : '750 42px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 46);
    texture.needsUpdate = true;
  }

  draw(active);

  return {
    mesh,
    setActive: draw,
    dispose() {
      mesh.removeFromParent();
      texture.dispose();
      material.dispose();
    },
  };
}
