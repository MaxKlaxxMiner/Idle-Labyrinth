// Minimal placeholder maze generator (binary random)
// Later replace with e.g. DFS backtracker or Wilson's algorithm.
export function createMaze(cols: number, rows: number): number[][] {
  const cells: number[][] = new Array(rows)
    .fill(0)
    .map(() => new Array(cols).fill(0));

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      cells[y][x] = edge ? 1 : Math.random() < 0.28 ? 1 : 0; // 1 = wall, 0 = floor
    }
  }
  return cells;
}

