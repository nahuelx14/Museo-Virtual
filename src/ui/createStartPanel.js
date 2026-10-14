import { normalizeRoomId } from '../anchors/roomReference.js';

export function createStartPanel({
  root,
  initialRoomId,
  scenes,
  initialSceneId,
  onRoomChange,
  onSceneChange,
  onRecalibrationChange,
  onAdminLogin,
  onAdminLogout,
  onPasswordResetRequest,
  onPasswordRecoveryComplete,
}) {
  const sceneOptions = scenes
    .map((scene) => `<option value="${scene.id}">${scene.name}</option>`)
    .join('');

  root.innerHTML = `
    <main class="landing">
      <section class="landing__card" aria-labelledby="page-title">
        <p class="eyebrow">Muestra escolar · Meta Quest 3</p>
        <h1 id="page-title">Museo XR</h1>
        <p class="lede">
          Ingresá la sala indicada por el QR maestro. Después, desde el visor,
          podrás iniciar la experiencia de realidad mixta.
        </p>

        <form class="room-form" novalidate>
          <label for="room-id">ID de sala</label>
          <div class="room-form__row">
            <input
              id="room-id"
              name="room"
              maxlength="64"
              autocomplete="off"
              placeholder="ejemplo: muestra-3a"
              spellcheck="false"
            />
            <button class="button button--secondary" type="submit">
              Usar sala
            </button>
          </div>
          <p class="form-message" role="status" aria-live="polite"></p>
        </form>

        <div class="scene-control" data-admin="scene-editor" hidden>
          <label for="scene-id">Escena que estás editando</label>
          <select id="scene-id" name="scene">
            ${sceneOptions}
          </select>
          <p>
            Acá asignás las obras. La escena visible se elige desde el menú del casco.
          </p>
        </div>

        <section class="auth-control" aria-labelledby="auth-title">
          <div class="auth-control__heading">
            <div>
              <span id="auth-title">Acceso</span>
              <strong data-auth="role">Conectando</strong>
            </div>
            <span class="role-badge" data-auth="badge">Invitado</span>
          </div>
          <p data-auth="message" role="status" aria-live="polite">
            Preparando acceso de invitado…
          </p>

          <button
            class="button button--quiet"
            data-auth="open-login"
            type="button"
            hidden
          >
            Acceso administrador
          </button>

          <form class="admin-login" data-auth="form" novalidate hidden>
            <label for="admin-email">Correo del administrador</label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autocomplete="username"
              inputmode="email"
              required
            />
            <label for="admin-password">Contraseña</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            />
            <button
              class="auth-link"
              data-auth="forgot-password"
              type="button"
            >
              Olvidé mi contraseña
            </button>
            <div class="admin-login__actions">
              <button class="button button--secondary" type="submit">Ingresar</button>
              <button class="button button--quiet" data-auth="cancel-login" type="button">
                Cancelar
              </button>
            </div>
          </form>

          <form class="admin-login password-recovery" data-auth="recovery-form" novalidate hidden>
            <p class="password-recovery__hint">
              El enlace fue validado. Elegí una contraseña nueva de al menos 8 caracteres.
            </p>
            <label for="admin-new-password">Nueva contraseña</label>
            <input
              id="admin-new-password"
              name="password"
              type="password"
              minlength="8"
              autocomplete="new-password"
              required
            />
            <label for="admin-confirm-password">Repetir contraseña</label>
            <input
              id="admin-confirm-password"
              name="password-confirmation"
              type="password"
              minlength="8"
              autocomplete="new-password"
              required
            />
            <button class="button button--secondary" type="submit">
              Guardar contraseña nueva
            </button>
          </form>

          <button
            class="button button--quiet"
            data-auth="logout"
            type="button"
            hidden
          >
            Salir del modo administrador
          </button>
        </section>

        <div data-admin-catalog-root></div>

        <label class="recalibration-control">
          <input id="force-recalibration" type="checkbox" />
          <span>
            <strong>Recalibrar origen al entrar</strong>
            <small>Usalo si el QR o la sala cambiaron de posición.</small>
          </span>
        </label>

        <button class="button button--primary" id="enter-xr" type="button" disabled>
          Ingresá una sala para continuar
        </button>

        <ul class="capabilities" aria-label="Estado técnico">
          <li><span>Conexión</span><strong data-status="secure">Comprobando</strong></li>
          <li><span>WebXR</span><strong data-status="webxr">Comprobando</strong></li>
          <li><span>Sala</span><strong data-status="room">Sin definir</strong></li>
          <li><span>Calibración</span><strong data-status="calibration">Pendiente</strong></li>
        </ul>

        <p class="activity" data-status="activity" role="status" aria-live="polite">
          Al entrar, apuntá de frente al centro del QR y confirmá con el gatillo derecho.
        </p>

        <p class="footnote">
          La cámara no lee el QR dentro de WebXR: el ID viene de la URL y el
          apuntado manual fija su posición. El anchor se guarda solo en este visor.
        </p>
      </section>
    </main>
  `;

  const form = root.querySelector('.room-form');
  const input = root.querySelector('#room-id');
  const message = root.querySelector('.form-message');
  const xrButton = root.querySelector('#enter-xr');
  const sceneSelect = root.querySelector('#scene-id');
  const sceneControl = root.querySelector('[data-admin="scene-editor"]');
  const recalibrationInput = root.querySelector('#force-recalibration');
  const secureStatus = root.querySelector('[data-status="secure"]');
  const webxrStatus = root.querySelector('[data-status="webxr"]');
  const roomStatus = root.querySelector('[data-status="room"]');
  const calibrationStatus = root.querySelector('[data-status="calibration"]');
  const activityStatus = root.querySelector('[data-status="activity"]');
  const authRole = root.querySelector('[data-auth="role"]');
  const authBadge = root.querySelector('[data-auth="badge"]');
  const authMessage = root.querySelector('[data-auth="message"]');
  const openLoginButton = root.querySelector('[data-auth="open-login"]');
  const logoutButton = root.querySelector('[data-auth="logout"]');
  const authForm = root.querySelector('[data-auth="form"]');
  const cancelLoginButton = root.querySelector('[data-auth="cancel-login"]');
  const forgotPasswordButton = root.querySelector('[data-auth="forgot-password"]');
  const recoveryForm = root.querySelector('[data-auth="recovery-form"]');
  const adminEmail = root.querySelector('#admin-email');
  const adminPassword = root.querySelector('#admin-password');
  const newPassword = root.querySelector('#admin-new-password');
  const passwordConfirmation = root.querySelector('#admin-confirm-password');
  const adminCatalogRoot = root.querySelector('[data-admin-catalog-root]');

  let roomId = normalizeRoomId(initialRoomId);
  let sceneId = scenes.some((scene) => scene.id === initialSceneId)
    ? initialSceneId
    : scenes[0].id;
  let roomAvailability = 'local';

  secureStatus.textContent = window.isSecureContext ? 'HTTPS listo' : 'Requiere HTTPS';
  sceneSelect.value = sceneId;
  updateRoom(roomId);
  detectWebXR(webxrStatus);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextRoomId = normalizeRoomId(input.value);

    if (!nextRoomId) {
      message.textContent = 'Usá entre 1 y 64 letras, números, guiones o guion bajo.';
      input.focus();
      return;
    }

    roomId = nextRoomId;
    updateRoom(roomId);
    message.textContent = `Sala ${roomId} preparada.`;
    onRoomChange(roomId);
  });

  sceneSelect.addEventListener('change', () => {
    sceneId = sceneSelect.value;
    onSceneChange(sceneId);
    activityStatus.textContent = `${sceneSelect.selectedOptions[0].text} preparada.`;
  });

  recalibrationInput.addEventListener('change', () => {
    onRecalibrationChange(recalibrationInput.checked);
    activityStatus.textContent = recalibrationInput.checked
      ? 'Al entrar se ignorará el origen anterior hasta que confirmes uno nuevo.'
      : 'Se intentará restaurar el anchor guardado para esta sala.';
  });

  openLoginButton.addEventListener('click', () => {
    authForm.hidden = false;
    openLoginButton.hidden = true;
    adminEmail.focus();
  });

  cancelLoginButton.addEventListener('click', () => {
    authForm.reset();
    authForm.hidden = true;
    openLoginButton.hidden = false;
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!adminEmail.value.trim() || !adminPassword.value) {
      authMessage.textContent = 'Ingresá el correo y la contraseña.';
      return;
    }

    setAuthBusy(true);

    try {
      await onAdminLogin({
        email: adminEmail.value,
        password: adminPassword.value,
      });
      authForm.reset();
      authForm.hidden = true;
    } catch (error) {
      authForm.hidden = false;
      openLoginButton.hidden = true;
      authMessage.textContent = error.message;
      adminPassword.focus();
      adminPassword.select();
    } finally {
      setAuthBusy(false);
    }
  });

  forgotPasswordButton.addEventListener('click', async () => {
    const email = adminEmail.value.trim();

    if (!email) {
      authMessage.textContent = 'Ingresá tu correo para enviarte el enlace de recuperación.';
      adminEmail.focus();
      return;
    }

    setAuthBusy(true);

    try {
      const result = await onPasswordResetRequest({ email });
      adminPassword.value = '';
      authMessage.textContent = result.message;
    } catch (error) {
      authMessage.textContent = error.message;
    } finally {
      setAuthBusy(false);
    }
  });

  recoveryForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (newPassword.value.length < 8) {
      authMessage.textContent = 'La contraseña debe tener al menos 8 caracteres.';
      newPassword.focus();
      return;
    }

    if (newPassword.value !== passwordConfirmation.value) {
      authMessage.textContent = 'Las contraseñas no coinciden.';
      passwordConfirmation.focus();
      passwordConfirmation.select();
      return;
    }

    setAuthBusy(true);

    try {
      await onPasswordRecoveryComplete({
        password: newPassword.value,
        passwordConfirmation: passwordConfirmation.value,
      });
      recoveryForm.reset();
    } catch (error) {
      authMessage.textContent = error.message;
      recoveryForm.hidden = false;
    } finally {
      setAuthBusy(false);
    }
  });

  logoutButton.addEventListener('click', async () => {
    setAuthBusy(true);

    try {
      await onAdminLogout();
    } catch (error) {
      authMessage.textContent = error.message;
    } finally {
      setAuthBusy(false);
    }
  });

  function setAuthBusy(busy) {
    root
      .querySelectorAll(
        '[data-auth="form"] input, [data-auth="form"] button, ' +
          '[data-auth="recovery-form"] input, [data-auth="recovery-form"] button',
      )
      .forEach((element) => {
        element.disabled = busy;
      });
    openLoginButton.disabled = busy;
    logoutButton.disabled = busy;
  }

  function updateRoom(nextRoomId) {
    input.value = nextRoomId ?? '';
    roomStatus.textContent = nextRoomId ?? 'Sin definir';

    updateXRButton();
  }

  function updateXRButton() {
    if (!roomId) {
      xrButton.disabled = true;
      xrButton.textContent = 'Ingresá una sala para continuar';
      return;
    }

    if (roomAvailability === 'loading') {
      xrButton.disabled = true;
      xrButton.textContent = 'Cargando contenido de la sala…';
      return;
    }

    if (roomAvailability === 'missing') {
      xrButton.disabled = true;
      xrButton.textContent = 'La sala todavía no está preparada';
      return;
    }

    if (roomAvailability === 'error') {
      xrButton.disabled = true;
      xrButton.textContent = 'No se pudo preparar la sala';
      return;
    }

    xrButton.disabled = false;
    xrButton.textContent = 'Preparando realidad mixta…';
  }

  return {
    xrButton,
    adminCatalogRoot,
    getRoomId: () => roomId,
    getSceneId: () => sceneId,
    setScenes(nextScenes, preferredSceneId = sceneId) {
      if (!Array.isArray(nextScenes) || nextScenes.length === 0) {
        sceneSelect.innerHTML = '<option value="">Sin escenas</option>';
        sceneSelect.disabled = true;
        sceneId = null;
        return null;
      }

      sceneSelect.innerHTML = nextScenes
        .map((scene) => `<option value="${escapeHtml(scene.id)}">${escapeHtml(scene.name)}</option>`)
        .join('');
      sceneSelect.disabled = false;
      sceneId = nextScenes.some((scene) => scene.id === preferredSceneId)
        ? preferredSceneId
        : nextScenes[0].id;
      sceneSelect.value = sceneId;
      return sceneId;
    },
    setRoomAvailability(status) {
      roomAvailability = status;
      updateXRButton();
    },
    setActivity(message) {
      activityStatus.textContent = message;
    },
    setCalibration(label) {
      calibrationStatus.textContent = label;
    },
    setRecalibrationRequested(requested) {
      recalibrationInput.checked = Boolean(requested);
    },
    setSessionActive(active) {
      root.querySelector('.landing').hidden = active;
    },
    setAuthState({ status, role, email, message: nextMessage }) {
      const isAdmin = role === 'admin';
      const isRecovery = status === 'password-recovery';
      const isConfigured = status !== 'unconfigured';
      const isLoading = status === 'loading';
      const recoveryWasHidden = recoveryForm.hidden;

      root.dataset.role = isAdmin ? 'admin' : isRecovery ? 'recovery' : 'invitado';
      authRole.textContent = isAdmin
        ? email || 'Administrador'
        : isRecovery
          ? email || 'Recuperar acceso'
          : 'Modo visitante';
      authBadge.textContent = isAdmin ? 'Admin' : isRecovery ? 'Recuperación' : 'Invitado';
      authBadge.dataset.role = isAdmin ? 'admin' : isRecovery ? 'recovery' : 'invitado';
      authMessage.textContent = nextMessage;
      logoutButton.hidden = !isAdmin;
      recoveryForm.hidden = !isRecovery;
      sceneControl.hidden = !isAdmin;

      if (isRecovery) {
        authForm.hidden = true;
        openLoginButton.hidden = true;

        if (recoveryWasHidden) {
          queueMicrotask(() => newPassword.focus());
        }
        return;
      }

      if (isAdmin) {
        authForm.reset();
        authForm.hidden = true;
        recoveryForm.reset();
      }

      openLoginButton.hidden = isAdmin || !isConfigured || isLoading || !authForm.hidden;
    },
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function detectWebXR(statusElement) {
  if (!('xr' in navigator)) {
    statusElement.textContent = 'No disponible';
    return;
  }

  try {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    statusElement.textContent = supported ? 'Immersive AR listo' : 'AR no disponible';
  } catch {
    statusElement.textContent = 'No se pudo comprobar';
  }
}
