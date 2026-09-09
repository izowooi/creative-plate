import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, parsePreferences, parsePosition } from '../lib/reading-state';

test('missing or corrupt preferences safely return defaults',()=> {
  for(const value of [null,'not-json','null','{}']) assert.deepEqual(parsePreferences(value),defaultPreferences);
});
test('preferences persist supported choices and clamp corrupted sizes',()=> {
  assert.deepEqual(parsePreferences(JSON.stringify({theme:'dark',font:'serif',size:24,leading:2.3})),{theme:'dark',font:'serif',size:24,leading:2.3});
  assert.equal(parsePreferences('{"size":999}').size,28);
  assert.equal(parsePreferences('{"size":0}').size,16);
  assert.equal(parsePreferences('{"theme":"red","leading":8}').theme,'light');
});
test('saved position uses stable episode IDs and validated paragraph numbers',()=> {
  const p={episodeId:'ep-0001',progress:67,paragraph:35,updatedAt:1788566000};
  assert.deepEqual(parsePosition(JSON.stringify(p)),p);
  for(const value of [null,'{','null',JSON.stringify({...p,paragraph:-1}),JSON.stringify({...p,episodeId:'../../foo'})]) assert.equal(parsePosition(value),null);
  assert.equal(parsePosition(JSON.stringify({...p,progress:120}))?.progress,100);
});
