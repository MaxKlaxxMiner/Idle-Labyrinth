/* tslint:disable:one-line max-line-length interface-name comment-format no-bitwise */
var Laby = (function () {
    function Laby(pixelWidth, pixelHeight, seed) {
        var w = this.fieldWidth = Math.max(2, Math.floor((pixelWidth - 1) / 2)) + 1;
        var h = this.fieldHeight = Math.max(2, Math.floor((pixelHeight - 1) / 2)) + 1;
        this.pixelWidth = w * 2 - 1;
        this.pixelHeight = h * 2 - 1;
        var f = this.field = new Uint32Array(w * h);
        w--;
        h--;
        for (var y = 0; y <= h; y++) {
            for (var x = 0; x <= w; x++) {
                var top = (x === 0 || x === w) && y > 0;
                var left = (y === 0 || y === h) && x > 0;
                var num = top || left ? 0 : x + y * w;
                f[x + y * this.fieldWidth] = (num << 2) | (top ? 1 : 0) | (left ? 2 : 0);
            }
        }
    }
    Laby.prototype.getWall = function (x, y) {
        if (x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight)
            return false;
        if ((x & 1) + (y & 1) === 0)
            return true;
        if ((x & 1) + (y & 1) === 2)
            return false;
        var node = this.field[Math.floor((x + 1) / 2) + Math.floor((y + 1) / 2) * this.fieldWidth];
        return (x & 1) === 0 ? (node & 1) === 1 : (node & 2) === 2;
    };
    return Laby;
})();
//# sourceMappingURL=laby.js.map