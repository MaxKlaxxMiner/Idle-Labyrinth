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
        this.counter = 0;
        this.bitmap = this.ctx.createImageData(canvas.width, canvas.height);
        this.bitmapBuf = new ArrayBuffer(this.bitmap.data.length);
        this.bitmapBuf8 = new Uint8ClampedArray(this.bitmapBuf);
        this.bitmapData = new Uint32Array(this.bitmapBuf);
    }
    Game.prototype.test = function () {
        var m = performance.now();
        var data = this.bitmapData;
        var c = (performance.now() * 0.1) % 1280;
        for (var y = 0; y < 720; y++) {
            for (var x = 0; x < 1280; x++) {
                data[x + y * 1280] = -16777216 | (Math.floor(x * 0.2 + c) << 16) | (Math.floor(y * 0.355) << 8) | 50; // red
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
    var game = new Game(document.getElementById("game"));
    window.setInterval(function () {
        game.test();
    }, 1);
    //var inc = () => { game.test(); requestAnimFrame(inc) }; inc();
};
//# sourceMappingURL=game.js.map