import { AppConfig, AppText } from "./data/config.js";
import { AppCategories } from "./data/categories.js";
import { StateManager } from "./core/state.js";
import { CryptoRandomizer, GameEngine } from "./core/engine.js";
import { GameHistory } from "./core/history.js";
import { NetworkManager } from "./network/firebase.js";
import { UIManager, ImageLoader } from "./ui/ui-manager.js";

export class PartyBoxApp {
  constructor() {

    if (typeof firebase !== 'undefined' && typeof firebase.initializeApp === 'function') {
      try {
        firebase.initializeApp({
          apiKey: "AIzaSyBXHJoDHeh55JhCmfJgYjWyN--BZVzlM5s",
          authDomain: "partybox1303.firebaseapp.com",
          databaseURL: "https://partybox1303-default-rtdb.europe-west1.firebasedatabase.app",
          projectId: "partybox1303",
          storageBucket: "partybox1303.firebasestorage.app",
          messagingSenderId: "693748041380",
          appId: "1:693748041380:web:2595063bb9a47621c20831",
          measurementId: "G-F35L57EYZP"
        });
      } catch (e) {
        console.warn('PartyBoxApp: Firebase initialization failed, continuing without network', e);
      }
    } else {
      console.warn('PartyBoxApp: firebase global is not available — running offline mode');
    }

    // Ініціалізувати системні компоненти
    this.ui = new UIManager();
    this.stateManager = new StateManager();
    this.engine = new GameEngine();
    this.authReady = this.setupAnonymousAuth();
    this.network = new NetworkManager(this.authReady);
    this.gameHistory = new GameHistory();

    // Легаси для обратної сумісності (з часом видалити)
    // Ці об'єкти використовуються старим кодом
    Object.defineProperty(this, 'state', {
      get: () => this.stateManager.getGameState('spy'),
      set: (val) => Object.assign(this.stateManager.state.spy, val)
    });
    Object.defineProperty(this, 'secretState', {
      get: () => this.stateManager.getGameState('secret'),
      set: (val) => Object.assign(this.stateManager.state.secret, val)
    });

    // Локальні властивості
    this.currentGame = null;
    this.pendingAccuseIndex = null;
    this.categoriesInitialized = new Set();

    // Запустити ініціалізацію
    this.init();
  }

  /**
   * Отримати елемент (делегація до UIManager)
   * @deprecated Використовувати this.ui.getElement() замість цього
   */
  getElement(id) {
    return this.ui.getElement(id);
  }

  async setupAnonymousAuth() {
    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
      // Firebase auth not available — resolve with null so app continues working offline
      return Promise.resolve(null);
    }

