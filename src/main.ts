import "./style.css";
import { Game } from "./game/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const uiRoot = document.querySelector<HTMLElement>("#ui-root");

if (!canvas || !uiRoot) {
  throw new Error("No se encontraron los contenedores de Sky Flight.");
}

const game = new Game(canvas, uiRoot);
game.start();
