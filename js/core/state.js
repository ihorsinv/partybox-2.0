export class StateManager {
  constructor() {
    this.state = {
      gameType: null,

      spy: {
        playerCount: 5,
        currentPlayer: 0,
        selectedCats: new Set(),
        spySet: new Set(),
        chosenChar: null,
        cardOpen: false
      },

      secret: {
        role: null,
        roomCode: null,
        grid: [],
        mySelected: null,
        opponentSelection: null,
        myEliminated: new Set(),
        pendingEliminated: new Set(),
        isMyTurn: false,
        gameActive: false,
        stage: 'lobby',
        myReady: false,
        opponentReady: false,
        accuseMode: false,
        status: 'selection',
        currentTurn: 'host',
        winner: null,
        resultShown: false,
        gridBuilt: false,
        selectedCats: new Set()
      }
    };

    this.listeners = new Map();
  }

  getGameState(gameType = this.state.gameType) {
    return gameType === 'spy' ? this.state.spy : this.state.secret;
  }

  setState(gameType, key, value) {
    const gameState = this.getGameState(gameType);
    if (gameState[key] !== value) {
      gameState[key] = value;
      this.notifyListeners(gameType, key, value);
    }
  }

  setStateMultiple(gameType, updates) {
    const gameState = this.getGameState(gameType);
    Object.entries(updates).forEach(([key, value]) => {
      if (gameState[key] !== value) {
        gameState[key] = value;
        this.notifyListeners(gameType, key, value);
      }
    });
  }

  subscribe(gameType, key, callback) {
    const listenerKey = `${gameType}:${key}`;
    if (!this.listeners.has(listenerKey)) {
      this.listeners.set(listenerKey, []);
    }
    this.listeners.get(listenerKey).push(callback);

    return () => {
      const listeners = this.listeners.get(listenerKey);
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    };
  }

  notifyListeners(gameType, key, value) {
    const listenerKey = `${gameType}:${key}`;
    const callbacks = this.listeners.get(listenerKey) || [];
    callbacks.forEach(callback => {
      try {
        callback(value);
      } catch (error) {
        console.error(`StateManager listener error for ${listenerKey}:`, error);
      }
    });
  }

  reset(gameType) {
    if (gameType === 'spy') {
      this.state.spy = {
        playerCount: 5,
        currentPlayer: 0,
        selectedCats: new Set(),
        spySet: new Set(),
        chosenChar: null,
        cardOpen: false
      };
    } else {
      this.state.secret = {
        role: null,
        roomCode: null,
        grid: [],
        mySelected: null,
        opponentSelection: null,
        myEliminated: new Set(),
        pendingEliminated: new Set(),
        isMyTurn: false,
        gameActive: false,
        stage: 'lobby',
        myReady: false,
        opponentReady: false,
        accuseMode: false,
        status: 'selection',
        currentTurn: 'host',
        winner: null,
        resultShown: false,
        gridBuilt: false,
        selectedCats: new Set()
      };
    }
  }
}
