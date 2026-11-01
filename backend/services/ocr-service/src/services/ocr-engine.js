/**
 * Reads one field from an image buffer. Swap in a real OCR engine behind this interface.
 * @typedef {'member.age' | 'household.bpl_status'} OcrField
 * @typedef {{ value: boolean | number | string | null, confidence: number }} OcrReading
 * @typedef {{ readField(image: Buffer, field: OcrField): Promise<OcrReading> }} OcrEngine
 */

const AGE = /\bage\s*[:-]?\s*(\d{1,3})\b/iu;
const BPL = /\bbpl\b/iu;

/**
 * Placeholder engine for the prototype: looks for plain-text markers in the bytes (useful for
 * tests and demos) and otherwise reports "not found" with zero confidence. It never guesses.
 */
export class MockOcrEngine {
  readField(image, field) {
    const text = image.toString('utf8');
    if (field === 'member.age') {
      const age = AGE.exec(text)?.[1];
      return Promise.resolve(
        age ? { value: Number(age), confidence: 0.4 } : { value: null, confidence: 0 },
      );
    }
    return Promise.resolve(
      BPL.test(text) ? { value: true, confidence: 0.4 } : { value: null, confidence: 0 },
    );
  }
}