    const auth = firebase.auth();
    return new Promise((resolve, reject) => {
      const unsubscribe = auth.onAuthStateChanged(user => {
        if (user) {
          unsubscribe();
          resolve(user);
        }
      }, err => {
        unsubscribe();
        reject(err);
      });
      auth.signInAnonymously().catch(err => {
        if (auth.currentUser) return;
        unsubscribe();
        reject(err);
      });
    });
  }

  init() {
    this.bindEvents();
    this.initCategories('cats-container', this.state.selectedCats, this.toggleCategory.bind(this));
    this.setupCategoriesEventDelegation('cats-container', this.state.selectedCats, this.toggleCategory.bind(this));
    this.updateStaticTexts();
    this.updatePlayerStepperState();
  }

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  secureRandomInt(max) {
    return CryptoRandomizer.secureRandomInt(max);
  }

  secureShuffle(array) {
    return CryptoRandomizer.secureShuffle(array);
  }

  ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
      if (keys.every((key, index) => String(index) === key)) return keys.map(key => value[key]);
    }
    return [];
  }

  switchScreen(id) {
    this.ui.showScreen(id);
    const header = document.querySelector('header');
    if (this.currentGame === 'secret' && (id === 'screen-secret-game' || id === 'screen-secret-result')) {
      if (header) this.hide(header);
    } else if (header) {
      this.show(header);
    }
    this.updateStaticTexts();
  }

  // Утилітарні методи для управління UI
  updateText(elementId, text) {
    const el = this.getElement(elementId) || document.getElementById(elementId);
    if (el) el.textContent = text;
  }

  updateHTML(elementId, html) {
    const el = this.getElement(elementId) || document.getElementById(elementId);
    if (el) el.innerHTML = html;
  }

  toggleClass(elementId, className, condition) {
    const el = this.getElement(elementId) || document.getElementById(elementId);
    if (!el) return;
    condition ? el.classList.add(className) : el.classList.remove(className);
  }

  setButtonState(elementId, enabled, text = null) {
    const btn = this.getElement(elementId) || document.getElementById(elementId);
    if (!btn) return;
    btn.disabled = !enabled;
    if (text) btn.textContent = text;
  }

  /**
   * Показати toast повідомлення
   * @param {string} msg - Текст повідомлення
   */
  showToast(msg) {
    this.ui.showToast(msg, AppConfig.TOAST_DURATION_MS || 2500);
  }

  openModal(id) {
    this.ui.setModalVisible(id, true);
  }

  closeModal(id) {
    this.ui.setModalVisible(id, false);
  }

  closeAllModals() {
    this.ui.closeAllModals();
    this.dismissPortraitTip();
  }

  setVisible(target, visible) {
    this.ui.setVisible(target, visible);
  }

  show(t) {
    this.ui.setVisible(t, true);
  }

  hide(t) {
    this.ui.setVisible(t, false);
  }

  dismissPortraitTip() {
    const tip = document.getElementById('portrait-tip');
    if (tip) tip.classList.remove('active');
  }

  updateStaticTexts() {
    const t = AppText;
    const el = id => document.getElementById(id);
    if (el('btn-rules')) el('btn-rules').textContent = t.rulesBtn;
    if (el('modal-rules-title')) el('modal-rules-title').textContent = t.rulesModalTitle;
    if (el('modal-rules-body')) el('modal-rules-body').innerHTML = this.currentGame === 'secret' ? t.secretrulesContent : t.spyrulesContent;
    if (el('menu-subtitle')) el('menu-subtitle').textContent = t.menuSubtitle;
    if (el('menu-spy-title')) el('menu-spy-title').textContent = t.menuSpyTitle;
    if (el('menu-spy-desc')) el('menu-spy-desc').textContent = t.menuSpyDesc;
    if (el('menu-secret-title')) el('menu-secret-title').textContent = t.menuSecretTitle;
    if (el('menu-secret-desc')) el('menu-secret-desc').textContent = t.menuSecretDesc;
    if (el('role-title')) el('role-title').textContent = t.roleTitle;
    if (el('role-subtitle')) el('role-subtitle').textContent = t.roleSubtitle;
    if (el('role-host-title')) el('role-host-title').textContent = t.roleHost;
    if (el('role-guest-title')) el('role-guest-title').textContent = t.roleGuest;
    if (el('setup-label-players')) el('setup-label-players').textContent = t.setupPlayers;
    if (el('setup-spy-hint')) el('setup-spy-hint').innerHTML = t.setupSpyHint.replace('{N}', Math.max(1, Math.floor(this.state.playerCount / AppConfig.SPIES_PER_PLAYERS)));
    if (el('setup-label-categories')) el('setup-label-categories').textContent = t.setupCategories;
    if (el('btn-select-all')) el('btn-select-all').textContent = this.state.selectedCats.size === AppCategories.length ? t.deselectAll : t.selectAll;
    if (el('btn-start-deal')) el('btn-start-deal').textContent = t.startBtn;
    if (document.getElementById('screen-deal').classList.contains('active')) {
      if (el('deal-player-name')) el('deal-player-name').textContent = t.playerBadge.replace('{N}', this.state.currentPlayer + 1);
      if (el('deal-prompt-text')) el('deal-prompt-text').textContent = this.state.currentPlayer === 0 ? t.promptTake : t.promptPass;
      if (el('btn-open-card-init')) el('btn-open-card-init').textContent = t.openCardBtn;
      if (el('text-tap-open')) el('text-tap-open').textContent = t.tapToOpen;
      if (el('btn-restart-action')) el('btn-restart-action').textContent = t.restartBtn;
    }
    if (el('final-title')) el('final-title').innerHTML = t.finalTitle;
    if (el('label-stat-players')) el('label-stat-players').textContent = t.finalPlayers;
    if (el('label-stat-spies')) el('label-stat-spies').textContent = t.finalSpies;
    if (el('final-description')) el('final-description').textContent = t.finalDesc;
    if (el('btn-new-game-restart')) el('btn-new-game-restart').textContent = t.newGameBtn;
    if (el('confirm-title')) el('confirm-title').textContent = t.abortConfirmTitle;
    if (el('confirm-desc')) el('confirm-desc').textContent = t.abortConfirmDesc;
    if (el('btn-cancel')) el('btn-cancel').textContent = t.cancelBtn;
    if (el('btn-confirm')) el('btn-confirm').textContent = t.confirmBtn;
    if (el('label-host-setup')) el('label-host-setup').textContent = t.secretHostSetup;
    if (el('label-host-cats')) el('label-host-cats').textContent = t.secretHostCats;
    if (el('btn-host-all')) el('btn-host-all').textContent = this.secretState.selectedCats?.size === AppCategories.length ? t.deselectAll : t.selectAll;
    if (el('btn-generate-room')) el('btn-generate-room').textContent = t.secretGenerateBtn;
    if (el('label-host-code')) el('label-host-code').textContent = t.secretHostCode;
    if (el('text-host-share')) el('text-host-share').textContent = t.secretHostShare;
    if (el('btn-start-secret-game')) el('btn-start-secret-game').textContent = t.secretStartBtn;
    if (el('btn-host-cancel')) el('btn-host-cancel').textContent = t.cancelBtn;
    if (el('label-guest-code')) el('label-guest-code').textContent = t.secretGuestCode;
    if (el('btn-join-game')) el('btn-join-game').textContent = t.secretConnectBtn;
    if (el('btn-myst-ready')) el('btn-myst-ready').textContent = t.secretReadyBtn;
    if (el('btn-myst-end-turn')) el('btn-myst-end-turn').textContent = t.secretEndTurnBtn;
    if (el('btn-myst-accuse')) el('btn-myst-accuse').textContent = this.secretState.accuseMode ? t.secretCancelAccuseBtn : t.secretAccuseBtn;
    if (el('btn-myst-surrender')) el('btn-myst-surrender').textContent = t.secretSurrenderBtn;
    if (el('btn-res-menu')) el('btn-res-menu').textContent = t.secretBackMenuBtn;
    if (el('btn-res-replay')) el('btn-res-replay').textContent = t.resReplayBtn;
    if (el('replay-request-title')) el('replay-request-title').textContent = t.replayRequestTitle;
    if (el('replay-request-desc')) el('replay-request-desc').textContent = t.replayRequestDesc;
    if (el('btn-replay-accept')) el('btn-replay-accept').textContent = t.replayAcceptBtn;
    if (el('btn-replay-decline')) el('btn-replay-decline').textContent = t.replayDeclineBtn;
    if (el('res-lbl-mine')) el('res-lbl-mine').textContent = t.resMyChoice;
    if (el('res-lbl-opp')) el('res-lbl-opp').textContent = t.resOppChoice;
  }

  initCategories(containerId, selectedSet, onToggle) {
    const container = this.getElement(containerId) || document.getElementById(containerId);
    if (!container || this.categoriesInitialized.has(containerId)) return;

    container.innerHTML = '';
    if (!selectedSet || typeof selectedSet.has !== 'function') selectedSet = new Set();

    AppCategories.forEach(cat => {
      const active = selectedSet.has(cat.id);
      const el = document.createElement('div');
      el.className = 'cat-toggle' + (active ? ' active' : '');
      el.dataset.id = cat.id;
      el.innerHTML = `<div class="ct-icon">${cat.icon}</div><div style="flex:1;"><div class="ct-name">${cat.name}</div><div class="ct-count">${cat.chars.length} персонажів</div></div><div class="ct-check">${active ? '✓' : ''}</div>`;
      container.appendChild(el);
    });

    this.categoriesInitialized.add(containerId);
  }

  updateCategoriesUI(containerId, selectedSet) {
    const container = this.getElement(containerId) || document.getElementById(containerId);
    if (!container) return;

    if (!selectedSet || typeof selectedSet.has !== 'function') selectedSet = new Set();

    container.querySelectorAll('.cat-toggle').forEach(el => {
      const catId = el.dataset.id;
      const active = selectedSet.has(catId);
      if (active) {
        el.classList.add('active');
        el.querySelector('.ct-check').textContent = '✓';
      } else {
        el.classList.remove('active');
        el.querySelector('.ct-check').textContent = '';
      }
    });
  }

  setupCategoriesEventDelegation(containerId, selectedSet, onToggle) {
    const container = this.getElement(containerId) || document.getElementById(containerId);
    if (!container) return;

    const oldHandler = container._categoryDelegationHandler;
    if (oldHandler) {
      container.removeEventListener('click', oldHandler);
    }

    const handler = (e) => {
      const toggle = e.target.closest('.cat-toggle');
      if (toggle) {
        const catId = toggle.dataset.id;
        if (catId) {
          onToggle(catId);
        }
      }
    };

    container._categoryDelegationHandler = handler;
    container.addEventListener('click', handler);
  }

  toggleCategory(id) {
    if (this.state.selectedCats.has(id)) {
      if (this.state.selectedCats.size === 1) { this.showToast(AppText.noCategoryError); return; }
      this.state.selectedCats.delete(id);
    } else {
      this.state.selectedCats.add(id);
    }
    this.updateCategoriesUI('cats-container', this.state.selectedCats);
    this.updateStaticTexts();
  }

  toggleAll() {
    this.state.selectedCats = this.state.selectedCats.size === AppCategories.length ? new Set() : new Set(AppCategories.map(c => c.id));
    this.updateCategoriesUI('cats-container', this.state.selectedCats);
    this.updateStaticTexts();
  }

  /**
   * Змінити кількість гравців
   * @param {number} delta - Зміна (додати/відняти)
   */
  changeCount(delta) {
    const next = this.state.playerCount + delta;
    if (next < AppConfig.MIN_PLAYERS_SPY || next > AppConfig.MAX_PLAYERS_SPY) return;
    this.state.playerCount = next;
    this.ui.setText('player-count', String(next));
    this.updateStaticTexts();
    this.updatePlayerStepperState();
  }

  updatePlayerStepperState() {
    const decreaseBtn = document.getElementById('btn-count-decrease');
    const increaseBtn = document.getElementById('btn-count-increase');
    if (decreaseBtn) {
      const disabled = this.state.playerCount <= AppConfig.MIN_PLAYERS_SPY;
      decreaseBtn.disabled = disabled;
      decreaseBtn.classList.toggle('disabled', disabled);
    }
    if (increaseBtn) {
      const disabled = this.state.playerCount >= AppConfig.MAX_PLAYERS_SPY;
      increaseBtn.disabled = disabled;
      increaseBtn.classList.toggle('disabled', disabled);
    }
  }

  selectGame(game) {
    this.closeAllModals();
    this.currentGame = game;
    if (game === 'spy') {
      document.body.classList.remove('is-secret-mode');
      this.show('btn-rules'); this.show('btn-back-menu');
      document.getElementById('header-title').textContent = '🕵️‍♂️ SPY';
      this.updateCategoriesUI('cats-container', this.state.selectedCats);
      this.updatePlayerStepperState();
      this.switchScreen('screen-setup');
    } else if (game === 'secret') {
      document.body.classList.add('is-secret-mode');
      this.show('btn-rules'); this.show('btn-back-menu');
      document.getElementById('header-title').textContent = '🎭 MYST';
      this.switchScreen('screen-secret-role-choice');
    }
  }

  async backToMenu() {
    const needsPortraitTip = document.getElementById('screen-secret-result').classList.contains('active') || document.getElementById('screen-secret-game').classList.contains('active');
    this.closeAllModals();
    this.currentGame = null;
    document.body.classList.remove('is-secret-mode');
    this.hide('btn-rules'); this.hide('btn-back-menu');
    document.getElementById('header-title').textContent = '🕵️‍♂️ PartyBox';
    this.show(document.querySelector('header'));
    await this.cancelSecretLobby();
    await this.network.disconnect(this.secretState.role);
    this.resetSecretState();
    const joinBtn = document.getElementById('btn-join-game');
    if (joinBtn) joinBtn.disabled = false;
    try {
      this.state.currentPlayer = 0; this.state.cardOpen = false;
      const flipCard = document.getElementById('flip-card');
      if (flipCard) flipCard.classList.remove('flipped');
      this.hide('flip-scene'); this.hide('deal-actions'); this.show('deal-prompt');
    } catch (e) { }
    this.switchScreen('screen-main-menu');
    if (needsPortraitTip && window.innerWidth > window.innerHeight) {
      const tip = document.getElementById('portrait-tip');
      if (tip) tip.classList.add('active');
    }
  }

  resetSecretState() {
    this.secretState = {
      role: null, roomCode: null, grid: [], gridBuilt: false, mySelected: null,
      opponentSelection: null, opponentSelectedimgUrl: null, myEliminated: new Set(),
      pendingEliminated: new Set(), isMyTurn: false, gameActive: false, stage: 'lobby',
      myReady: false, opponentReady: false, accuseMode: false, status: 'selection', currentTurn: 'host',
      winner: null, resultShown: false, selectedCats: new Set(), gracefulEnding: false,
      replayModalOpen: false, replayModalIncoming: false
    };
    this.pendingAccuseIndex = null;
  }

  buildCharacterPool(excludeRecent = true) {
    const pool = [];
    AppCategories.forEach(cat => { if (this.state.selectedCats.has(cat.id)) pool.push(...cat.chars); });

    if (excludeRecent && pool.length > 0) {
      const recentChars = this.gameHistory.getRecentCharacters(Math.ceil(pool.length * 0.15));
      return pool.filter(char => !recentChars.includes(char.name));
    }
    return pool;
  }

  startGame() {
    if (this.state.playerCount < AppConfig.MIN_PLAYERS_SPY || this.state.playerCount > AppConfig.MAX_PLAYERS_SPY) {
      this.showToast(`Кількість гравців має бути від ${AppConfig.MIN_PLAYERS_SPY} до ${AppConfig.MAX_PLAYERS_SPY}`);
      return;
    }

    let pool = this.buildCharacterPool(true);

    if (pool.length === 0) {
      pool = this.buildCharacterPool(false);
    }

    if (pool.length === 0) { this.showToast(AppText.noCategoryError); return; }

    const chosen = pool[CryptoRandomizer.secureRandomInt(pool.length)];
    this.state.chosenChar = chosen;
    this.gameHistory.addCharacterToHistory(chosen.name);

    const spiesCount = Math.max(1, Math.floor(this.state.playerCount / AppConfig.SPIES_PER_PLAYERS));
    const roleIndices = this.secureShuffle([...Array(this.state.playerCount).keys()]);
    this.state.spySet = new Set(roleIndices.slice(0, spiesCount));
    this.state.currentPlayer = 0; this.state.cardOpen = false;
    document.getElementById('final-players').textContent = this.state.playerCount;
    document.getElementById('final-spies').textContent = spiesCount;
    this.showDealPrompt(true); this.switchScreen('screen-deal');
  }

  showDealPrompt(isFirst) {
    this.updateStaticTexts();
    this.show('deal-prompt'); this.hide('flip-scene'); this.hide('deal-actions');
    document.getElementById('flip-card').classList.remove('flipped');
  }

  openCard() {
    if (this.state.cardOpen) return;
    this.state.cardOpen = true;
    const isSpy = this.state.spySet.has(this.state.currentPlayer);
    const back = document.getElementById('flip-back');
    const t = AppText;
    if (isSpy) {
      back.className = 'flip-face flip-back back-spy';
      back.innerHTML = `<div class="spy-content"><div class="spy-emoji">🕵️‍♂️</div><div class="spy-title">${t.youAreSpy}</div><div class="spy-sub">${t.spyTask}</div></div><div class="spy-card-info"><div class="spy-badge"><div class="spy-dot"></div><div class="spy-badge-text">${t.spyBadge}</div></div></div>`;
    } else {
      back.className = 'flip-face flip-back back-char';
      const charName = this.escapeHtml(this.state.chosenChar.name);
      const charEmoji = this.escapeHtml(this.state.chosenChar.emoji);
      back.innerHTML = `
        <div class="card-img-wrap">
          <div class="card-img-placeholder" id="card-ph">${charEmoji}</div>
          <div class="img-loader" id="img-ldr"><div class="spinner"></div></div>
          <img class="card-img loading" id="card-photo" alt="${charName}"/>
          <div class="card-img-overlay"></div>
        </div>
        <div class="card-info">
          <div class="info-trigger-btn" id="spy-info-btn">i</div>
          <div class="card-top-label">${t.characterYour}</div>
          <div class="card-name">${charName}</div>
          <div class="card-bot-label">${t.characterWarn}</div>
        </div>`;
      document.getElementById('spy-info-btn').onclick = (e) => { e.stopPropagation(); this.openInfoModal(this.state.chosenChar, {}, e); };
      const imgEl = back.querySelector('#card-photo');
      ImageLoader.bind(imgEl, this.state.chosenChar, { hidePlaceholder: true });
    }
    this.hide('deal-prompt'); this.show('flip-scene');
    void document.getElementById('flip-scene').offsetWidth;
    document.getElementById('flip-card').classList.add('flipped');
    setTimeout(() => {
      document.getElementById('btn-close-card').textContent = this.state.currentPlayer >= this.state.playerCount - 1 ? t.finishHandoutBtn : t.closeCardBtn;
      this.show('deal-actions');
    }, 600);
  }

  closeCard() {
    this.hide('deal-actions');
    document.getElementById('flip-card').classList.remove('flipped');
    this.state.cardOpen = false;
    setTimeout(() => {
      this.hide('flip-scene');
      this.state.currentPlayer++;
      if (this.state.currentPlayer >= this.state.playerCount) {
        this.switchScreen('screen-final');
      } else {
        this.showDealPrompt(false);
      }
    }, 600);
  }

  confirmAbort() { this.openModal('confirmModal'); }
  executeRestart() { this.closeModal('confirmModal'); this.resetGame(); }
  resetGame() {
    this.state.currentPlayer = 0; this.state.cardOpen = false;
    this.hide('deal-actions'); this.hide('flip-scene');
    this.switchScreen('screen-setup');
  }

  openInfoModal(charData, options = {}, event) {
    if (event) event.stopPropagation();
    const name = charData.name || charData.nameRU || 'Персонаж';
    const description = charData.desc || charData.descRU || 'Опис відсутній.';
    const enlargeImage = options.enlargeImage === true;
    const safeName = this.escapeHtml(name);
    const safeDescription = this.escapeHtml(description);
    const safeEmoji = this.escapeHtml(charData.emoji || '🔍');
    document.getElementById('modal-info-title').textContent = name;
    document.getElementById('modal-info-body').innerHTML = enlargeImage ? `
      <div style="display:flex; justify-content:center; width:100%; margin-bottom: 18px;">
        <img class="card-img loading" id="modal-char-photo" alt="${safeName}" style="width:auto; height:auto; max-width: calc(100vw - 56px); max-height: calc(100vh - 220px); border-radius: 20px; object-fit: contain; display:block;" />
      </div>
      <p style="font-size: 1rem; line-height: 1.6; color: var(--text);">${safeDescription}</p>
    ` : `
      <div style="font-size: 4.5rem; margin-bottom: 14px; text-shadow: 0 4px 12px rgba(0,0,0,0.45);">${safeEmoji}</div>
      <p style="font-size: 1.05rem; line-height: 1.6; color: var(--text); font-weight: 500;">${safeDescription}</p>
    `;
    if (enlargeImage) {
      const modalImg = document.getElementById('modal-char-photo');
      if (modalImg) {
        const url = ImageLoader.getCharImage(charData);
        if (url) {
          modalImg.src = url;
          modalImg.onload = () => modalImg.classList.remove('loading');
          modalImg.onerror = () => this.hide(modalImg);
        } else {
          this.hide(modalImg);
        }
      }
    }
    this.openModal('infoModal');
  }

  chooseSecretHost() {
    this.secretState.role = 'host';
    if (!this.categoriesInitialized.has('secret-cats-container')) {
      this.initCategories('secret-cats-container', this.secretState.selectedCats, this.toggleSecretCategory.bind(this));
      this.setupCategoriesEventDelegation('secret-cats-container', this.secretState.selectedCats, this.toggleSecretCategory.bind(this));
    } else {
      this.updateCategoriesUI('secret-cats-container', this.secretState.selectedCats);
    }
    this.show('host-setup-view'); this.hide('host-lobby-view');
    this.switchScreen('screen-secret-lobby-host');
  }

  chooseSecretGuest() {
    this.secretState.role = 'guest';
    document.getElementById('room-code-input').value = '';
    document.getElementById('join-status').textContent = '';
    const joinBtn = document.getElementById('btn-join-game');
    if (joinBtn) joinBtn.disabled = false;
    this.switchScreen('screen-secret-lobby-guest');
  }

  toggleSecretCategory(id) {
    if (this.secretState.selectedCats.has(id)) {
      if (this.secretState.selectedCats.size === 1) { this.showToast(AppText.noCategoryError); return; }
      this.secretState.selectedCats.delete(id);
    } else {
      this.secretState.selectedCats.add(id);
    }
    this.updateCategoriesUI('secret-cats-container', this.secretState.selectedCats);
    this.updateStaticTexts();
  }

  toggleAllMysteryCats() {
    this.secretState.selectedCats = this.secretState.selectedCats.size === AppCategories.length ? new Set() : new Set(AppCategories.map(c => c.id));
    this.updateCategoriesUI('secret-cats-container', this.secretState.selectedCats);
    this.updateStaticTexts();
  }

  async generateUniqueRoomCode() {
    const minCode = 10 ** (AppConfig.ROOM_CODE_LENGTH - 1);
    const maxCode = 10 ** AppConfig.ROOM_CODE_LENGTH;
    for (let attempt = 0; attempt < AppConfig.MAX_ROOM_CODE_ATTEMPTS; attempt++) {
      const randomOffset = CryptoRandomizer.secureRandomInt(maxCode - minCode);
      const code = String(minCode + randomOffset);
      const snap = await firebase.database().ref('rooms/' + code).once('value');
      if (!snap.exists()) return code;
    }
    throw new Error('roomcode-collision');
  }

  buildDiverseSecretGrid() {
    const selectedCharacters = [];
    const usedCharIds = new Set();
    const recentChars = this.gameHistory.getRecentCharacters(Math.ceil(AppConfig.SECRET_GRID_SIZE * 0.2));
    const enabledCategories = AppCategories.filter(cat => this.secretState.selectedCats.has(cat.id));
    const targetPerCategory = Math.floor(AppConfig.SECRET_GRID_SIZE / enabledCategories.length);
    const remainder = AppConfig.SECRET_GRID_SIZE % enabledCategories.length;
    let charIndex = 0;

    for (let catIdx = 0; catIdx < enabledCategories.length; catIdx++) {
      const cat = enabledCategories[catIdx];
      const categoryChars = cat.chars.filter(char => !usedCharIds.has(char.name));
      if (categoryChars.length === 0) continue;

      const nonRecentChars = categoryChars.filter(char => !recentChars.includes(char.name));
      const poolToUse = nonRecentChars.length > 0 ? nonRecentChars : categoryChars;
      const shuffledCat = CryptoRandomizer.secureShuffle(poolToUse);
      const countForThisCategory = targetPerCategory + (catIdx < remainder ? 1 : 0);
      const available = AppConfig.SECRET_GRID_SIZE - selectedCharacters.length;
      const toAdd = Math.min(countForThisCategory, available, shuffledCat.length);

      for (let i = 0; i < toAdd; i++) {
        selectedCharacters.push(shuffledCat[i]);
        usedCharIds.add(shuffledCat[i].name);
      }
    }

    if (selectedCharacters.length < AppConfig.SECRET_GRID_SIZE) {
      const allChars = [];
      enabledCategories.forEach(cat => {
        allChars.push(...cat.chars.filter(ch => !usedCharIds.has(ch.name)));
      });
      const shuffledRemaining = CryptoRandomizer.secureShuffle(allChars);
      for (const char of shuffledRemaining) {
        if (selectedCharacters.length >= AppConfig.SECRET_GRID_SIZE) break;
        selectedCharacters.push(char);
        usedCharIds.add(char.name);
      }
    }

    return CryptoRandomizer.secureShuffle(selectedCharacters.slice(0, AppConfig.SECRET_GRID_SIZE));
  }

  async generateSecretRoomCode() {
    const pool = [];
    AppCategories.forEach(cat => { if (this.secretState.selectedCats.has(cat.id)) pool.push(...cat.chars); });
    if (pool.length < AppConfig.SECRET_GRID_SIZE) { this.showToast(AppText.noCategoryError); return; }

    this.secretState.grid = this.buildDiverseSecretGrid();

    let code;
    try { code = await this.generateUniqueRoomCode(); }
    catch (error) { this.showToast('Не вдалося згенерувати код. Спробуйте ще раз.'); return; }

    this.secretState.roomCode = code;
    try {
      document.getElementById('btn-generate-room').disabled = true;
      const randomFirstTurn = CryptoRandomizer.secureRandomInt(2) === 0 ? 'host' : 'guest';
      await this.network.createRoom(code, this.secretState.grid.map(c => ({ name: c.name, emoji: c.emoji, imgUrl: c.imgUrl || '', desc: c.desc || '' })), randomFirstTurn);

      this.secretState.grid.forEach(char => this.gameHistory.addCharacterToHistory(char.name));

      document.getElementById('room-code-display').textContent = code;
      this.hide('host-setup-view'); this.show('host-lobby-view');
      document.getElementById('label-waiting-players').textContent = AppText.secretWaitMsg;
      this.network.listenForGuest(() => {
        this.hide('host-wait-group'); this.show('host-connected-group');
        document.getElementById('host-connected-group').textContent = AppText.secretConnectedMsg;
        this.show('btn-start-secret-game');
      });
      ImageLoader.preload(this.secretState.grid).catch(() => { });
    } catch (e) {
      this.showToast('Помилка створення кімнати. Спробуйте ще раз.');
      document.getElementById('btn-generate-room').disabled = false;
    }
  }

  async joinGame() {
    const code = document.getElementById('room-code-input').value.trim().replace(/\s/g, '');
    if (code.length !== AppConfig.ROOM_CODE_LENGTH) { this.showToast(`Введіть ${AppConfig.ROOM_CODE_LENGTH} цифр`); return; }
    await this.network.disconnect(this.secretState.role);
    const joinBtn = document.getElementById('btn-join-game');
    joinBtn.disabled = true;
    document.getElementById('join-status').textContent = 'Підключення...';
    try {
      const roomData = await this.network.joinRoom(code);
      const grid = this.ensureArray(roomData.grid);
      if (grid.length !== AppConfig.SECRET_GRID_SIZE) throw new Error('invalid-room-data');
      this.secretState.roomCode = code;
      this.secretState.grid = grid;
      document.getElementById('join-status').textContent = AppText.secretConnectedMsg;
      this.initSecretGameState();
      ImageLoader.preload(this.secretState.grid).catch(() => { });
    } catch (e) {
      const msg = e.message === 'room-not-found' ? 'Кімнату не знайдено. Перевірте код 🔍' : 'Помилка підключення. Спробуйте ще раз.';
      this.showToast(msg);
      document.getElementById('join-status').textContent = '';
      joinBtn.disabled = false;
    }
  }

  async cancelSecretLobby() {
    await this.network.disconnect(this.secretState.role).catch(() => { });
    this.show('host-setup-view'); this.hide('host-lobby-view');
    this.show('host-wait-group'); this.hide('host-connected-group');
    this.hide('btn-start-secret-game');
    document.getElementById('btn-generate-room').disabled = false;
  }

  startSecretGame() {
    this.initSecretGameState();
    this.network.updateState('status', 'selection');
  }

  initSecretGameState() {
    this.secretState.stage = 'lobby';
    this.secretState.mySelected = null;
    this.secretState.opponentSelection = null;
    this.secretState.myEliminated = new Set();
    this.secretState.pendingEliminated = new Set();
    this.secretState.myReady = false;
    this.secretState.opponentReady = false;
    this.secretState.accuseMode = false;
    this.secretState.gridBuilt = false;
    this.secretState.isMyTurn = false;
    this.secretState.gameActive = true;
    this.secretState.currentTurn = 'host';
    this.secretState.status = 'lobby';
    this.secretState.winner = null;
    this.secretState.resultShown = false;
    this.secretState.gracefulEnding = false;
    this.secretState.replayModalOpen = false;
    this.secretState.replayModalIncoming = false;
    this.pendingAccuseIndex = null;
    this.network.listenState(this.syncGameState.bind(this));
    this.network.listenForDisconnect(() => {
      if (this.secretState.gracefulEnding) return;
      this.showToast('З\'єднання з суперником перервано 💔');
      this.secretState.gameActive = false;
      setTimeout(async () => { await this.backToMenu(); }, AppConfig.RESULT_SCREEN_DELAY_MS);
    }, this.secretState.role);
    document.getElementById('orientation-tip').classList.remove('dismissed');
    this.hide('mystery-my-char-wrap');
  }

  dismissOrientationTip() {
    document.getElementById('orientation-tip').classList.add('dismissed');
  }

  async syncGameState(roomData) {
    if (!roomData) {
      if (this.secretState.gameActive) {
        this.showToast('Кімната закрита або втрачено з\'єднання.');
        this.secretState.gameActive = false;
        setTimeout(async () => { await this.backToMenu(); }, AppConfig.RESULT_SCREEN_DELAY_MS);
      }
      return;
    }
    let gridArray = [];
    if (roomData.grid !== undefined && roomData.grid !== null) {
      gridArray = this.ensureArray(roomData.grid);
      const hasLocal = Array.isArray(this.secretState.grid) && this.secretState.grid.length > 0;
      const gridChanged = !this.secretState.gridBuilt || this.secretState.grid.length !== gridArray.length ||
        this.secretState.grid.some((item, idx) => {
          const other = gridArray[idx] || {};
          return item.name !== other.name || item.imgUrl !== other.imgUrl;
        });
      if (!hasLocal && gridArray.length > 0) this.secretState.grid = gridArray;
      if (gridArray.length > 0 && gridChanged) {
        this.secretState.grid = gridArray;
        this.secretState.gridBuilt = false;
      }
    }
    const myRoleData = roomData[this.secretState.role] || {};
    this.secretState.mySelected = myRoleData.selection !== null ? myRoleData.selection : null;
    this.secretState.myReady = myRoleData.ready === true;
    this.secretState.myEliminated = new Set(myRoleData.eliminated || []);
    this.secretState.pendingEliminated = new Set(myRoleData.pendingEliminated || []);
    const oppRole = this.secretState.role === 'host' ? 'guest' : 'host';
    const oppRoleData = roomData[oppRole] || {};
    this.secretState.opponentReady = oppRoleData.ready === true;
    this.secretState.opponentSelection = oppRoleData.selection !== null ? oppRoleData.selection : null;
    this.secretState.status = roomData.status || 'lobby';
    this.secretState.currentTurn = roomData.currentTurn || 'host';
    this.secretState.isMyTurn = this.secretState.currentTurn === this.secretState.role;
    this.secretState.winner = roomData.winner || null;
    this.secretState.gameActive = roomData.status === 'selection' || roomData.status === 'playing';
    if (roomData.status !== 'playing' && this.secretState.accuseMode) {
      this.secretState.accuseMode = false;
      this.pendingAccuseIndex = null;
      this.closeModal('accuseModal');
    }
    if (roomData.status !== 'ended' && this.secretState.resultShown) {
      this.secretState.resultShown = false;
    }
    if (roomData.status === 'ended' && oppRoleData.requestReplay === true && this.secretState.role === 'host') {
      if (!this.secretState.replayModalOpen) {
        this.openReplayModal({ title: AppText.replayRequestTitle, incoming: true });
      }
    }
    const shouldRenderGrid = roomData.status === 'selection' || roomData.status === 'playing';
    if (shouldRenderGrid) {
      if (!this.secretState.gridBuilt) { this.initSecretGrid(); this.secretState.gridBuilt = true; }
      const gameScreen = document.getElementById('screen-secret-game');
      if (gameScreen && !gameScreen.classList.contains('active')) {
        try { this.hide(document.querySelector('header')); } catch (e) { }
        this.hide('mystery-my-char-wrap');
        this.switchScreen('screen-secret-game');
        const tip = document.getElementById('orientation-tip');
        if (tip) tip.classList.remove('dismissed');
      }
    }
    if (roomData.status === 'lobby') this.secretState.stage = 'lobby';
    else if (roomData.status === 'selection') {
      this.secretState.stage = 'selection';
      if (this.secretState.myReady && this.secretState.opponentReady && roomData.status !== 'playing') {
        await this.network.updateState('status', 'playing');
      }
    } else if (roomData.status === 'playing') this.secretState.stage = 'playing';
    else if (roomData.status === 'ended' || roomData.winner !== null) {
      this.secretState.stage = 'ended';
      if (roomData.winner != null && roomData.resultReason != null && !this.secretState.resultShown) {
        this.secretState.resultShown = true;
        const iWon = roomData.winner === this.secretState.role;
        const myCharIdx = myRoleData.selection;
        const oppCharIdx = oppRoleData.selection;
        this.showSecretResult(iWon, myCharIdx, oppCharIdx, roomData.resultReason);
      }
    }
    this.updateSecretGridUI();
  }

  initSecretGrid() {
    const gridEl = this.getElement('cards-grid') || document.getElementById('cards-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';
    this.secretState.grid.forEach((char, idx) => {
      const cell = document.createElement('div');
      cell.id = `card-cell-${idx}`;
      cell.className = 'card-cell';
      cell.dataset.idx = idx;
      const charName = this.escapeHtml(char.name);
      const charEmoji = this.escapeHtml(char.emoji);
      cell.innerHTML = `
        <div class="card-img-wrap">
          <div class="card-img-placeholder">${charEmoji}</div>
          <div class="img-loader"><div class="spinner"></div></div>
          <img class="card-img loading" alt="${charName}" />
          <div class="card-img-overlay"></div>
          <div class="info-trigger-btn" title="Info">i</div>
        </div>
        <div class="secret-card-info">
          <div class="card-top-label">${charName}</div>
          <div class="card-bot-label">${AppText.characterWarn}</div>
        </div>`;
      const imgEl = cell.querySelector('.card-img');
      ImageLoader.bind(imgEl, char, { hidePlaceholder: true });
      cell.querySelector('.info-trigger-btn').onclick = (e) => { e.stopPropagation(); this.openInfoModal(char, { enlargeImage: true }, e); };
      cell.onclick = () => this.handleCardClick(idx);
      gridEl.appendChild(cell);
    });
  }

  updateSecretGridUI() {
    const t = AppText;
    for (let idx = 0; idx < AppConfig.SECRET_GRID_SIZE; idx++) {
      const cell = document.getElementById(`card-cell-${idx}`);
      if (!cell) continue;
      cell.classList.toggle('eliminated', this.secretState.myEliminated.has(idx));
      cell.classList.toggle('selected', this.secretState.stage === 'selection' && this.secretState.mySelected === idx);
      cell.classList.toggle('pending-elimination', this.secretState.stage === 'playing' && this.secretState.pendingEliminated.has(idx));
      cell.classList.toggle('locked', this.secretState.stage === 'playing' && !this.secretState.isMyTurn);
      cell.classList.toggle('accuse-target', this.secretState.accuseMode);
    }
    const readyBtn = this.getElement('btn-myst-ready') || document.getElementById('btn-myst-ready');
    const endBtn = this.getElement('btn-myst-end-turn') || document.getElementById('btn-myst-end-turn');
    const accBtn = this.getElement('btn-myst-accuse') || document.getElementById('btn-myst-accuse');
    const turnInd = this.getElement('turn-indicator') || document.getElementById('turn-indicator');
    if (this.secretState.stage === 'lobby') {
      if (readyBtn) this.hide(readyBtn);
      if (endBtn) this.hide(endBtn);
      if (accBtn) this.hide(accBtn);
      if (turnInd) turnInd.textContent = this.secretState.role === 'guest' ? 'Очікування початку гри хостом...' : 'Очікування підключення суперника...';
      if (turnInd) turnInd.className = 'turn-indicator blink';
    } else if (this.secretState.stage === 'selection') {
      if (readyBtn) this.show(readyBtn);
      if (endBtn) this.hide(endBtn);
      if (accBtn) this.hide(accBtn);
      const noSelection = !Number.isInteger(this.secretState.mySelected);
      if (readyBtn) {
        readyBtn.disabled = this.secretState.myReady || noSelection;
        if (this.secretState.myReady) {
          readyBtn.title = 'Очікуйте суперника';
        } else if (noSelection) {
          readyBtn.title = 'Оберіть карту, щоб підтвердити';
        } else {
          readyBtn.title = '';
        }
      }
      const hintEl = document.getElementById('myst-ready-hint');
      if (hintEl) {
        hintEl.classList.add('hidden');
      }
      if (readyBtn) {
        if (readyBtn.disabled) {
          readyBtn.setAttribute('aria-disabled', 'true');
        } else {
          readyBtn.setAttribute('aria-disabled', 'false');
        }
      }
      if (turnInd) turnInd.textContent = t.turnWait;
      if (turnInd) turnInd.className = 'turn-indicator blink';
    } else if (this.secretState.stage === 'playing') {
      if (readyBtn) this.hide(readyBtn);
      if (this.secretState.isMyTurn) {
        if (endBtn) this.show(endBtn);
        if (accBtn) this.show(accBtn);
      }
      else {
        if (endBtn) this.hide(endBtn);
        if (accBtn) this.hide(accBtn);
      }
      if (accBtn) accBtn.textContent = this.secretState.accuseMode ? t.secretCancelAccuseBtn : t.secretAccuseBtn;
      if (turnInd) turnInd.textContent = this.secretState.isMyTurn ? t.turnMine : t.turnEnemy;
      if (turnInd) turnInd.className = 'turn-indicator ' + (this.secretState.isMyTurn ? '' : 'enemy');
    }
  }

  async handleCardClick(idx) {
    if (this.secretState.stage === 'selection') {
      if (!this.secretState.myReady) {
        // Apply selection locally for immediate UX feedback, then update server
        this.secretState.mySelected = idx;
        try {
          await this.network.updateState(`${this.secretState.role}/selection`, idx);
        } catch (e) {
          // network errors will be reconciled by syncGameState
        }
        this.updateSecretGridUI();
        // ensure the ready button updates immediately for UX
        const readyBtnImmediate = document.getElementById('btn-myst-ready');
        if (readyBtnImmediate) {
          readyBtnImmediate.disabled = false;
          readyBtnImmediate.title = '';
          readyBtnImmediate.setAttribute('aria-disabled', 'false');
        }
      }
    } else if (this.secretState.stage === 'playing' && this.secretState.isMyTurn) {
      if (this.secretState.accuseMode) {
        this.showAccuseConfirm(idx);
      } else {
        const nextPending = new Set(this.secretState.pendingEliminated);
        if (nextPending.has(idx)) nextPending.delete(idx);
        else nextPending.add(idx);
        this.secretState.pendingEliminated = nextPending;
        await this.network.updateState(`${this.secretState.role}/pendingEliminated`, Array.from(nextPending));
        this.updateSecretGridUI();
      }
    }
  }

  showAccuseConfirm(idx) {
    this.pendingAccuseIndex = idx;
    const char = Array.isArray(this.secretState.grid) && this.secretState.grid[idx] ? this.secretState.grid[idx] : null;
    const name = char ? (char.name || char.nameRU || 'Персонаж') : 'Персонаж';
    const titleEl = document.getElementById('accuse-title');
    const descEl = document.getElementById('accuse-desc');
    const confirmBtn = document.getElementById('btn-accuse-confirm');
    if (titleEl) titleEl.textContent = `Звинуватити ${name}?`;
    if (descEl) descEl.textContent = 'Це фінальна відповідь.';
    if (confirmBtn) confirmBtn.disabled = false;
    this.openModal('accuseModal');
  }

  toggleAccuseMode() {
    if (this.secretState.stage !== 'playing' || !this.secretState.isMyTurn) return;
    this.secretState.accuseMode = !this.secretState.accuseMode;
    if (!this.secretState.accuseMode) this.pendingAccuseIndex = null;
    this.updateSecretGridUI();
  }

  cancelAccuse() {
    this.secretState.accuseMode = false;
    this.pendingAccuseIndex = null;
    this.closeModal('accuseModal');
    this.updateSecretGridUI();
  }

  async performAccuse() {
    if (this.pendingAccuseIndex === null) { this.cancelAccuse(); return; }
    const idx = this.pendingAccuseIndex; this.pendingAccuseIndex = null;
    this.secretState.accuseMode = false;
    this.closeModal('accuseModal');
    const oppRole = this.secretState.role === 'host' ? 'guest' : 'host';
    const isCorrect = idx === this.secretState.opponentSelection;
    const winner = isCorrect ? this.secretState.role : oppRole;
    const confirmBtn = document.getElementById('btn-accuse-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      await this.network.updateStates({
        status: 'ended', winner, resultReason: isCorrect ? 'accuse_correct' : 'accuse_missed'
      });
    } catch (err) { this.showToast('Помилка мережі. Спробуйте ще раз.'); }
    finally { if (confirmBtn) confirmBtn.disabled = false; }
  }

  sendMysteryReady() {
    // Require a valid integer selection before sending ready
    if (!Number.isInteger(this.secretState.mySelected)) {
      const hintEl = document.getElementById('myst-ready-hint');
      if (hintEl) {
        hintEl.classList.remove('hidden');
      }
      this.showToast('Спочатку оберіть карту, щоб розпочати гру.');
      return;
    }
    this.secretState.myReady = true;
    this.updateSecretGridUI();
    this.network.updateState(`${this.secretState.role}/ready`, true);
    const myChar = this.secretState.grid[this.secretState.mySelected];
    document.getElementById('mystery-my-char-emoji').textContent = myChar.emoji;
    document.getElementById('mystery-my-char-name').textContent = myChar.name;
    const imgEl = document.getElementById('mystery-my-char-img');
    imgEl.src = ''; this.hide(imgEl); this.show('mystery-my-char-emoji');
    const infoBtn = document.getElementById('btn-myst-info');
    infoBtn.onclick = (e) => { e.stopPropagation(); this.openInfoModal(myChar, { enlargeImage: true }, e); };
    const url = ImageLoader.getCharImage(myChar);
    if (url) { imgEl.src = url; this.show(imgEl); this.hide('mystery-my-char-emoji'); }
    this.show('mystery-my-char-wrap');
  }

  async endSecretTurn() {
    const nextTurn = this.secretState.role === 'host' ? 'guest' : 'host';
    const pendingEliminated = Array.from(this.secretState.pendingEliminated);
    const opponentSelected = this.secretState.opponentSelection;
    const committingEliminated = new Set(this.secretState.myEliminated);
    pendingEliminated.forEach(idx => committingEliminated.add(idx));

    if (opponentSelected !== null && this.secretState.pendingEliminated.has(opponentSelected)) {
      try {
        await this.network.updateStates({ status: 'ended', winner: this.secretState.role, resultReason: 'eliminate_opponent_char' });
      } catch (err) { this.showToast('Помилка мережі. Спробуйте ще раз.'); }
      return;
    }

    try {
      await this.network.updateStates({
        currentTurn: nextTurn,
        [`${this.secretState.role}/eliminated`]: Array.from(committingEliminated),
        [`${this.secretState.role}/pendingEliminated`]: []
      });
    } catch (err) {
      this.showToast('Помилка мережі. Спробуйте ще раз.');
      return;
    }

    this.secretState.myEliminated = committingEliminated;
    this.secretState.pendingEliminated.clear();
    this.updateSecretGridUI();
  }

  async surrenderSecretGame() {
    const oppRole = this.secretState.role === 'host' ? 'guest' : 'host';
    try { await this.network.updateStates({ status: 'ended', winner: oppRole, resultReason: 'surrender' }); } catch (e) { this.showToast('Не вдалося здатися. Спробуйте ще раз.'); }
  }

  async handleReplayRequest() {
    if (this.secretState.role === 'host') {
      this.openReplayModal({ title: AppText.replayConfirmTitle, incoming: false });
      return;
    }
    try {
      await this.network.updateState(`${this.secretState.role}/requestReplay`, true);
      this.showToast('Запит на нову роздачу надіслано. Очікуйте рішення хоста.');
    } catch (err) {
      this.showToast('Не вдалося надіслати запит. Спробуйте ще раз.');
    }
  }

  openReplayModal(options = {}) {
    const title = options.title || AppText.replayRequestTitle;
    const desc = options.desc !== undefined ? options.desc : '';
    const titleEl = document.getElementById('replay-request-title');
    const descEl = document.getElementById('replay-request-desc');
    if (titleEl) titleEl.textContent = title;
    if (descEl) {
      descEl.textContent = desc;
      descEl.style.display = desc ? '' : 'none';
    }
    this.openModal('replayRequestModal');
    this.secretState.replayModalOpen = true;
    this.secretState.replayModalIncoming = Boolean(options.incoming);
  }

  closeReplayModal() {
    this.closeModal('replayRequestModal');
    this.secretState.replayModalOpen = false;
    this.secretState.replayModalIncoming = false;
  }

  async confirmReplayAction() {
    this.closeReplayModal();
    if (this.secretState.role !== 'host') {
      this.showToast('Тільки хост може запустити нову роздачу. Очікуйте рішення.');
      return;
    }
    await this.executeReplayReset();
  }

  async declineReplayRequest() {
    const role = this.secretState.role;
    const incoming = this.secretState.replayModalIncoming;
    this.closeReplayModal();
    if (!role) return;
    try {
      if (incoming && role === 'host') {
        await this.network.updateState('guest/requestReplay', false);
      }
      await this.network.updateState(`${role}/requestReplay`, false);
    } catch (err) {
      console.warn('Не вдалося скасувати replay request', err);
    }
  }

  async executeReplayReset() {
    if (this.secretState.role !== 'host') return;
    const grid = this.buildDiverseSecretGrid();
    const nextTurn = CryptoRandomizer.secureRandomInt(2) === 0 ? 'host' : 'guest';
    const resetState = {
      grid: grid.map(c => ({ name: c.name, emoji: c.emoji, imgUrl: c.imgUrl || '', desc: c.desc || '' })),
      host: { selection: null, eliminated: [], pendingEliminated: [], ready: false, guess: null, requestReplay: false },
      guest: { selection: null, eliminated: [], pendingEliminated: [], ready: false, guess: null, requestReplay: false },
      currentTurn: nextTurn,
      status: 'selection',
      winner: null,
      resultReason: null
    };

    this.secretState.grid = grid;
    this.secretState.gridBuilt = false;
    this.secretState.mySelected = null;
    this.secretState.opponentSelection = null;
    this.secretState.myEliminated = new Set();
    this.secretState.pendingEliminated = new Set();
    this.secretState.myReady = false;
    this.secretState.opponentReady = false;
    this.secretState.accuseMode = false;
    this.secretState.gameActive = true;
    this.secretState.currentTurn = nextTurn;
    this.secretState.isMyTurn = nextTurn === this.secretState.role;
    this.secretState.resultShown = false;
    this.secretState.gracefulEnding = false;
    this.pendingAccuseIndex = null;
    this.secretState.stage = 'selection';
    this.secretState.status = 'selection';
    try {
      await this.network.updateStates(resetState);
      this.initSecretGrid();
      this.switchScreen('screen-secret-game');
      this.updateSecretGridUI();
    } catch (err) {
      this.showToast('Не вдалося перезапустити гру. Спробуйте ще раз.');
    }
  }

  async showSecretResult(iWon, myCharIdx, oppCharIdx, reason) {
    const t = AppText;
    this.secretState.gracefulEnding = true;
    const resultTitle = document.getElementById('result-title');
    resultTitle.textContent = iWon ? t.resWinTitle : t.resLoseTitle;
    resultTitle.classList.toggle('win', iWon); resultTitle.classList.toggle('lose', !iWon);
    document.getElementById('result-icon').textContent = iWon ? '🎉' : '💔';
    let message;
    const isHost = this.secretState.role === 'host';
    if (reason === 'accuse_correct') message = iWon ? t.resWinByAccuseCorrect : t.resLoseByAccuseCorrect;
    else if (reason === 'accuse_missed') message = iWon ? t.resWinByAccuseMissed : (isHost ? t.resLoseByAccuseMissedHost : t.resLoseByAccuseMissedGuest);
    else if (reason === 'surrender') message = iWon ? t.resWinBySurrender : t.resLoseBySurrender;
    else if (reason === 'eliminate_opponent_char') message = iWon ? t.resWinByEliminatedOpponentCard : t.resLoseByEliminatedOpponentCard;
    else message = iWon ? t.resWinMsg : t.resLoseMsg;
    document.getElementById('result-message').textContent = message;
    resultTitle.style.background = '';
    const mChar = Number.isInteger(myCharIdx) && this.secretState.grid[myCharIdx] ? this.secretState.grid[myCharIdx] : null;
    const oChar = Number.isInteger(oppCharIdx) && this.secretState.grid[oppCharIdx] ? this.secretState.grid[oppCharIdx] : null;
    const setupResultImage = (charObj, prefix) => {
      const emojiEl = document.getElementById(`${prefix}-emoji`);
      const imgEl = document.getElementById(`${prefix}-img`);
      const nameEl = document.getElementById(`${prefix}-name`);
      this.show(emojiEl); this.hide(imgEl); imgEl.src = '';
      if (charObj) {
        emojiEl.textContent = charObj.emoji; nameEl.textContent = charObj.name;
        const url = ImageLoader.getCharImage(charObj);
        if (url) { imgEl.src = url; this.show(imgEl); this.hide(emojiEl); }
      } else { emojiEl.textContent = '❓'; nameEl.textContent = '-'; }
    };
    setupResultImage(mChar, 'res-my'); setupResultImage(oChar, 'res-opp');
    this.secretState.gameActive = false;
    this.hide(document.querySelector('header'));
    this.switchScreen('screen-secret-result');
  }

  toggleFullScreen() {
    const doc = document; const docEl = doc.documentElement;
    const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
      if (requestFullScreen) {
        try {
          const res = requestFullScreen.call(docEl);
          if (res && typeof res.catch === 'function') res.catch(() => this.showToast("Повноекранний режим заблоковано на цьому пристрої."));
        } catch (e) { this.showToast("Помилка активації повного екрану."); }
      } else { this.showFullscreenTooltip(); }
    } else {
      if (cancelFullScreen) cancelFullScreen.call(doc);
    }
  }

  showFullscreenTooltip() {
    const tooltipModal = document.getElementById('fullscreenTooltipModal');
    const closeBtn = document.getElementById('btn-close-tooltip');

    if (!tooltipModal) return;

    tooltipModal.classList.add('active');
    closeBtn.onclick = () => this.closeFullscreenTooltip();
  }

  closeFullscreenTooltip() {
    const tooltipModal = document.getElementById('fullscreenTooltipModal');

    if (!tooltipModal) return;

    tooltipModal.classList.remove('active');
  }

  updateFullscreenIcon() {
    const isFullscreen = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    const iconEnter = document.getElementById('icon-fs-enter');
    const iconExit = document.getElementById('icon-fs-exit');
    if (iconEnter && iconExit) {
      isFullscreen ? this.hide(iconEnter) : this.show(iconEnter);
      isFullscreen ? this.show(iconExit) : this.hide(iconExit);
    }
  }

  bindEvents() {
    const $ = id => document.getElementById(id);
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('menu-spy-card', () => this.selectGame('spy'));
    on('menu-secret-card', () => this.selectGame('secret'));
    on('secret-host-card', () => this.chooseSecretHost());
    on('secret-guest-card', () => this.chooseSecretGuest());
    on('btn-back-menu', () => this.backToMenu());
    on('btn-rules', () => this.openModal('rulesModal'));
    on('btn-fullscreen', () => this.toggleFullScreen());
    on('btn-count-decrease', () => this.changeCount(-1));
    on('btn-count-increase', () => this.changeCount(1));
    on('btn-select-all', () => this.toggleAll());
    on('btn-start-deal', () => this.startGame());
    on('btn-open-card-init', () => this.openCard());
    on('flip-front-cover', () => this.openCard());
    on('btn-close-card', () => this.closeCard());
    on('btn-restart-action', () => this.confirmAbort());
    on('btn-new-game-restart', () => this.resetGame());
    on('btn-cancel', () => this.closeModal('confirmModal'));
    on('btn-confirm', () => this.executeRestart());
    on('btn-close-rules', () => this.closeModal('rulesModal'));
    on('btn-close-info', () => this.closeModal('infoModal'));
    on('btn-secret-back-host', () => this.switchScreen('screen-secret-role-choice'));
    on('btn-secret-back-guest', () => this.switchScreen('screen-secret-role-choice'));
    on('btn-host-all', () => this.toggleAllMysteryCats());
    on('btn-generate-room', () => this.generateSecretRoomCode());
    on('btn-start-secret-game', () => this.startSecretGame());
    on('btn-host-cancel', () => this.cancelSecretLobby());
    on('btn-join-game', () => this.joinGame());
    const roomCodeInput = document.getElementById('room-code-input');
    if (roomCodeInput) {
      roomCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
    }
    on('btn-dismiss-orientation', () => this.dismissOrientationTip());
    on('btn-myst-ready', () => this.sendMysteryReady());
    on('btn-myst-end-turn', () => this.endSecretTurn());
    on('btn-myst-accuse', () => this.toggleAccuseMode());
    on('btn-myst-surrender', () => this.surrenderSecretGame());
    on('btn-accuse-cancel', () => this.cancelAccuse());
    on('btn-accuse-confirm', () => this.performAccuse());
    on('btn-res-replay', () => this.handleReplayRequest());
    on('btn-replay-accept', () => this.confirmReplayAction());
    on('btn-replay-decline', () => this.declineReplayRequest());
    on('btn-res-menu', () => this.backToMenu());
    on('btn-dismiss-portrait', () => this.dismissPortraitTip());
    document.addEventListener('fullscreenchange', () => this.updateFullscreenIcon());
    document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenIcon());
    document.addEventListener('mozfullscreenchange', () => this.updateFullscreenIcon());
    document.addEventListener('MSFullscreenChange', () => this.updateFullscreenIcon());
    window.addEventListener('resize', () => { if (window.innerHeight > window.innerWidth) this.dismissPortraitTip(); });
    window.addEventListener('beforeunload', () => {
      if (this.network._roomRef && this.secretState.role === 'host') {
        try { this.network._roomRef.onDisconnect().remove(); } catch (e) { }
      }
    });
  }
}
