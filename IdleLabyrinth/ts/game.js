/* tslint:disable:one-line max-line-length interface-name comment-format */
var Game = (function () {
    function Game() {
    }
    Game.test = function (gameDiv) {
        gameDiv.style.width = "1280px";
        gameDiv.style.height = "720px";
        gameDiv.style.backgroundColor = "#036";
    };
    return Game;
})();
window.onload = function () {
    var div = document.getElementById("game");
    Game.test(div);
};
