import { AppConfig } from "../data/config.js";

export class NetworkManager {
  constructor(authReady) {
    this._roomRef = null;
    this._stateListener = false;
    this._guestListenerActive = false;
    this._disconnectListenerActive = false;
    this._authReady = authReady || Promise.resolve();
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
    guestRef.off('value');
    let hasTriggered = false;
    guestRef.on('value', snap => {
      if (snap.val() === true && !hasTriggered) {
        hasTriggered = true;
        onConnected();
      }
    });
  }

  listenForDisconnect(callback, role) {
    if (!this._roomRef) return;
    const field = role === 'host' ? 'guestOnline' : 'hostOnline';
    const statusRef = this._roomRef.child(field);
    if (this._disconnectListenerActive) {
      statusRef.off('value');
    }
    this._disconnectListenerActive = true;
    let firstSnapshot = true;
    statusRef.on('value', snap => {
      if (firstSnapshot) { firstSnapshot = false; return; }
      if (snap.val() === false) callback();
    });
  }

  listenState(callback) {
    if (!this._roomRef) return;
    if (this._stateListener) this._roomRef.off('value');
    this._roomRef.on('value', snap => { callback(snap.exists() ? snap.val() : null); });
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
    this._roomRef.child('guestOnline').off();
    this._roomRef.child('hostOnline').off();
    this._roomRef.off();
    this._roomRef = null;
    this._stateListener = false;
    this._guestListenerActive = false;
    this._disconnectListenerActive = false;
  }

  _isValidRoomCode(code) {
    return new RegExp(`^[0-9]{${AppConfig.ROOM_CODE_LENGTH}}$`).test(code);
  }
}
