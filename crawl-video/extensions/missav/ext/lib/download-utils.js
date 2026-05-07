'use strict';

const MAX_FIRST_PART_LEN = 60;

/**
 * Builds a safe filename for the downloaded video.
 * Format: missav_{firstWordOfTitle}_{quality}.ts
 * @param {string} pageTitle - Page title (e.g. "H_1724A141G00017 일본 옷을...")
 * @param {string} quality   - Quality string (e.g. "720p")
 * @returns {string}
 */
function buildFilename(pageTitle, quality) {
  const firstPart = pageTitle
    .replace(/[^\x00-\x7F].*$/, '')
    .trimEnd()
    .replace(/[<>:"/\\|?* ]/g, '_')
    .replace(/_{3,}/g, '__')
    .substring(0, MAX_FIRST_PART_LEN);
  return `missav_${firstPart}_${quality}.ts`;
}

/**
 * Concatenates an array of ArrayBuffers into a single ArrayBuffer.
 * Used to merge MPEG-TS segments (disguised as .jpeg) into one .ts file.
 * @param {ArrayBuffer[]} buffers
 * @returns {ArrayBuffer}
 */
function concatenateBuffers(buffers) {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

/**
 * Extracts the UUID from a surrit.com m3u8 URL.
 * Pattern: https://surrit.com/{UUID}/...
 * @param {string} url
 * @returns {string|null}
 */
function extractUuidFromM3u8Url(url) {
  if (!url) return null;
  const match = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  return match ? match[0] : null;
}

module.exports = { buildFilename, concatenateBuffers, extractUuidFromM3u8Url };
