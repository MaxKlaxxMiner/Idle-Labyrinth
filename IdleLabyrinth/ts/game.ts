/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */

class Game
{
  gameDiv: HTMLElement;
  ctx: CanvasRenderingContext2D;

  bitmap: ImageData;
  bitmapBuf: ArrayBuffer;
  bitmapBuf8: Uint8Array;
  bitmapData: Uint32Array;

  laby: Laby;

  constructor(gameDiv: HTMLElement)
  {
    this.gameDiv = gameDiv;
    gameDiv.style.width = "1280px";
    gameDiv.style.height = "720px";
    gameDiv.style.backgroundColor = "#036";

    var canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    this.ctx = canvas.getContext("2d", { alpha: false, antialias: false, depth: false });
    gameDiv.appendChild(canvas);

    this.bitmap = this.ctx.createImageData(canvas.width, canvas.height);
    this.bitmapBuf = new ArrayBuffer(this.bitmap.data.length);
    this.bitmapBuf8 = new Uint8Array(this.bitmapBuf);
    this.bitmapData = new Uint32Array(this.bitmapBuf);

    this.laby = new Laby(1280 / 32, 720 / 32, 12345);
  }

  bitmapScroll(x: number, y: number): void
  {
    var ofs = Math.floor((x + y * 1280) * 4);
    if (ofs === 0) return;
    var tmp: Uint8Array;
    if (ofs >= 0)
    {
      tmp = new Uint8Array(this.bitmapBuf, 0, this.bitmapBuf.byteLength - ofs);
      this.bitmapBuf8.set(tmp, ofs);
    }
    else
    {
      tmp = new Uint8Array(this.bitmapBuf, -ofs, this.bitmapBuf.byteLength + ofs);
      this.bitmapBuf8.set(tmp, 0);
    }
  }

  bitmapDraw(startX: number, startY: number, width: number, height: number, c: number): void
  {
    var data = this.bitmapData;
    var endX = startX + width;
    var endY = startY + height;
    for (var y = startY; y < endY; y++)
    {
      for (var x = startX; x < endX; x++)
      {
        data[x + y * 1280] =
        -16777216 |    // alpha (255 << 24)
        (Math.floor(x * 0.2 + c) << 16) |    // blue
        (Math.floor(y * 0.355) << 8) |    // green
        80;            // red
      }
    }
  }

  draw(): void
  {
    var m = performance.now();

    var laby = this.laby;
    var w = laby.pixelWidth;
    var h = laby.pixelHeight;
    var d = this.bitmapData;

    var mul = 32;
    for (var y = 0; y < h; y++)
    {
      for (var x = 0; x < w; x++)
      {
        var c = laby.getWall(x, y) ? 0xaaaaaa : 0x000000;
        for (var cy = 0; cy < mul; cy++)
        {
          var p = x * mul + (y * mul + cy) * 1280;
          for (var cx = 0; cx < mul; cx++)
          {
            d[p + cx] = c;
          }
        }
      }
    }

    this.bitmap.data.set(this.bitmapBuf8);
    this.ctx.putImageData(this.bitmap, 0, 0);

    m = performance.now() - m;
    document.getElementById("time").innerText = " / f-time: " + m.toFixed(2) + " ms";
  }
}

window.onload = () =>
{
  game = new Game(document.getElementById("game"));

  //window.setInterval(() => game.draw(), 10);

  var run = () => { requestAnimFrame(run); game.draw(); }; run();
};

var game: Game;