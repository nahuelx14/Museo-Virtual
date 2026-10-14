const STORAGE_KEY = 'museo-xr:room-id';
const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function normalizeRoomId(value) {
  const candidate = String(value ?? '').trim();
  return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}

export function readRoomId({
  location = window.location,
  storage = window.localStorage,
} = {}) {
  const search = new URLSearchParams(location.search);
  const fromUrl = normalizeRoomId(search.get('room') ?? search.get('sala'));

  if (fromUrl) {
    return fromUrl;
  }

  try {
    return normalizeRoomId(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistRoomId(
  value,
  {
    location = window.location,
    history = window.history,
    storage = window.localStorage,
  } = {},
) {
  const roomId = normalizeRoomId(value);

  if (!roomId) {
    throw new TypeError('El ID de sala no es válido.');
  }

  try {
    storage.setItem(STORAGE_KEY, roomId);
  } catch {
    // La URL sigue siendo suficiente si el almacenamiento está bloqueado.
  }

  const nextUrl = new URL(location.href);
  nextUrl.searchParams.delete('sala');
  nextUrl.searchParams.set('room', roomId);
  history.replaceState({}, '', nextUrl);

  return roomId;
}
