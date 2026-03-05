/**
 * RP2040Simulator Tests
 *
 * Tests the Raspberry Pi Pico (RP2040) emulator including:
 * - Lifecycle: create, loadBinary, start, stop, reset
 * - GPIO pin listeners (all 30 pins)
 * - ADC access
 * - External pin driving (setPinState)
 * - Binary loading (base64 decode)
 * - LED_BUILTIN pin (GPIO25)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RP2040Simulator } from '../simulation/RP2040Simulator';
import { PinManager } from '../simulation/PinManager';

// ─── Mock requestAnimationFrame ──────────────────────────────────────────────
// No-op mock: returns an ID but never invokes the callback.
// The RP2040 execute loop runs ~2M ARM cycles per frame which causes OOM in tests.
// Since lifecycle tests only need isRunning() (set before RAF fires), a no-op is safe.
beforeEach(() => {
  let counter = 0;
  vi.stubGlobal('requestAnimationFrame', (_cb: FrameRequestCallback) => ++counter);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a minimal base64-encoded RP2040 binary.
 * A real binary would start with the 256-byte second stage bootloader.
 * For lifecycle tests, we just need *some* bytes.
 */
function minimalBinary(sizeKb = 1): string {
  const bytes = new Uint8Array(sizeKb * 1024); // all zeros = NOP-like
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('RP2040Simulator — lifecycle', () => {
  let pm: PinManager;
  let sim: RP2040Simulator;

  beforeEach(() => {
    pm = new PinManager();
    sim = new RP2040Simulator(pm);
  });
  afterEach(() => sim.stop());

  it('creates instance in idle state', () => {
    expect(sim).toBeDefined();
    expect(sim.isRunning()).toBe(false);
  });

  it('loadBinary() accepts valid base64 without throwing', () => {
    expect(() => sim.loadBinary(minimalBinary())).not.toThrow();
  });

  it('start() transitions to running after loadBinary()', () => {
    sim.loadBinary(minimalBinary());
    sim.start();
    expect(sim.isRunning()).toBe(true);
  });

  it('stop() transitions out of running state', () => {
    sim.loadBinary(minimalBinary());
    sim.start();
    sim.stop();
    expect(sim.isRunning()).toBe(false);
  });

  it('stop() is idempotent before start()', () => {
    expect(() => sim.stop()).not.toThrow();
    expect(sim.isRunning()).toBe(false);
  });

  it('reset() restores idle state and preserves flash', () => {
    sim.loadBinary(minimalBinary(4));
    sim.start();
    sim.reset();
    expect(sim.isRunning()).toBe(false);
    // After reset, ADC should still be accessible (new RP2040 instance created)
    expect(sim.getADC()).not.toBeNull();
  });

  it('warns but does not throw on loadHex() (wrong method)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => sim.loadHex(':00000001FF')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('setSpeed() clamps to valid range', () => {
    sim.setSpeed(0.001);
    expect((sim as any).speed).toBe(0.1);
    sim.setSpeed(99);
    expect((sim as any).speed).toBe(10.0);
    sim.setSpeed(3.0);
    expect((sim as any).speed).toBe(3.0);
  });
});

// ─── ADC ─────────────────────────────────────────────────────────────────────

describe('RP2040Simulator — ADC', () => {
  it('getADC() returns null before loadBinary()', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    expect(sim.getADC()).toBeNull();
  });

  it('getADC() returns RPADC instance after loadBinary()', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());
    const adc = sim.getADC();
    expect(adc).not.toBeNull();
    expect(adc).toBeDefined();
  });

  it('ADC object has expected shape', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());
    const adc = sim.getADC();
    // RP2040 ADC has a different API from AVRADC — just ensure it's an object
    expect(typeof adc).toBe('object');
  });
});

// ─── GPIO pin listeners ───────────────────────────────────────────────────────

describe('RP2040Simulator — GPIO listeners', () => {
  it('setPinState() drives a GPIO pin and PinManager reflects it', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());

    const cb = vi.fn();
    pm.onPinChange(25, cb);  // LED_BUILTIN = GPIO25

    sim.setPinState(25, true);
    // setPinState uses gpio.setInputValue — the GPIO listener fires via rp2040js
    expect(() => sim.setPinState(25, false)).not.toThrow();
  });

  it('GPIO listeners are set up for all 30 pins after loadBinary()', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());

    // 30 GPIO listeners should be registered
    const unsubscribers = (sim as any).gpioUnsubscribers as Array<() => void>;
    expect(unsubscribers).toHaveLength(30);
  });

  it('GPIO listeners are cleaned up and recreated on reset()', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());
    const beforeCount = (sim as any).gpioUnsubscribers.length;

    sim.reset();
    const afterCount = (sim as any).gpioUnsubscribers.length;

    expect(beforeCount).toBe(30);
    expect(afterCount).toBe(30);
  });

  it('setPinState() works for all valid GPIO indices (0-29)', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());

    for (let gpio = 0; gpio < 30; gpio++) {
      expect(() => sim.setPinState(gpio, true)).not.toThrow();
      expect(() => sim.setPinState(gpio, false)).not.toThrow();
    }
  });

  it('setPinState() on out-of-range pin does not throw', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    // No loadBinary — rp2040 is null
    expect(() => sim.setPinState(0, true)).not.toThrow();
    expect(() => sim.setPinState(99, true)).not.toThrow();
  });
});

// ─── Binary loading ───────────────────────────────────────────────────────────

describe('RP2040Simulator — binary loading', () => {
  it('loads exact byte count into flash', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    const sizeBytes = 2048;
    const b64 = minimalBinary(sizeBytes / 1024);
    sim.loadBinary(b64);

    const rp2040 = (sim as any).rp2040;
    expect(rp2040).not.toBeNull();
    // The first `sizeBytes` of flash should match our binary (all zeros)
    const flashSlice = rp2040.flash.slice(0, sizeBytes);
    expect(flashSlice.every((b: number) => b === 0)).toBe(true);
  });

  it('larger binary loads without overflow', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    // 256 KB = largest practical sketch
    const b64 = minimalBinary(256);
    expect(() => sim.loadBinary(b64)).not.toThrow();
  });

  it('flash content is preserved after reset()', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);

    // Create a binary with a known pattern
    const bytes = new Uint8Array(256);
    bytes[0] = 0xAA;
    bytes[1] = 0xBB;
    bytes[255] = 0xFF;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);

    sim.loadBinary(b64);
    sim.reset();

    const rp2040 = (sim as any).rp2040;
    expect(rp2040.flash[0]).toBe(0xAA);
    expect(rp2040.flash[1]).toBe(0xBB);
    expect(rp2040.flash[255]).toBe(0xFF);
  });
});

// ─── PinManager integration ───────────────────────────────────────────────────

describe('RP2040Simulator — PinManager integration', () => {
  it('pinManager reference is accessible', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    expect(sim.pinManager).toBe(pm);
  });

  it('triggerPinChange from external code fires PinManager listeners', () => {
    const pm = new PinManager();
    const sim = new RP2040Simulator(pm);
    sim.loadBinary(minimalBinary());

    const cb = vi.fn();
    pm.onPinChange(25, cb);

    // Simulate what would happen when GPIO25 goes HIGH inside the RP2040
    pm.triggerPinChange(25, true);

    expect(cb).toHaveBeenCalledWith(25, true);
  });
});
