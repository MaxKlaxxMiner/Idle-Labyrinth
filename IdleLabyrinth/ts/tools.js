/* tslint:disable:one-line max-line-length interface-name comment-format */
var requestAnimFrame = (function () { return (window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || (function (callback) {
    window.setTimeout(callback, 1000 / 60);
})); })();
//# sourceMappingURL=tools.js.map