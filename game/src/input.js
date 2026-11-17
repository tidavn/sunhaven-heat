// Keyboard and mouse state for Sunhaven Heat. The game reads keys by
// action name (forward, back, left, right, handbrake, enterCar, punch,
// shoot, sprint, pause, mute) so the controls are defined in exactly
// one place. Mouse drag orbits the camera; a click on the canvas also
// fires the pistol when the player is armed and on foot.

const KEY_BINDINGS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyE: 'enterCar',
  KeyF: 'punch',
  KeyQ: 'shoot',
  KeyM: 'mute',
  KeyP: 'pause',
  Escape: 'pause',
  Digit1: 'weapon',
  Enter: 'confirm',
};

export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.canvas = canvas;
    this.onPause = null;
    this.onMute = null;
    this.onConfirm = null;
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const action = KEY_BINDINGS[event.code];
      if (!action) return;
      if (action === 'pause') {
        if (this.onPause) this.onPause();
        return;
      }
      if (action === 'mute') {
        if (this.onMute) this.onMute();
        return;
      }
      if (action === 'confirm') {
        if (this.onConfirm) this.onConfirm();
        return;
      }
      this.held.add(action);
      this.pressed.add(action);
      if (action === 'handbrake' || action === 'shoot' || action === 'punch') {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      const action = KEY_BINDINGS[event.code];
      if (action) this.held.delete(action);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
    });
    canvas.addEventListener('mousedown', (event) => {
      this.mouseDown = true;
      this.dragX = event.clientX;
      this.dragY = event.clientY;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.mouseDown) return;
      this.mouseDX += event.clientX - this.dragX;
      this.mouseDY += event.clientY - this.dragY;
      this.dragX = event.clientX;
      this.dragY = event.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('click', () => {
      this.pressed.add('shoot');
    });
  }

  isDown(action) {
    return this.held.has(action);
  }

  /** True only on the frame the key went down; consumed by endFrame(). */
  wasPressed(action) {
    return this.pressed.has(action);
  }

  /**
   * Mouse drag since last frame, in pixels. Consumed on read: the
   * simulation runs several fixed steps per rendered frame on a slow
   * machine, and reading without consuming would orbit the camera
   * once per step instead of once per frame.
   */
  dragDelta() {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
