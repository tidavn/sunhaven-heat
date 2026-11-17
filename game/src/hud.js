// The HUD and menus for Sunhaven Heat: wanted stars, cash, health,
// the day clock, the mission objective, the speedometer, toasts, and
// a live minimap drawn on a 2D canvas. Menus are plain DOM overlays
// the game shows and hides; every button calls back into the game.

import { ROAD_COORDS, CITY_EXTENT } from './city.js';
import { formatCash, formatDistance, formatTimer } from './util.js';

const MAP_SIZE = 200;
const MAP_SCALE = MAP_SIZE / (CITY_EXTENT * 2 + 60);

export class Hud {
  constructor(document, callbacks) {
    this.doc = document;
    this.cb = callbacks;
    this.el = {};
    for (const id of [
      'hud', 'stars', 'cash', 'health-fill', 'clock', 'objective-title',
      'objective-text', 'objective-dist', 'mission-timer', 'speed',
      'toasts', 'minimap', 'screen-title', 'screen-pause', 'screen-mission',
      'screen-end', 'mission-title', 'mission-body', 'mission-sub',
      'end-title', 'end-body', 'wanted-flash', 'continue-btn',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.minimapCtx = this.el.minimap.getContext('2d');
    this._wireButtons();
  }

  _wireButtons() {
    const bind = (id, fn) => {
      const btn = this.doc.getElementById(id);
      if (btn) btn.addEventListener('click', fn);
    };
    bind('new-game-btn', () => this.cb.onNewGame());
    bind('continue-btn', () => this.cb.onContinue());
    bind('resume-btn', () => this.cb.onResume());
    bind('pause-save-btn', () => this.cb.onSave());
    bind('pause-quit-btn', () => this.cb.onQuitToTitle());
    bind('mission-start-btn', () => this.cb.onMissionStart());
    bind('mission-next-btn', () => this.cb.onMissionNext());
    bind('mission-retry-btn', () => this.cb.onMissionRetry());
    bind('end-continue-btn', () => this.cb.onEndContinue());
    bind('end-title-btn', () => this.cb.onQuitToTitle());
  }

  showHud(visible) {
    this.el.hud.style.display = visible ? 'block' : 'none';
  }

  hideAllScreens() {
    for (const id of ['screen-title', 'screen-pause', 'screen-mission', 'screen-end']) {
      this.el[id].style.display = 'none';
    }
  }

  showScreen(id) {
    this.hideAllScreens();
    this.el[id].style.display = 'flex';
  }

  showTitle(hasSave) {
    this.showScreen('screen-title');
    this.el['continue-btn'].style.display = hasSave ? 'inline-block' : 'none';
    this.showHud(false);
  }

  showPause() {
    this.showScreen('screen-pause');
  }

  /** Mission overlay: mode 'briefing' | 'passed' | 'failed'. */
  showMission(mode, mission, extra = '') {
    this.showScreen('screen-mission');
    const titles = {
      briefing: `DAY ${mission.day} — ${mission.title}`,
      passed: 'MISSION PASSED',
      failed: 'MISSION FAILED',
    };
    this.el['mission-title'].textContent = titles[mode];
    this.el['mission-body'].textContent = mode === 'briefing' ? mission.briefing : extra;
    this.el['mission-sub'].textContent = mode === 'briefing'
      ? `Reward ${formatCash(mission.reward)}${mission.timer ? ` · Time limit ${formatTimer(mission.timer)}` : ''}`
      : mode === 'passed' ? `Reward ${formatCash(mission.reward)}` : '';
    this.doc.getElementById('mission-start-btn').style.display = mode === 'briefing' ? 'inline-block' : 'none';
    this.doc.getElementById('mission-next-btn').style.display = mode === 'passed' ? 'inline-block' : 'none';
    this.doc.getElementById('mission-retry-btn').style.display = mode === 'failed' ? 'inline-block' : 'none';
  }

  /** End overlay: mode 'busted' | 'wasted' | 'story'. */
  showEnd(mode, body) {
    this.showScreen('screen-end');
    const titles = {
      busted: 'BUSTED',
      wasted: 'WASTED',
      story: 'THE LONG WAY OUT',
    };
    this.el['end-title'].textContent = titles[mode];
    this.el['end-body'].textContent = body;
    this.doc.getElementById('end-continue-btn').textContent = mode === 'story' ? 'Keep playing — free roam' : 'Continue';
  }

  setStars(stars) {
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += `<span class="star${i < stars ? ' lit' : ''}">★</span>`;
    }
    this.el.stars.innerHTML = html;
    this.el['wanted-flash'].style.opacity = stars > 0 ? '1' : '0';
  }

  setCash(cash) {
    this.el.cash.textContent = formatCash(cash);
  }

  setHealth(health, maxHealth) {
    const pct = Math.max(0, Math.round((health / maxHealth) * 100));
    this.el['health-fill'].style.width = `${pct}%`;
    this.el['health-fill'].style.background = pct > 50 ? '#2ecc71' : pct > 25 ? '#e8b93c' : '#e5534b';
  }

  setClock(day, hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    const label = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    this.el.clock.textContent = `DAY ${day} · ${h12}:${String(m).padStart(2, '0')} ${label}`;
  }

  setObjective(title, text, distanceM, timerSec) {
    this.el['objective-title'].textContent = title || 'SUNHAVEN';
    this.el['objective-text'].textContent = text || 'Free roam — find work, or just drive.';
    this.el['objective-dist'].textContent = distanceM != null ? formatDistance(distanceM) : '';
    if (timerSec != null && timerSec > 0) {
      this.el['mission-timer'].style.display = 'block';
      this.el['mission-timer'].textContent = formatTimer(timerSec);
      this.el['mission-timer'].style.color = timerSec < 30 ? '#ff6b5e' : '#ffd23c';
    } else {
      this.el['mission-timer'].style.display = 'none';
    }
  }

  setSpeed(kmh, inCar) {
    this.el.speed.style.display = inCar ? 'block' : 'none';
    this.el.speed.textContent = `${Math.round(kmh)} km/h`;
  }

  toast(message, ms = 3600) {
    const div = this.doc.createElement('div');
    div.className = 'toast';
    div.textContent = message;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  _mapXY(x, z) {
    return {
      x: (x + CITY_EXTENT + 30) * MAP_SCALE,
      y: (z + CITY_EXTENT + 30) * MAP_SCALE,
    };
  }

  drawMinimap(world) {
    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = 'rgba(12, 16, 24, 0.88)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea and beach on the west edge.
    ctx.fillStyle = '#1d6f9e';
    ctx.fillRect(0, 0, 14, MAP_SIZE);
    ctx.fillStyle = '#e0c48f';
    ctx.fillRect(14, 0, 6, MAP_SIZE);
    // Roads.
    ctx.strokeStyle = '#5a5f66';
    ctx.lineWidth = 4;
    for (const c of ROAD_COORDS) {
      const a = this._mapXY(c, -CITY_EXTENT);
      const b = this._mapXY(c, CITY_EXTENT);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const c2 = this._mapXY(-CITY_EXTENT, c);
      const d2 = this._mapXY(CITY_EXTENT, c);
      ctx.beginPath();
      ctx.moveTo(c2.x, c2.y);
      ctx.lineTo(d2.x, d2.y);
      ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      const p = this._mapXY(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Sun coins.
    for (const coin of world.side.coins) {
      if (!coin.taken) dot(coin.x, coin.z, '#ffd23c', 2.5);
    }
    // Taxi target.
    const taxiTarget = world.side.taxiTarget;
    if (taxiTarget) dot(taxiTarget.x, taxiTarget.z, '#2ecc71', 4);
    // Mission waypoint.
    const wp = world.missions.waypoint;
    if (wp) {
      const p = this._mapXY(wp.x, wp.z);
      ctx.fillStyle = '#ffd23c';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // Police.
    for (const car of world.police.cars) dot(car.state.x, car.state.z, '#ff3b30', 3.5);
    for (const cop of world.police.officers) dot(cop.x, cop.z, '#ff3b30', 3);
    // Player arrow.
    const pp = this._mapXY(world.player.x, world.player.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(world.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
