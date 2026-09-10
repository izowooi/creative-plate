import type { BookInfo, Episode, EpisodeInfo } from '../lib/types';

type Env = { ASSETS: { fetch(request:Request):Promise<Response> }; GN_SUPABASE_URL:string; GN_SUPABASE_ANON_KEY:string };
type Row = Record<string, unknown>;
const epColumns='id,book_id,number,title,status,characters,minutes,source_updated_at';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});

async function rows(env:Env,table:string,query:Record<string,string>):Promise<Row[]> {
  if(!env.GN_SUPABASE_URL || !env.GN_SUPABASE_ANON_KEY) throw new Error('Database not configured');
  const base=new URL(env.GN_SUPABASE_URL);
  if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co')) throw new Error('Invalid database URL');
  const all:Row[]=[];
  for(let offset=0;offset<100000;offset+=500) {
    const url=new URL(`/rest/v1/${table}`,base);
    url.search=new URLSearchParams({...query,limit:'500',offset:String(offset)}).toString();
    const response=await fetch(url,{headers:{apikey:env.GN_SUPABASE_ANON_KEY},signal:AbortSignal.timeout(12000)});
    if(!response.ok) throw new Error(`Database HTTP ${response.status}`);
    const page:Row[]=await response.json();
    all.push(...page);
    if(page.length<500) return all;
  }
  throw new Error('Catalog too large');
}
function episode(row:Row):EpisodeInfo {
  return {id:String(row.id),number:Number(row.number),title:String(row.title),status:row.status as 'draft'|'final',
    updatedAt:String(row.source_updated_at),characters:Number(row.characters),minutes:Number(row.minutes)};
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if(request.method!=='GET') return json({error:'읽기 전용 API입니다.'},405);
    try {
      if(url.pathname.replace(/\/$/,'')==='/api/catalog.json') {
        const [books,episodes]=await Promise.all([
          rows(env,'gn_books',{select:'id,title,author,genre,tags,description,quote',order:'id.asc'}),
          rows(env,'gn_episodes',{select:epColumns,order:'book_id.asc,number.asc'}),
        ]);
        const result:BookInfo[]=books.map(b=>({id:String(b.id),title:String(b.title),author:String(b.author),genre:String(b.genre),
          tags:b.tags as string[],description:String(b.description),quote:String(b.quote),source:'supabase',includeDrafts:true,
          episodes:episodes.filter(e=>e.book_id===b.id).map(episode)}));
        return json(result);
      }
      const match=url.pathname.match(/^\/api\/books\/([a-z0-9-]+)\/episodes\/(ep-[0-9]+)\/?$/);
      if(match) {
        const result=await rows(env,'gn_episodes',{select:`${epColumns},body`,book_id:`eq.${match[1]}`,id:`eq.${match[2]}`,order:'number.asc'});
        if(!result[0]) return json({error:'회차를 찾을 수 없어요.'},404);
        return json({...episode(result[0]),body:String(result[0].body)} satisfies Episode);
      }
      return json({error:'경로를 찾을 수 없어요.'},404);
    } catch {
      // Do not include upstream credentials, URLs, or SQL errors in reader responses.
      return json({error:'이야기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'},503);
    }
  },
};
