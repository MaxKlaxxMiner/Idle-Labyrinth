/* tslint:disable:one-line max-line-length interface-name comment-format */
var requestAnimFrame = (() => (window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || ((cb) => window.setTimeout(cb, 1000 / 60))))();
function getDocumentSize() {
    const body = document.body;
    const html = document.documentElement;
    return {
        width: Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, html.scrollWidth, html.offsetWidth),
        height: Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
    };
}
/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
/// <reference path="tools.ts" />
class Laby {
    constructor(pixelWidth, pixelHeight, seed) {
        const w = this.fieldWidth = Math.max(2, (pixelWidth - 1) >>> 1) + 1;
        const h = this.fieldHeight = Math.max(2, (pixelHeight - 1) >>> 1) + 1;
        this.pixelWidth = w * 2 - 1;
        this.pixelHeight = h * 2 - 1;
        this.field = new Uint32Array(w * h);
        this.fillBaseWalls();
        this.fillRandomWalls(seed);
    }
    fillBaseWalls() {
        const f = this.field;
        const fw = this.fieldWidth;
        const w = fw - 1;
        const h = this.fieldHeight - 1;
        for (let y = 0; y <= h; y++) {
            for (let x = 0; x <= w; x++) {
                const top = (x === 0 || x === w) && y > 0;
                const left = (y === 0 || y === h) && x > 0;
                const num = top || left ? 0 : x + y * w;
                f[x + y * fw] = (num << 2) | (top ? 1 : 0) | (left ? 2 : 0);
            }
        }
    }
    getRemainList() {
        const r = [];
        const f = this.field;
        const w = this.fieldWidth;
        const h = this.fieldHeight;
        for (let y = 1; y < h; y++) {
            for (let x = 1; x < w; x++) {
                const p = x + y * w;
                const n = f[p];
                if ((n & 1) === 0 && f[p - w] >>> 2 !== n >>> 2)
                    r.push(p);
                if ((n & 2) === 0 && f[p - 1] >>> 2 !== n >>> 2)
                    r.push(-p);
            }
        }
        return r;
    }
    fillWallChain(p, n) {
        const f = this.field;
        let posList = [];
        let nextList = [];
        posList.push(p);
        while (posList.length > 0) {
            for (let i = 0; i < posList.length; i++) {
                p = posList[i];
                if (p < 0 || p >= f.length)
                    console.log("error: " + p);
                if (f[p] >>> 2 === n)
                    continue;
                f[p] = (f[p] & 3) | (n << 2);
                if ((f[p] & 2) === 2 && f[p - 1] >>> 2 !== n)
                    nextList.push(p - 1);
                if ((f[p + 1] & 2) === 2 && f[p + 1] >>> 2 !== n)
                    nextList.push(p + 1);
                if ((f[p] & 1) === 1 && f[p - this.fieldWidth] >>> 2 !== n)
                    nextList.push(p - this.fieldWidth);
                if ((f[p + this.fieldWidth] & 1) === 1 && f[p + this.fieldWidth] >>> 2 !== n)
                    nextList.push(p + this.fieldWidth);
            }
            posList = nextList;
            nextList = [];
        }
    }
    fillRandomWalls(rnd) {
        const f = this.field;
        const fw = this.fieldWidth;
        let remainList = this.getRemainList();
        let remainTicks = remainList.length;
        let remainLimit = (remainTicks + 1) >>> 2;
        while (remainTicks > 0) {
            remainTicks--;
            if (remainTicks < remainLimit) {
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
                if (n1 === n2 || (f[next] & 2) === 2)
                    continue; // wall already set
                f[next] |= 2; // set horizontal wall
                if (n1 < n2)
                    this.fillWallChain(next - 1, n1);
                else
                    this.fillWallChain(next, n2);
            }
            else // --- vertical ---
             {
                const n1 = f[next] >>> 2;
                const n2 = f[next - fw] >>> 2;
                if (n1 === n2 || (f[next] & 1) === 1)
                    continue; // wall already set
                f[next] |= 1; // set vertical wall
                if (n1 < n2)
                    this.fillWallChain(next - fw, n1);
                else
                    this.fillWallChain(next, n2); // angrenzende Wand auffüllen
            }
        }
    }
    getWall(x, y) {
        if (x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight)
            return false;
        if ((x & 1) + (y & 1) === 0)
            return true;
        if ((x & 1) + (y & 1) === 2)
            return false;
        const node = this.field[((x + 1) >>> 1) + ((y + 1) >>> 1) * this.fieldWidth];
        return (x & 1) === 0 ? (node & 1) === 1 : (node & 2) === 2;
    }
}
/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
/// <reference path="laby.ts" />
class Game {
    constructor(gameDiv, canvasWidth = 1280, canvasHeight = 720) {
        this.zoomLevels = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 19, 22, 26, 30, 36, 42, 49, 57, 67, 79, 93, 109, 128, 151, 178, 209];
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
    bitmapScroll(x, y) {
        const ofs = Math.floor((x + y * this.bitmapWidth) * 4);
        if (ofs === 0)
            return;
        let tmp;
        if (ofs >= 0) {
            tmp = new Uint8Array(this.bitmapBuf, 0, this.bitmapBuf.byteLength - ofs);
            this.bitmapBuf8.set(tmp, ofs);
        }
        else {
            tmp = new Uint8Array(this.bitmapBuf, -ofs, this.bitmapBuf.byteLength + ofs);
            this.bitmapBuf8.set(tmp, 0);
        }
    }
    static getLabyColor(laby, x, y) {
        if (laby.getWall(x, y)) {
            if (x === 0 || y === 0 || x === laby.pixelWidth - 1 || y === laby.pixelHeight - 1) {
                return 0xffb80000; // border
            }
            return 0xff000000; // wall
        }
        else {
            return 0xffd3d3d3; // way
        }
    }
    drawFastPixels(labyX, labyY, zoom) {
        const d = this.bitmapData;
        const color = Game.getLabyColor(this.laby, labyX, labyY);
        let line = labyX * zoom + this.labyOfsX + (labyY * zoom + this.labyOfsY) * this.bitmapWidth;
        for (let cy = 0; cy < zoom; cy++) {
            for (let cx = 0; cx < zoom; cx++) {
                d[line + cx] = color;
            }
            line += this.bitmapWidth;
        }
    }
    drawSafePixels(labyX, labyY, zoom) {
        const d = this.bitmapData;
        const color = Game.getLabyColor(this.laby, labyX, labyY);
        for (let cy = 0; cy < zoom; cy++) {
            const py = labyY * zoom + this.labyOfsY + cy;
            if (py < 0 || py >= this.bitmapHeight)
                continue;
            for (let cx = 0; cx < zoom; cx++) {
                const px = labyX * zoom + this.labyOfsX + cx;
                if (px < 0 || px >= this.bitmapWidth)
                    continue;
                d[py * this.bitmapWidth + px] = color;
            }
        }
    }
    drawLabyRect(zoom) {
        const laby = this.laby;
        const d = this.bitmapData;
        for (let i = 0; i < d.length; i++)
            d[i] = 0xff777777; // background
        const startX = Math.max(Math.floor((zoom - this.labyOfsX - 1) / zoom), 1);
        const endX = Math.min(Math.floor((this.bitmapWidth - this.labyOfsX) / zoom), laby.pixelWidth - 1);
        const startY = Math.max(Math.floor((zoom - this.labyOfsY - 1) / zoom), 1);
        const endY = Math.min(Math.floor((this.bitmapHeight - this.labyOfsY) / zoom), laby.pixelHeight - 1);
        // --- fast fill ---
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                this.drawFastPixels(x, y, zoom);
            }
        }
        // --- horizontal border ---
        for (let x = startX - 1; x <= endX; x++) {
            this.drawSafePixels(x, startY - 1, zoom); // top
            this.drawSafePixels(x, endY, zoom); // bottom
        }
        // --- vertical border ---
        for (let y = startY; y < endY; y++) {
            this.drawSafePixels(startX - 1, y, zoom); // left
            this.drawSafePixels(endX, y, zoom); // right
        }
    }
    zoomOut() {
        this.labyZoom--;
        if (this.labyZoom < 0) {
            this.labyZoom = 0;
            return;
        }
    }
    zoomIn() {
        this.labyZoom++;
        if (this.labyZoom >= this.zoomLevels.length) {
            this.labyZoom = this.zoomLevels.length - 1;
            return;
        }
    }
    draw() {
        let m = performance.now();
        if (!this.laby) {
            if (this.labyZoom)
                return;
            this.labyZoom = 16;
            var width = 1920 * 2; // 4k
            var height = 1080 * 2;
            document.getElementById("time").innerHTML = " / <span style=color:#fe0>gen: " + width + " x " + height + " ...</span>";
            setTimeout(() => { this.laby = new Laby(width, height, 1234567890); }, 50);
            return;
        }
        if (keys[65]) {
            this.labyOfsX -= 33;
            keys[65] = false;
        } // A
        if (keys[68]) {
            this.labyOfsX += 33;
            keys[68] = false;
        } // D
        if (keys[87]) {
            this.labyOfsY -= 33;
            keys[87] = false;
        } // W
        if (keys[83]) {
            this.labyOfsY += 33;
            keys[83] = false;
        } // S
        this.drawLabyRect(this.zoomLevels[this.labyZoom]);
        this.bitmap.data.set(this.bitmapBuf8);
        this.ctx.putImageData(this.bitmap, 0, 0);
        m = performance.now() - m;
        document.getElementById("time").innerText = " / f-time: " + m.toFixed(2) + " ms";
    }
}
var keys = {};
var game;
window.onload = () => {
    document.body.onkeydown = (e) => {
        console.log("key pressed: " + e.keyCode);
        keys[e.keyCode] = true;
    };
    document.body.onkeyup = (e) => {
        keys[e.keyCode] = false;
    };
    var div = document.getElementById("game");
    var mouseX = 0;
    var mouseY = 0;
    var mouseSpeed = 1;
    div.onmousedown = (m) => {
        mouseX = m.x;
        mouseY = m.y;
        if (m.buttons & 1) {
            div.style.cursor = "grabbing";
        }
    };
    window.onmousewheel = (m) => {
        if (m.deltaY > 0)
            game.zoomOut();
        else
            game.zoomIn();
    };
    var moveEvent = (m) => {
        if ((m.buttons & 1) && div.style.cursor === "grabbing") {
            game.labyOfsX += (m.x - mouseX) * mouseSpeed;
            game.labyOfsY += (m.y - mouseY) * mouseSpeed;
        }
        else {
            if (div.style.cursor !== "grab")
                div.style.cursor = "grab";
        }
        mouseX = m.x;
        mouseY = m.y;
    };
    document.onmousemove = moveEvent;
    document.onmouseup = moveEvent;
    var docSize = getDocumentSize();
    game = new Game(div, docSize.width - 20, docSize.height - 20 - 10 - 32 - 32 - 10);
    //window.setInterval(() => game.draw(), 1);
    var run = () => { requestAnimFrame(run); game.draw(); };
    run();
};
//# sourceMappingURL=bundle.js.map