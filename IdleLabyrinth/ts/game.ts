/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */

/// <reference path="laby.ts" />

class Game
{
  readonly gameDiv: HTMLElement;
  readonly ctx: CanvasRenderingContext2D;

  readonly bitmap: ImageData;
  readonly bitmapBuf: ArrayBuffer;
  readonly bitmapBuf8: Uint8Array;
  readonly bitmapData: Uint32Array;
  readonly bitmapWidth: number;
  readonly bitmapHeight: number;

  laby: Laby;
  labyOfsX: number;
  labyOfsY: number;
  labyZoom: number;

  constructor(gameDiv: HTMLElement, canvasWidth = 1280, canvasHeight = 720)
  {
    this.gameDiv = gameDiv;
    gameDiv.style.width = canvasWidth + "px";
    gameDiv.style.height = canvasHeight + "px";
    gameDiv.style.backgroundColor = "#036";

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    this.ctx = canvas.getContext("2d");
    gameDiv.appendChild(canvas);

    this.bitmap = this.ctx.createImageData(canvas.width, canvas.height);
    this.bitmapBuf = new ArrayBuffer(this.bitmap.data.length);
    this.bitmapBuf8 = new Uint8Array(this.bitmapBuf);
    this.bitmapData = new Uint32Array(this.bitmapBuf);
    this.bitmapWidth = canvasWidth;
    this.bitmapHeight = canvasHeight;

    this.labyOfsX = 0;
    this.labyOfsY = 0;
    this.labyZoom = 0;
  }

  bitmapScroll(x: number, y: number): void
  {
    const ofs = Math.floor((x + y * this.bitmapWidth) * 4);
    if (ofs === 0) return;
    let tmp: Uint8Array;
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

  static getLabyColor(laby: Laby, x: number, y: number): number
  {
    if (laby.getWall(x, y))
    {
      if (x === 0 || y === 0 || x === laby.pixelWidth - 1 || y === laby.pixelHeight - 1)
      {
        return 0xffb80000; // border
      }
      return 0xff000000; // wall
    }
    else
    {
      return 0xffd3d3d3; // way
    }
  }

  drawFastPixels(labyX: number, labyY: number, zoom: number): void
  {
    const d = this.bitmapData;
    const color = Game.getLabyColor(this.laby, labyX, labyY);
    let line = labyX * zoom + this.labyOfsX + (labyY * zoom + this.labyOfsY) * this.bitmapWidth;
    for (let cy = 0; cy < zoom; cy++)
    {
      for (let cx = 0; cx < zoom; cx++)
      {
        d[line + cx] = color;
      }
      line += this.bitmapWidth;
    }
  }

  drawSafePixels(labyX: number, labyY: number, zoom: number): void
  {
    const d = this.bitmapData;
    const color = Game.getLabyColor(this.laby, labyX, labyY);
    for (let cy = 0; cy < zoom; cy++)
    {
      const py = labyY * zoom + this.labyOfsY + cy;
      if (py < 0 || py >= this.bitmapHeight) continue;
      for (let cx = 0; cx < zoom; cx++)
      {
        const px = labyX * zoom + this.labyOfsX + cx;
        if (px < 0 || px >= this.bitmapWidth) continue;
        d[py * this.bitmapWidth + px] = color;
      }
    }
  }

  drawLabyRect(zoom: number): void
  {
    const laby = this.laby;
    const d = this.bitmapData;
    for (let i = 0; i < d.length; i++) d[i] = 0xff777777; // background

    const startX = Math.max(Math.floor((zoom - this.labyOfsX - 1) / zoom), 1);
    const endX = Math.min(Math.floor((this.bitmapWidth - this.labyOfsX) / zoom), laby.pixelWidth - 1);
    const startY = Math.max(Math.floor((zoom - this.labyOfsY - 1) / zoom), 1);
    const endY = Math.min(Math.floor((this.bitmapHeight - this.labyOfsY) / zoom), laby.pixelHeight - 1);

    // --- fast fill ---
    for (let y = startY; y < endY; y++)
    {
      for (let x = startX; x < endX; x++)
      {
        this.drawFastPixels(x, y, zoom);
      }
    }

    // --- horizontal border ---
    for (let x = startX - 1; x <= endX; x++)
    {
      this.drawSafePixels(x, startY - 1, zoom); // top
      this.drawSafePixels(x, endY, zoom);       // bottom
    }

    // --- vertical border ---
    for (let y = startY; y < endY; y++)
    {
      this.drawSafePixels(startX - 1, y, zoom); // left
      this.drawSafePixels(endX, y, zoom);       // right
    }
  }

  zoomLevels = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 19, 22, 26, 30, 36, 42, 49, 57, 67, 79, 93, 109, 128, 151, 178, 209];

