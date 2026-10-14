import './styles.css';
import { createRoomCalibration } from './anchors/createRoomCalibration.js';
import { readRoomId, persistRoomId } from './anchors/roomReference.js';
import { createAuthService } from './backend/authService.js';
import { getSupabaseClient, isSupabaseConfigured } from './backend/supabaseClient.js';
import { MUSEUM_SCENES } from './data/museumCatalog.js';
import { createControllerInteraction } from './interaction/createControllerInteraction.js';
import { STLModelCache } from './models/stlModelCache.js';
import { createMuseumContent } from './scene/createMuseumContent.js';
import { createMuseumScene } from './scene/createMuseumScene.js';
import { createStartPanel } from './ui/createStartPanel.js';

const app = document.querySelector('#app');

if (!app) {
  throw new Error('No se encontró el contenedor #app.');
}

const museumScene = createMuseumScene({ mount: document.body });
const modelCache = new STLModelCache({ maxEntries: 4 });

let startPanel;
let controllerInteraction;
let roomCalibration;
let authService;

function reportStatus(message) {
  startPanel?.setActivity(message);
  controllerInteraction?.setStatus(message);
}

const museumContent = createMuseumContent({
  scene: museumScene.scene,
  modelCache,
  onStatus: reportStatus,
});

let xrButtonBound = false;

startPanel = createStartPanel({
  root: app,
  initialRoomId: readRoomId(),
  scenes: MUSEUM_SCENES,
  initialSceneId: museumContent.getActiveSceneId(),
  onRoomChange(roomId) {
    persistRoomId(roomId);
    roomCalibration?.setForceRecalibration(false);
    startPanel.setRecalibrationRequested(false);
    bindXRButtonOnce();
  },
  onSceneChange(sceneId) {
    museumContent.setActiveScene(sceneId);
  },
  onRecalibrationChange(requested) {
    roomCalibration?.setForceRecalibration(requested);
  },
  async onAdminLogin(credentials) {
    if (!authService) {
      throw new Error('Configurá Supabase antes de ingresar como administrador.');
    }

    return authService.signInAsAdmin(credentials);
  },
  async onAdminLogout() {
    if (!authService) {
      return;
    }

    return authService.signOutAdmin();
  },
  async onPasswordResetRequest({ email }) {
    if (!authService) {
      throw new Error('Configurá Supabase antes de recuperar la contraseña.');
    }

    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = '';
    redirectUrl.searchParams.set('reset-password', '1');

    return authService.requestPasswordReset({
      email,
      redirectTo: redirectUrl.toString(),
    });
  },
  async onPasswordRecoveryComplete(passwords) {
    if (!authService) {
      throw new Error('No se pudo conectar con Supabase para actualizar la contraseña.');
    }

    const state = await authService.updateRecoveredPassword(passwords);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = '';
    cleanUrl.searchParams.delete('reset-password');
    window.history.replaceState(window.history.state, '', cleanUrl.toString());
    return state;
  },
});

async function initializeBackend() {
  if (!isSupabaseConfigured()) {
    startPanel.setAuthState({
      status: 'unconfigured',
      role: 'invitado',
      email: null,
      message: 'Demo local: faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    });
    return;
  }

  try {
    const client = await getSupabaseClient();
    authService = createAuthService({
      client,
      onStateChange(state) {
        startPanel.setAuthState(state);
      },
    });
    await authService.initialize();
  } catch (error) {
    startPanel.setAuthState({
      status: 'error',
      role: 'invitado',
      email: null,
      message: `${error.message} La experiencia continúa en modo local sin permisos de edición.`,
    });
  }
}

void initializeBackend();

roomCalibration = createRoomCalibration({
  renderer: museumScene.renderer,
  realityAccelerator: museumScene.realityAccelerator,
  museumContent,
  addFrameCallback: museumScene.addFrameCallback,
  getRoomId: startPanel.getRoomId,
  onStatus: reportStatus,
  onStateChange(_state, label) {
    startPanel.setCalibration(label);
  },
  onRecalibrationConsumed() {
    startPanel.setRecalibrationRequested(false);
  },
});

controllerInteraction = createControllerInteraction({
  scene: museumScene.scene,
  renderer: museumScene.renderer,
  realityAccelerator: museumScene.realityAccelerator,
  roomCalibration,
  museumContent,
  addFrameCallback: museumScene.addFrameCallback,
  onStatus(message) {
    startPanel.setActivity(message);
  },
});

function bindXRButtonOnce() {
  if (xrButtonBound || !startPanel.getRoomId()) {
    return;
  }

  museumScene.bindXRButton(startPanel.xrButton);
  xrButtonBound = true;
}

bindXRButtonOnce();

museumScene.renderer.xr.addEventListener('sessionstart', () => {
  startPanel.setSessionActive(true);
});

museumScene.renderer.xr.addEventListener('sessionend', () => {
  startPanel.setSessionActive(false);
});

window.addEventListener(
  'beforeunload',
  () => {
    controllerInteraction.dispose();
    roomCalibration.dispose();
    authService?.dispose();
    museumContent.dispose();
    museumScene.dispose();
  },
  { once: true },
);
