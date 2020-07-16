/* tslint:disable:one-line max-line-length interface-name comment-format */
var requestAnimFrame = (() => (window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || (cb => window.setTimeout(cb, 1000 / 60))))();
function getDocumentSize() {
    const body = document.body;
    const html = document.documentElement;
    return {
        width: Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, html.scrollWidth, html.offsetWidth),
        height: Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
    };
}
//# sourceMappingURL=tools.js.map