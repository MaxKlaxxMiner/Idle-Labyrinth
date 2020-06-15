/* tslint:disable:one-line max-line-length interface-name comment-format */

var requestAnimFrame = (() => (window.requestAnimationFrame || (<any>window).webkitRequestAnimationFrame || (<any>window).mozRequestAnimationFrame || (callback => { window.setTimeout(callback, 1000 / 60); })))();
 