export type FsmState = 'IDLE' | 'PRESSED' | 'PANNING' | 'PINCHING';

export type PointerType = 'mouse' | 'touch' | 'pen';

export interface PointerRecord {
  pointerId: number;
  x: number;
  y: number;
  pointerType: PointerType;
  button: number;
  timestamp: number;
}

export type GestureEvent =
  | { type: 'TAP'; x: number; y: number; pointerType: PointerType }
  | { type: 'LONG_PRESS'; x: number; y: number; pointerType: PointerType }
  | { type: 'PAN_START'; x: number; y: number }
  | { type: 'PAN_MOVE'; dx: number; dy: number }
  | { type: 'PAN_END' }
  | { type: 'PINCH_START'; midX: number; midY: number; distance: number }
  | { type: 'PINCH_MOVE'; midX: number; midY: number; distance: number; dmidX: number; dmidY: number; distanceRatio: number }
  | { type: 'PINCH_END' };

export const TAP_DURATION_MS = 300;
export const TAP_SLOP_PX = 10;
export const LONG_PRESS_DURATION_MS = 300;

interface TrackedPointer {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  pointerType: PointerType;
  button: number;
  startTime: number;
}

export class GestureFsm {
  private state: FsmState = 'IDLE';
  private pointers = new Map<number, TrackedPointer>();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressFired = false;
  private lastPinchDistance = 0;
  private lastMidX = 0;
  private lastMidY = 0;
  private suppressTapUntil = 0;

  constructor(
    private emit: (event: GestureEvent) => void,
  ) {}

  getState(): FsmState {
    return this.state;
  }

  pointerDown(record: PointerRecord): void {
    const tracked: TrackedPointer = {
      pointerId: record.pointerId,
      startX: record.x,
      startY: record.y,
      currentX: record.x,
      currentY: record.y,
      pointerType: record.pointerType,
      button: record.button,
      startTime: record.timestamp,
    };
    this.pointers.set(record.pointerId, tracked);

    if (this.pointers.size === 1) {
      this.state = 'PRESSED';
      this.longPressFired = false;
      this.longPressTimer = setTimeout(() => {
        if (this.state === 'PRESSED' && !this.longPressFired) {
          const p = this.getFirstPointer();
          if (p && this.dist(p.startX, p.startY, p.currentX, p.currentY) < TAP_SLOP_PX) {
            this.longPressFired = true;
            this.emit({ type: 'LONG_PRESS', x: p.currentX, y: p.currentY, pointerType: p.pointerType });
          }
        }
      }, LONG_PRESS_DURATION_MS);
    } else if (this.pointers.size === 2) {
      if (this.longPressTimer !== null) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this.state = 'PINCHING';
      const ptrs = [...this.pointers.values()];
      const p1 = ptrs[0]!;
      const p2 = ptrs[1]!;
      const distance = this.dist(p1.currentX, p1.currentY, p2.currentX, p2.currentY);
      const midX = (p1.currentX + p2.currentX) / 2;
      const midY = (p1.currentY + p2.currentY) / 2;
      this.lastPinchDistance = distance;
      this.lastMidX = midX;
      this.lastMidY = midY;
      this.emit({ type: 'PINCH_START', midX, midY, distance });
    }
  }

  pointerMove(record: PointerRecord): void {
    const tracked = this.pointers.get(record.pointerId);
    if (!tracked) return;

    const prevX = tracked.currentX;
    const prevY = tracked.currentY;
    tracked.currentX = record.x;
    tracked.currentY = record.y;

    if (this.state === 'PRESSED') {
      const d = this.dist(tracked.startX, tracked.startY, tracked.currentX, tracked.currentY);
      if (d > TAP_SLOP_PX) {
        if (this.longPressTimer !== null) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        if (tracked.pointerType === 'touch' || tracked.button !== 0) {
          this.state = 'PANNING';
          this.emit({ type: 'PAN_START', x: tracked.startX, y: tracked.startY });
          this.emit({ type: 'PAN_MOVE', dx: tracked.currentX - tracked.startX, dy: tracked.currentY - tracked.startY });
        }
      }
    } else if (this.state === 'PANNING') {
      this.emit({ type: 'PAN_MOVE', dx: record.x - prevX, dy: record.y - prevY });
    } else if (this.state === 'PINCHING' && this.pointers.size === 2) {
      const ptrs = [...this.pointers.values()];
      const p1 = ptrs[0]!;
      const p2 = ptrs[1]!;
      const distance = this.dist(p1.currentX, p1.currentY, p2.currentX, p2.currentY);
      const midX = (p1.currentX + p2.currentX) / 2;
      const midY = (p1.currentY + p2.currentY) / 2;
      const distanceRatio = this.lastPinchDistance > 0 ? distance / this.lastPinchDistance : 1;
      this.emit({
        type: 'PINCH_MOVE',
        midX,
        midY,
        distance,
        dmidX: midX - this.lastMidX,
        dmidY: midY - this.lastMidY,
        distanceRatio,
      });
      this.lastPinchDistance = distance;
      this.lastMidX = midX;
      this.lastMidY = midY;
    }
  }

  pointerUp(record: PointerRecord): void {
    const tracked = this.pointers.get(record.pointerId);
    if (!tracked) return;

    if (this.state === 'PRESSED') {
      if (this.longPressTimer !== null) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      const duration = record.timestamp - tracked.startTime;
      const d = this.dist(tracked.startX, tracked.startY, tracked.currentX, tracked.currentY);
      if (duration < TAP_DURATION_MS && d < TAP_SLOP_PX && !this.longPressFired && record.timestamp >= this.suppressTapUntil) {
        this.emit({ type: 'TAP', x: tracked.currentX, y: tracked.currentY, pointerType: tracked.pointerType });
      }
      this.state = 'IDLE';
    } else if (this.state === 'PANNING') {
      this.emit({ type: 'PAN_END' });
      this.state = 'IDLE';
    } else if (this.state === 'PINCHING') {
      this.emit({ type: 'PINCH_END' });
      this.suppressTapUntil = record.timestamp + 100;
      this.state = 'IDLE';
    }

    this.pointers.delete(record.pointerId);
    if (this.pointers.size === 0) {
      this.state = 'IDLE';
    }
  }

  pointerCancel(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.state === 'PANNING') {
      this.emit({ type: 'PAN_END' });
    } else if (this.state === 'PINCHING') {
      this.emit({ type: 'PINCH_END' });
    }
    this.pointers.clear();
    this.state = 'IDLE';
  }

  private getFirstPointer(): TrackedPointer | undefined {
    return this.pointers.values().next().value;
  }

  private dist(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
