import { AppConfig } from "../data/config.js";

export class NetworkManager {
  constructor(authReady) {
    this._roomRef = null;
    this._stateListener = false;
    this._guestListenerActive = false;
    this._authReady = authReady || Promise.resolve();
    this._guestHandler = null;
    this._disconnectHandler = null;
    this._stateValueHandler = null;
  }

  async ensureAuth() {
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    return this._authReady;
  }

  async createRoom(code, grid, startingRole = 'host') {
    await this.ensureAuth();
    const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
    if (!uid) throw new Error('auth-required');
    if (!this._isValidRoomCode(code)) throw new Error('invalid-room-code');
    const roomRef = firebase.database().ref('rooms/' + code);
    const snap = await roomRef.once('value');
    if (snap.exists()) throw new Error('roomcode-collision');

    const roomData = {
      grid: grid,
      host: { selection: null, eliminated: [], pendingEliminated: [], ready: false, guess: null, requestReplay: false },
      guest: { selection: null, eliminated: [], pendingEliminated: [], ready: false, guess: null, requestReplay: false },
      currentTurn: startingRole, status: 'lobby', winner: null,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      hostOnline: true, guestOnline: false,
      hostUid: uid
    };
    this._roomRef = roomRef;
    try {
      await roomRef.onDisconnect().remove();
      await roomRef.set(roomData);
    } catch (err) {
      await roomRef.onDisconnect().cancel().catch(() => { });
      this._roomRef = null;
      throw err;
    }
    return roomRef;
  }

  async joinRoom(code) {
    await this.ensureAuth();
    const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
    if (!uid) throw new Error('auth-required');
    if (!this._isValidRoomCode(code)) throw new Error('invalid-room-code');
    const roomRef = firebase.database().ref('rooms/' + code);
    const snap = await roomRef.once('value');
    if (!snap.exists()) throw new Error('room-not-found');
    const roomData = snap.val();
    if (roomData.status !== 'lobby') throw new Error('game-already-started');
    if (roomData.guestOnline === true) throw new Error('guest-already-joined');
    if (roomData.hostOnline !== true) throw new Error('host-offline');

    await roomRef.update({ guestOnline: true, guestUid: uid });
    await roomRef.child('guestOnline').onDisconnect().set(false);
    this._roomRef = roomRef;
    return roomData;
  }

  listenForGuest(onConnected) {
    if (!this._roomRef || this._guestListenerActive) return;
    this._guestListenerActive = true;
    const guestRef = this._roomRef.child('guestOnline');
    if (this._guestHandler) guestRef.off('value', this._guestHandler);
    let hasTriggered = false;
    this._guestHandler = snap => {
      if (snap.val() === true && !hasTriggered) {
        hasTriggered = true;
        onConnected();
      }
    };
    guestRef.on('value', this._guestHandler);
  }

  listenForDisconnect(callback, role) {
    if (!this._roomRef) return;
    const field = role === 'host' ? 'guestOnline' : 'hostOnline';
    const statusRef = this._roomRef.child(field);
    if (this._disconnectHandler) statusRef.off('value', this._disconnectHandler);
    let firstSnapshot = true;
    this._disconnectHandler = snap => {
      if (firstSnapshot) { firstSnapshot = false; return; }
      if (snap.val() === false) callback();
    };
    statusRef.on('value', this._disconnectHandler);
  }

  listenState(callback) {
    if (!this._roomRef) return;
    if (this._stateListener && this._stateValueHandler) {
      this._roomRef.off('value', this._stateValueHandler);
    }

    this._stateValueHandler = snap => {
      callback(snap.exists() ? snap.val() : null);
    };

    this._roomRef.on('value', this._stateValueHandler);
    this._stateListener = true;
  }

  async updateState(path, value) {
    if (!this._roomRef) return;
    await this._roomRef.child(path).set(value);
  }

  async updateStates(values) {
    if (!this._roomRef) return;
    await this._roomRef.update(values);
  }

  async disconnect(role) {
    if (!this._roomRef) return;
    try { await this._roomRef.onDisconnect().cancel(); } catch (e) { }
    if (role === 'host') {
      await this._roomRef.remove();
    } else {
      const snap = await this._roomRef.once('value');
      if (snap.exists()) await this._roomRef.child('guestOnline').set(false);
    }
    // Detach granular handlers if present
    try {
      if (this._guestHandler) this._roomRef.child('guestOnline').off('value', this._guestHandler);
      if (this._disconnectHandler) this._roomRef.child('hostOnline').off('value', this._disconnectHandler);
      if (this._stateValueHandler) this._roomRef.off('value', this._stateValueHandler);
    } catch (e) { }

    // Clear internal references
    this._guestHandler = null;
    this._disconnectHandler = null;
    this._stateValueHandler = null;
    this._roomRef = null;
    this._stateListener = false;
  }

  _isValidRoomCode(code) {
    return new RegExp(`^[0-9]{${AppConfig.ROOM_CODE_LENGTH}}$`).test(code);
  }
}
