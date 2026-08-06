import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectCountryCodeForQuery } from './geocodeHelpers';

describe('detectCountryCodeForQuery', () => {
  /**
   * **Feature: platform-refinement, Property 1: Country code detection consistency**
   * **Validates: Requirements 1.3**
   *
   * For any input string containing no Chinese characters (Unicode \u4e00-\u9fff),
   * detectCountryCodeForQuery SHALL return 'us'.
   */
  it('returns "us" for any string without Chinese characters', () => {
    // Generate ASCII-only strings (printable range 0x20-0x7e) to ensure no Chinese chars
    const asciiString = fc.array(
      fc.integer({ min: 0x20, max: 0x7e }).map(c => String.fromCharCode(c)),
      { minLength: 0, maxLength: 200 },
    ).map(arr => arr.join(''));

    fc.assert(
      fc.property(asciiString, (input) => {
        expect(detectCountryCodeForQuery(input)).toBe('us');
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Complementary direction: any string containing at least one Chinese character
   * SHALL return 'cn'.
   */
  it('returns "cn" for any string containing at least one Chinese character', () => {
    const chineseChar = fc.integer({ min: 0x4e00, max: 0x9fff }).map(c => String.fromCharCode(c));
    const asciiPart = fc.array(
      fc.integer({ min: 0x20, max: 0x7e }).map(c => String.fromCharCode(c)),
      { minLength: 0, maxLength: 50 },
    ).map(arr => arr.join(''));

    // Build a string that has at least one Chinese character mixed with ASCII
    const mixedString = fc.tuple(asciiPart, chineseChar, asciiPart).map(
      ([before, ch, after]) => before + ch + after,
    );

    fc.assert(
      fc.property(mixedString, (input) => {
        expect(detectCountryCodeForQuery(input)).toBe('cn');
      }),
      { numRuns: 200 },
    );
  });
});
