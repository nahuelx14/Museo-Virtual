const TABLE_COUNT = 10;
const SCENE_COUNT = 3;
const PUBLIC_BASE_URL = import.meta.env?.BASE_URL ?? '/';

export const TABLE_SLOTS = Object.freeze(
  Array.from({ length: TABLE_COUNT }, (_, index) =>
    Object.freeze({
      id: `mesa-${String(index + 1).padStart(2, '0')}`,
      label: `Mesa ${index + 1}`,
    }),
  ),
);

export const ARTWORKS = Object.freeze({
  'demo-escena-1': Object.freeze({
    id: 'demo-escena-1',
    name: 'Prototipo de la escena 1',
    author: 'Contenido técnico de prueba',
    description: 'STL de demostración. Se reemplazará por una obra estudiantil.',
    modelUrl: `${PUBLIC_BASE_URL}assets/demo-tetrahedron.stl`,
    scale: 1,
    color: 0x72dbb4,
  }),
  'demo-escena-2': Object.freeze({
    id: 'demo-escena-2',
    name: 'Prototipo de la escena 2',
    author: 'Contenido técnico de prueba',
    description: 'STL de demostración. Se reemplazará por una obra estudiantil.',
    modelUrl: `${PUBLIC_BASE_URL}assets/demo-tetrahedron.stl`,
    scale: 1,
    color: 0xf2b84b,
  }),
  'demo-escena-3': Object.freeze({
    id: 'demo-escena-3',
    name: 'Prototipo de la escena 3',
    author: 'Contenido técnico de prueba',
    description: 'STL de demostración. Se reemplazará por una obra estudiantil.',
    modelUrl: `${PUBLIC_BASE_URL}assets/demo-tetrahedron.stl`,
    scale: 1,
    color: 0xa997ff,
  }),
});

export const MUSEUM_SCENES = Object.freeze(
  Array.from({ length: SCENE_COUNT }, (_, sceneIndex) => {
    const id = `escena-${sceneIndex + 1}`;
    const demoArtworkId = `demo-escena-${sceneIndex + 1}`;

    return Object.freeze({
      id,
      name: `Escena ${sceneIndex + 1}`,
      order: sceneIndex + 1,
      assignments: Object.freeze(
        Object.fromEntries(
          TABLE_SLOTS.map((slot, slotIndex) => [
            slot.id,
            slotIndex === 0 ? demoArtworkId : null,
          ]),
        ),
      ),
    });
  }),
);

export function getMuseumScene(sceneId) {
  return MUSEUM_SCENES.find((scene) => scene.id === sceneId) ?? null;
}

export function getArtworkForSlot(sceneId, slotId) {
  const scene = getMuseumScene(sceneId);

  if (!scene || !Object.hasOwn(scene.assignments, slotId)) {
    return null;
  }

  const artworkId = scene.assignments[slotId];
  return artworkId ? ARTWORKS[artworkId] ?? null : null;
}

export function validateMuseumCatalog({
  tableSlots = TABLE_SLOTS,
  scenes = MUSEUM_SCENES,
  artworks = ARTWORKS,
} = {}) {
  const errors = [];
  const slotIds = new Set(tableSlots.map((slot) => slot.id));

  if (tableSlots.length !== TABLE_COUNT || slotIds.size !== tableSlots.length) {
    errors.push('Deben existir exactamente 10 mesas con IDs únicos.');
  }

  if (scenes.length !== SCENE_COUNT) {
    errors.push('Deben existir exactamente 3 escenas.');
  }

  for (const scene of scenes) {
    const assignmentIds = Object.keys(scene.assignments);

    if (
      assignmentIds.length !== tableSlots.length ||
      assignmentIds.some((slotId) => !slotIds.has(slotId))
    ) {
      errors.push(`${scene.name} no contiene una asignación para cada mesa.`);
    }

    for (const artworkId of Object.values(scene.assignments)) {
      if (artworkId !== null && !artworks[artworkId]) {
        errors.push(`${scene.name} referencia una obra inexistente: ${artworkId}.`);
      }
    }
  }

  return errors;
}
