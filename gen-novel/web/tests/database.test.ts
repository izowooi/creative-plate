import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';

test('gn schema: RLS, token authentication, atomic sync, history, retry and stale import protection',async()=> {
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    await db.exec(fs.readFileSync('../supabase/migrations/20260910_gn_library.sql','utf8'));
    await db.exec('grant execute on function public.gn_import_catalog(jsonb,text) to authenticated;');
    await db.exec(fs.readFileSync('../supabase/migrations/20260910_gn_function_grants.sql','utf8'));
    assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','public.gn_import_catalog(jsonb,text)','EXECUTE') as allowed")).rows[0].allowed,false);
    const token='test-only-token-'.repeat(5);
    await db.query('insert into public.gn_sync_credentials values ($1,$2)',['github',createHash('sha256').update(token).digest('hex')]);
    const book={id:'test',title:'테스트',author:'작가',genre:'판타지',tags:[],description:'소개',quote:'',episodes:[{
      id:'ep-0001',number:1,title:'첫 화',status:'draft',body:'본문',characters:2,minutes:1,updatedAt:'2026-09-10T00:00:00Z',
    }]};
    const payload={revision:1,commit:'a'.repeat(40),books:[book]};
    await db.exec('set role anon;');
    await assert.rejects(db.query('select * from public.gn_sync_credentials'),/permission denied/);
    await assert.rejects(db.query("insert into public.gn_books (id,title,author,genre) values ('bad','bad','bad','bad')"),/permission denied/);
    await assert.rejects(db.query('select public.gn_import_catalog($1,$2)',[payload,'wrong-token']),/unauthorized/);
    await db.query('select public.gn_import_catalog($1,$2)',[payload,token]);
    assert.equal((await db.query('select * from public.gn_episodes')).rows.length,1);
    const repeat=await db.query<{result:{status:string}}>('select public.gn_import_catalog($1,$2) result',[payload,token]);
    assert.equal(repeat.rows[0].result.status,'already_applied');
    book.episodes[0].status='final';book.episodes[0].body='최종';
    await db.query('select public.gn_import_catalog($1,$2)',[{...payload,revision:2},token]);
    book.episodes[0].status='draft';book.episodes[0].body='되돌릴 초안';
    await db.query('select public.gn_import_catalog($1,$2)',[{...payload,revision:3},token]);
    assert.equal((await db.query<{body:string}>('select body from public.gn_episodes')).rows[0].body,'최종');
    await assert.rejects(db.query('select public.gn_import_catalog($1,$2)',[{...payload,revision:4,books:[{...book,id:'invalid/id'}]},token]));
    await db.exec('reset role;');
    assert.equal((await db.query<{revision:number}>('select revision from public.gn_sync_state')).rows[0].revision,3);
    assert.equal((await db.query('select * from public.gn_episode_revisions')).rows.length,3);
    await db.exec('set role anon;');
    await db.query('select public.gn_import_catalog($1,$2)',[{...payload,revision:5,books:[]},token]);
    assert.equal((await db.query('select * from public.gn_books')).rows.length,0);
    assert.equal((await db.query('select * from public.gn_episodes')).rows.length,0);
  } finally {await db.close();}
});
