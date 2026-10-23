import sqlite3
from contextlib import contextmanager
import json
import hashlib
import time
from pathlib import Path

SCHEMA = '''
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,url TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',channel TEXT NOT NULL DEFAULT '',first_seen REAL NOT NULL,last_seen REAL, last_attempt REAL,state TEXT DEFAULT 'pending',error TEXT);
CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,post_id TEXT NOT NULL REFERENCES posts(id),captured REAL NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(post_id,hash));
CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY,post_id TEXT,captured REAL,status TEXT,detail TEXT);
CREATE TABLE IF NOT EXISTS jobs(post_id TEXT PRIMARY KEY REFERENCES posts(id),due REAL NOT NULL,priority INTEGER DEFAULT 0,attempts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS comment_jobs(post_id TEXT PRIMARY KEY REFERENCES posts(id),due REAL NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,received REAL NOT NULL,event_key TEXT UNIQUE,title TEXT,body TEXT,url TEXT,status TEXT DEFAULT 'unmatched',post_id TEXT);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,created REAL,kind TEXT,detail TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(post_id UNINDEXED,title,body,comments,tokenize='unicode61');
CREATE INDEX IF NOT EXISTS snapshots_post ON snapshots(post_id,captured);
'''

class DB:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        c = sqlite3.connect(str(self.path), timeout=30)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('PRAGMA foreign_keys=ON')
        try:
            with c:
                yield c
        finally:
            c.close()

    def event(self, kind, detail):
        with self.connect() as c:
            c.execute('INSERT INTO events(created,kind,detail) VALUES(?,?,?)', (time.time(),kind,detail[:1000]))

    def enqueue(self, url, pid, priority=0):
        now = time.time()
        with self.connect() as c:
            c.execute('INSERT OR IGNORE INTO posts(id,url,first_seen) VALUES(?,?,?)', (pid,url,now))
            c.execute('UPDATE posts SET url=? WHERE id=?',(url,pid))
            c.execute('INSERT INTO jobs(post_id,due,priority) VALUES(?,?,?) ON CONFLICT(post_id) DO UPDATE SET due=min(jobs.due,excluded.due),priority=max(jobs.priority,excluded.priority)',(pid,now,priority))

    def save(self, data):
        data = dict(data)
        # Counters and coverage are observations, not edits to a post.
        encoded = json.dumps(data, ensure_ascii=False,sort_keys=True)
        digest = hashlib.sha256(encoded.encode()).hexdigest()
        now = time.time()
        with self.connect() as c:
            c.execute('INSERT OR IGNORE INTO posts(id,url,first_seen) VALUES(?,?,?)',(data['id'],data['url'],now))
            cur = c.execute('INSERT OR IGNORE INTO snapshots(post_id,captured,hash,payload) VALUES(?,?,?,?)',(data['id'],now,digest,encoded))
            if cur.rowcount:
                c.execute('INSERT INTO search(post_id,title,body,comments) VALUES(?,?,?,?)',(data['id'],data['title'],data['body'],'\n'.join(x['body'] for x in data['comments'])))
            c.execute("UPDATE posts SET title=?,channel=?,last_seen=?,last_attempt=?,state='saved',error=NULL WHERE id=?",(data['title'],data['channel'],now,now,data['id']))
            c.execute('INSERT INTO observations(post_id,captured,status,detail) VALUES(?,?,?,?)',(data['id'],now,'ok',json.dumps({'comments':len(data['comments']),'expected':data.get('expected_comments'),'complete':data['comments_complete']})))
        return bool(cur.rowcount)

    def rows(self, sql, args=()):
        with self.connect() as c:
            return [dict(x) for x in c.execute(sql,args)]

    def execute(self, sql, args=()):
        with self.connect() as c:
            return c.execute(sql,args).rowcount

    def match_notifications(self):
        for n in self.rows("SELECT * FROM notifications WHERE status='unmatched' ORDER BY id DESC LIMIT 100"):
            candidates=set()
            fields=[n['title'] or '',n['body'] or '']
            if n['body']:fields.append(n['body'].splitlines()[0])
            for field in fields:
                title=' '.join(field.split()).strip()
                if len(title)<5:continue
                candidates.update(p['id'] for p in self.rows('SELECT id FROM posts WHERE title=?',(title,)))
            if len(candidates)==1:
                pid=next(iter(candidates))
                self.execute("UPDATE notifications SET status='matched',post_id=? WHERE id=?",(pid,n['id']))
                self.execute('UPDATE jobs SET due=?,priority=10 WHERE post_id=?',(time.time(),pid))

    def overview(self):
        counts = {}
        for table in ['posts','snapshots','notifications','jobs']:
            counts[table] = self.rows('SELECT count(*) AS n FROM '+table)[0]['n']
        counts['saved_posts'] = self.rows('SELECT count(*) AS n FROM posts WHERE last_seen IS NOT NULL')[0]['n']
        counts['last_success'] = self.rows('SELECT max(last_seen) AS t FROM posts')[0]['t']
        counts['events'] = self.rows('SELECT * FROM events ORDER BY id DESC LIMIT 12')
        counts['storage_bytes'] = sum(p.stat().st_size for p in self.path.parent.glob('archive.sqlite*'))
        return counts

    def find(self, query='', channel='', offset=0):
        where, args = [], []
        if query:
            # Literal substring search supports Korean inflections and archived versions.
            where.append('(p.id IN (SELECT post_id FROM search WHERE title LIKE ? OR body LIKE ? OR comments LIKE ?))')
            args.extend(['%'+query+'%']*3)
        if channel:
            where.append('p.channel=?'); args.append(channel)
        clause = ' WHERE '+' AND '.join(where) if where else ''
        return self.rows('SELECT p.*,(SELECT count(*) FROM snapshots s WHERE s.post_id=p.id) AS versions FROM posts p'+clause+' ORDER BY (p.last_seen IS NOT NULL) DESC,p.last_seen DESC,p.first_seen DESC LIMIT 50 OFFSET ?',args+[offset])

    def detail(self, pid):
        posts = self.rows('SELECT * FROM posts WHERE id=?',(pid,))
        if not posts:
            return None
        p = posts[0]
        p['snapshots'] = self.rows('SELECT id,captured,payload FROM snapshots WHERE post_id=? ORDER BY captured DESC,id DESC',(pid,))
        for s in p['snapshots']:
            s['data'] = json.loads(s.pop('payload'))
        p['observations'] = self.rows('SELECT * FROM observations WHERE post_id=? ORDER BY id DESC LIMIT 30',(pid,))
        return p
