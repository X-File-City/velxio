/**
 * I2C Bus Manager — virtual I2C devices that attach to avr8js AVRTWI
 *
 * Each device registers at a 7-bit I2C address. When the Arduino sketch
 * does Wire.beginTransmission(addr) / Wire.requestFrom(addr, ...), the
 * TWI event handler routes events to the matching virtual device.
 */

import type { AVRTWI, TWIEventHandler } from 'avr8js';

// ── Virtual I2C device interface ────────────────────────────────────────────

export interface I2CDevice {
  /** 7-bit I2C address (e.g. 0x27 for PCF8574 LCD backpack, 0x3C for SSD1306) */
  address: number;
  /** Called when master sends a byte after addressing this device for write */
  writeByte(value: number): boolean;          // return true for ACK
  /** Called when master requests a byte from this device (read mode) */
  readByte(): number;
  /** Optional: called on STOP condition */
  stop?(): void;
}

// ── I2C Bus Manager (TWIEventHandler for avr8js) ───────────────────────────

export class I2CBusManager implements TWIEventHandler {
  private devices: Map<number, I2CDevice> = new Map();
  private activeDevice: I2CDevice | null = null;
  private writeMode = true;

  constructor(private twi: AVRTWI) {
    twi.eventHandler = this;
  }

  /** Register a virtual I2C device on the bus */
  addDevice(device: I2CDevice): void {
    this.devices.set(device.address, device);
  }

  /** Remove a device by address */
  removeDevice(address: number): void {
    this.devices.delete(address);
  }

  // ── TWIEventHandler implementation ──────────────────────────────────────

  start(_repeated: boolean): void {
    this.twi.completeStart();
  }

  stop(): void {
    if (this.activeDevice?.stop) this.activeDevice.stop();
    this.activeDevice = null;
    this.twi.completeStop();
  }

  connectToSlave(addr: number, write: boolean): void {
    const device = this.devices.get(addr);
    if (device) {
      this.activeDevice = device;
      this.writeMode = write;
      this.twi.completeConnect(true);  // ACK
    } else {
      this.activeDevice = null;
      this.twi.completeConnect(false); // NACK — no such address
    }
  }

  writeByte(value: number): void {
    if (this.activeDevice) {
      const ack = this.activeDevice.writeByte(value);
      this.twi.completeWrite(ack);
    } else {
      this.twi.completeWrite(false);
    }
  }

  readByte(_ack: boolean): void {
    if (this.activeDevice) {
      const value = this.activeDevice.readByte();
      this.twi.completeRead(value);
    } else {
      this.twi.completeRead(0xff);
    }
  }
}

// ── Built-in virtual I2C devices ───────────────────────────────────────────

/**
 * Generic I2C memory / register device.
 * Emulates a device with 256 byte registers.
 * First write byte = register address, subsequent bytes = data.
 * Reads return register contents sequentially.
 *
 * Used to test I2C communication without a specific device implementation.
 */
export class I2CMemoryDevice implements I2CDevice {
  public registers = new Uint8Array(256);
  private regPointer = 0;
  private firstByte = true;

  /** Callback fired whenever a register is written */
  public onRegisterWrite: ((reg: number, value: number) => void) | null = null;

  constructor(public address: number) {}

  writeByte(value: number): boolean {
    if (this.firstByte) {
      this.regPointer = value;
      this.firstByte = false;
    } else {
      this.registers[this.regPointer] = value;
      if (this.onRegisterWrite) {
        this.onRegisterWrite(this.regPointer, value);
      }
      this.regPointer = (this.regPointer + 1) & 0xFF;
    }
    return true; // ACK
  }

  readByte(): number {
    const value = this.registers[this.regPointer];
    this.regPointer = (this.regPointer + 1) & 0xFF;
    return value;
  }

  stop(): void {
    this.firstByte = true;
  }
}

/**
 * Virtual DS1307 RTC — returns system time via I2C (address 0x68).
 * Supports Wire.requestFrom(0x68, 7) to read seconds..year in BCD.
 */
export class VirtualDS1307 implements I2CDevice {
  public address = 0x68;
  private regPointer = 0;
  private firstByte = true;

  private toBCD(n: number): number {
    return ((Math.floor(n / 10) & 0xF) << 4) | (n % 10 & 0xF);
  }

  writeByte(value: number): boolean {
    if (this.firstByte) {
      this.regPointer = value;
      this.firstByte = false;
    }
    return true;
  }

  readByte(): number {
    const now = new Date();
    let val = 0;
    switch (this.regPointer) {
      case 0: val = this.toBCD(now.getSeconds()); break;   // seconds
      case 1: val = this.toBCD(now.getMinutes()); break;   // minutes
      case 2: val = this.toBCD(now.getHours());   break;   // hours (24h)
      case 3: val = this.toBCD(now.getDay() + 1); break;   // day of week (1=Sun)
      case 4: val = this.toBCD(now.getDate());     break;   // date
      case 5: val = this.toBCD(now.getMonth() + 1); break;  // month
      case 6: val = this.toBCD(now.getFullYear() % 100); break; // year
      default: val = 0;
    }
    this.regPointer = (this.regPointer + 1) & 0x3F;
    return val;
  }

  stop(): void {
    this.firstByte = true;
  }
}

/**
 * Virtual temperature / humidity sensor (address 0x48).
 * Returns fixed temperature (configurable) and humidity.
 */
export class VirtualTempSensor implements I2CDevice {
  public address = 0x48;
  private regPointer = 0;
  private firstByte = true;

  /** Temperature in degrees C * 100 (e.g. 2350 = 23.50 C) */
  public temperature = 2350;
  /** Humidity in % * 100 */
  public humidity = 5500;

  writeByte(value: number): boolean {
    if (this.firstByte) {
      this.regPointer = value;
      this.firstByte = false;
    }
    return true;
  }

  readByte(): number {
    let val = 0;
    // Register 0: temp high byte, 1: temp low byte, 2: humidity high, 3: humidity low
    switch (this.regPointer) {
      case 0: val = (this.temperature >> 8) & 0xFF; break;
      case 1: val = this.temperature & 0xFF; break;
      case 2: val = (this.humidity >> 8) & 0xFF; break;
      case 3: val = this.humidity & 0xFF; break;
      default: val = 0xFF;
    }
    this.regPointer = (this.regPointer + 1) & 0xFF;
    return val;
  }

  stop(): void {
    this.firstByte = true;
  }
}
