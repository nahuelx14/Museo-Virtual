import './styles.css';
import { createRoomCalibration } from './anchors/createRoomCalibration.js';
import { removeRoomLayout } from './anchors/roomPersistence.js';
import { readRoomId, persistRoomId } from './anchors/roomReference.js';
import { createAuthService, USER_ROLES } from './backend/authService.js';
import { inspectSTLFile } from './backend/artworkStorage.js';
import { createMuseumCatalogService } from './backend/museumCatalogService.js';
import { getSupabaseClient, isSupabaseConfigured } from './backend/supabaseClient.js';
import { MUSEUM_SCENES } from './data/museumCatalog.js';
import { createControllerInteraction } from './interaction/createControllerInteraction.js';
import { STLModelCache } from './models/stlModelCache.js';
import { createMuseumContent } from './scene/createMuseumContent.js';
import { createMuseumScene } from './scene/createMuseumScene.js';
import { createAdminCatalogPanel } from './ui/createAdminCatalogPanel.js';
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
let catalogService;
let adminCatalogPanel;
let currentCatalog = null;
let catalogRefreshVersion = 0;
let authState = {
  status: 'idle',
  role: USER_ROLES.GUEST,
};

function reportStatus(message) {
  startPanel?.setActivity(message);
  controllerInteraction?.setStatus(message);
}