  zoomOut(): void
  {
    this.labyZoom--;
    if (this.labyZoom < 0)
    {
      this.labyZoom = 0;
      return;
    }
  }

  zoomIn(): void
  {
    this.labyZoom++;
    if (this.labyZoom >= this.zoomLevels.length)
    {
      this.labyZoom = this.zoomLevels.length - 1;
      return;
    }
  }

  draw(): void
  {
    let m = performance.now();

    if (!this.laby)
    {
      if (this.labyZoom) return;
      this.labyZoom = 16;
      var width = 1920 * 2;  // 4k
      var height = 1080 * 2;
      document.getElementById("time").innerHTML = " / <span style=color:#fe0>gen: " + width + " x " + height + " ...</span>";
      setTimeout(() => { this.laby = new Laby(width, height, 1234567890); }, 50);
      return;
    }

    if (keys[65]) { this.labyOfsX -= 33; keys[65] = false; } // A
    if (keys[68]) { this.labyOfsX += 33; keys[68] = false; } // D
    if (keys[87]) { this.labyOfsY -= 33; keys[87] = false; } // W
    if (keys[83]) { this.labyOfsY += 33; keys[83] = false; } // S

    this.drawLabyRect(this.zoomLevels[this.labyZoom]);

    this.bitmap.data.set(this.bitmapBuf8);
    this.ctx.putImageData(this.bitmap, 0, 0);

    m = performance.now() - m;
    document.getElementById("time").innerText = " / f-time: " + m.toFixed(2) + " ms";
  }
}

var keys: { [key: string]: boolean; } = {};
var game: Game;

window.onload = () =>
{
  document.body.onkeydown = (e: KeyboardEvent) =>
  {
    console.log("key pressed: " + e.keyCode);
    keys[e.keyCode] = true;
  };
  document.body.onkeyup = (e: KeyboardEvent) =>
  {
    keys[e.keyCode] = false;
  };

  var div = document.getElementById("game");
  var mouseX = 0;
  var mouseY = 0;
  var mouseSpeed = 1;

  div.onmousedown = (m: MouseEvent) =>
  {
    mouseX = m.x;
    mouseY = m.y;
    if (m.buttons & 1)
    {
      div.style.cursor = "grabbing";
    }
  };

  window.onmousewheel = (m: MouseWheelEvent) =>
  {
    if (m.deltaY > 0) game.zoomOut(); else game.zoomIn();
  };

  var moveEvent = (m: MouseEvent) =>
  {
    if ((m.buttons & 1) && div.style.cursor === "grabbing")
    {
      game.labyOfsX += (m.x - mouseX) * mouseSpeed;
      game.labyOfsY += (m.y - mouseY) * mouseSpeed;
    }
    else
    {
      if (div.style.cursor !== "grab") div.style.cursor = "grab";
    }
    mouseX = m.x;
    mouseY = m.y;
  };

  document.onmousemove = moveEvent;
  document.onmouseup = moveEvent;

  var docSize = getDocumentSize();
  game = new Game(div, docSize.width - 20, docSize.height - 20 - 10 - 32 - 32 - 10);

  //window.setInterval(() => game.draw(), 1);

  var run = () => { requestAnimFrame(run); game.draw(); }; run();
};
