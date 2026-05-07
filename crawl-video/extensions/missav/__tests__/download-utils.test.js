'use strict';
const { buildFilename, concatenateBuffers, extractUuidFromM3u8Url } = require('../ext/lib/download-utils');

describe('buildFilename', () => {
  test('creates valid filename from title and quality', () => {
    expect(buildFilename('H_1724A141G00017 일본 옷을 벗고', '720p'))
      .toBe('missav_H_1724A141G00017_720p.ts');
  });

  test('sanitizes forbidden filename characters', () => {
    expect(buildFilename('Title: "Special/File|Name"', '360p'))
      .toBe('missav_Title__Special_File_Name__360p.ts');
  });

  test('handles title with no spaces', () => {
    expect(buildFilename('H_1724A147G00005', '1080p'))
      .toBe('missav_H_1724A147G00005_1080p.ts');
  });

  test('truncates very long first word', () => {
    const longTitle = 'A'.repeat(100) + ' rest of title';
    const result = buildFilename(longTitle, '480p');
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith('_480p.ts')).toBe(true);
  });
});

describe('concatenateBuffers', () => {
  test('merges two ArrayBuffers correctly', () => {
    const buf1 = new Uint8Array([0x47, 0x40]).buffer;
    const buf2 = new Uint8Array([0x11, 0x10]).buffer;

    const result = concatenateBuffers([buf1, buf2]);

    expect(new Uint8Array(result)).toEqual(new Uint8Array([0x47, 0x40, 0x11, 0x10]));
  });

  test('handles empty array', () => {
    const result = concatenateBuffers([]);
    expect(result.byteLength).toBe(0);
  });

  test('handles single buffer', () => {
    const buf = new Uint8Array([0x47, 0x00, 0x11]).buffer;
    const result = concatenateBuffers([buf]);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([0x47, 0x00, 0x11]));
  });

  test('preserves MPEG-TS sync byte (0x47) at start', () => {
    const mpegTsBuf = new Uint8Array([0x47, 0x40, 0x00, 0x10]).buffer;
    const result = concatenateBuffers([mpegTsBuf]);
    expect(new Uint8Array(result)[0]).toBe(0x47);
  });

  test('correctly calculates total size', () => {
    const bufs = [
      new Uint8Array(100).buffer,
      new Uint8Array(200).buffer,
      new Uint8Array(50).buffer,
    ];
    const result = concatenateBuffers(bufs);
    expect(result.byteLength).toBe(350);
  });
});

describe('extractUuidFromM3u8Url', () => {
  test('extracts UUID from surrit.com URL', () => {
    const url = 'https://surrit.com/4039d1ca-5c9e-472b-b45f-5ec929cfd397/playlist.m3u8';
    expect(extractUuidFromM3u8Url(url))
      .toBe('4039d1ca-5c9e-472b-b45f-5ec929cfd397');
  });

  test('extracts UUID from quality-specific URL', () => {
    const url = 'https://surrit.com/b11ec5e1-86bb-4745-9e4b-2b1c1cd35525/720p/video.m3u8';
    expect(extractUuidFromM3u8Url(url))
      .toBe('b11ec5e1-86bb-4745-9e4b-2b1c1cd35525');
  });

  test('returns null for URL without UUID', () => {
    expect(extractUuidFromM3u8Url('https://example.com/video.m3u8')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractUuidFromM3u8Url('')).toBeNull();
  });
});
