// Save and load for Sunhaven Heat: one small JSON record in
// localStorage. It keeps the story position, cash, health, the sun
// coins found and where the player stood — never anything the game
// cannot rebuild. A corrupt or missing record just starts a new game.

export const SAVE_KEY = 'sunhaven-heat.save.v1';

export function saveGame(state) {
  try {
    const record = {
      version: 1,
      missionIndex: state.missionIndex,
      cash: Math.round(state.cash),
      health: Math.round(state.health),
      coinsCollected: state.coinsCollected,
      player: { x: state.playerX, z: state.playerZ },
      day: state.day,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== 1) return null;
    return record;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
