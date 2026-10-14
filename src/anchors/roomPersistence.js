import { normalizeRoomId } from './roomReference.js';
import { TABLE_SLOTS } from '../data/museumCatalog.js';

const ANCHOR_KEY_PREFIX = 'museo-xr:room-anchor:v1:';
const LAYOUT_KEY_PREFIX = 'museo-xr:room-layout:v1:';
const RECORD_VERSION = 1;
const TABLE_ID_PATTERN = /^mesa-\d{2}$/;
const KNOWN_TABLE_IDS = new Set(TABLE_SLOTS.map((table) => table.id));

export function readRoomAnchorId(roomId, { storage = window.localStorage } = {}) {
  const key = createStorageKey(ANCHOR_KEY_PREFIX, roomId);

  try {
    const record = JSON.parse(storage.getItem(key));

    if (
      record?.version !== RECORD_VERSION ||
      typeof record.anchorId !== 'string' ||
      record.anchorId.length === 0 ||
      record.anchorId.length > 512
    ) {
      return null;
    }

    return record.anchorId;
  } catch {
    return null;
  }
}

export function writeRoomAnchorId(
  roomId,
  anchorId,
  { storage = window.localStorage } = {},
) {
  if (typeof anchorId !== 'string' || anchorId.length === 0 || anchorId.length > 512) {
    throw new TypeError('El identificador del anchor persistente no es válido.');
  }

  const key = createStorageKey(ANCHOR_KEY_PREFIX, roomId);

  try {
    storage.setItem(
      key,
      JSON.stringify({
        version: RECORD_VERSION,
        anchorId,
        updatedAt: new Date().toISOString(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeRoomAnchorId(roomId, { storage = window.localStorage } = {}) {
  const key = createStorageKey(ANCHOR_KEY_PREFIX, roomId);

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readRoomLayout(roomId, { storage = window.localStorage } = {}) {
  const key = createStorageKey(LAYOUT_KEY_PREFIX, roomId);

  try {
    return normalizeRoomLayout(JSON.parse(storage.getItem(key)));
  } catch {
    return null;
  }
}

export function writeRoomLayout(roomId, layout, { storage = window.localStorage } = {}) {
  const normalized = normalizeRoomLayout(layout);

  if (!normalized) {
    throw new TypeError('La distribución de mesas contiene transformaciones inválidas.');
  }

  const key = createStorageKey(LAYOUT_KEY_PREFIX, roomId);

  try {
    storage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function normalizeRoomLayout(value) {
  if (!value || value.version !== RECORD_VERSION || !isPlainObject(value.tables)) {
    return null;
  }

  const tables = {};

  const entries = Object.entries(value.tables);

  if (entries.length > KNOWN_TABLE_IDS.size) {
    return null;
  }

  for (const [tableId, transform] of entries) {
    if (!TABLE_ID_PATTERN.test(tableId) || !KNOWN_TABLE_IDS.has(tableId)) {
      return null;
    }

    const normalizedTransform = normalizeTransform(transform);

    if (!normalizedTransform) {
      return null;
    }

    tables[tableId] = normalizedTransform;
  }

  return {
    version: RECORD_VERSION,
    tables,
  };
}

export function createRoomLayout(tables) {
  return normalizeRoomLayout({ version: RECORD_VERSION, tables });
}

function normalizeTransform(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const position = normalizeNumberTuple(value.position, 3);
  const quaternion = normalizeNumberTuple(value.quaternion, 4);
  const scale = normalizeNumberTuple(value.scale, 3);
  const quaternionLengthSquared = quaternion?.reduce((sum, component) => {
    return sum + component * component;
  }, 0);

  if (
    !position ||
    !quaternion ||
    !scale ||
    quaternionLengthSquared < Number.EPSILON ||
    scale.some((component) => component <= 0)
  ) {
    return null;
  }

  const quaternionLength = Math.sqrt(quaternionLengthSquared);

  return {
    position,
    quaternion: quaternion.map((component) => component / quaternionLength),
    scale,
  };
}

function normalizeNumberTuple(value, length) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(item))) {
    return null;
  }

  return value.map(Number);
}

function createStorageKey(prefix, roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);

  if (!normalizedRoomId) {
    throw new TypeError('El ID de sala no es válido.');
  }

  return `${prefix}${normalizedRoomId}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
