import * as THREE from 'three';
import { ARButton, RealityAccelerator } from 'ratk';

const XR_SESSION_INIT = {
  // RATK 0.3 actualiza detectedPlanes y detectedMeshes en cada frame; deben
  // estar concedidas para evitar colecciones ausentes dentro del toolkit.
  requiredFeatures: ['hit-test', 'plane-detection', 'mesh-detection', 'anchors'],
  optionalFeatures: ['hand-tracking', 'local-floor'],
};

export function createMuseumScene({ mount }) {
  const frameCallbacks = new Set();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.01,
    50,
  );
  camera.position.set(0, 1.45, 3.2);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.domElement.className = 'xr-canvas';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  mount.prepend(renderer.domElement);

  const realityAccelerator = new RealityAccelerator(renderer.xr);
  scene.add(realityAccelerator.root);

  const hemisphereLight = new THREE.HemisphereLight(0xe8fff6, 0x183127, 2.2);
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);

  const preview = createDesktopPreview();
  scene.add(preview.root);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', onResize);

  renderer.xr.addEventListener('sessionstart', () => {
    preview.root.visible = false;
  });

  renderer.xr.addEventListener('sessionend', () => {
    preview.root.visible = true;
  });

  const timer = new THREE.Timer();
  timer.connect(document);

  renderer.setAnimationLoop((time, frame) => {
    timer.update(time);
    const elapsed = timer.getElapsed();
    preview.artwork.rotation.y = elapsed * 0.45;
    preview.artwork.position.y = 1.17 + Math.sin(elapsed * 1.2) * 0.04;
    realityAccelerator.update();

    for (const callback of frameCallbacks) {
      callback({ time, frame });
    }

    renderer.render(scene, camera);
  });

  return {
    scene,
    camera,
    renderer,
    realityAccelerator,
    addFrameCallback(callback) {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    bindXRButton(button) {
      button.disabled = false;
      ARButton.convertToARButton(button, renderer, {
        ...XR_SESSION_INIT,
        ENTER_XR_TEXT: 'Entrar a realidad mixta',
        LEAVE_XR_TEXT: 'Salir de realidad mixta',
        XR_NOT_SUPPORTED_TEXT: 'WebXR AR no compatible',
        XR_NOT_ALLOWED_TEXT: 'WebXR no permitido',
        onUnsupported() {
          button.disabled = true;
        },
        onNotAllowed() {
          button.disabled = true;
        },
        onFeaturesUnsupported(reason) {
          console.error('No se pudo iniciar WebXR con las funciones requeridas.', reason);
          button.textContent = 'Faltan funciones WebXR requeridas';
          button.title = String(reason?.message ?? reason ?? 'Error WebXR');
        },
      });
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      frameCallbacks.clear();
      preview.geometry.forEach((geometry) => geometry.dispose());
      preview.materials.forEach((material) => material.dispose());
      timer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function createDesktopPreview() {
  const root = new THREE.Group();
  root.position.set(1.35, -0.22, -0.2);
  root.rotation.y = -0.35;

  const baseGeometry = new THREE.CylinderGeometry(0.62, 0.72, 0.16, 48);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x153f31,
    metalness: 0.15,
    roughness: 0.5,
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.58;
  root.add(base);

  const ringGeometry = new THREE.TorusGeometry(0.5, 0.022, 12, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x72dbb4 });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.68;
  root.add(ring);

  const artworkGeometry = new THREE.IcosahedronGeometry(0.42, 1);
  const artworkMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2b84b,
    flatShading: true,
    metalness: 0.08,
    roughness: 0.4,
  });
  const artwork = new THREE.Mesh(artworkGeometry, artworkMaterial);
  artwork.position.y = 1.17;
  root.add(artwork);

  return {
    root,
    artwork,
    geometry: [baseGeometry, ringGeometry, artworkGeometry],
    materials: [baseMaterial, ringMaterial, artworkMaterial],
  };
}
