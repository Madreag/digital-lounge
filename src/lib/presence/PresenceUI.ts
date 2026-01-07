/**
 * Presence UI
 *
 * Renders the presence UI components:
 * - Collapsible player list sidebar
 * - Status indicators
 * - Typing indicator
 * - Join/leave notifications
 * - Player count in header
 */

import { PresenceManager } from './PresenceManager.js';
import { PlayerState, PlayerStatus, colorToCSS } from '../player/types.js';

/** How long to show join/leave notifications */
const NOTIFICATION_DURATION = 5000;

/** Max notifications to show at once */
const MAX_NOTIFICATIONS = 5;

interface Notification {
  id: number;
  message: string;
  type: 'join' | 'leave';
  timestamp: number;
}

export class PresenceUI {
  private presence: PresenceManager;
  private container: HTMLElement;

  // UI Elements
  private playerListContainer: HTMLElement | null = null;
  private playerList: HTMLElement | null = null;
  private playerCountBadge: HTMLElement | null = null;
  private typingIndicator: HTMLElement | null = null;
  private notificationContainer: HTMLElement | null = null;
  private toggleButton: HTMLElement | null = null;

  private isCollapsed = false;
  private notifications: Notification[] = [];
  private notificationId = 0;
  private unsubscribers: (() => void)[] = [];

  constructor(presence: PresenceManager, container: HTMLElement) {
    this.presence = presence;
    this.container = container;
    this.createUI();
    this.setupEventHandlers();
  }

