'use strict';

/**
 * Parses an HLS master playlist and returns quality levels with absolute URLs.
 * @param {string} text - Raw m3u8 master playlist content
 * @param {string} baseUrl - URL of the master playlist (used to resolve relative URLs)
 * @returns {Array<{height: number, width: number, bandwidth: number, url: string}>}
 */
function parseMasterPlaylist(text, baseUrl) {
  if (!text || !text.trim()) return [];
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  const lines = text.split('\n');
  const levels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
    const bwMatch = line.match(/BANDWIDTH=(\d+)/);
    const urlLine = lines[i + 1]?.trim();

    if (!urlLine || urlLine.startsWith('#')) continue;

    levels.push({
      height: resMatch ? parseInt(resMatch[2], 10) : 0,
      width: resMatch ? parseInt(resMatch[1], 10) : 0,
      bandwidth: bwMatch ? parseInt(bwMatch[1], 10) : 0,
      url: urlLine.startsWith('http') ? urlLine : baseDir + urlLine,
    });
  }

  return levels;
}

/**
 * Parses an HLS media playlist and returns absolute segment URLs.
 * Handles missav.ai's pattern where segments are named video{N}.jpeg (actual MPEG-TS).
 * @param {string} text - Raw m3u8 media playlist content
 * @param {string} baseUrl - URL of the media playlist
 * @returns {string[]} Absolute segment URLs in order
 */
function parseSegmentPlaylist(text, baseUrl) {
  if (!text || !text.trim()) return [];
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => (l.startsWith('http') ? l : baseDir + l));
}

/**
 * Selects the quality level with the highest resolution that does not exceed maxHeight.
 * Falls back to the lowest level if all levels exceed maxHeight.
 * @param {Array<{height: number, url: string}>} levels
 * @param {number} maxHeight - Maximum desired height (default 720)
 * @returns {{height: number, url: string}}
 */
function selectQuality(levels, maxHeight = 720) {
  if (!levels || levels.length === 0) return null;
  const candidates = levels.filter(l => l.height <= maxHeight);
  if (candidates.length === 0) return levels[0];
  return candidates.reduce((best, l) => (l.height > best.height ? l : best));
}

module.exports = { parseMasterPlaylist, parseSegmentPlaylist, selectQuality };
