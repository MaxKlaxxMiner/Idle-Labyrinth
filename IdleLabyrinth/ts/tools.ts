/* tslint:disable:one-line max-line-length interface-name comment-format */

var requestAnimFrame = (() => (window.requestAnimationFrame || (<any>window).webkitRequestAnimationFrame || (<any>window).mozRequestAnimationFrame || (callback => { window.setTimeout(callback, 1000 / 60); })))();

interface DocumentSize
{
  width: number;
  height: number;
}

function getDocumentSize(): DocumentSize
{
  var body = document.body;
  var html = document.documentElement;
  return {
    width: Math.max(body.scrollWidth, body.offsetWidth, html.clientWidth, html.scrollWidth, html.offsetWidth),
    height: Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)
  };
}
