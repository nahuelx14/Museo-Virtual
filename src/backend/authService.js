export const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  GUEST: 'invitado',
});

const INITIAL_STATE = Object.freeze({
  status: 'idle',
  role: USER_ROLES.GUEST,
  email: null,
  message: 'Preparando acceso de invitado…',
});

const MIN_PASSWORD_LENGTH = 8;

function describeSignInError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? 'Error desconocido');

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Correo o contraseña incorrectos. Volvé a intentarlo o recuperá la contraseña.';
  }

  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Ese correo todavía no fue confirmado en Supabase.';
  }

  return `No se pudo iniciar sesión: ${message}`;
}

export function createAuthService({ client, onStateChange = () => {} }) {
  if (!client?.auth || typeof client.from !== 'function') {
    throw new TypeError('Se requiere un cliente Supabase válido.');
  }

  let state = INITIAL_STATE;
  let disposed = false;
  let authSubscription;
  let syncVersion = 0;
  let recoveryMode = false;

  function publish(nextState) {
    if (disposed) {
      return state;
    }

    state = Object.freeze({ ...state, ...nextState });
    onStateChange(state);
    return state;
  }

  async function fetchProfile(userId) {
    const { data, error } = await client
      .from('profiles')
      .select('role, display_name')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo leer el perfil: ${error.message}`);
    }

    return data;
  }

  async function resolveSession(
    session,
    version = ++syncVersion,
    { allowDuringRecovery = false } = {},
  ) {
    if (recoveryMode && !allowDuringRecovery) {
      return state;
    }

    if (!session?.user) {
      return publish({
        status: 'signed-out',
        role: USER_ROLES.GUEST,
        email: null,
        message: 'No hay una sesión activa.',
      });
    }

    let profile;

    try {
      profile = await fetchProfile(session.user.id);
    } catch (error) {
      if (version !== syncVersion || disposed) {
        return state;
      }

      return publish({
        status: 'error',
        role: USER_ROLES.GUEST,
        email: session.user.email ?? null,
        message: `${error.message} Se aplicó el rol invitado por seguridad.`,
      });
    }

    if (version !== syncVersion || disposed) {
      return state;
    }

    const role = profile?.role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.GUEST;

    return publish({
      status: 'ready',
      role,
      email: session.user.email ?? null,
      displayName: profile?.display_name ?? null,
      message:
        role === USER_ROLES.ADMIN
          ? 'Sesión de administración habilitada.'
          : 'Ingresaste automáticamente como invitado.',
    });
  }

  async function createGuestSession() {
    const { data, error } = await client.auth.signInAnonymously();

    if (error) {
      throw new Error(`No se pudo iniciar la sesión de invitado: ${error.message}`);
    }

    return data.session;
  }

  function listenForAuthChanges() {
    if (typeof client.auth.onAuthStateChange !== 'function') {
      return;
    }

    const result = client.auth.onAuthStateChange((event, session) => {
      const version = ++syncVersion;

      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode = true;
        publish({
          status: 'password-recovery',
          role: USER_ROLES.GUEST,
          email: session?.user?.email ?? null,
          message: 'Ingresá y confirmá una contraseña nueva para recuperar el acceso.',
        });
        return;
      }

      queueMicrotask(() => {
        resolveSession(session, version).catch((error) => {
          if (version === syncVersion) {
            publish({
              status: 'error',
              role: USER_ROLES.GUEST,
              message: error.message,
            });
          }
        });
      });
    });

    authSubscription = result?.data?.subscription;
  }

  async function initialize() {
    publish({
      status: 'loading',
      role: USER_ROLES.GUEST,
      message: 'Conectando con Supabase…',
    });

    listenForAuthChanges();

    const { data, error } = await client.auth.getSession();

    if (error) {
      throw new Error(`No se pudo recuperar la sesión: ${error.message}`);
    }

    const session = data.session ?? (await createGuestSession());
    return resolveSession(session);
  }

  async function signInAsAdmin({ email, password }) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedEmail || !String(password ?? '')) {
      throw new Error('Ingresá el correo y la contraseña del administrador.');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      throw new Error(describeSignInError(error));
    }

    const profile = await fetchProfile(data.user.id);

    if (profile?.role !== USER_ROLES.ADMIN) {
      await client.auth.signOut({ scope: 'local' });
      const guestSession = await createGuestSession();
      await resolveSession(guestSession);
      throw new Error('La cuenta es válida, pero no tiene rol de administrador.');
    }

    return resolveSession(data.session);
  }

  async function requestPasswordReset({ email, redirectTo }) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedEmail) {
      throw new Error('Ingresá el correo del administrador.');
    }

    let redirectUrl;

    try {
      redirectUrl = new URL(String(redirectTo ?? ''));
    } catch {
      throw new Error('No se pudo preparar el enlace de recuperación.');
    }

    if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
      throw new Error('La recuperación requiere una URL web válida.');
    }

    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: redirectUrl.toString(),
    });

    if (error) {
      throw new Error(`No se pudo enviar el correo de recuperación: ${error.message}`);
    }

    return {
      email: normalizedEmail,
      message:
        'Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva.',
    };
  }

  async function updateRecoveredPassword({ password, passwordConfirmation }) {
    const nextPassword = String(password ?? '');

    if (!recoveryMode || state.status !== 'password-recovery') {
      throw new Error('Abrí primero el enlace de recuperación enviado por correo.');
    }

    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    if (nextPassword !== String(passwordConfirmation ?? '')) {
      throw new Error('Las contraseñas no coinciden.');
    }

    const { data, error } = await client.auth.updateUser({ password: nextPassword });

    if (error) {
      throw new Error(`No se pudo actualizar la contraseña: ${error.message}`);
    }

    if (!data?.user) {
      throw new Error('Supabase no devolvió la cuenta recuperada. Volvé a abrir el enlace.');
    }

    recoveryMode = false;
    return resolveSession(
      { user: data.user },
      ++syncVersion,
      { allowDuringRecovery: true },
    );
  }

  async function signOutAdmin() {
    recoveryMode = false;
    publish({
      status: 'loading',
      role: USER_ROLES.GUEST,
      message: 'Cerrando la sesión de administración…',
    });

    const { error } = await client.auth.signOut({ scope: 'local' });

    if (error) {
      throw new Error(`No se pudo cerrar la sesión: ${error.message}`);
    }

    const guestSession = await createGuestSession();
    return resolveSession(guestSession);
  }

  return {
    initialize,
    signInAsAdmin,
    signOutAdmin,
    requestPasswordReset,
    updateRecoveredPassword,
    getState: () => state,
    dispose() {
      disposed = true;
      syncVersion += 1;
      authSubscription?.unsubscribe();
    },
  };
}
