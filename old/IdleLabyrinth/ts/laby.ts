/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */

/// <reference path="tools.ts" />

class Laby
{
  private readonly fieldWidth: number;
  private readonly fieldHeight: number;
  private readonly field: Uint32Array;
  readonly pixelWidth: number;
  readonly pixelHeight: number;

  constructor(pixelWidth: number, pixelHeight: number, seed: number)
  {
    const w = this.fieldWidth = Math.max(2, (pixelWidth - 1) >>> 1) + 1;
    const h = this.fieldHeight = Math.max(2, (pixelHeight - 1) >>> 1) + 1;
    this.pixelWidth = w * 2 - 1;
    this.pixelHeight = h * 2 - 1;
    this.field = new Uint32Array(w * h);
    this.fillBaseWalls();
    this.fillRandomWalls(seed);
  }

  private fillBaseWalls(): void
  {
    const f = this.field;
    const fw = this.fieldWidth;
    const w = fw - 1;
    const h = this.fieldHeight - 1;
    for (let y = 0; y <= h; y++)
    {
      for (let x = 0; x <= w; x++)
      {
        const top = (x === 0 || x === w) && y > 0;
        const left = (y === 0 || y === h) && x > 0;
        const num = top || left ? 0 : x + y * w;
        f[x + y * fw] = (num << 2) | (top ? 1 : 0) | (left ? 2 : 0);
      }
    }
  }

  private getRemainList(): Array<number>
  {
    const r: Array<number> = [];
    const f = this.field;
    const w = this.fieldWidth;
    const h = this.fieldHeight;
    for (let y = 1; y < h; y++)
    {
      for (let x = 1; x < w; x++)
      {
        const p = x + y * w;
        const n = f[p];
        if ((n & 1) === 0 && f[p - w] >>> 2 !== n >>> 2) r.push(p);
        if ((n & 2) === 0 && f[p - 1] >>> 2 !== n >>> 2) r.push(-p);
      }
    }
    return r;
  }

  private fillWallChain(p: number, n: number)
  {
    const f = this.field;

    let posList: Array<number> = [];
    let nextList: Array<number> = [];
    posList.push(p);

    while (posList.length > 0)
    {
      for (let i = 0; i < posList.length; i++)
      {
        p = posList[i];
        if (p < 0 || p >= f.length) console.log("error: " + p);
        if (f[p] >>> 2 === n) continue;
        f[p] = (f[p] & 3) | (n << 2);
        if ((f[p] & 2) === 2 && f[p - 1] >>> 2 !== n) nextList.push(p - 1);
        if ((f[p + 1] & 2) === 2 && f[p + 1] >>> 2 !== n) nextList.push(p + 1);
        if ((f[p] & 1) === 1 && f[p - this.fieldWidth] >>> 2 !== n) nextList.push(p - this.fieldWidth);
        if ((f[p + this.fieldWidth] & 1) === 1 && f[p + this.fieldWidth] >>> 2 !== n) nextList.push(p + this.fieldWidth);
      }

      posList = nextList;
      nextList = [];
    }
  }

  private fillRandomWalls(rnd: number)
  {
    const f = this.field;
    const fw = this.fieldWidth;

    let remainList = this.getRemainList();
    let remainTicks = remainList.length;
    let remainLimit = (remainTicks + 1) >>> 2;
    while (remainTicks > 0)
    {
      remainTicks--;
      if (remainTicks < remainLimit)
      {
        remainList = this.getRemainList();
        remainTicks = remainList.length;
        remainLimit = (remainTicks + 1) >>> 2;
      }

      rnd = (rnd * 214013 + 2531011) >>> 0;

      let next = remainList[(rnd >>> 8) % remainList.length];
      if (next < 0) // --- horizontal ---
      {
        next = -next;
        const n1 = f[next] >>> 2;
        const n2 = f[next - 1] >>> 2;
        if (n1 === n2 || (f[next] & 2) === 2) continue; // wall already set

        f[next] |= 2; // set horizontal wall

        if (n1 < n2) this.fillWallChain(next - 1, n1); else this.fillWallChain(next, n2);
      }
      else // --- vertical ---
      {
        const n1 = f[next] >>> 2;
        const n2 = f[next - fw] >>> 2;
        if (n1 === n2 || (f[next] & 1) === 1) continue; // wall already set

        f[next] |= 1; // set vertical wall

        if (n1 < n2) this.fillWallChain(next - fw, n1); else this.fillWallChain(next, n2); // angrenzende Wand auffüllen
      }
    }
  }

  getWall(x: number, y: number): boolean
  {
    if (x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight) return false;

    if ((x & 1) + (y & 1) === 0) return true;
    if ((x & 1) + (y & 1) === 2) return false;

    const node = this.field[((x + 1) >>> 1) + ((y + 1) >>> 1) * this.fieldWidth];

    return (x & 1) === 0 ? (node & 1) === 1 : (node & 2) === 2;
  }
}
