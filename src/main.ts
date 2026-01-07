/**
 * Digital Lounge - Main Entry Point
 *
 * Initializes the presence system for player status tracking,
 * typing indicators, and join/leave notifications.
 */

import { LoungeClient } from './lib/websocket/client.js';
import { PresenceManager } from './lib/presence/PresenceManager.js';
import { PresenceUI } from './lib/presence/PresenceUI.js';

// Configuration
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

// Initialize WebSocket client
const client = new LoungeClient({
  url: WS_URL,
  autoReconnect: true,
  reconnectInterval: 2000,
  maxReconnectAttempts: 10,
});

// Initialize presence system
const presenceManager = new PresenceManager(client);
const presenceUI = new PresenceUI(presenceManager, document.body);

// Connect to server
client.connect();

// Log connection state changes
client.onStateChange((state, previousState) => {
  console.log(`[Main] Connection: ${previousState} -> ${state}`);

  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.className = `connection-status ${state}`;
    statusEl.textContent = state === 'connected' ? 'Connected' :
                           state === 'connecting' ? 'Connecting...' :
                           state === 'reconnecting' ? 'Reconnecting...' : 'Disconnected';
  }
});

// Example: Wire up chat input for typing indicator
const chatInput = document.getElementById('chat-input') as HTMLInputElement | null;
if (chatInput) {
  chatInput.addEventListener('input', () => {
    presenceManager.setTyping(chatInput.value.length > 0);
  });

  chatInput.addEventListener('blur', () => {
    presenceManager.setTyping(false);
  });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  presenceUI.dispose();
  presenceManager.dispose();
  client.disconnect();
});

// Export for debugging
declare global {
  interface Window {
    lounge: {
      client: LoungeClient;
      presence: PresenceManager;
    };
  }
}

window.lounge = {
  client,
  presence: presenceManager,
};

console.log('[Digital Lounge] Presence system initialized');
