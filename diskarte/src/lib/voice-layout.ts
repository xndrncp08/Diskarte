/**
 * Adaptive grid: pick the column count that makes 16:9 tiles as large as possible for the
 * available stage size (the classic "maximise tile area" search, capped for readability).
 */
export function bestGrid(count: number, width: number, height: number, aspect = 16 / 9, gap = 12): { columns: number; rows: number; tileWidth: number } {
  if (count <= 0 || width <= 0 || height <= 0) return { columns: 1, rows: 1, tileWidth: 0 };
  let best = { columns: 1, rows: count, tileWidth: 0 };
  for (let columns = 1; columns <= Math.min(count, 6); columns++) {
    const rows = Math.ceil(count / columns);
    const maxW = (width - gap * (columns - 1)) / columns;
    const maxH = (height - gap * (rows - 1)) / rows;
    const tileWidth = Math.floor(Math.min(maxW, maxH * aspect));
    if (tileWidth > best.tileWidth) best = { columns, rows, tileWidth };
  }
  return best;
}
