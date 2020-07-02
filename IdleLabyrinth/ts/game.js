/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
var Game = (function () {
    function Game(gameDiv) {
        this.zoomLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80];
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
        for (var i = 0; i < d.length; i++)
            d[i] = 0xffff8000;
        var startX = Math.max(Math.floor((zoom - this.labyOfsX - 1) / zoom), 1);
        var endX = Math.min(Math.floor((1280 - this.labyOfsX) / zoom), laby.pixelWidth - 1);
        var startY = Math.max(Math.floor((zoom - this.labyOfsY - 1) / zoom), 1);
        var endY = Math.min(Math.floor((720 - this.labyOfsY) / zoom), laby.pixelHeight - 1);
        for (var y = startY; y < endY; y++) {
            for (var x = startX; x < endX; x++) {
                var c = laby.getWall(x, y) ? 0xff000000 : 0xffd3d3d3;
                var line = x * zoom + this.labyOfsX + (y * zoom + this.labyOfsY) * 1280;
                for (var cy = 0; cy < zoom; cy++) {
                    for (var cx = 0; cx < zoom; cx++) {
                        d[line + cx] = c;
                    }
                    line += 1280;
                }
            }
        }
    };
    Game.prototype.zoomOut = function () {
        this.labyZoom--;
        if (this.labyZoom < 0) {
            this.labyZoom = 0;
            return;
        }
    };
    Game.prototype.zoomIn = function () {
        this.labyZoom++;
        if (this.labyZoom >= this.zoomLevels.length) {
            this.labyZoom = this.zoomLevels.length - 1;
            return;
        }
    };
    Game.prototype.draw = function () {
        var _this = this;
        var m = performance.now();
        if (!this.laby) {
            if (this.labyZoom)
                return;
            this.labyOfsX = -27;
            this.labyOfsY = -27;
            this.labyZoom = 10;
            var width = 1920 * 2; // 4k
            var height = 1080 * 2;
            document.getElementById("time").innerHTML = " / <span style=color:#fe0>gen: " + width + " x " + height + " ...</span>";
            setTimeout(function () {
                _this.laby = new Laby(width, height, 1234567890);
            }, 50);
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
        this.drawLabyRect(0, 0, 1280, 720, this.zoomLevels[this.labyZoom]);
        this.bitmap.data.set(this.bitmapBuf8);
        this.ctx.putImageData(this.bitmap, 0, 0);
        m = performance.now() - m;
        document.getElementById("time").innerText = " / f-time: " + m.toFixed(2) + " ms";
    };
    return Game;
})();
var keys = {};
var game;
window.onload = function () {
    document.body.onkeydown = function (e) {
        console.log("key pressed: " + e.keyCode);
        keys[e.keyCode] = true;
    };
    document.body.onkeyup = function (e) {
        keys[e.keyCode] = false;
    };
    var div = document.getElementById("game");
    var mouseX = 0;
    var mouseY = 0;
    var mouseSpeed = 3;
    div.onmousedown = function (m) {
        mouseX = m.x;
        mouseY = m.y;
        if (m.buttons & 1) {
            div.style.cursor = "grabbing";
        }
    };
    div.onmousewheel = function (m) {
        if (m.wheelDelta < 0)
            game.zoomOut();
        else
            game.zoomIn();
    };
    var moveEvent = function (m) {
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
    game = new Game(div);
    //window.setInterval(() => game.draw(), 10);
    var run = function () {
        requestAnimFrame(run);
        game.draw();
    };
    run();
};
//# sourceMappingURL=game.js.map