import { getBooks, bookInfo } from '@/lib/catalog';
import { Library } from '@/components/library';

export default function Home() {
  return <Library books={getBooks().map(bookInfo)} />;
}
