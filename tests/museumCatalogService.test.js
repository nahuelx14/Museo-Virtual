import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAssignmentRows,
  buildMuseumCatalog,
  createMuseumCatalogService,
} from '../src/backend/museumCatalogService.js';

function createCatalog() {
  const room = {
    id: 'room-uuid',
    slug: 'muestra-2026',
    name: 'Muestra 2026',
    is_published: true,
  };
  const totems = Array.from({ length: 10 }, (_, index) => ({
    id: `totem-${index + 1}`,
    code: `mesa-${String(index + 1).padStart(2, '0')}`,
    label: `Mesa ${index + 1}`,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }));
  const scenes = Array.from({ length: 3 }, (_, index) => ({
    id: `scene-${index + 1}`,
    name: `Escena ${index + 1}`,
    scene_order: index + 1,
  }));
  const artworks = [
    {
      id: 'artwork-1',
      name: 'Obra 1',
      author: 'Estudiante',
      description: 'Descripción',
      storage_path: 'muestra-2026/artwork-1/obra.stl',
      polygon_count: 42,
      polygon_warning: false,
      model_scale: 0.001,
      color: 0x72dbb4,
      created_at: '2026-10-14T00:00:00Z',
    },
  ];
  const assignments = [
    {
      scene_id: 'scene-1',
      totem_id: 'totem-1',
      artwork_id: 'artwork-1',
    },
  ];

  return buildMuseumCatalog({ room, totems, scenes, artworks, assignments });
}

test('buildMuseumCatalog conserva 10 mesas y una obra por mesa y escena', () => {
  const catalog = createCatalog();

  assert.equal(catalog.isComplete, true);
  assert.equal(catalog.tableSlots.length, 10);
  assert.equal(catalog.scenes.length, 3);
  assert.equal(catalog.scenes[0].assignments['mesa-01'], 'artwork-1');
  assert.equal(catalog.scenes[0].assignments['mesa-02'], null);
  assert.equal(catalog.scenes[1].assignments['mesa-01'], null);
  assert.equal(catalog.artworks['artwork-1'].scale, 0.001);
});

test('buildAssignmentRows genera exactamente una fila por mesa', () => {
  const catalog = createCatalog();
  const rows = buildAssignmentRows({
    catalog,
    sceneId: 'scene-2',
    assignments: {
      'mesa-01': 'artwork-1',
      'mesa-02': null,
    },
  });

  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], {
    scene_id: 'scene-2',
    totem_id: 'totem-1',
    artwork_id: 'artwork-1',
  });
  assert.equal(rows[1].artwork_id, null);
});

test('buildAssignmentRows rechaza obras de otra sala', () => {
  const catalog = createCatalog();

  assert.throws(
    () =>
      buildAssignmentRows({
        catalog,
        sceneId: 'scene-1',
        assignments: { 'mesa-01': 'artwork-ajena' },
      }),
    /no pertenece a la sala/,
  );
});

test('updateArtwork guarda título, autor, descripción y escala juntos', async () => {
  const updates = [];
  const query = {
    update(values) {
      updates.push(values);
      return this;
    },
    eq() {
      return this;
    },
    error: null,
  };
  const service = createMuseumCatalogService({
    client: {
      from(table) {
        assert.equal(table, 'artworks');
        return query;
      },
    },
    storage: {},
  });
  const updated = await service.updateArtwork({
    catalog: createCatalog(),
    artworkId: 'artwork-1',
    name: ' Título corregido ',
    author: ' Estudiante A ',
    description: ' Nueva descripción ',
    scale: '0.01',
  });

  assert.deepEqual(updates, [
    {
      name: 'Título corregido',
      author: 'Estudiante A',
      description: 'Nueva descripción',
      model_scale: 0.01,
    },
  ]);
  assert.equal(updated.name, 'Título corregido');
  assert.equal(updated.scale, 0.01);
});
