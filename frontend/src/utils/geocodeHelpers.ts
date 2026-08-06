/**
 * Detect country code based on query text.
 * If the query contains Chinese characters (Unicode \u4e00-\u9fff), returns 'cn'.
 * Otherwise returns 'us'.
 */
export function detectCountryCodeForQuery(query: string): 'cn' | 'us' {
  return /[\u4e00-\u9fff]/.test(query) ? 'cn' : 'us';
}

/**
 * Detect country code based on geographic coordinates.
 * Returns 'cn' if coordinates fall within China's bounding box, otherwise 'us'.
 */
export function detectCountryCodeForCoords(lat: number, lon: number): 'cn' | 'us' {
  return lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135 ? 'cn' : 'us';
}
