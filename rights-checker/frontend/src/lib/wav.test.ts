import { describe, expect, it } from 'vitest';
import { encodeWav, toWav16k } from './wav';

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 16_000));
    const text = (o: number, n: number) =>
      String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(o + i)));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });

  it('returns the recording unchanged where Web Audio is missing (tests, old browsers)', async () => {
    const blob = new Blob(['x']);
    expect(await toWav16k(blob)).toBe(blob);
  });
});
