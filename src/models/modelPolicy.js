export const STL_POLYGON_WARNING_THRESHOLD = 100_000;

export function assessPolygonCount(polygonCount) {
  if (!Number.isFinite(polygonCount) || polygonCount < 0) {
    throw new TypeError('La cantidad de polígonos debe ser un número no negativo.');
  }

  return {
    polygonCount,
    shouldWarn: polygonCount > STL_POLYGON_WARNING_THRESHOLD,
  };
}
