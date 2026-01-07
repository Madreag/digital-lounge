import { useState, useEffect, useCallback } from 'react';
import { wsClient, ConnectionState, ServerState } from '../lib/websocket/client';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 16;
const USERNAME_PATTERN = /^[a-zA-Z0-9]+$/;

function validateUsername(username: string): string | null {
  if (username.length === 0) {
    return null;
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username must be alphanumeric only';
  }
  return null;
}

interface ConnectScreenProps {
  serverUrl: string;
  onJoin: (username: string) => void;
}

export function ConnectScreen({ serverUrl, onJoin }: ConnectScreenProps) {
  const [username, setUsername] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [serverState, setServerState] = useState<ServerState>({ playerCount: 0 });
  const [error, setError] = useState<string>('');

  const validationError = validateUsername(username);
  const isUsernameValid = username.length > 0 && validationError === null;
  const isConnected = connectionState === 'connected';
  const canJoin = isUsernameValid && isConnected;

  useEffect(() => {
    const unsubConnection = wsClient.onConnectionChange(setConnectionState);
    const unsubServerState = wsClient.onServerStateChange(setServerState);
    const unsubError = wsClient.onError(setError);

    wsClient.connect(serverUrl);

    return () => {
      unsubConnection();
      unsubServerState();
      unsubError();
    };
  }, [serverUrl]);

  const handleUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setError('');
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (canJoin) {
      wsClient.joinLounge(username);
      onJoin(username);
    }
  }, [canJoin, username, onJoin]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canJoin) {
      wsClient.joinLounge(username);
      onJoin(username);
    }
  }, [canJoin, username, onJoin]);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <h1 style={styles.title}>DIGITAL LOUNGE</h1>

        <div style={styles.statusContainer}>
          <StatusIndicator state={connectionState} />
          <span style={styles.playerCount}>
            {serverState.playerCount} player{serverState.playerCount !== 1 ? 's' : ''} online
          </span>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputContainer}>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter username"
              maxLength={USERNAME_MAX_LENGTH}
              style={styles.input}
              autoFocus
            />
            {validationError && username.length > 0 && (
              <span style={styles.validationError}>{validationError}</span>
            )}
          </div>

          {error && <div style={styles.errorMessage}>{error}</div>}

          <button
            type="submit"
            disabled={!canJoin}
            style={{
              ...styles.button,
              ...(canJoin ? styles.buttonEnabled : styles.buttonDisabled),
            }}
          >
            [ ENTER LOUNGE ]
          </button>
        </form>

        <p style={styles.hint}>
          {!isConnected && connectionState !== 'error' && 'Connecting to server...'}
          {connectionState === 'error' && 'Unable to connect. Please try again.'}
          {isConnected && !isUsernameValid && 'Enter a username (3-16 alphanumeric characters)'}
          {isConnected && isUsernameValid && 'Press Enter or click to join'}
        </p>
      </div>
    </div>
  );
}

function StatusIndicator({ state }: { state: ConnectionState }) {
  const getStatusStyle = () => {
    switch (state) {
      case 'connected':
        return { ...styles.statusDot, backgroundColor: '#00ff00', boxShadow: '0 0 8px #00ff00' };
      case 'connecting':
        return { ...styles.statusDot, backgroundColor: '#ffaa00', boxShadow: '0 0 8px #ffaa00' };
      case 'error':
        return { ...styles.statusDot, backgroundColor: '#ff0000', boxShadow: '0 0 8px #ff0000' };
      default:
        return { ...styles.statusDot, backgroundColor: '#666666' };
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div style={styles.statusIndicator}>
      <div style={getStatusStyle()} />
      <span style={styles.statusText}>{getStatusText()}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    zIndex: 1000,
  },
  panel: {
    backgroundColor: 'rgba(45, 45, 68, 0.9)',
    border: '1px solid #6b4c9a',
    borderRadius: '8px',
    padding: '40px',
    maxWidth: '400px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 0 30px rgba(107, 76, 154, 0.3)',
  },
  title: {
    color: '#ff00ff',
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '24px',
    textShadow: '0 0 15px #ff00ff',
    letterSpacing: '4px',
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    padding: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '4px',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  statusText: {
    color: '#aaaaaa',
    fontSize: '14px',
  },
  playerCount: {
    color: '#00ffff',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid #6b4c9a',
    borderRadius: '4px',
    padding: '12px 16px',
    fontSize: '16px',
    color: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  validationError: {
    color: '#ff6666',
    fontSize: '12px',
    textAlign: 'left',
  },
  errorMessage: {
    color: '#ff6666',
    fontSize: '14px',
    padding: '8px',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: '4px',
  },
  button: {
    padding: '14px 24px',
    fontSize: '18px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    letterSpacing: '2px',
  },
  buttonEnabled: {
    backgroundColor: '#6b4c9a',
    color: '#ffffff',
    boxShadow: '0 0 15px rgba(107, 76, 154, 0.5)',
  },
  buttonDisabled: {
    backgroundColor: '#333344',
    color: '#666666',
    cursor: 'not-allowed',
  },
  hint: {
    color: '#888888',
    fontSize: '12px',
    marginTop: '16px',
    minHeight: '18px',
  },
};
