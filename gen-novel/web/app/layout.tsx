import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '책갈피 · 나의 웹소설 서재', template: '%s · 책갈피' },
  description: '내가 쓰는 이야기, 언제 어디서나 이어 읽는 작은 서재.',
  appleWebApp: { capable: true, title: '책갈피', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
