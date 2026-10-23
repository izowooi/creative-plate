import json
import logging
import re
import time
from urllib.parse import quote
import requests
from .parser import BASE, CHANNELS, article, listing

log = logging.getLogger(__name__)

class RateLimited(Exception):
    pass

class Collector:
    def __init__(self, db, config, gate=None):
        self.db, self.config = db, config
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'BlindPersonalArchive/1.0 (private reading archive; no redistribution)'
        self.last_request = 0
        self.gate = gate if gate is not None else {'pause_until':0}
        self.browser = None
        self.pw = None
        self.browser_error = None

    @property
    def pause_until(self):
        return self.gate['pause_until']

    @pause_until.setter
    def pause_until(self, value):
        self.gate['pause_until']=value

    def fetch(self, url):
        delay = self.config.get('request_delay_seconds', 5)
        time.sleep(max(0, delay-(time.time()-self.last_request)))
        self.last_request = time.time()
        r = self.session.get(url, timeout=(10,35),allow_redirects=False)
        if r.status_code in (403,429):
            self.pause_until = time.time()+3600
            raise RateLimited('HTTP %s: 1시간 수집 중단'%r.status_code)
        r.raise_for_status()
        if r.status_code != 200:
            raise ValueError('Unexpected HTTP %s'%r.status_code)
        if len(r.content) > 12_000_000:
            raise ValueError('Response too large')
        r.encoding = 'utf-8'
        return r.text

    def discover(self):
        for channel in self.config.get('channels',CHANNELS):
            if time.time()<self.pause_until:
                break
            try:
                html = self.fetch(BASE+'/kr/topics/'+quote(channel,safe=''))
                found = listing(html)
                if not found:
                    raise ValueError('목록에서 게시글을 찾지 못했습니다.')
                # Recheck older entries independently; discovery must not reset backoff.
                for p in found:
                    known = self.db.rows('SELECT id,last_seen FROM posts WHERE id=?',(p['id'],))
                    priority=8 if channel=='토픽 베스트' else 5
                    if not known:
                        self.db.enqueue(p['url'],p['id'],priority)
                    elif known[0]['last_seen'] is None:
                        self.db.execute('UPDATE jobs SET priority=max(priority,?) WHERE post_id=?',(priority,p['id']))
                self.db.event('discovery',channel+': '+str(len(found))+'개 발견')
            except Exception as e:
                self.db.event('discovery_error',channel+': '+str(e))
                log.warning('discovery: %s',e)

    def expand_comments(self, url):
        if not self.browser:
            from playwright.sync_api import sync_playwright
            self.pw = sync_playwright().start()
            self.browser = self.pw.chromium.launch(headless=True)
        page = self.browser.new_page()
        page.route('**/*',lambda route: route.abort() if route.request.resource_type in ['image','media','font'] else route.continue_())
        try:
            response = page.goto(url,wait_until='domcontentloaded',timeout=45000)
            if response and response.status in (403,429):
                self.pause_until = time.time()+3600
                raise RateLimited('브라우저 HTTP %s'%response.status)
            page.locator('.article-comments').wait_for(timeout=15000)
            deadline = time.monotonic()+self.config.get('comment_budget_seconds',90)
            clicks = 0
            # Bound both time and operations; retries on subsequent visits enrich the archive.
            while time.monotonic()<deadline and clicks<40:
                buttons = page.locator('.article-comments .btn-reply:visible')
                if not buttons.count():
                    break
                before = page.locator('.article-comments .wrap-comment[id]').count()
                buttons.last.click(timeout=5000)
                page.wait_for_timeout(2000)
                clicks += 1
                after = page.locator('.article-comments .wrap-comment[id]').count()
                if after<=before:
                    break
            return article(page.content(),url)
        finally:
            page.close()

    def collect(self, job):
        pid, url = job['post_id'],job['url']
        try:
            data = article(self.fetch(url),url)
            # Commit the body before doing any slower browser work.
            self.db.save(data)
            if not data['comments_complete'] and self.config.get('expand_comments',True):
                self.db.execute('INSERT OR IGNORE INTO comment_jobs(post_id,due) VALUES(?,?)',(pid,time.time()))
            age = time.time()-job['first_seen']
            interval = 600 if age<3600 else 1800 if age<86400 else 21600
            if age>self.config.get('revisit_days',7)*86400:
                self.db.execute('DELETE FROM jobs WHERE post_id=?',(pid,))
            else:
                self.db.execute('UPDATE jobs SET due=?,priority=0,attempts=0 WHERE post_id=?',(time.time()+interval,pid))
            self.match_notifications()
        except Exception as e:
            attempts = job['attempts']+1
            status = 'unavailable' if isinstance(e,requests.HTTPError) and e.response.status_code in (404,410) else 'error'
            self.db.execute('INSERT INTO observations(post_id,captured,status,detail) VALUES(?,?,?,?)',(pid,time.time(),status,str(e)[:500]))
            self.db.execute('UPDATE posts SET last_attempt=?,state=?,error=? WHERE id=?',(time.time(),status,str(e)[:500],pid))
            self.db.execute('UPDATE jobs SET due=?,attempts=?,priority=0 WHERE post_id=?',(time.time()+min(86400,300*2**min(attempts,8)),attempts,pid))
            self.db.event('collection_error',pid+': '+str(e))
            log.warning('collect %s: %s',pid,e)

    def match_notifications(self):
        self.db.match_notifications()

    def run_comments(self, stop):
        try:
            while not stop.is_set():
                jobs=self.db.rows('SELECT j.*,p.url FROM comment_jobs j JOIN posts p ON p.id=j.post_id WHERE j.due<=? ORDER BY j.due LIMIT 1',(time.time(),))
                if not jobs or time.time()<self.pause_until:
                    stop.wait(5);continue
                job=jobs[0]
                try:
                    self.db.save(self.expand_comments(job['url']))
                    self.browser_error=None
                except Exception as e:
                    self.browser_error=str(e)[:300]
                    self.db.event('comment_warning',job['post_id']+': '+str(e))
                    if self.browser:
                        self.browser.close();self.browser=None
                    if self.pw:
                        self.pw.stop();self.pw=None
                finally:
                    self.db.execute('DELETE FROM comment_jobs WHERE post_id=?',(job['post_id'],))
                stop.wait(5)
        finally:
            if self.browser:self.browser.close()
            if self.pw:self.pw.stop()

    def run(self, stop):
        next_discovery = 0
        try:
            while not stop.is_set():
                if time.time()<self.pause_until:
                    stop.wait(10); continue
                if time.time()>=next_discovery:
                    self.discover()
                    next_discovery=time.time()+self.config.get('poll_seconds',600)
                jobs = self.db.rows('SELECT j.*,p.url,p.first_seen FROM jobs j JOIN posts p ON p.id=j.post_id WHERE j.due<=? ORDER BY j.priority DESC,j.due LIMIT 1',(time.time(),))
                if jobs:
                    self.collect(jobs[0])
                else:
                    stop.wait(2)
        finally:
            if self.browser:
                self.browser.close()
            if self.pw:
                self.pw.stop()
