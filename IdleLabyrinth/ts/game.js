/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
var Game = (function () {
    function Game(gameDiv, canvasWidth, canvasHeight) {
        if (canvasWidth === void 0) { canvasWidth = 1280; }
        if (canvasHeight === void 0) { canvasHeight = 720; }
        this.zoomLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80];
        this.gameDiv = gameDiv;
        gameDiv.style.width = canvasWidth + "px";
        gameDiv.style.height = canvasHeight + "px";
        gameDiv.style.backgroundColor = "#036";
        var canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        this.ctx = canvas.getContext("2d", { alpha: false, antialias: false, depth: false });
        gameDiv.appendChild(canvas);
        this.bitmap = this.ctx.createImageData(canvas.width, canvas.height);
        this.bitmapBuf = new ArrayBuffer(this.bitmap.data.length);
        this.bitmapBuf8 = new Uint8Array(this.bitmapBuf);
        this.bitmapData = new Uint32Array(this.bitmapBuf);
        this.bitmapWidth = canvasWidth;
        this.bitmapHeight = canvasHeight;
    }
    Game.prototype.bitmapScroll = function (x, y) {
        var ofs = Math.floor((x + y * this.bitmapWidth) * 4);
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
    Game.getLabyColor = function (laby, x, y) {
        if (laby.getWall(x, y)) {
            if (x === 0 || y === 0 || x === laby.pixelWidth - 1 || y === laby.pixelHeight - 1) {
                return 0xffb80000; // border
            }
            return 0xff000000; // wall
        }
        else {
            return 0xffd3d3d3; // way
        }
    };
    Game.prototype.drawFastPixels = function (labyX, labyY, zoom) {
        var d = this.bitmapData;
        var color = Game.getLabyColor(this.laby, labyX, labyY);
        var line = labyX * zoom + this.labyOfsX + (labyY * zoom + this.labyOfsY) * this.bitmapWidth;
        for (var cy = 0; cy < zoom; cy++) {
            for (var cx = 0; cx < zoom; cx++) {
                d[line + cx] = color;
            }
            line += this.bitmapWidth;
        }
    };
    Game.prototype.drawSafePixels = function (labyX, labyY, zoom) {
        var d = this.bitmapData;
        var color = Game.getLabyColor(this.laby, labyX, labyY);
        for (var cy = 0; cy < zoom; cy++) {
            var py = labyY * zoom + this.labyOfsY + cy;
            if (py < 0 || py >= this.bitmapHeight)
                continue;
            for (var cx = 0; cx < zoom; cx++) {
                var px = labyX * zoom + this.labyOfsX + cx;
                if (px < 0 || px >= this.bitmapWidth)
                    continue;
                d[py * this.bitmapWidth + px] = color;
            }
        }
    };
    Game.prototype.drawLabyRect = function (zoom) {
        var laby = this.laby;
        var d = this.bitmapData;
        for (var i = 0; i < d.length; i++)
            d[i] = 0xff777777;
        var x, y;
        var startX = Math.max(Math.floor((zoom - this.labyOfsX - 1) / zoom), 1);
        var endX = Math.min(Math.floor((this.bitmapWidth - this.labyOfsX) / zoom), laby.pixelWidth - 1);
        var startY = Math.max(Math.floor((zoom - this.labyOfsY - 1) / zoom), 1);
        var endY = Math.min(Math.floor((this.bitmapHeight - this.labyOfsY) / zoom), laby.pixelHeight - 1);
        for (y = startY; y < endY; y++) {
            for (x = startX; x < endX; x++) {
                this.drawFastPixels(x, y, zoom);
            }
        }
        for (x = startX - 1; x <= endX; x++) {
            this.drawSafePixels(x, startY - 1, zoom); // top
            this.drawSafePixels(x, endY, zoom); // bottom
        }
        for (y = startY; y < endY; y++) {
            this.drawSafePixels(startX - 1, y, zoom); // left
            this.drawSafePixels(endX, y, zoom); // right
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
        this.drawLabyRect(this.zoomLevels[this.labyZoom]);
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
    var mouseSpeed = 1;
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
    var docSize = getDocumentSize();
    game = new Game(div, docSize.width - 20, docSize.height - 20 - 10 - 32 - 32 - 10);
    //window.setInterval(() => game.draw(), 1);
    var run = function () {
        requestAnimFrame(run);
        game.draw();
    };
    run();
};
//# sourceMappingURL=game.js.map