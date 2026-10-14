import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthService, USER_ROLES } from '../src/backend/authService.js';

function createFakeClient({
  initialSession = null,
  passwordUserRole = USER_ROLES.ADMIN,
  passwordError = null,
} = {}) {
  const profiles = new Map([
    ['guest-user', { role: USER_ROLES.GUEST, display_name: null }],
    ['password-user', { role: passwordUserRole, display_name: 'Docente' }],
  ]);
  const calls = [];
  let authStateCallback;
  let nextPasswordError = passwordError;
  let activePasswordUser = { id: 'password-user', email: 'docente@escuela.edu.ar' };

  const client = {
    calls,
    setPasswordError(error) {
      nextPasswordError = error;
    },
    emitAuthStateChange(event, session) {
      authStateCallback?.(event, session);
    },
    from(table) {
      assert.equal(table, 'profiles');
      let selectedId;

      return {
        select() {
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'id');
          selectedId = value;
          return this;
        },
        async maybeSingle() {
          calls.push(['profile', selectedId]);
          return { data: profiles.get(selectedId) ?? null, error: null };
        },
      };
    },
    auth: {
      async getSession() {
        calls.push(['getSession']);
        return { data: { session: initialSession }, error: null };
      },
      async signInAnonymously() {
        calls.push(['signInAnonymously']);
        return {
          data: {
            session: { user: { id: 'guest-user' } },
            user: { id: 'guest-user' },
          },
          error: null,
        };
      },
      async signInWithPassword({ email }) {
        calls.push(['signInWithPassword', email]);

        if (nextPasswordError) {
          return { data: { user: null, session: null }, error: nextPasswordError };
        }

        activePasswordUser = { id: 'password-user', email };
        return {
          data: { user: activePasswordUser, session: { user: activePasswordUser } },
          error: null,
        };
      },
      async resetPasswordForEmail(email, options) {
        calls.push(['resetPasswordForEmail', email, options]);
        return { data: {}, error: null };
      },
      async updateUser(attributes) {
        calls.push(['updateUser', attributes]);
        return { data: { user: activePasswordUser }, error: null };
      },
      async signOut(options) {
        calls.push(['signOut', options]);
        return { error: null };
      },
      onAuthStateChange(callback) {
        calls.push(['onAuthStateChange']);
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe() {
                calls.push(['unsubscribe']);
              },
            },
          },
        };
      },
    },
  };

  return client;
}

test('initialize crea sesión anónima y aplica rol invitado', async () => {
  const client = createFakeClient();
  const states = [];
  const service = createAuthService({
    client,
    onStateChange: (state) => states.push(state),
  });

  const state = await service.initialize();

  assert.equal(state.status, 'ready');
  assert.equal(state.role, USER_ROLES.GUEST);
  assert.equal(state.email, null);
  assert.ok(client.calls.some(([name]) => name === 'signInAnonymously'));
  assert.equal(states.at(-1).role, USER_ROLES.GUEST);

  service.dispose();
  assert.ok(client.calls.some(([name]) => name === 'unsubscribe'));
});

test('signInAsAdmin normaliza correo y acepta solo perfil admin', async () => {
  const client = createFakeClient();
  const service = createAuthService({ client });
  await service.initialize();

  const state = await service.signInAsAdmin({
    email: ' DOCENTE@ESCUELA.EDU.AR ',
    password: 'secreto-de-prueba',
  });

  assert.equal(state.role, USER_ROLES.ADMIN);
  assert.equal(state.email, 'docente@escuela.edu.ar');
  assert.deepEqual(
    client.calls.find(([name]) => name === 'signInWithPassword'),
    ['signInWithPassword', 'docente@escuela.edu.ar'],
  );
});

test('signInAsAdmin rechaza una cuenta válida sin rol admin y vuelve a invitado', async () => {
  const client = createFakeClient({ passwordUserRole: USER_ROLES.GUEST });
  const service = createAuthService({ client });
  await service.initialize();

  await assert.rejects(
    service.signInAsAdmin({
      email: 'estudiante@escuela.edu.ar',
      password: 'secreto-de-prueba',
    }),
    /no tiene rol de administrador/,
  );

  assert.equal(service.getState().role, USER_ROLES.GUEST);
  assert.ok(client.calls.some(([name]) => name === 'signOut'));
  assert.equal(
    client.calls.filter(([name]) => name === 'signInAnonymously').length,
    2,
  );
});

test('un login incorrecto conserva la sesión invitada y permite reintentar', async () => {
  const client = createFakeClient({
    passwordError: {
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    },
  });
  const service = createAuthService({ client });
  await service.initialize();

  await assert.rejects(
    service.signInAsAdmin({
      email: 'docente@escuela.edu.ar',
      password: 'incorrecta',
    }),
    /Correo o contraseña incorrectos/,
  );

  assert.equal(service.getState().status, 'ready');
  assert.equal(service.getState().role, USER_ROLES.GUEST);

  client.setPasswordError(null);
  const state = await service.signInAsAdmin({
    email: 'docente@escuela.edu.ar',
    password: 'correcta-de-prueba',
  });

  assert.equal(state.role, USER_ROLES.ADMIN);
  assert.equal(
    client.calls.filter(([name]) => name === 'signInWithPassword').length,
    2,
  );
});

test('requestPasswordReset normaliza el correo y no revela si la cuenta existe', async () => {
  const client = createFakeClient();
  const service = createAuthService({ client });

  const result = await service.requestPasswordReset({
    email: ' DOCENTE@ESCUELA.EDU.AR ',
    redirectTo: 'https://museo.example/?room=muestra-2026&reset-password=1',
  });

  assert.match(result.message, /Si existe una cuenta/);
  assert.deepEqual(
    client.calls.find(([name]) => name === 'resetPasswordForEmail'),
    [
      'resetPasswordForEmail',
      'docente@escuela.edu.ar',
      { redirectTo: 'https://museo.example/?room=muestra-2026&reset-password=1' },
    ],
  );
});

test('PASSWORD_RECOVERY habilita el cambio y restaura el rol desde profiles', async () => {
  const client = createFakeClient();
  const service = createAuthService({ client });
  await service.initialize();

  client.emitAuthStateChange('PASSWORD_RECOVERY', {
    user: { id: 'password-user', email: 'docente@escuela.edu.ar' },
  });

  assert.equal(service.getState().status, 'password-recovery');
  assert.equal(service.getState().email, 'docente@escuela.edu.ar');

  await assert.rejects(
    service.updateRecoveredPassword({
      password: 'contraseña-nueva',
      passwordConfirmation: 'otra-contraseña',
    }),
    /no coinciden/,
  );

  const state = await service.updateRecoveredPassword({
    password: 'contraseña-nueva',
    passwordConfirmation: 'contraseña-nueva',
  });

  assert.equal(state.status, 'ready');
  assert.equal(state.role, USER_ROLES.ADMIN);
  assert.deepEqual(
    client.calls.find(([name]) => name === 'updateUser'),
    ['updateUser', { password: 'contraseña-nueva' }],
  );
});
