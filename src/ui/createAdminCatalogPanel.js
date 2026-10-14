export function createAdminCatalogPanel({
  root,
  onCreateRoom,
  onInspectFile,
  onUploadArtwork,
  onUpdateArtwork,
  onSaveAssignments,
  onResetLayout,
  onRefresh,
}) {
  root.innerHTML = `
    <section class="admin-catalog" aria-labelledby="catalog-title" hidden>
      <div class="admin-catalog__heading">
        <div>
          <p class="eyebrow">Administración</p>
          <h2 id="catalog-title">Contenido de la sala</h2>
        </div>
        <button class="button button--quiet" data-catalog-action="refresh" type="button">
          Actualizar
        </button>
      </div>

      <p class="catalog-message" data-catalog="message" role="status" aria-live="polite">
        Elegí una sala para administrar su contenido.
      </p>

      <form class="catalog-create-room" data-catalog="create-room" hidden>
        <h3>Preparar esta sala</h3>
        <p>
          Se crearán las 10 mesas fijas y tres escenas. Después podrás cargar y
          asignar las obras sin volver a registrar las mesas.
        </p>
        <label for="catalog-room-name">Nombre visible de la sala</label>
        <input id="catalog-room-name" name="room-name" maxlength="120" required />
        <label class="catalog-check">
          <input name="is-published" type="checkbox" checked />
          <span>Publicar la sala para que puedan verla los visitantes</span>
        </label>
        <button class="button button--secondary" type="submit">Crear sala</button>
      </form>

      <div data-catalog="workspace" hidden>
        <div class="catalog-room-summary">
          <div>
            <span>Sala activa</span>
            <strong data-catalog="room-name">—</strong>
          </div>
          <span class="catalog-publication" data-catalog="publication">—</span>
        </div>

        <section class="catalog-section" aria-labelledby="upload-title">
          <div class="catalog-section__heading">
            <div>
              <h3 id="upload-title">1. Cargar una obra</h3>
              <p>El STL original se conserva en Storage y solo se descarga al seleccionarlo.</p>
            </div>
          </div>

          <form class="artwork-upload" data-catalog="upload-form">
            <label class="catalog-field catalog-field--wide">
              <span>Archivo STL</span>
              <input name="stl" type="file" accept=".stl,model/stl" required />
            </label>
            <p class="file-inspection" data-catalog="file-inspection">
              Todavía no se analizó ningún archivo.
            </p>
            <label class="catalog-field">
              <span>Nombre de la obra</span>
              <input name="name" maxlength="160" required />
            </label>
            <label class="catalog-field">
              <span>Autor o autora</span>
              <input name="author" maxlength="160" required />
            </label>
            <label class="catalog-field catalog-field--wide">
              <span>Descripción</span>
              <textarea name="description" maxlength="2000" rows="3"></textarea>
            </label>
            <label class="catalog-field">
              <span>Escala inicial</span>
              <input
                name="scale"
                type="number"
                value="1"
                min="0.000001"
                max="1000"
                step="any"
                required
              />
            </label>
            <p class="catalog-scale-help">
              No se adivinan unidades: 1 conserva la medida del STL; 0,001 suele
              convertir milímetros a metros. Podés corregirla después.
            </p>
            <button class="button button--secondary catalog-field--wide" type="submit">
              Subir obra
            </button>
          </form>
        </section>

        <section class="catalog-section" aria-labelledby="library-title">
          <div class="catalog-section__heading">
            <div>
              <h3 id="library-title">2. Biblioteca de obras</h3>
              <p>La escala se aplica cuando el modelo se vuelve a cargar en el casco.</p>
            </div>
            <strong data-catalog="artwork-count">0 obras</strong>
          </div>
          <div class="artwork-library" data-catalog="artwork-list"></div>
        </section>

        <section class="catalog-section" aria-labelledby="assignments-title">
          <div class="catalog-section__heading">
            <div>
              <h3 id="assignments-title">3. Asignar obras a las mesas</h3>
              <p data-catalog="scene-label">Elegí una escena arriba.</p>
            </div>
          </div>
          <form data-catalog="assignments-form">
            <div class="assignment-grid" data-catalog="assignments"></div>
            <button class="button button--secondary" type="submit">
              Guardar asignaciones de esta escena
            </button>
          </form>
        </section>

        <section class="catalog-section catalog-section--danger" aria-labelledby="tables-title">
          <div class="catalog-section__heading">
            <div>
              <h3 id="tables-title">Colocación física</h3>
              <p>
                Las mesas se fijan desde el casco, en orden de Mesa 1 a Mesa 10.
                Esta acción solo borra la distribución guardada en este visor.
              </p>
            </div>
          </div>
          <button class="button button--quiet" data-catalog-action="reset-layout" type="button">
            Volver a colocar las 10 mesas en este visor
          </button>
        </section>
      </div>
    </section>
  `;

  const section = root.querySelector('.admin-catalog');
  const message = root.querySelector('[data-catalog="message"]');
  const createRoomForm = root.querySelector('[data-catalog="create-room"]');
  const roomNameInput = root.querySelector('#catalog-room-name');
  const workspace = root.querySelector('[data-catalog="workspace"]');
  const roomName = root.querySelector('[data-catalog="room-name"]');
  const publication = root.querySelector('[data-catalog="publication"]');
  const uploadForm = root.querySelector('[data-catalog="upload-form"]');
  const fileInput = uploadForm.querySelector('[name="stl"]');
  const fileInspection = root.querySelector('[data-catalog="file-inspection"]');
  const artworkCount = root.querySelector('[data-catalog="artwork-count"]');
  const artworkList = root.querySelector('[data-catalog="artwork-list"]');
  const sceneLabel = root.querySelector('[data-catalog="scene-label"]');
  const assignmentsForm = root.querySelector('[data-catalog="assignments-form"]');
  const assignmentsRoot = root.querySelector('[data-catalog="assignments"]');
  const refreshButton = root.querySelector('[data-catalog-action="refresh"]');
  const resetLayoutButton = root.querySelector('[data-catalog-action="reset-layout"]');

  let isAdmin = false;
  let activeRoomId = null;
  let catalog = null;
  let activeSceneId = null;
  let inspection = null;
  let inspectionToken = 0;
  let busy = false;

  createRoomForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!isAdmin || busy) {
      return;
    }

    await runBusy(async () => {
      await onCreateRoom({
        roomId: activeRoomId,
        name: createRoomForm.elements['room-name'].value,
        isPublished: createRoomForm.elements['is-published'].checked,
      });
    }, 'Creando sala, mesas y escenas…');
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0] ?? null;
    const token = ++inspectionToken;
    inspection = null;

    if (!file) {
      setFileInspection('Todavía no se analizó ningún archivo.');
      return;
    }

    setFileInspection('Analizando cantidad de polígonos…');

    try {
      const result = await onInspectFile(file);

      if (token !== inspectionToken || file !== fileInput.files?.[0]) {
        return;
      }

      inspection = { file, ...result };
      const sizeMb = result.size / (1024 * 1024);
      const warning = result.shouldWarn
        ? ' Advertencia: supera el límite recomendado de 100.000 polígonos.'
        : ' Complejidad aceptable para continuar.';
      setFileInspection(
        `${result.polygonCount.toLocaleString('es-AR')} polígonos · ${sizeMb.toFixed(2)} MB.${warning}`,
        result.shouldWarn ? 'warning' : 'ok',
      );
    } catch (error) {
      if (token === inspectionToken) {
        setFileInspection(error.message, 'error');
      }
    }
  });

  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!catalog || busy) {
      return;
    }

    const file = fileInput.files?.[0] ?? null;

    await runBusy(async () => {
      let currentInspection = inspection;

      if (!file) {
        throw new Error('Seleccioná un archivo STL.');
      }

      if (!currentInspection || currentInspection.file !== file) {
        currentInspection = { file, ...(await onInspectFile(file)) };
      }

      await onUploadArtwork({
        file,
        name: uploadForm.elements.name.value,
        author: uploadForm.elements.author.value,
        description: uploadForm.elements.description.value,
        scale: uploadForm.elements.scale.value,
        polygonCount: currentInspection.polygonCount,
      });
      uploadForm.reset();
      uploadForm.elements.scale.value = '1';
      inspection = null;
      inspectionToken += 1;
      setFileInspection('Obra subida. Podés seleccionar otro STL.');
    }, 'Subiendo el STL original y registrando la obra…');
  });

  artworkList.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-artwork-edit]');

    if (!form) {
      return;
    }

    event.preventDefault();

    await runBusy(
      () =>
        onUpdateArtwork({
          artworkId: form.dataset.artworkEdit,
          name: form.elements.name.value,
          author: form.elements.author.value,
          description: form.elements.description.value,
          scale: form.elements.scale.value,
        }),
      'Actualizando título, autor, descripción y escala…',
    );
  });

  assignmentsForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!catalog || !activeSceneId || busy) {
      return;
    }

    const assignments = Object.fromEntries(
      catalog.tableSlots.map((slot) => [
        slot.id,
        assignmentsForm.elements[`assignment:${slot.id}`]?.value || null,
      ]),
    );

    await runBusy(
      () => onSaveAssignments({ sceneId: activeSceneId, assignments }),
      'Guardando una obra por mesa para esta escena…',
    );
  });

  refreshButton.addEventListener('click', () => {
    if (!busy) {
      void runBusy(onRefresh, 'Actualizando la sala desde Supabase…');
    }
  });

  resetLayoutButton.addEventListener('click', async () => {
    if (busy || !catalog) {
      return;
    }

    const confirmed = window.confirm(
      `¿Volver a colocar las 10 mesas de ${catalog.room.name} en este visor?`,
    );

    if (!confirmed) {
      return;
    }

    await runBusy(onResetLayout, 'Borrando la distribución local de mesas…');
  });

  async function runBusy(action, progressMessage) {
    setBusy(true);
    setMessage(progressMessage);

    try {
      await action();
    } catch (error) {
      setMessage(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function setBusy(value) {
    busy = Boolean(value);
    section.querySelectorAll('button, input, textarea, select').forEach((element) => {
      element.disabled = busy;
    });
  }

  function setFileInspection(text, tone = 'neutral') {
    fileInspection.textContent = text;
    fileInspection.dataset.tone = tone;
  }

  function setMessage(text, tone = 'neutral') {
    message.textContent = text;
    message.dataset.tone = tone;
  }

  function renderCatalog() {
    if (!catalog) {
      artworkCount.textContent = '0 obras';
      artworkList.innerHTML = '<p class="catalog-empty">Todavía no hay obras cargadas.</p>';
      assignmentsRoot.innerHTML = '';
      return;
    }

    roomName.textContent = `${catalog.room.name} (${catalog.room.slug})`;
    publication.textContent = catalog.room.isPublished ? 'Publicada' : 'Solo admin';
    publication.dataset.published = String(catalog.room.isPublished);
    artworkCount.textContent = `${catalog.artworkList.length} ${catalog.artworkList.length === 1 ? 'obra' : 'obras'}`;
    artworkList.innerHTML = catalog.artworkList.length
      ? catalog.artworkList.map(renderArtwork).join('')
      : '<p class="catalog-empty">Todavía no hay obras cargadas en esta sala.</p>';
    renderAssignments();
  }

  function renderAssignments() {
    if (!catalog) {
      return;
    }

    const scene = catalog.scenes.find((candidate) => candidate.id === activeSceneId);

    if (!scene) {
      sceneLabel.textContent = 'Esta sala todavía no tiene una escena válida.';
      assignmentsRoot.innerHTML = '';
      return;
    }

    sceneLabel.textContent = `${scene.name}: una obra como máximo en cada mesa.`;
    const artworkOptions = catalog.artworkList
      .map(
        (artwork) =>
          `<option value="${escapeHtml(artwork.id)}">${escapeHtml(artwork.name)} · ${escapeHtml(artwork.author)}</option>`,
      )
      .join('');

    assignmentsRoot.innerHTML = catalog.tableSlots
      .map((slot) => {
        const selectedArtworkId = scene.assignments[slot.id] ?? '';
        const options = `<option value="">Sin obra asignada</option>${artworkOptions}`;

        return `
          <label class="assignment-row">
            <span>${escapeHtml(slot.label)}</span>
            <select name="assignment:${escapeHtml(slot.id)}">
              ${markSelectedOption(options, selectedArtworkId)}
            </select>
          </label>
        `;
      })
      .join('');
  }

  return {
    setRole(role) {
      isAdmin = role === 'admin';
      section.hidden = !isAdmin;
    },
    setRoomId(roomId) {
      activeRoomId = roomId;
      catalog = null;
      activeSceneId = null;
      roomNameInput.value = roomId ? humanizeRoomId(roomId) : '';
      createRoomForm.hidden = true;
      workspace.hidden = true;
      setMessage(
        roomId
          ? `Buscando la sala ${roomId}…`
          : 'Elegí una sala para administrar su contenido.',
      );
    },
    setLoading(text = 'Actualizando la sala desde Supabase…') {
      setMessage(text);
    },
    setMissingRoom(roomId) {
      activeRoomId = roomId;
      catalog = null;
      activeSceneId = null;
      roomNameInput.value = humanizeRoomId(roomId);
      createRoomForm.hidden = false;
      workspace.hidden = true;
      setMessage(`La sala ${roomId} todavía no existe. Podés prepararla ahora.`);
    },
    setCatalog(nextCatalog, sceneId) {
      catalog = nextCatalog;
      activeSceneId = sceneId ?? nextCatalog.scenes[0]?.id ?? null;
      createRoomForm.hidden = true;
      workspace.hidden = false;
      renderCatalog();
      setMessage(
        nextCatalog.isComplete
          ? 'Catálogo listo. Los cambios se guardan en Supabase.'
          : 'La sala está incompleta: revisá que tenga 10 mesas y tres escenas.',
        nextCatalog.isComplete ? 'ok' : 'warning',
      );
    },
    setSceneId(sceneId) {
      activeSceneId = sceneId;
      renderAssignments();
    },
    setMessage,
  };
}

function renderArtwork(artwork) {
  const polygonText = Number.isInteger(artwork.polygonCount)
    ? `${artwork.polygonCount.toLocaleString('es-AR')} polígonos`
    : 'Polígonos sin registrar';
  const warning = artwork.polygonWarning
    ? '<span class="artwork-warning">Revisar complejidad</span>'
    : '';

  return `
    <article class="artwork-card">
      <div class="artwork-card__summary">
        <div>
          <strong>${escapeHtml(artwork.name)}</strong>
          <span>${escapeHtml(artwork.author)}</span>
        </div>
        ${warning}
      </div>
      <small>${escapeHtml(polygonText)}</small>
      <form class="artwork-edit" data-artwork-edit="${escapeHtml(artwork.id)}">
        <label class="catalog-field">
          <span>Título</span>
          <input
            name="name"
            value="${escapeHtml(artwork.name)}"
            maxlength="160"
            required
          />
        </label>
        <label class="catalog-field">
          <span>Autor o autora</span>
          <input
            name="author"
            value="${escapeHtml(artwork.author)}"
            maxlength="160"
            required
          />
        </label>
        <label class="catalog-field artwork-edit__wide">
          <span>Descripción</span>
          <textarea name="description" maxlength="2000" rows="3">${escapeHtml(artwork.description)}</textarea>
        </label>
        <label class="catalog-field">
          <span>Escala</span>
          <input
            name="scale"
            type="number"
            value="${escapeHtml(String(artwork.scale))}"
            min="0.000001"
            max="1000"
            step="any"
            required
          />
        </label>
        <button class="button button--quiet" type="submit">Guardar cambios</button>
      </form>
    </article>
  `;
}

function markSelectedOption(options, selectedValue) {
  if (!selectedValue) {
    return options.replace('<option value="">', '<option value="" selected>');
  }

  const escapedValue = escapeHtml(selectedValue);
  return options.replace(
    `<option value="${escapedValue}">`,
    `<option value="${escapedValue}" selected>`,
  );
}

function humanizeRoomId(roomId) {
  return String(roomId ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
