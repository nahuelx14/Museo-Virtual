import { normalizeRoomId } from '../anchors/roomReference.js';
import { TABLE_SLOTS } from '../data/museumCatalog.js';
import { createArtworkStorage, validateSTLFile } from './artworkStorage.js';

const SCENE_COUNT = 3;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function createMuseumCatalogService({
  client,
  storage = createArtworkStorage({ client }),
  idFactory = () => crypto.randomUUID(),
  now = () => Date.now(),
} = {}) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('Se requiere un cliente Supabase válido para el catálogo.');
  }

  const signedUrls = new Map();

  async function loadRoom(roomSlug) {
    const slug = requireRoomSlug(roomSlug);
    const { data: room, error: roomError } = await client
      .from('rooms')
      .select('id, slug, name, is_published')
      .eq('slug', slug)
      .maybeSingle();

    throwIfError(roomError, 'No se pudo leer la sala');

    if (!room) {
      return null;
    }

    const [totemsResult, scenesResult, artworksResult, assignmentsResult] =
      await Promise.all([
        client
          .from('totems')
          .select('id, room_id, code, label, position, quaternion, scale')
          .eq('room_id', room.id)
          .order('code'),
        client
          .from('scenes')
          .select('id, room_id, name, scene_order')
          .eq('room_id', room.id)
          .order('scene_order'),
        client
          .from('artworks')
          .select(
            'id, room_id, name, author, description, storage_path, polygon_count, polygon_warning, model_scale, color, created_at',
          )
          .eq('room_id', room.id)
          .order('created_at'),
        client
          .from('scene_assignments')
          .select('scene_id, totem_id, artwork_id'),
      ]);

    throwIfError(totemsResult.error, 'No se pudieron leer las mesas');
    throwIfError(scenesResult.error, 'No se pudieron leer las escenas');
    throwIfError(artworksResult.error, 'No se pudieron leer las obras');
    throwIfError(assignmentsResult.error, 'No se pudieron leer las asignaciones');

    const sceneIds = new Set((scenesResult.data ?? []).map((scene) => scene.id));
    const assignments = (assignmentsResult.data ?? []).filter((assignment) =>
      sceneIds.has(assignment.scene_id),
    );

    return buildMuseumCatalog({
      room,
      totems: totemsResult.data ?? [],
      scenes: scenesResult.data ?? [],
      artworks: artworksResult.data ?? [],
      assignments,
    });
  }

  async function createRoom({ slug: roomSlug, name, isPublished = true }) {
    const slug = requireRoomSlug(roomSlug);
    const roomName = normalizeRequiredText(name, 'Ingresá un nombre para la sala.', 120);
    const { data: room, error: roomError } = await client
      .from('rooms')
      .insert({ slug, name: roomName, is_published: Boolean(isPublished) })
      .select('id, slug, name, is_published')
      .single();

    throwIfError(roomError, 'No se pudo crear la sala');

    try {
      const { error: totemsError } = await client.from('totems').insert(
        TABLE_SLOTS.map((slot) => ({
          room_id: room.id,
          code: slot.id,
          label: slot.label,
        })),
      );
      throwIfError(totemsError, 'No se pudieron preparar las 10 mesas');

      const { error: scenesError } = await client.from('scenes').insert(
        Array.from({ length: SCENE_COUNT }, (_, index) => ({
          room_id: room.id,
          name: `Escena ${index + 1}`,
          scene_order: index + 1,
        })),
      );
      throwIfError(scenesError, 'No se pudieron preparar las tres escenas');
    } catch (error) {
      await client.from('rooms').delete().eq('id', room.id);
      throw error;
    }

    return loadRoom(slug);
  }

  async function uploadArtwork({
    catalog,
    file,
    name,
    author,
    description = '',
    scale,
    polygonCount,
  }) {
    requireCatalogRoom(catalog);
    validateSTLFile(file);

    const artworkName = normalizeRequiredText(name, 'Ingresá el nombre de la obra.', 160);
    const artworkAuthor = normalizeRequiredText(author, 'Ingresá el nombre del autor.', 160);
    const artworkDescription = normalizeOptionalText(description, 2000);
    const modelScale = normalizeScale(scale);
    const normalizedPolygonCount = normalizePolygonCount(polygonCount);
    const artworkId = idFactory();
    const storagePath = await storage.upload({
      roomId: catalog.room.slug,
      artworkId,
      file,
    });

    const { data, error } = await client
      .from('artworks')
      .insert({
        id: artworkId,
        room_id: catalog.room.id,
        name: artworkName,
        author: artworkAuthor,
        description: artworkDescription,
        storage_path: storagePath,
        polygon_count: normalizedPolygonCount,
        model_scale: modelScale,
      })
      .select(
        'id, room_id, name, author, description, storage_path, polygon_count, polygon_warning, model_scale, color, created_at',
      )
      .single();

    if (error) {
      try {
        await storage.remove(storagePath);
      } catch (cleanupError) {
        console.warn('No se pudo limpiar el STL después del error de catálogo.', cleanupError);
      }

      throwIfError(error, 'El STL se subió, pero no se pudo registrar la obra');
    }

    return mapArtwork(data);
  }

  async function updateArtwork({
    catalog,
    artworkId,
    name,
    author,
    description = '',
    scale,
  }) {
    requireCatalogRoom(catalog);
    const artworkName = normalizeRequiredText(name, 'Ingresá el título de la obra.', 160);
    const artworkAuthor = normalizeRequiredText(author, 'Ingresá el nombre del autor.', 160);
    const artworkDescription = normalizeOptionalText(description, 2000);
    const modelScale = normalizeScale(scale);
    const artwork = catalog.artworks[artworkId];

    if (!artwork) {
      throw new Error('La obra elegida no pertenece a esta sala.');
    }

    const { error } = await client
      .from('artworks')
      .update({
        name: artworkName,
        author: artworkAuthor,
        description: artworkDescription,
        model_scale: modelScale,
      })
      .eq('id', artworkId)
      .eq('room_id', catalog.room.id);

    throwIfError(error, 'No se pudieron actualizar los datos de la obra');
    return {
      ...artwork,
      name: artworkName,
      author: artworkAuthor,
      description: artworkDescription,
      scale: modelScale,
    };
  }

  async function saveAssignments({ catalog, sceneId, assignments }) {
    requireCatalogRoom(catalog);
    const scene = catalog.scenes.find((candidate) => candidate.id === sceneId);

    if (!scene) {
      throw new Error('La escena elegida no pertenece a esta sala.');
    }

    const rows = buildAssignmentRows({ catalog, sceneId, assignments });
    const { error } = await client
      .from('scene_assignments')
      .upsert(rows, { onConflict: 'scene_id,totem_id' });

    throwIfError(error, 'No se pudieron guardar las asignaciones');
    return rows;
  }

  async function getArtworkModelUrl(artwork) {
    if (artwork?.modelUrl) {
      return artwork.modelUrl;
    }

    const path = String(artwork?.storagePath ?? '');

    if (!path) {
      throw new Error('La obra no tiene un STL asociado.');
    }

    const cached = signedUrls.get(path);

    if (cached && cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > now()) {
      return cached.url;
    }

    const url = await storage.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    signedUrls.set(path, {
      url,
      expiresAt: now() + SIGNED_URL_TTL_SECONDS * 1000,
    });
    return url;
  }

  return {
    loadRoom,
    createRoom,
    uploadArtwork,
    updateArtwork,
    saveAssignments,
    getArtworkModelUrl,
    clearSignedUrlCache() {
      signedUrls.clear();
    },
  };
}

