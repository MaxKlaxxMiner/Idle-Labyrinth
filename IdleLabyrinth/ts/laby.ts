/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */

class Laby
{
  private fieldWidth: number;
  private fieldHeight: number;
  private field: Uint32Array;
  pixelWidth: number;
  pixelHeight: number;
  seed: number;

  constructor(pixelWidth: number, pixelHeight: number, seed: number)
  {
    var w = this.fieldWidth = Math.max(2,(pixelWidth - 1) >>> 1) + 1;
    var h = this.fieldHeight = Math.max(2,(pixelHeight - 1) >>> 1) + 1;
    this.pixelWidth = w * 2 - 1;
    this.pixelHeight = h * 2 - 1;
    this.field = new Uint32Array(w * h);
    this.seed = seed;

    this.fillBaseWalls();
    this.fillRandomWalls(seed);
  }

  private fillBaseWalls(): void
  {
    var f = this.field;
    var fw = this.fieldWidth;
    var w = fw - 1;
    var h = this.fieldHeight - 1;
    for (var y = 0; y <= h; y++)
    {
      for (var x = 0; x <= w; x++)
      {
        var top = (x === 0 || x === w) && y > 0;
        var left = (y === 0 || y === h) && x > 0;
        var num = top || left ? 0 : x + y * w;
        f[x + y * fw] = (num << 2) | (top ? 1 : 0) | (left ? 2 : 0);
      }
    }
  }

  private getRemainList(): Array<number>
  {
    var r: Array<number> = [];
    var f = this.field;
    var w = this.fieldWidth;
    var h = this.fieldHeight;
    for (var y = 1; y < h; y++)
    {
      for (var x = 1; x < w; x++)
      {
        var p = x + y * w;
        var n = f[p];
        if ((n & 1) === 0 && f[p - w] >>> 2 !== n >>> 2) r.push(p);
        if ((n & 2) === 0 && f[p - 1] >>> 2 !== n >>> 2) r.push(-p);
      }
    }
    return r;
  }

  private fillWallChain(p: number, n: number)
  {
    var f = this.field;

    var posList: Array<number> = [];
    var nextList: Array<number> = [];
    posList.push(p);

    while (posList.length > 0)
    {
      for (var i = 0; i < posList.length; i++)
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
    var f = this.field;
    var fw = this.fieldWidth;

    var remainList = this.getRemainList();
    var remainTicks = remainList.length;
    var remainLimit = (remainTicks + 1) >>> 2;
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

      var next = remainList[(rnd >>> 8) % remainList.length];
      var n1: number, n2: number;
      if (next < 0) // --- horizontal ---
      {
        next = -next;
        n1 = f[next] >>> 2;
        n2 = f[next - 1] >>> 2;
        if (n1 === n2 || (f[next] & 2) === 2) continue; // wall already set

        f[next] |= 2; // set horizontal wall

        if (n1 < n2) this.fillWallChain(next - 1, n1); else this.fillWallChain(next, n2);
      }
      else // --- vertical ---
      {
        n1 = f[next] >>> 2;
        n2 = f[next - fw] >>> 2;
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

    var node = this.field[((x + 1) >>> 1) + ((y + 1) >>> 1) * this.fieldWidth];

    return (x & 1) === 0 ? (node & 1) === 1 : (node & 2) === 2;
  }
}
