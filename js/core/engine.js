import { AppConfig } from "../data/config.js";
import { AppCategories } from "../data/categories.js";

export class CryptoRandomizer {
  static secureRandomInt(max) {
    if (max <= 0) return 0;
    if (max === 1) return 0;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const LIMIT = Math.floor(0x100000000 / max) * max;
      do {
        crypto.getRandomValues(buf);
      } while (buf[0] >= LIMIT);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  static secureRandomRange(min, max) {
    if (min >= max) return min;
    return min + this.secureRandomInt(max - min);
  }

  static secureShuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.secureRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export class GameEngine {
  constructor(appConfig = AppConfig) {
    this.config = appConfig;
    this.crypto = CryptoRandomizer;
  }

  calculateSpyCount(playerCount) {
    return Math.max(1, Math.floor(playerCount / this.config.SPIES_PER_PLAYERS));
  }

  selectSpies(playerCount) {
    const spyCount = this.calculateSpyCount(playerCount);
    const spies = new Set();

    while (spies.size < spyCount) {
      spies.add(this.crypto.secureRandomInt(playerCount));
    }

    return spies;
  }

  selectCharacter(categories, excludeRecent = new Set()) {
    const pool = [];

    categories.forEach(cat => {
      cat.chars.forEach(char => {
        if (!excludeRecent.has(char.name)) {
          pool.push(char);
        }
      });
    });

    if (pool.length === 0) {
      categories.forEach(cat => pool.push(...cat.chars));
    }

    const idx = this.crypto.secureRandomInt(pool.length);
    return pool[idx];
  }

  buildGameGrid(selectedCatIds, gridSize = 16) {
    const selectedCats = AppCategories.filter(cat => selectedCatIds.has(cat.id));

    if (selectedCats.length === 0) {
      throw new Error('No categories selected');
    }

    return this._buildDiverseGrid(selectedCats, gridSize);
  }

  _buildDiverseGrid(categories, gridSize) {
    const grid = [];
    const enabledCats = categories.filter(c => c.chars.length > 0);
    const targetPerCategory = Math.floor(gridSize / enabledCats.length);
    const remainder = gridSize % enabledCats.length;

    enabledCats.forEach((cat, idx) => {
      const count = targetPerCategory + (idx < remainder ? 1 : 0);
      const chars = this.crypto.secureShuffle(cat.chars).slice(0, count);
      grid.push(...chars);
    });

    return this.crypto.secureShuffle(grid).slice(0, gridSize);
  }

  checkSecretGameResult(myChoice, opponentChoice) {
    if (!myChoice || !opponentChoice) {
      return { won: false, reason: 'incomplete' };
    }

    const correct = myChoice.name === opponentChoice.name;
    return {
      won: correct,
      reason: correct ? 'correct' : 'wrong'
    };
  }

  validateRoomCode(code) {
    if (!code || typeof code !== 'string') return false;
    return code.length === this.config.ROOM_CODE_LENGTH && /^\d+$/.test(code);
  }

  generateRoomCode() {
    const min = Math.pow(10, this.config.ROOM_CODE_LENGTH - 1);
    const max = Math.pow(10, this.config.ROOM_CODE_LENGTH) - 1;
    return String(this.crypto.secureRandomRange(min, max));
  }
}
