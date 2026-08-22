import type { PlayerInput } from './PlayerInput';

export interface KeyBindings {
  left: string;
  right: string;
  thrust: string;
  fire: string;
}

// docs/controls.md's decided keyboard mapping. Tracked via native
// KeyboardEvent.code strings rather than Phaser's KeyCodes enum
// specifically because P2's fire key is Right Ctrl - Phaser's KeyCodes
// can't distinguish left/right Ctrl (both map to the same legacy keyCode),
// but `event.code` ('ControlRight') can. Using raw codes for every
// binding keeps P1 and P2 symmetric instead of mixing two approaches.
export const P1_BINDINGS: KeyBindings = {
  left: 'KeyA',
  right: 'KeyD',
  thrust: 'KeyW',
  fire: 'Space',
};

export const P2_BINDINGS: KeyBindings = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  thrust: 'ArrowUp',
  fire: 'ControlRight',
};

export class KeyboardInput implements PlayerInput {
  private readonly held = new Set<string>();
  private readonly bindings: KeyBindings;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;

  constructor(bindings: KeyBindings) {
    this.bindings = bindings;
    this.onKeyDown = (event) => {
      if (this.isBound(event.code)) event.preventDefault();
      this.held.add(event.code);
    };
    this.onKeyUp = (event) => {
      this.held.delete(event.code);
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  get turnDirection(): -1 | 0 | 1 {
    const left = this.held.has(this.bindings.left);
    const right = this.held.has(this.bindings.right);
    if (left && !right) return -1;
    if (right && !left) return 1;
    return 0;
  }

  get isThrusting(): boolean {
    return this.held.has(this.bindings.thrust);
  }

  get isFiring(): boolean {
    return this.held.has(this.bindings.fire);
  }

  private isBound(code: string): boolean {
    return (
      code === this.bindings.left ||
      code === this.bindings.right ||
      code === this.bindings.thrust ||
      code === this.bindings.fire
    );
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
