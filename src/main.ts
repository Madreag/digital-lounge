import { DigitalLounge } from './game/DigitalLounge.js';
import { LoungeClient } from './lib/websocket/index.js';
import { ChatManager } from './lib/chat/index.js';
import { ChatUI } from './ui/index.js';

// Get game container
const container = document.getElementById('game-container');
if (!container) {
  throw new Error('Game container not found');
}

// Initialize the game
const game = new DigitalLounge(container);
game.start();

// Initialize WebSocket client
const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const client = new LoungeClient({ url: wsUrl });

// Initialize chat
const chatManager = new ChatManager(client);
const chatUI = new ChatUI(chatManager);
chatUI.mount(document.body);

// Connect to server
client.connect();

// Connection status display
client.onStateChange((state, _prevState) => {
  console.log(`[Main] Connection state: ${state}`);
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.textContent = state;
    statusEl.className = `connection-status connection-${state}`;
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  game.onWindowResize();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  client.disconnect();
  chatManager.dispose();
  chatUI.dispose();
  game.dispose();
});
