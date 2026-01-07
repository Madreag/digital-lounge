import { DigitalLounge } from './game/DigitalLounge';

const container = document.getElementById('game-container');
if (!container) {
  throw new Error('Game container not found');
}

const game = new DigitalLounge(container);
game.start();

window.addEventListener('resize', () => {
  game.onWindowResize();
});

window.addEventListener('beforeunload', () => {
  game.dispose();
});
