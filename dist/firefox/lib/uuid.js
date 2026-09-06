// lib/uuid.js — Lightweight RFC4122 v4 UUID generator
// No external dependencies. Uses crypto.getRandomValues.

/**
 * Generates a RFC4122 version 4 UUID.
 * @returns {string} e.g. "550e8400-e29b-41d4-a716-446655440000"
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Variant bits (10xx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  }
  // Fallback (no crypto — should never happen in an extension context)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
