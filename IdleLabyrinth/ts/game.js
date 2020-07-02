/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
var Game = (function () {
    function Game(gameDiv) {
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
    Game.prototype.drawLabyRect = function (pixX, pixY, width, height, zoom) {
        var laby = this.laby;
        var d = this.bitmapData;
        var startX = 0;
        var endX = Math.floor(1280 / zoom);
        var startY = 0;
        var endY = Math.floor(720 / zoom);
        for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
                var c = laby.getWall(x, y) ? 0x000000 : 0xd3d3d3;
                var line = x * zoom + (y * zoom) * 1280;
                for (var cy = 0; cy < zoom; cy++) {
                    for (var cx = 0; cx < zoom; cx++) {
                        d[line + cx] = c;
                    }
                    line += 1280;
                }
            }
        }
    };
    Game.prototype.draw = function () {
        var m = performance.now();
        if (!this.laby)
            this.laby = new Laby(1000, 1000, 1234567890);
        this.drawLabyRect(0, 0, 1280, 720, 10);
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