export function buildMuseumCatalog({ room, totems, scenes, artworks, assignments }) {
  if (!room?.id || !room?.slug) {
    throw new TypeError('La sala recibida desde Supabase no es válida.');
  }

  const totemRowsByCode = new Map(totems.map((totem) => [totem.code, totem]));
  const tableSlots = TABLE_SLOTS.map((slot) => {
    const row = totemRowsByCode.get(slot.id);

    return {
      ...slot,
      databaseId: row?.id ?? null,
      transform: row
        ? {
            position: row.position,
            quaternion: row.quaternion,
            scale: row.scale,
          }
        : null,
    };
  });
  const artworkList = artworks.map(mapArtwork);
  const artworkMap = Object.fromEntries(artworkList.map((artwork) => [artwork.id, artwork]));
  const totemCodeById = new Map(
    tableSlots
      .filter((slot) => slot.databaseId)
      .map((slot) => [slot.databaseId, slot.id]),
  );
  const assignmentsByScene = new Map();

  for (const assignment of assignments) {
    const slotId = totemCodeById.get(assignment.totem_id);

    if (!slotId) {
      continue;
    }

    const sceneAssignments = assignmentsByScene.get(assignment.scene_id) ?? {};
    sceneAssignments[slotId] = assignment.artwork_id ?? null;
    assignmentsByScene.set(assignment.scene_id, sceneAssignments);
  }

  const normalizedScenes = [...scenes]
    .sort((first, second) => first.scene_order - second.scene_order)
    .map((scene) => ({
      id: scene.id,
      name: scene.name,
      order: scene.scene_order,
      assignments: Object.fromEntries(
        TABLE_SLOTS.map((slot) => [
          slot.id,
          assignmentsByScene.get(scene.id)?.[slot.id] ?? null,
        ]),
      ),
    }));

  return {
    room: {
      id: room.id,
      slug: room.slug,
      name: room.name,
      isPublished: Boolean(room.is_published),
    },
    tableSlots,
    scenes: normalizedScenes,
    artworks: artworkMap,
    artworkList,
    isComplete: tableSlots.every((slot) => slot.databaseId) && normalizedScenes.length === 3,
  };
}