const museumContent = createMuseumContent({
  scene: museumScene.scene,
  modelCache,
  async resolveModelUrl(artwork) {
    if (artwork.modelUrl) {
      return artwork.modelUrl;
    }

    if (!catalogService) {
      throw new Error('El catálogo de Supabase todavía no está disponible.');
    }

    return catalogService.getArtworkModelUrl(artwork);
  },
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
    currentCatalog = null;
    catalogService?.clearSignedUrlCache();
    adminCatalogPanel?.setRoomId(roomId);
    roomCalibration?.setForceRecalibration(false);
    startPanel.setRecalibrationRequested(false);
    bindXRButtonOnce();

    if (catalogService && authState.status === 'ready') {
      void refreshCatalog().catch(() => {});
    }
  },
  onSceneChange(sceneId) {
    adminCatalogPanel?.setSceneId(sceneId);
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

adminCatalogPanel = createAdminCatalogPanel({
  root: startPanel.adminCatalogRoot,
  async onCreateRoom({ roomId, name, isPublished }) {
    requireAdminAccess();
    startPanel.setRoomAvailability('loading');
    const catalog = await catalogService.createRoom({
      slug: roomId,
      name,
      isPublished,
    });
    applyCatalog(catalog);
  },
  onInspectFile: inspectSTLFile,
  async onUploadArtwork(artwork) {
    requireAdminCatalog();
    await catalogService.uploadArtwork({ catalog: currentCatalog, ...artwork });
    await refreshCatalog({ successMessage: 'Obra cargada y disponible para asignar.' });
  },
  async onUpdateArtwork(artwork) {
    requireAdminCatalog();
    await catalogService.updateArtwork({
      catalog: currentCatalog,
      ...artwork,
    });
    await refreshCatalog({ successMessage: 'Datos de la obra actualizados.' });
  },
  async onSaveAssignments({ sceneId, assignments }) {
    requireAdminCatalog();
    await catalogService.saveAssignments({
      catalog: currentCatalog,
      sceneId,
      assignments,
    });
    await refreshCatalog({ successMessage: 'Asignaciones guardadas para esta escena.' });
  },
  async onResetLayout() {
    requireAdminCatalog();
    const removed = removeRoomLayout(startPanel.getRoomId());

    if (!removed) {
      throw new Error('El navegador no permitió borrar la distribución local.');
    }

    museumContent.resetSlots();
    reportStatus('Distribución local borrada. Al entrar como admin, colocá Mesa 1 a Mesa 10.');
  },
  onRefresh: () => refreshCatalog(),
});
adminCatalogPanel.setRole(authState.role);
adminCatalogPanel.setRoomId(startPanel.getRoomId());

async function initializeBackend() {
  if (!isSupabaseConfigured()) {
    startPanel.setRoomAvailability('local');
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
    catalogService = createMuseumCatalogService({ client });
    authService = createAuthService({
      client,
      onStateChange(state) {
        authState = state;
        startPanel.setAuthState(state);
        adminCatalogPanel.setRole(state.role);

        if (state.status === 'ready') {
          void refreshCatalog().catch(() => {});
        }
      },
    });
    await authService.initialize();
  } catch (error) {
    startPanel.setRoomAvailability('error');
    startPanel.setAuthState({
      status: 'error',
      role: 'invitado',
      email: null,
      message: `${error.message} No se habilitó el catálogo remoto.`,
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
  getIsAdmin: () => authState.role === USER_ROLES.ADMIN,
  onSceneChange() {
    // La escena visible se elige dentro de XR. La selección de edición de la
    // landing se conserva de forma independiente.
  },
  onStatus(message) {
    startPanel.setActivity(message);
  },
});

async function refreshCatalog({ successMessage = null } = {}) {
  const roomId = startPanel.getRoomId();

  if (!catalogService || authState.status !== 'ready' || !roomId) {
    return null;
  }

  const refreshVersion = ++catalogRefreshVersion;
  startPanel.setRoomAvailability('loading');
  adminCatalogPanel.setLoading(`Leyendo la sala ${roomId} desde Supabase…`);

  try {
    const catalog = await catalogService.loadRoom(roomId);

    if (refreshVersion !== catalogRefreshVersion || roomId !== startPanel.getRoomId()) {
      return null;
    }

    if (!catalog) {
      currentCatalog = null;
      startPanel.setRoomAvailability('missing');

      if (authState.role === USER_ROLES.ADMIN) {
        adminCatalogPanel.setMissingRoom(roomId);
        reportStatus(`La sala ${roomId} todavía no existe. Creala desde el panel admin.`);
      } else {
        reportStatus(`La sala ${roomId} no existe o todavía no está publicada.`);
      }

      return null;
    }

    if (!catalog.isComplete) {
      currentCatalog = catalog;
      startPanel.setRoomAvailability('error');
      adminCatalogPanel.setCatalog(catalog, catalog.scenes[0]?.id ?? null);
      reportStatus('La sala está incompleta en Supabase: deben existir 10 mesas y tres escenas.');
      return catalog;
    }

    applyCatalog(catalog);

    if (successMessage) {
      adminCatalogPanel.setMessage(successMessage, 'ok');
      reportStatus(successMessage);
    }

    return catalog;
  } catch (error) {
    if (refreshVersion === catalogRefreshVersion) {
      startPanel.setRoomAvailability('error');
      adminCatalogPanel.setMessage(error.message, 'error');
      reportStatus(`No se pudo cargar la sala: ${error.message}`);
    }

    throw error;
  }
}

function applyCatalog(catalog) {
  const editingSceneId = startPanel.getSceneId();
  currentCatalog = catalog;
  museumContent.setCatalog(catalog);
  const selectedSceneId = startPanel.setScenes(catalog.scenes, editingSceneId);
  adminCatalogPanel.setCatalog(catalog, selectedSceneId);
  controllerInteraction?.refreshSceneMenu();
  startPanel.setRoomAvailability('ready');
  reportStatus(
    `${catalog.room.name}: ${catalog.artworkList.length} obras disponibles. Dentro del casco elegí la escena desde el controlador izquierdo.`,
  );
}

function requireAdminCatalog() {
  requireAdminAccess();

  if (!currentCatalog) {
    throw new Error('Primero prepará y cargá la sala actual.');
  }
}

function requireAdminAccess() {
  if (authState.role !== USER_ROLES.ADMIN || !catalogService) {
    throw new Error('Esta acción requiere una sesión de administrador.');
  }
}

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
