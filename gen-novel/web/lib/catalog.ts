import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Book, BookMeta, Episode } from './types';
import library from '../content/library.json';

function json(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function directories(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort() : [];
}
function safeFile(root: string, file: string): string {
  const real = fs.realpathSync(file);
  if (!real.startsWith(fs.realpathSync(root) + path.sep)) throw new Error('작품 폴더 밖의 파일입니다.');
  return real;
}
function episode(root: string, folder: string, number: unknown, date: unknown, status: Episode['status']): Episode | null {
  if (!Number.isSafeInteger(number) || Number(number) < 1) throw new Error('올바르지 않은 회차 번호입니다.');
  if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) throw new Error('올바르지 않은 회차 날짜입니다.');
  const file = path.join(folder, status === 'final' ? 'manuscript.md' : 'draft.md');
  if (!fs.existsSync(file)) {
    if (status === 'draft') return null;
    throw new Error('확정 원고가 없습니다.');
  }
  const text = fs.readFileSync(safeFile(root, file), 'utf8').replace(/\r\n/g, '\n');
  if (!text.trim() || text.includes('[작성 필요]')) {
    if (status === 'draft') return null;
    throw new Error('확정 원고가 비어 있습니다.');
  }
  const heading = text.match(/^#\s+(.+)\n?/);
  const title = (heading?.[1] ?? `${number}화`).replace(/^\d+화[.\s]*/, '').trim();
  const body = heading ? text.slice(heading[0].length).trim() : text.trim();
  return { id: `ep-${String(number).padStart(4, '0')}`, number: Number(number), title, status,
    updatedAt: date, characters: body.replace(/\s/g, '').length,
    minutes: Math.max(1, Math.ceil(body.replace(/\s/g, '').length / 450)), body };
}

/** Only explicitly configured books and manuscript files enter the public reader. */
export function loadCatalog(root: string, entries: BookMeta[]): Book[] {
  const ids = new Set<string>();
  return entries.map(meta => {
    if (!/^[a-z0-9-]+$/.test(meta.id) || ids.has(meta.id)) throw new Error('중복되거나 잘못된 작품 ID입니다.');
    ids.add(meta.id);
    const source = path.resolve(root, meta.source);
    if (!source.startsWith(path.resolve(root) + path.sep)) throw new Error('작품 경로가 프로젝트 밖입니다.');
    if (!fs.existsSync(source)) throw new Error(`작품 자료 폴더가 없습니다: ${meta.id}`);
    safeFile(root, source);
    const episodes = new Map<number, Episode>();
    for (const name of directories(path.join(source, 'final'))) {
      if (!/^\d+$/.test(name)) continue;
      const dir = path.join(source, 'final', name);
      const release = json(safeFile(source, path.join(dir, 'release.json')));
      const hashes = release.hashes as Record<string, string> | undefined;
      const manuscript = fs.readFileSync(safeFile(source, path.join(dir, 'manuscript.md')), 'utf8').replace(/\r\n/g, '\n');
      if (!hashes || createHash('sha256').update(manuscript).digest('hex') !== hashes['manuscript.md']) {
        throw new Error('확정 원고 해시가 일치하지 않습니다. novel.py check로 확인하세요.');
      }
      const item = episode(source, dir, release.episode, release.approved_at, 'final');
      if (item) {
        if (episodes.has(item.number)) throw new Error('중복 확정 회차입니다.');
        episodes.set(item.number, item);
      }
    }
    if (meta.includeDrafts) for (const name of directories(path.join(source, 'runs'))) {
      const dir = path.join(source, 'runs', name);
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
      const manifest = json(safeFile(source, path.join(dir, 'manifest.json')));
      const item = episode(source, dir, manifest.episode, manifest.created_at, 'draft');
      if (!item) continue;
      const previous = episodes.get(item.number);
      if (!previous || (previous.status === 'draft' && Date.parse(item.updatedAt) > Date.parse(previous.updatedAt))) {
        episodes.set(item.number, item);
      }
    }
    return { ...meta, episodes: [...episodes.values()].sort((a, b) => a.number - b.number) };
  });
}

export function getBooks(): Book[] {
  return loadCatalog(path.resolve(process.cwd(), '..'), library as BookMeta[]);
}
export function bookInfo(book: Book) {
  return { ...book, episodes: book.episodes.map(({ body: _body, ...info }) => info) };
}
