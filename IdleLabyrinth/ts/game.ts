 /* tslint:disable:one-line max-line-length interface-name comment-format */

class Game
{
  static test(gameDiv: HTMLElement): void
  {
    gameDiv.style.width = "1280px";
    gameDiv.style.height = "720px";
    gameDiv.style.backgroundColor = "#036";
  }
}

window.onload = () =>
{
  var div = document.getElementById("game");
  Game.test(div);
}
