import * as THREE from 'three';
import {
  readRoomAnchorId,
  readRoomLayout,
  removeRoomAnchorId,
  writeRoomAnchorId,
  writeRoomLayout,
} from './roomPersistence.js';

const UP = new THREE.Vector3(0, 1, 0);
const DIRECTION_EPSILON = 0.0001;

export const ROOM_CALIBRATION_STATES = Object.freeze({
  OUTSIDE_XR: 'outside-xr',
  RESTORING: 'restoring',
  AWAITING_CONFIRMATION: 'awaiting-confirmation',
  CALIBRATING: 'calibrating',
  READY: 'ready',
});

export function createRoomCalibration({
  renderer,
  realityAccelerator,
  museumContent,
  addFrameCallback,
  getRoomId,
  onStatus = () => {},
  onStateChange = () => {},
  onRecalibrationConsumed = () => {},
  storage = window.localStorage,
}) {
  let state = ROOM_CALIBRATION_STATES.OUTSIDE_XR;
  let observedSession = null;
  let preparingSession = null;
  let activeAnchor = null;
  let pendingReplacementAnchor = null;
  let forceRecalibration = false;
  let calibrationRequest = null;
  let disposed = false;

  function setState(nextState, label) {
    state = nextState;
    onStateChange(nextState, label);
  }

  function report(message) {
    onStatus(message);
  }

  async function prepareSession(session) {
    const roomId = getRoomId();

    if (!roomId) {
      setState(ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION, 'Falta sala');
      report('No se puede calibrar sin un ID de sala válido.');
      return;
    }

    museumContent.detachRoomOrigin();
    activeAnchor = null;
    pendingReplacementAnchor = null;
    setState(ROOM_CALIBRATION_STATES.RESTORING, 'Buscando anchor');
    report(`Buscando el origen guardado de la sala ${roomId}…`);

    const storedAnchorId = readRoomAnchorId(roomId, { storage });
    let restoreSupported = true;

    try {
      await realityAccelerator.restorePersistentAnchors();
    } catch (error) {
      restoreSupported = false;
      console.warn('La restauración de anchors persistentes no está disponible.', error);
    }

    if (disposed || renderer.xr.getSession() !== session) {
      return;
    }

    const restoredAnchor = storedAnchorId
      ? [...realityAccelerator.persistentAnchors].find(
          (anchor) => anchor.anchorID === storedAnchorId,
        ) ?? null
      : null;

    if (storedAnchorId && !restoredAnchor && restoreSupported) {
      removeRoomAnchorId(roomId, { storage });
    }

    if (forceRecalibration) {
      pendingReplacementAnchor = restoredAnchor;
      forceRecalibration = false;
      onRecalibrationConsumed();
      setState(ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION, 'Recalibración requerida');
      reportCalibrationInstructions('Recalibración solicitada.');
      return;
    }

    if (restoredAnchor) {
      activeAnchor = restoredAnchor;
      museumContent.attachRoomOrigin(restoredAnchor);
      const restoredTables = restoreLayout(roomId);
      setState(ROOM_CALIBRATION_STATES.READY, 'Anchor restaurado');
      reportReady(restoredTables, true);
      return;
    }

    setState(
      ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION,
      restoreSupported ? 'Calibración requerida' : 'Persistencia no disponible',
    );
    reportCalibrationInstructions(
      restoreSupported
        ? 'No hay un origen guardado para esta sala.'
        : 'Este navegador no pudo restaurar anchors persistentes.',
    );
  }

  function reportCalibrationInstructions(prefix) {
    report(
      `${prefix} Ponete de frente al QR, apuntá al centro y presioná el gatillo derecho.`,
    );
  }

  function requestCalibration({ hitPosition, controllerPosition }) {
    if (state !== ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION) {
      return Promise.resolve(false);
    }

    if (calibrationRequest) {
      return calibrationRequest.promise;
    }

    const request = createDeferred();
    calibrationRequest = {
      hitPosition: hitPosition.clone(),
      controllerPosition: controllerPosition.clone(),
      promise: request.promise,
      resolve: request.resolve,
    };
    setState(ROOM_CALIBRATION_STATES.CALIBRATING, 'Guardando origen');
    report('Confirmación recibida. Guardando el origen de la sala…');
    return request.promise;
  }

  async function performPendingCalibration(request) {
    const session = renderer.xr.getSession();
    const roomId = getRoomId();

    if (!session || !roomId) {
      request.resolve(false);
      return;
    }

    try {
      const worldQuaternion = deriveRoomOriginQuaternion(
        request.controllerPosition,
        request.hitPosition,
      );
      const localPosition = realityAccelerator.root.worldToLocal(request.hitPosition.clone());
      const rootWorldQuaternion = realityAccelerator.root.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      const localQuaternion = rootWorldQuaternion.invert().multiply(worldQuaternion);
      const anchor = await realityAccelerator.createAnchor(
        localPosition,
        localQuaternion,
        false,
      );

      if (disposed || renderer.xr.getSession() !== session) {
        request.resolve(false);
        return;
      }

      let persistenceMessage = ' El anchor permanecerá durante esta sesión.';
      let persisted = false;

      try {
        await anchor.makePersistent();
        persisted = writeRoomAnchorId(roomId, anchor.anchorID, { storage });
        persistenceMessage = persisted
          ? ' El anchor quedó guardado en este visor.'
          : ' El anchor es persistente, pero el navegador bloqueó su asociación local con la sala.';
      } catch (error) {
        console.warn('No se pudo hacer persistente el anchor de sala.', error);
      }

      activeAnchor = anchor;
      museumContent.attachRoomOrigin(anchor);
      const restoredTables = restoreLayout(roomId);
      setState(ROOM_CALIBRATION_STATES.READY, persisted ? 'Anchor guardado' : 'Anchor de sesión');

      let replacementMessage = '';

      if (persisted && pendingReplacementAnchor && pendingReplacementAnchor !== anchor) {
        try {
          await realityAccelerator.deleteAnchor(pendingReplacementAnchor);
        } catch (error) {
          console.warn('No se pudo borrar el anchor persistente reemplazado.', error);
          replacementMessage = ' El anchor anterior no pudo eliminarse y requiere revisión.';
        }
      }

      pendingReplacementAnchor = null;
      report(
        `Origen confirmado en el QR.${persistenceMessage}${replacementMessage}${describeRestoredTables(restoredTables)}`,
      );
      request.resolve(true);
    } catch (error) {
      setState(ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION, 'Reintentar calibración');
      report(`No se pudo fijar el origen: ${error.message ?? error}. Volvé a apuntar al QR.`);
      request.resolve(false);
    }
  }

  function restoreLayout(roomId) {
    const layout = readRoomLayout(roomId, { storage });
    return museumContent.applyLayout(layout);
  }

  function reportReady(restoredTables, restoredAnchor) {
    const anchorMessage = restoredAnchor
      ? 'Origen persistente restaurado en este visor.'
      : 'Origen de sala listo.';
    report(`${anchorMessage}${describeRestoredTables(restoredTables)}`);
  }

  function saveLayout() {
    const roomId = getRoomId();

    if (!roomId || state !== ROOM_CALIBRATION_STATES.READY) {
      return false;
    }

    return writeRoomLayout(roomId, museumContent.exportLayout(), { storage });
  }

  const removeFrameCallback = addFrameCallback(() => {
    const session = renderer.xr.getSession();

    if (!session || disposed) {
      return;
    }

    if (session !== observedSession && !preparingSession) {
      observedSession = session;
      preparingSession = prepareSession(session)
        .catch((error) => {
          if (!disposed && renderer.xr.getSession() === session) {
            setState(ROOM_CALIBRATION_STATES.AWAITING_CONFIRMATION, 'Reintentar calibración');
            report(
              `No se pudo preparar la sala: ${error.message ?? error}. Apuntá al QR para recalibrar.`,
            );
          }
        })
        .finally(() => {
          preparingSession = null;
        });
    }

    if (calibrationRequest && state === ROOM_CALIBRATION_STATES.CALIBRATING) {
      const request = calibrationRequest;
      calibrationRequest = null;
      performPendingCalibration(request);
    }
  });

  const onSessionEnd = () => {
    observedSession = null;
    activeAnchor = null;
    pendingReplacementAnchor = null;
    museumContent.detachRoomOrigin();
    setState(ROOM_CALIBRATION_STATES.OUTSIDE_XR, 'Fuera de XR');

    if (calibrationRequest) {
      calibrationRequest.resolve(false);
      calibrationRequest = null;
    }
  };
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  setState(ROOM_CALIBRATION_STATES.OUTSIDE_XR, 'Pendiente');

  return {
    getState: () => state,
    isReady: () => state === ROOM_CALIBRATION_STATES.READY,
    requestCalibration,
    saveLayout,
    setForceRecalibration(value) {
      forceRecalibration = Boolean(value);
    },
    dispose() {
      disposed = true;
      removeFrameCallback();
      renderer.xr.removeEventListener('sessionend', onSessionEnd);
      museumContent.detachRoomOrigin();

      if (calibrationRequest) {
        calibrationRequest.resolve(false);
        calibrationRequest = null;
      }
    },
  };
}

export function deriveRoomOriginQuaternion(controllerPosition, hitPosition) {
  const directionIntoRoom = controllerPosition.clone().sub(hitPosition);
  directionIntoRoom.y = 0;

  if (directionIntoRoom.lengthSq() < DIRECTION_EPSILON * DIRECTION_EPSILON) {
    throw new Error('No se pudo determinar hacia dónde mira el QR');
  }

  directionIntoRoom.normalize();
  const yaw = Math.atan2(directionIntoRoom.x, directionIntoRoom.z);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw);
}

function describeRestoredTables(count) {
  if (count === 0) {
    return ' Ahora apuntá a la Mesa 1 para colocarla.';
  }

  return ` Se reconstruyeron ${count} de 10 mesas.`;
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