export function buildAssignmentRows({ catalog, sceneId, assignments }) {
  const artworkIds = new Set(Object.keys(catalog.artworks));

  return catalog.tableSlots.map((slot) => {
    if (!slot.databaseId) {
      throw new Error(`${slot.label} no está registrada en Supabase.`);
    }

    const artworkId = assignments?.[slot.id] || null;

    if (artworkId && !artworkIds.has(artworkId)) {
      throw new Error(`${slot.label} referencia una obra que no pertenece a la sala.`);
    }

    return {
      scene_id: sceneId,
      totem_id: slot.databaseId,
      artwork_id: artworkId,
    };
  });
}

function mapArtwork(row) {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description ?? '',
    storagePath: row.storage_path,
    polygonCount: row.polygon_count,
    polygonWarning: Boolean(row.polygon_warning),
    scale: row.model_scale,
    color: row.color,
    createdAt: row.created_at,
  };
}

function normalizeScale(value) {
  const scale = Number(value);

  if (!Number.isFinite(scale) || scale < 0.000001 || scale > 1000) {
    throw new Error('La escala debe ser un número entre 0,000001 y 1000.');
  }

  return scale;
}

function normalizePolygonCount(value) {
  const polygonCount = Number(value);

  if (!Number.isInteger(polygonCount) || polygonCount < 0) {
    throw new Error('No se pudo determinar la cantidad de polígonos del STL.');
  }

  return polygonCount;
}

function normalizeRequiredText(value, message, maxLength) {
  const text = String(value ?? '').trim();

  if (!text) {
    throw new Error(message);
  }

  if (text.length > maxLength) {
    throw new Error(`El texto no puede superar ${maxLength} caracteres.`);
  }

  return text;
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value ?? '').trim();

  if (text.length > maxLength) {
    throw new Error(`La descripción no puede superar ${maxLength} caracteres.`);
  }

  return text;
}

function requireRoomSlug(value) {
  const slug = normalizeRoomId(value);

  if (!slug) {
    throw new Error('El ID de sala no es válido.');
  }

  return slug;
}

function requireCatalogRoom(catalog) {
  if (!catalog?.room?.id || !catalog?.room?.slug) {
    throw new Error('Primero prepará una sala válida.');
  }
}

function throwIfError(error, prefix) {
  if (error) {
    throw new Error(`${prefix}: ${error.message}`);
  }
}
