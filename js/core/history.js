export class GameHistory {
  constructor() {
    this.storageKey = 'partybox_game_history';
    this.maxHistorySize = 30;
  }

  getHistory() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  addCharacterToHistory(charName) {
    const history = this.getHistory();
    const timestamp = Date.now();
    history.unshift({ name: charName, timestamp });
    if (history.length > this.maxHistorySize) history.pop();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save game history');
    }
  }

  getRecentCharacters(count = 10) {
    return this.getHistory().slice(0, count).map(item => item.name);
  }

  clearHistory() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear game history');
    }
  }
}
