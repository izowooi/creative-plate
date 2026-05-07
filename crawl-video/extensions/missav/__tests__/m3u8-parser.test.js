'use strict';
const { parseMasterPlaylist, parseSegmentPlaylist, selectQuality } = require('../ext/lib/m3u8-parser');

describe('parseMasterPlaylist', () => {
  test('returns quality levels with absolute URLs', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=1416800,CODECS="avc1.64001e,mp4a.40.2",RESOLUTION=640x360',
      '360p/video.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=4606800,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720',
      '720p/video.m3u8',
    ].join('\n');
    const baseUrl = 'https://surrit.com/abc-123/playlist.m3u8';

    const result = parseMasterPlaylist(text, baseUrl);

    expect(result).toEqual([
      { height: 360, width: 640, bandwidth: 1416800, url: 'https://surrit.com/abc-123/360p/video.m3u8' },
      { height: 720, width: 1280, bandwidth: 4606800, url: 'https://surrit.com/abc-123/720p/video.m3u8' },
    ]);
  });

  test('handles all four quality levels from real site', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-STREAM-INF:BANDWIDTH=1416800,CODECS="avc1.64001e,mp4a.40.2",RESOLUTION=640x360',
      '360p/video.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=2514600,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=854x480',
      '480p/video.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=4606800,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720',
      '720p/video.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=8115800,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080',
      '1080p/video.m3u8',
    ].join('\n');
    const baseUrl = 'https://surrit.com/4039d1ca-5c9e-472b-b45f-5ec929cfd397/playlist.m3u8';

    const result = parseMasterPlaylist(text, baseUrl);

    expect(result).toHaveLength(4);
    expect(result.map(l => l.height)).toEqual([360, 480, 720, 1080]);
    expect(result[2].url).toBe('https://surrit.com/4039d1ca-5c9e-472b-b45f-5ec929cfd397/720p/video.m3u8');
  });

  test('returns empty array for empty input', () => {
    expect(parseMasterPlaylist('', 'https://surrit.com/abc/playlist.m3u8')).toEqual([]);
  });

  test('handles absolute URLs in playlist', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=1416800,RESOLUTION=640x360',
      'https://cdn.example.com/360p/video.m3u8',
    ].join('\n');
    const result = parseMasterPlaylist(text, 'https://surrit.com/abc/playlist.m3u8');
    expect(result[0].url).toBe('https://cdn.example.com/360p/video.m3u8');
  });
});

describe('parseSegmentPlaylist', () => {
  test('returns absolute segment URLs', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:4',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:4.004000,',
      'video0.jpeg',
      '#EXTINF:4.004011,',
      'video1.jpeg',
      '#EXT-X-ENDLIST',
    ].join('\n');
    const baseUrl = 'https://surrit.com/abc/360p/video.m3u8';

    const result = parseSegmentPlaylist(text, baseUrl);

    expect(result).toEqual([
      'https://surrit.com/abc/360p/video0.jpeg',
      'https://surrit.com/abc/360p/video1.jpeg',
    ]);
  });

  test('handles empty playlist', () => {
    expect(parseSegmentPlaylist('', 'https://surrit.com/abc/360p/video.m3u8')).toEqual([]);
    expect(parseSegmentPlaylist('   ', 'https://surrit.com/abc/360p/video.m3u8')).toEqual([]);
  });

  test('handles only headers (no segments)', () => {
    const text = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST';
    expect(parseSegmentPlaylist(text, 'https://surrit.com/abc/360p/video.m3u8')).toEqual([]);
  });

  test('handles absolute segment URLs', () => {
    const text = '#EXTM3U\n#EXTINF:4.0,\nhttps://cdn.example.com/seg0.ts\n#EXT-X-ENDLIST';
    const result = parseSegmentPlaylist(text, 'https://surrit.com/abc/360p/video.m3u8');
    expect(result).toEqual(['https://cdn.example.com/seg0.ts']);
  });

  test('counts correct number of segments for real playlist size', () => {
    const lines = ['#EXTM3U', '#EXT-X-TARGETDURATION:4'];
    for (let i = 0; i < 176; i++) {
      lines.push(`#EXTINF:4.004000,`, `video${i}.jpeg`);
    }
    lines.push('#EXT-X-ENDLIST');
    const result = parseSegmentPlaylist(lines.join('\n'), 'https://surrit.com/abc/360p/video.m3u8');
    expect(result).toHaveLength(176);
    expect(result[0]).toBe('https://surrit.com/abc/360p/video0.jpeg');
    expect(result[175]).toBe('https://surrit.com/abc/360p/video175.jpeg');
  });
});

describe('selectQuality', () => {
  const levels = [
    { height: 360, url: 'url360' },
    { height: 480, url: 'url480' },
    { height: 720, url: 'url720' },
    { height: 1080, url: 'url1080' },
  ];

  test('selects highest quality <= maxHeight', () => {
    expect(selectQuality(levels, 720)).toMatchObject({ height: 720, url: 'url720' });
  });

  test('selects closest lower quality when exact match unavailable', () => {
    expect(selectQuality(levels, 600)).toMatchObject({ height: 480, url: 'url480' });
    expect(selectQuality(levels, 400)).toMatchObject({ height: 360, url: 'url360' });
  });

  test('selects highest available when maxHeight exceeds all', () => {
    expect(selectQuality(levels, 9999)).toMatchObject({ height: 1080, url: 'url1080' });
    expect(selectQuality(levels, 1080)).toMatchObject({ height: 1080, url: 'url1080' });
  });

  test('falls back to first level when all exceed maxHeight', () => {
    expect(selectQuality(levels, 100)).toBe(levels[0]);
  });

  test('defaults to 720p when maxHeight not specified', () => {
    expect(selectQuality(levels)).toMatchObject({ height: 720 });
  });
});
