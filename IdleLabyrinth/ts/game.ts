﻿/* tslint:disable:one-line max-line-length interface-name comment-format */

class Game
{
  gameDiv: HTMLElement;
  ctx: CanvasRenderingContext2D;

  constructor(gameDiv: HTMLElement)
  {
    this.gameDiv = gameDiv;
    gameDiv.style.width = "1280px";
    gameDiv.style.height = "720px";
    gameDiv.style.backgroundColor = "#036";

    var canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    this.ctx = canvas.getContext("2d");
    gameDiv.appendChild(canvas);
  }

  test(): void
  {
    var g = this.ctx;
    g.fillRect(100, 100, 1280 - 200, 720 - 200);
  }
}

window.onload = () =>
{
  var game = new Game(document.getElementById("game"));
  game.test();
}
