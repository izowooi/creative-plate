import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index';

const env={GN_SUPABASE_URL:'https://example.supabase.co',GN_SUPABASE_ANON_KEY:'test-public-key',ASSETS:{fetch:async()=>new Response('asset')}};
test('worker exposes read-only live catalog/chapters and does not return secrets on failure',async()=> {
  const original=globalThis.fetch;
  const episode={book_id:'future-book',id:'ep-0020',number:20,title:'새 회차',status:'draft',characters:2,minutes:1,source_updated_at:'2026-09-10',body:'새 본문'};
  try {
    globalThis.fetch=async(input)=> {
      const url=new URL(String(input));
      const item=url.pathname.endsWith('gn_books')?{id:'future-book',title:'새 작품',author:'작가',genre:'판타지',tags:[],description:'',quote:''}:episode;
      return Response.json([item]);
    };
    const catalog=await worker.fetch(new Request('https://reader.test/api/catalog.json'),env);
    assert.equal(catalog.status,200);
    const data=await catalog.json() as {episodes:unknown[]}[];
    assert.equal(data.length,1);assert.ok(!JSON.stringify(data).includes('새 본문'));
    const chapter=await worker.fetch(new Request('https://reader.test/api/books/future-book/episodes/ep-0020'),env);
    assert.equal((await chapter.json() as {body:string}).body,'새 본문');
    assert.equal((await worker.fetch(new Request('https://reader.test/api/catalog.json',{method:'POST'}),env)).status,405);
    assert.equal(await (await worker.fetch(new Request('https://reader.test/read/?book=future-book'),env)).text(),'asset');
    globalThis.fetch=async()=>new Response('secret upstream error',{status:500});
    const failure=await worker.fetch(new Request('https://reader.test/api/catalog.json'),env);
    assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('secret'));
  } finally {globalThis.fetch=original;}
});
