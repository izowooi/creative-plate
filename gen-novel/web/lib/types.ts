export type BookMeta = {
  id: string; title: string; author: string; genre: string; tags: string[];
  description: string; quote: string; source: string; includeDrafts: boolean;
};
export type Episode = {
  id: string; number: number; title: string; status: 'draft' | 'final';
  updatedAt: string; characters: number; minutes: number; body: string;
};
export type EpisodeInfo = Omit<Episode, 'body'>;
export type Book = BookMeta & { episodes: Episode[] };
export type BookInfo = Omit<Book, 'episodes'> & { episodes: EpisodeInfo[] };
