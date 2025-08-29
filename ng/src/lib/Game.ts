import { Laby } from './Laby';
import { Input } from './Input';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTime = 0;

  // Simple state for the idle loop
  private tickCount = 0;
  private cells: number[][] = [];
  private static readonly BASE_SEED = 123456;

  // FPS measurement (updated roughly once per second)
  private fpsTimer = 0;
  private fpsFrames = 0;
  private fpsShown = 0;

  // Input and player state
  private input = new Input();
  private level = 0; // gameLevel beginnt bei 0
  private player = { x: 1, y: 1, r: 0.35, speed: 4.0 };
  private goal = { x: 0, y: 0 };
  private zoom = 1.0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D Context nicht verfügbar');
    this.ctx = ctx;

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();

    // Initial maze via Laby anhand Level 0
    this.cells = this.generateCellsForLevel(this.level);
    this.placePlayerAndGoal();
  }

  start() {
    if (this.rafId != null) return;
    this.lastTime = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(1, (t - this.lastTime) / 1000);
      this.lastTime = t;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private update(dt: number) {
    // Idle tick progression — expand later with resources, upgrades, etc.
    this.tickCount += 1;

    // FPS accounting
    this.fpsTimer += dt;
    this.fpsFrames += 1;
    if (this.fpsTimer >= 1) {
      this.fpsShown = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsTimer -= 1;
      this.fpsFrames = 0;
    }

    // Zoom controls
    const zd = this.input.zoomDelta();
    if (!Number.isNaN(zd)) {
      if (zd > 0) this.zoom = Math.min(3, this.zoom + 0.02);
      if (zd < 0) this.zoom = Math.max(0.5, this.zoom - 0.02);
    } else {
      this.zoom = 1.0;
    }

    // Discrete stepping: each key press moves to next node (2 tiles)
    const step = this.input.consumeStepDir();
    if (step) {
      const sx = step.dx * 2;
      const sy = step.dy * 2;
      const nx = this.player.x + sx;
      const ny = this.player.y + sy;
      if (this.canStepTo(this.player.x, this.player.y, nx, ny)) {
        this.player.x = nx;
        this.player.y = ny;
      }
    }

    // Goal check
    const dx = (this.player.x + 0.5) - (this.goal.x + 0.5);
    const dy = (this.player.y + 0.5) - (this.goal.y + 0.5);
    if (Math.hypot(dx, dy) < 0.5) {
      this.level += 1;
      this.cells = this.generateCellsForLevel(this.level);
      this.placePlayerAndGoal();
    }
  }

  private render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid sizing + camera
    const cols = this.cells[0]?.length ?? 1;
    const rows = this.cells.length;
    const basePad = 8;
    const cw = Math.floor((w - basePad * 2) / cols);
    const ch = Math.floor((h - basePad * 2) / rows);
    const sizeBase = Math.max(2, Math.min(cw, ch));
    const size = Math.max(2, Math.floor(sizeBase * this.zoom));
    const worldW = cols * size;
    const worldH = rows * size;
    const playerPx = (this.player.x + 0.5) * size;
    const playerPy = (this.player.y + 0.5) * size;
    let ox = Math.floor(w / 2 - playerPx);
    let oy = Math.floor(h / 2 - playerPy);
    // Clamp camera if world smaller than canvas, center it; else constrain panning
    if (worldW <= w) ox = Math.floor((w - worldW) / 2);
    else ox = Math.max(w - worldW, Math.min(0, ox));
    if (worldH <= h) oy = Math.floor((h - worldH) / 2);
    else oy = Math.max(h - worldH, Math.min(0, oy));

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = this.cells[y][x];
        ctx.fillStyle = v === 1 ? '#1f2937' : '#0b0b0b';
        ctx.fillRect(ox + x * size, oy + y * size, size - 1, size - 1);
      }
    }

    // Draw goal
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(ox + this.goal.x * size + size * 0.25, oy + this.goal.y * size + size * 0.25, size * 0.5, size * 0.5);

    // Draw player (yellow circle)
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(ox + (this.player.x + 0.5) * size, oy + (this.player.y + 0.5) * size, this.player.r * size, 0, Math.PI * 2);
    ctx.fill();

    // HUD
    ctx.fillStyle = '#eaeaea';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    const lines = [
      `FPS: ${this.fpsShown}`,
      `Level: ${this.level + 1}`,
      `Zoom: ${this.zoom.toFixed(2)} (+= / - , 0 reset)`,
      `Move: WASD/↑↓←→  Ziel: Blaues Feld`,
    ];
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 8, 8 + i * 14);
  }

  private onResize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    this.ctx.imageSmoothingEnabled = false;
  }

  private generateCells(cols: number, rows: number): number[][] {
    // Seed nach Vorgabe: BASE_SEED + w + h + gameLevel
    const laby = new Laby(cols, rows, Game.BASE_SEED + cols + rows + this.level);
    const outCols = laby.width * 2 - 1;
    const outRows = laby.height * 2 - 1;
    const cells: number[][] = new Array(outRows).fill(0).map(() => new Array(outCols).fill(0));

    for (let y = 0; y < outRows; y++) {
      for (let x = 0; x < outCols; x++) {
        if ((x & 1) === 0 && (y & 1) === 0) {
          // Intersections are walls
          cells[y][x] = 1;
        } else if ((x & 1) === 0) {
          // Vertical walls
          const pos = (x >> 1) + (y >> 1) * laby.width;
          cells[y][x] = laby.getVWall(pos) ? 1 : 0;
        } else if ((y & 1) === 0) {
          // Horizontal walls
          const pos = (x >> 1) + (y >> 1) * laby.width;
          cells[y][x] = laby.getHWall(pos) ? 1 : 0;
        } else {
          // Cell interior is free
          cells[y][x] = 0;
        }
      }
    }
    return cells;
  }

  private generateCellsForLevel(gameLevel: number): number[][] {
    // Größenentwicklung nach Schnipsel: w,h starten bei 5 und wachsen um 2,
    // gesteuert über das Verhältnis w/h zum goldenen Schnitt.
    let w = 5;
    let h = 5;
    for (let i = 0; i < gameLevel; i++) {
      if (w / h < 1.61803399) w += 2; else h += 2;
    }
    return this.generateCells(w, h);
  }

  private placePlayerAndGoal() {
    // Start: suche erste freie Zelle nahe (1,1)
    const rows = this.cells.length;
    const cols = this.cells[0]?.length ?? 0;
    const isFree = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && this.cells[y][x] === 0;
    // Start bevorzugt ungerade/ungerade (Innenraum)
    let sx = 1, sy = 1;
    if (!isFree(sx, sy)) {
      outer: for (let y = 1; y < rows; y += 2) {
        for (let x = 1; x < cols; x += 2) {
          if (isFree(x, y)) { sx = x; sy = y; break outer; }
        }
      }
    }
    this.player.x = sx; this.player.y = sy;

    // Goal: suche freie Zelle nahe (cols-2, rows-2)
    let gx = Math.max(1, cols - 2), gy = Math.max(1, rows - 2);
    if (!isFree(gx, gy)) {
      outer2: for (let y = rows - 2; y >= 1; y -= 2) {
        for (let x = cols - 2; x >= 1; x -= 2) {
          if (isFree(x, y)) { gx = x; gy = y; break outer2; }
        }
      }
    }
    this.goal.x = gx; this.goal.y = gy;
  }

  private canStepTo(cx: number, cy: number, nx: number, ny: number): boolean {
    const rows = this.cells.length;
    const cols = this.cells[0]?.length ?? 0;
    if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) return false;
    // Ensure stepping by 2 in a cardinal direction
    const dx = nx - cx, dy = ny - cy;
    if (!((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0))) return false;
    // Intermediate edge must be free and destination cell must be free
    const mx = cx + Math.sign(dx);
    const my = cy + Math.sign(dy);
    const isFree = (x: number, y: number) => this.cells[y]?.[x] === 0;
    return isFree(mx, my) && isFree(nx, ny);
  }
}
