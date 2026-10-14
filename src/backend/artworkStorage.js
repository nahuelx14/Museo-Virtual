export const STL_BUCKET = 'museum-stl';
export const MAX_STL_BYTES = 50 * 1024 * 1024;
export const POLYGON_WARNING_THRESHOLD = 100_000;

const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateSTLFile(file) {
  const name = String(file?.name ?? '').trim();
  const size = Number(file?.size);

  if (!name.toLowerCase().endsWith('.stl')) {
    throw new Error('Seleccioná un archivo con extensión .stl.');
  }

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('El archivo STL está vacío o no se pudo leer.');
  }

  if (size > MAX_STL_BYTES) {
    throw new Error('El STL supera el límite de 50 MB configurado en Storage.');
  }

  return { name, size };
}

export function buildSTLStoragePath({ roomId, artworkId, fileName }) {
  if (!PATH_SEGMENT_PATTERN.test(String(roomId ?? ''))) {
    throw new Error('El ID de sala no es válido para Storage.');
  }

  if (!PATH_SEGMENT_PATTERN.test(String(artworkId ?? ''))) {
    throw new Error('El ID de obra no es válido para Storage.');
  }

  const safeName = String(fileName ?? '')
    .trim()
    .replace(/\.stl$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  if (!safeName) {
    throw new Error('El nombre del archivo STL no es válido.');
  }

  return `${roomId}/${artworkId}/${safeName}.stl`;
}

export function shouldWarnPolygonCount(polygonCount) {
  return Number.isFinite(polygonCount) && polygonCount > POLYGON_WARNING_THRESHOLD;
}

export async function inspectSTLFile(file) {
  const metadata = validateSTLFile(file);

  if (typeof file.arrayBuffer !== 'function') {
    throw new Error('El navegador no pudo leer el contenido del STL.');
  }

  const buffer = await file.arrayBuffer();
  const polygonCount = countSTLTriangles(buffer);

  if (polygonCount < 1) {
    throw new Error('El STL no contiene triángulos reconocibles.');
  }

  return {
    ...metadata,
    polygonCount,
    shouldWarn: shouldWarnPolygonCount(polygonCount),
  };
}

export function countSTLTriangles(value) {
  const buffer = toArrayBuffer(value);

  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    const expectedByteLength = 84 + triangleCount * 50;

    if (triangleCount > 0 && expectedByteLength === buffer.byteLength) {
      return triangleCount;
    }
  }

  const source = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return source.match(/\bfacet\s+normal\b/gi)?.length ?? 0;
}

export function createArtworkStorage({ client }) {
  if (!client?.storage?.from) {
    throw new TypeError('Se requiere un cliente Supabase Storage válido.');
  }

  const bucket = client.storage.from(STL_BUCKET);

  return {
    async upload({ roomId, artworkId, file }) {
      const { name } = validateSTLFile(file);
      const path = buildSTLStoragePath({ roomId, artworkId, fileName: name });
      const { data, error } = await bucket.upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'model/stl',
        upsert: false,
      });

      if (error) {
        throw new Error(`No se pudo subir el STL: ${error.message}`);
      }

      return data.path;
    },

    async createSignedUrl(path, expiresIn = 3600) {
      const { data, error } = await bucket.createSignedUrl(path, expiresIn);

      if (error) {
        throw new Error(`No se pudo preparar la descarga del STL: ${error.message}`);
      }

      return data.signedUrl;
    },

    async remove(paths) {
      const normalizedPaths = Array.isArray(paths) ? paths : [paths];
      const { error } = await bucket.remove(normalizedPaths.filter(Boolean));

      if (error) {
        throw new Error(`No se pudo eliminar el STL de Storage: ${error.message}`);
      }
    },
  };
}

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }

  throw new TypeError('Se esperaba el contenido binario de un STL.');
}
