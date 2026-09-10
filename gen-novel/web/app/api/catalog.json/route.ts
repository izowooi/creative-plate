import { getBooks, bookInfo } from '@/lib/catalog';
export const dynamic = 'force-static';
// Local/static preview only. Cloudflare intercepts /api/* and queries Supabase live.
export function GET() {return Response.json(getBooks().map(bookInfo));}
