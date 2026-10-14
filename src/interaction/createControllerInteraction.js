import * as THREE from 'three';
import { ROOM_CALIBRATION_STATES } from '../anchors/createRoomCalibration.js';

const RAY_LENGTH_METERS = 4;

export function createControllerInteraction({
  scene,
  renderer,
  realityAccelerator,
  roomCalibration,
  museumContent,
  addFrameCallback,
  onStatus = () => {},
}) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = RAY_LENGTH_METERS;
  const rotationMatrix = new THREE.Matrix4();
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -RAY_LENGTH_METERS),
  ]);
  const rayMaterial = new THREE.LineBasicMaterial({ color: 0x72dbb4 });
  const reticleGeometry = new THREE.RingGeometry(0.045, 0.065, 36);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2b84b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;

  const statusPanel = createStatusPanel();
  let currentStatus = 'Ponete de frente al QR y apuntá al centro con el controlador derecho.';
  statusPanel.setText(currentStatus);

  let hitTestTarget = null;
  let hitTestPromise = null;
  let rightController = null;

  const controllers = [0, 1].map((index) => {
    const controller = renderer.xr.getController(index);
    const ray = new THREE.Line(rayGeometry, rayMaterial);
    ray.name = `rayo-controlador-${index}`;
    controller.add(ray);
    scene.add(controller);

    const onConnected = (event) => {
      controller.userData.handedness = event.data.handedness;

      if (event.data.handedness === 'left') {
        controller.add(statusPanel.sprite);
      }

      if (event.data.handedness === 'right') {
        rightController = controller;
        ensureHitTestTarget();
      }
    };

    const onDisconnected = () => {
      if (controller === rightController) {
        rightController = null;
        cleanupHitTestTarget();
      }

      controller.userData.handedness = null;
    };

    const onSelect = () => {
      handleSelect(controller).catch((error) => {
        report(`Error de interacción: ${error.message ?? error}`);
      });
    };

    controller.addEventListener('connected', onConnected);
    controller.addEventListener('disconnected', onDisconnected);
    controller.addEventListener('select', onSelect);

    return { controller, onConnected, onDisconnected, onSelect };
  });

  async function ensureHitTestTarget() {
    if (hitTestTarget || hitTestPromise || !rightController) {
      return;
    }

    hitTestPromise = realityAccelerator
      .createHitTestTargetFromControllerSpace('right')
      .then((target) => {
        if (!rightController || !renderer.xr.isPresenting) {
          realityAccelerator.deleteHitTestTarget(target);
          return;
        }

        hitTestTarget = target;
        hitTestTarget.add(reticle);

        if (roomCalibration.isReady()) {
          reportNextTableInstruction();
        } else if (roomCalibration.getState() === ROOM_CALIBRATION_STATES.RESTORING) {
          report('Buscando el anchor persistente de esta sala…');
        } else {
          report('Ponete de frente al QR, apuntá al centro y presioná el gatillo derecho.');
        }
      })
      .catch((error) => {
        report(`No se pudo iniciar el hit-test del controlador: ${error.message ?? error}`);
      })
      .finally(() => {
        hitTestPromise = null;
      });

    await hitTestPromise;
  }

  async function handleSelect(controller) {
    const selectedSlotId = roomCalibration.isReady() ? raycastSlot(controller) : null;

    if (selectedSlotId) {
      await museumContent.loadSlotArtwork(selectedSlotId);
      return;
    }

    if (controller.userData.handedness !== 'right') {
      report('Usá el controlador derecho para colocar las mesas.');
      return;
    }

    if (!hitTestTarget?.hitTestResultValid) {
      report(
        roomCalibration.isReady()
          ? 'No hay una superficie válida bajo el rayo. Volvé a apuntar a la mesa.'
          : 'No hay una superficie válida bajo el rayo. Volvé a apuntar al centro del QR.',
      );
      return;
    }

    if (!roomCalibration.isReady()) {
      const calibrationState = roomCalibration.getState();

      if (calibrationState === ROOM_CALIBRATION_STATES.RESTORING) {
        report('Todavía estamos buscando el anchor guardado. Esperá un instante.');
        return;
      }

      if (calibrationState === ROOM_CALIBRATION_STATES.CALIBRATING) {
        report('El origen ya se está guardando. Esperá un instante.');
        return;
      }

      if (calibrationState !== ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION) {
        report('La calibración todavía no está disponible. Salí y volvé a entrar a WebXR.');
        return;
      }

      const hitPosition = hitTestTarget.getWorldPosition(new THREE.Vector3());
      const controllerPosition = controller.getWorldPosition(new THREE.Vector3());
      await roomCalibration.requestCalibration({ hitPosition, controllerPosition });
      return;
    }

    const nextSlotId = museumContent.getNextUnplacedSlotId();

    if (!nextSlotId) {
      report('Las 10 mesas ya están colocadas. Apuntá a una base para cargar su obra.');
      return;
    }

    const worldPosition = hitTestTarget.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = hitTestTarget.getWorldQuaternion(new THREE.Quaternion());
    const placedSlot = museumContent.placeSlotAtWorldPose(
      nextSlotId,
      worldPosition,
      worldQuaternion,
    );
    const layoutSaved = roomCalibration.saveLayout();
    const progress = museumContent.getPlacementProgress();
    const next = museumContent.getNextUnplacedSlotId();

    if (next) {
      report(
        `${placedSlot.label} colocada (${progress.placed}/${progress.total}).${layoutSaved ? '' : ' No se pudo guardar localmente.'} Apuntá a la siguiente mesa.`,
      );
    } else {
      report(
        `Las 10 mesas quedaron colocadas.${layoutSaved ? '' : ' No se pudo guardar la distribución local.'} Apuntá a una base para cargar su obra.`,
      );
    }
  }

  function reportNextTableInstruction() {
    const nextSlotId = museumContent.getNextUnplacedSlotId();

    if (nextSlotId) {
      const tableNumber = Number(nextSlotId.slice(-2));
      report(`Origen listo. Apuntá a la Mesa ${tableNumber} y presioná el gatillo derecho.`);
    } else {
      report('Origen y 10 mesas restaurados. Apuntá a una base para cargar su obra.');
    }
  }

  function raycastSlot(controller) {
    controller.updateWorldMatrix(true, false);
    rotationMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotationMatrix).normalize();

    const intersections = raycaster.intersectObject(museumContent.roomRoot, true);

    for (const intersection of intersections) {
      const slotId = museumContent.resolveSlotId(intersection.object);

      if (slotId) {
        return slotId;
      }
    }

    return null;
  }

  function cleanupHitTestTarget() {
    reticle.visible = false;

    if (!hitTestTarget) {
      return;
    }

    reticle.removeFromParent();

    try {
      realityAccelerator.deleteHitTestTarget(hitTestTarget);
    } catch (error) {
      console.warn('No se pudo liberar el hit-test de RATK.', error);
    }

    hitTestTarget = null;
  }

  function report(message) {
    currentStatus = message;
    statusPanel.setText(message);
    onStatus(message);
  }

  const removeFrameCallback = addFrameCallback(() => {
    reticle.visible = Boolean(hitTestTarget?.hitTestResultValid);
  });

  const onSessionStart = () => {
    report(currentStatus);
  };
  const onSessionEnd = () => {
    cleanupHitTestTarget();
  };
  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  return {
    setStatus(message) {
      currentStatus = message;
      statusPanel.setText(message);
    },
    dispose() {
      removeFrameCallback();
      cleanupHitTestTarget();
      renderer.xr.removeEventListener('sessionstart', onSessionStart);
      renderer.xr.removeEventListener('sessionend', onSessionEnd);

      for (const { controller, onConnected, onDisconnected, onSelect } of controllers) {
        controller.removeEventListener('connected', onConnected);
        controller.removeEventListener('disconnected', onDisconnected);
        controller.removeEventListener('select', onSelect);
        controller.removeFromParent();
      }

      statusPanel.dispose();
      rayGeometry.dispose();
      rayMaterial.dispose();
      reticleGeometry.dispose();
      reticleMaterial.dispose();
    },
  };
}

function createStatusPanel() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'estado-controlador-izquierdo';
  sprite.position.set(0.18, 0.12, -0.34);
  sprite.scale.set(0.46, 0.153, 1);

  return {
    sprite,
    setText(message) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(5, 24, 18, 0.94)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#72dbb4';
      context.lineWidth = 8;
      context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
      context.fillStyle = '#f4fbf7';
      context.font = '600 42px system-ui, sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      drawWrappedText(context, message, 34, 32, canvas.width - 68, 54, 3);
      texture.needsUpdate = true;
    },
    dispose() {
      sprite.removeFromParent();
      texture.dispose();
      material.dispose();
    },
  };
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
    }
    line = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}
