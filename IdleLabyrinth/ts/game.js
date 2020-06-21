/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
var Game = (function () {
    function Game(gameDiv) {
        this.lastSeed = -1;
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
    }
    Game.prototype.bitmapScroll = function (x, y) {
        var ofs = Math.floor((x + y * 1280) * 4);
        if (ofs === 0)
            return;
        var tmp;
        if (ofs >= 0) {
            tmp = new Uint8Array(this.bitmapBuf, 0, this.bitmapBuf.byteLength - ofs);
            this.bitmapBuf8.set(tmp, ofs);
        }
        else {
            tmp = new Uint8Array(this.bitmapBuf, -ofs, this.bitmapBuf.byteLength + ofs);
            this.bitmapBuf8.set(tmp, 0);
        }
    };
    Game.prototype.bitmapDraw = function (startX, startY, width, height, c) {
        var data = this.bitmapData;
        var endX = startX + width;
        var endY = startY + height;
        for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
                data[x + y * 1280] = -16777216 | (Math.floor(x * 0.2 + c) << 16) | (Math.floor(y * 0.355) << 8) | 80; // red
            }
        }
    };
    Game.prototype.draw = function () {
        var m = performance.now();
        var mul = 4;
        var seed = m / 1 >>> 0;
        if (seed !== this.lastSeed) {
            this.laby = new Laby(1280 / mul, 720 / mul, seed);
            this.lastSeed = seed;
        }
        var laby = this.laby;
        var w = laby.pixelWidth;
        var h = laby.pixelHeight;
        var d = this.bitmapData;
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var c = laby.getWall(x, y) ? 0x000000 : 0xd3d3d3;
                for (var cy = 0; cy < mul; cy++) {
                    var p = x * mul + (y * mul + cy) * 1280;
                    for (var cx = 0; cx < mul; cx++) {
                        d[p + cx] = c;
                    }
                }
            }
        }
        this.bitmap.data.set(this.bitmapBuf8);
        this.ctx.putImageData(this.bitmap, 0, 0);
        m = performance.now() - m;
        document.getElementById("time").innerText = " / f-time: " + m.toFixed(2) + " ms";
    };
    return Game;
})();
window.onload = function () {
    game = new Game(document.getElementById("game"));
    //window.setInterval(() => game.draw(), 10);
    var run = function () {
        requestAnimFrame(run);
        game.draw();
    };
    run();
};
var game;
//# sourceMappingURL=game.js.map