  /** Clean up */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    if (this.playerListContainer) {
      this.playerListContainer.remove();
    }
    if (this.typingIndicator) {
      this.typingIndicator.remove();
    }
    if (this.notificationContainer) {
      this.notificationContainer.remove();
    }
  }

  private createUI(): void {
    this.createStyles();
    this.createPlayerListSidebar();
    this.createTypingIndicator();
    this.createNotificationContainer();
    this.createPlayerCountHeader();
  }

  private createStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* Player List Sidebar */
      .presence-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        width: 280px;
        height: 100vh;
        background: linear-gradient(180deg, rgba(26, 26, 46, 0.95) 0%, rgba(20, 20, 35, 0.98) 100%);
        border-left: 1px solid rgba(255, 0, 255, 0.3);
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        z-index: 1000;
        transition: transform 0.3s ease;
        box-shadow: -5px 0 20px rgba(0, 0, 0, 0.5);
      }

      .presence-sidebar.collapsed {
        transform: translateX(240px);
      }

      .presence-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.2);
      }

      .presence-sidebar-title {
        color: #00ffff;
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
      }

      .presence-toggle-btn {
        width: 32px;
        height: 32px;
        background: rgba(255, 0, 255, 0.2);
        border: 1px solid rgba(255, 0, 255, 0.4);
        border-radius: 4px;
        color: #ff00ff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .presence-toggle-btn:hover {
        background: rgba(255, 0, 255, 0.3);
        box-shadow: 0 0 10px rgba(255, 0, 255, 0.3);
      }

      .presence-toggle-btn svg {
        transition: transform 0.3s ease;
      }

      .presence-sidebar.collapsed .presence-toggle-btn svg {
        transform: rotate(180deg);
      }

      /* Player List */
      .presence-player-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }

      .presence-player-list::-webkit-scrollbar {
        width: 6px;
      }

      .presence-player-list::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
      }

      .presence-player-list::-webkit-scrollbar-thumb {
        background: rgba(255, 0, 255, 0.3);
        border-radius: 3px;
      }

      .presence-player-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        margin-bottom: 6px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border: 1px solid transparent;
        transition: all 0.2s ease;
      }

      .presence-player-item:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .presence-player-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        color: #fff;
        margin-right: 12px;
        position: relative;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }

      .presence-status-dot {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid rgba(26, 26, 46, 0.95);
      }

      .presence-status-dot.active {
        background: #00ff88;
        box-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
      }

      .presence-status-dot.idle {
        background: #ffaa00;
        box-shadow: 0 0 8px rgba(255, 170, 0, 0.6);
      }

      .presence-status-dot.away {
        background: #888888;
      }

      .presence-player-info {
        flex: 1;
        min-width: 0;
      }

      .presence-player-name {
        color: #ffffff;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .presence-player-status {
        color: #888888;
        font-size: 11px;
        text-transform: capitalize;
        margin-top: 2px;
      }

      .presence-player-typing {
        color: #00ffff;
        font-size: 11px;
        animation: pulse 1.5s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* Player Count Header Badge */
      .presence-player-count {
        position: fixed;
        top: 20px;
        right: 300px;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(0, 255, 255, 0.3);
        border-radius: 20px;
        padding: 6px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        z-index: 999;
        transition: right 0.3s ease;
      }

      .presence-sidebar.collapsed ~ .presence-player-count,
      .presence-player-count.sidebar-collapsed {
        right: 60px;
      }

      .presence-player-count-icon {
        color: #00ffff;
      }

      .presence-player-count-number {
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
      }

      .presence-player-count-label {
        color: #888888;
        font-size: 12px;
      }

      /* Typing Indicator */
      .presence-typing-indicator {
        position: fixed;
        bottom: 80px;
        left: 20px;
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(0, 255, 255, 0.3);
        border-radius: 20px;
        padding: 8px 16px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #00ffff;
        font-size: 13px;
        z-index: 999;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.3s ease;
        pointer-events: none;
      }

      .presence-typing-indicator.visible {
        opacity: 1;
        transform: translateY(0);
      }

      .presence-typing-dots {
        display: inline-flex;
        gap: 3px;
        margin-left: 6px;
      }

      .presence-typing-dots span {
        width: 6px;
        height: 6px;
        background: #00ffff;
        border-radius: 50%;
        animation: typingBounce 1.4s infinite ease-in-out;
      }

      .presence-typing-dots span:nth-child(1) { animation-delay: 0s; }
      .presence-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
      .presence-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes typingBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Notifications */
      .presence-notifications {
        position: fixed;
        bottom: 20px;
        left: 20px;
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        z-index: 999;
        pointer-events: none;
      }

      .presence-notification {
        background: rgba(0, 0, 0, 0.8);
        border-radius: 8px;
        padding: 10px 16px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 13px;
        color: #ffffff;
        border-left: 3px solid;
        animation: slideIn 0.3s ease;
        opacity: 1;
        transition: opacity 0.3s ease;
      }

      .presence-notification.join {
        border-left-color: #00ff88;
      }

      .presence-notification.leave {
        border-left-color: #ff6666;
      }

      .presence-notification.fade-out {
        opacity: 0;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* Empty State */
      .presence-empty {
        text-align: center;
        padding: 40px 20px;
        color: #666666;
        font-size: 13px;
      }

      .presence-empty-icon {
        font-size: 40px;
        margin-bottom: 12px;
        opacity: 0.5;
      }
    `;
    document.head.appendChild(style);
  }

  private createPlayerListSidebar(): void {
    this.playerListContainer = document.createElement('div');
    this.playerListContainer.className = 'presence-sidebar';
    this.playerListContainer.innerHTML = `
      <div class="presence-sidebar-header">
        <span class="presence-sidebar-title">Online Players</span>
        <button class="presence-toggle-btn" title="Toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
      <div class="presence-player-list"></div>
    `;

    this.container.appendChild(this.playerListContainer);
    this.playerList = this.playerListContainer.querySelector('.presence-player-list');
    this.toggleButton = this.playerListContainer.querySelector('.presence-toggle-btn');

    this.toggleButton?.addEventListener('click', () => {
      this.toggleSidebar();
    });
  }

  private createTypingIndicator(): void {
    this.typingIndicator = document.createElement('div');
    this.typingIndicator.className = 'presence-typing-indicator';
    this.typingIndicator.innerHTML = `
      <span class="presence-typing-text"></span>
      <span class="presence-typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </span>
    `;
    this.container.appendChild(this.typingIndicator);
  }

  private createNotificationContainer(): void {
    this.notificationContainer = document.createElement('div');
    this.notificationContainer.className = 'presence-notifications';
    this.container.appendChild(this.notificationContainer);
  }

  private createPlayerCountHeader(): void {
    this.playerCountBadge = document.createElement('div');
    this.playerCountBadge.className = 'presence-player-count';
    this.playerCountBadge.innerHTML = `
      <svg class="presence-player-count-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      <span class="presence-player-count-number">0</span>
      <span class="presence-player-count-label">online</span>
    `;
    this.container.appendChild(this.playerCountBadge);
  }

  private setupEventHandlers(): void {
    // Update player list when players change
    this.unsubscribers.push(
      this.presence.on('players:update', (players) => {
        this.renderPlayerList(players);
        this.updatePlayerCount(players.length);
      })
    );

    // Show join notifications
    this.unsubscribers.push(
      this.presence.on('player:join', (player) => {
        this.showNotification(`${player.username} joined the lounge`, 'join');
      })
    );

    // Show leave notifications
    this.unsubscribers.push(
      this.presence.on('player:leave', ({ username }) => {
        this.showNotification(`${username} left the lounge`, 'leave');
      })
    );

    // Update typing indicator
    this.unsubscribers.push(
      this.presence.on('player:typing', () => {
        this.updateTypingIndicator();
      })
    );
  }

  private toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
    this.playerListContainer?.classList.toggle('collapsed', this.isCollapsed);
    this.playerCountBadge?.classList.toggle('sidebar-collapsed', this.isCollapsed);
  }

  private renderPlayerList(players: PlayerState[]): void {
    if (!this.playerList) return;

    if (players.length === 0) {
      this.playerList.innerHTML = `
        <div class="presence-empty">
          <div class="presence-empty-icon">👋</div>
          <div>No one else is here yet</div>
        </div>
      `;
      return;
    }

    // Sort: active first, then idle, then away
    const statusOrder: Record<PlayerStatus, number> = { active: 0, idle: 1, away: 2 };
    const sorted = [...players].sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.username.localeCompare(b.username);
    });

    this.playerList.innerHTML = sorted
      .map((player) => this.renderPlayerItem(player))
      .join('');
  }

  private renderPlayerItem(player: PlayerState): string {
    const bgColor = colorToCSS(player.color);
    const initial = player.username.charAt(0).toUpperCase();
    const statusText = player.isTyping ? 'typing...' : player.status;
    const statusClass = player.isTyping ? 'presence-player-typing' : 'presence-player-status';
    const isLocal = player.id === this.presence.localId;

    return `
      <div class="presence-player-item" data-player-id="${player.id}">
        <div class="presence-player-avatar" style="background-color: ${bgColor}">
          ${initial}
          <span class="presence-status-dot ${player.status}"></span>
        </div>
        <div class="presence-player-info">
          <div class="presence-player-name">${player.username}${isLocal ? ' (you)' : ''}</div>
          <div class="${statusClass}">${statusText}</div>
        </div>
      </div>
    `;
  }

  private updatePlayerCount(count: number): void {
    const numberEl = this.playerCountBadge?.querySelector('.presence-player-count-number');
    const labelEl = this.playerCountBadge?.querySelector('.presence-player-count-label');

    if (numberEl) {
      numberEl.textContent = count.toString();
    }
    if (labelEl) {
      labelEl.textContent = count === 1 ? 'online' : 'online';
    }
  }

  private updateTypingIndicator(): void {
    if (!this.typingIndicator) return;

    const typingPlayers = this.presence.getTypingPlayers();
    const textEl = this.typingIndicator.querySelector('.presence-typing-text');

    if (typingPlayers.length === 0) {
      this.typingIndicator.classList.remove('visible');
      return;
    }

    let text: string;
    if (typingPlayers.length === 1) {
      text = `${typingPlayers[0].username} is typing`;
    } else if (typingPlayers.length === 2) {
      text = `${typingPlayers[0].username} and ${typingPlayers[1].username} are typing`;
    } else {
      text = `${typingPlayers.length} people are typing`;
    }

    if (textEl) {
      textEl.textContent = text;
    }
    this.typingIndicator.classList.add('visible');
  }

  private showNotification(message: string, type: 'join' | 'leave'): void {
    if (!this.notificationContainer) return;

    const notification: Notification = {
      id: this.notificationId++,
      message,
      type,
      timestamp: Date.now(),
    };

    this.notifications.push(notification);

    // Limit notifications
    while (this.notifications.length > MAX_NOTIFICATIONS) {
      const oldest = this.notifications.shift();
      if (oldest) {
        this.removeNotificationElement(oldest.id);
      }
    }

    // Create notification element
    const el = document.createElement('div');
    el.className = `presence-notification ${type}`;
    el.dataset.notificationId = notification.id.toString();
    el.textContent = message;
    this.notificationContainer.appendChild(el);

    // Auto-remove after duration
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => {
        this.removeNotificationElement(notification.id);
        this.notifications = this.notifications.filter((n) => n.id !== notification.id);
      }, 300);
    }, NOTIFICATION_DURATION);
  }

  private removeNotificationElement(id: number): void {
    const el = this.notificationContainer?.querySelector(`[data-notification-id="${id}"]`);
    if (el) {
      el.remove();
    }
  }
}
