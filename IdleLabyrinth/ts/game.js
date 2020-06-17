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
        this.ctx = canvas.getContext("2d");
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
    Game.prototype.test = function () {
        var m = performance.now();
        var c = Math.floor(m * 0.1);
        if (scrollMode) {
            if (this.lastC) {
                var dif = c - this.lastC;
                if (dif > 0) {
                    dif *= 5;
                    this.bitmapScroll(-dif, 0);
                    this.bitmapDraw(1280 - dif, 0, dif, 720, c);
                }
            }
            else {
                this.bitmapDraw(0, 0, 1280, 720, c);
            }
        }
        else {
            this.bitmapDraw(0, 0, 1280, 720, c);
        }
        this.lastC = c;
        this.bitmap.data.set(this.bitmapBuf8);
        this.ctx.putImageData(this.bitmap, 0, 0);
        m = performance.now() - m;
        document.getElementById("time").innerText = " / f-time: " + m.toFixed(2) + " ms (scroll: " + scrollMode + ")";
    };
    return Game;
})();
window.onload = function () {
    var game = new Game(document.getElementById("game"));
    //window.setInterval(() => game.test(), 10);
    var inc = function () {
        requestAnimFrame(inc);
        game.test();
    };
    inc();
};
var scrollMode = true;
//# sourceMappingURL=game.js.map