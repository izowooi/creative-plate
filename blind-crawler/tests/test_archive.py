import tempfile
import unittest
from pathlib import Path
from blind_archive.db import DB
from scripts.backup import backup
from blind_archive.parser import article,canonical,listing

HTML='''<div class="contents"><a href="/kr/topics/블라블라">블라블라</a><h1>제목</h1><div class="article-view-contents"><div class="contents-txt">첫 원문<br>둘째 줄</div></div></div><div class="article-comments"><div class="comments_function"><h3>댓글 1</h3></div><div class="wrap-comment" id="1"><p class="name">작성자</p><p class="cmt-txt">댓글 원문</p></div></div>'''
URL='https://www.teamblind.com/kr/post/테스트-abc123'
class ArchiveTests(unittest.TestCase):
    def test_versions_survive_pung_and_duplicate(self):
        with tempfile.TemporaryDirectory() as d:
            db=DB(Path(d)/'archive.sqlite');p=article(HTML,URL)
            self.assertTrue(db.save(p));self.assertFalse(db.save(p))
            p['body']='-펑-';p['comments']=[];db.save(p)
            versions=db.detail('abc123')['snapshots']
            self.assertEqual(len(versions),2)
            self.assertIn('첫 원문',versions[1]['data']['body'])
            self.assertEqual(versions[1]['data']['comments'][0]['body'],'댓글 원문')
            self.assertEqual(len(db.find('첫 원문')),1)
            self.assertEqual(len(db.find('댓글 원문')),1)
    def test_consistent_backup_can_be_reopened(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as d:
            db=DB(Path(d)/'archive.sqlite');db.save(article(HTML,URL))
            path=backup(d)
            with sqlite3.connect(path) as c:
                self.assertEqual(c.execute('SELECT count(*) FROM snapshots').fetchone()[0],1)
                self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
    def test_notification_exact_title_links_without_url(self):
        with tempfile.TemporaryDirectory() as d:
            db=DB(Path(d)/'archive.sqlite');p=article(HTML,URL);p['title']='알림으로 찾을 제목';db.save(p)
            db.execute('INSERT INTO notifications(received,event_key,title,body) VALUES(0,?,?,?)',('key','지금 주목글','알림으로 찾을 제목'))
            db.match_notifications()
            self.assertEqual(db.rows('SELECT post_id FROM notifications')[0]['post_id'],'abc123')

    def test_missing_body_is_not_empty_snapshot(self):
        with self.assertRaises(ValueError):article('<h1>로그인</h1>',URL)
    def test_only_blind_posts(self):
        for url in ['https://evil.example/kr/post/hi-abc','https://www.teamblind.com/kr/post/a-abc/x','http://127.0.0.1/kr/post/a-abc']:
            with self.assertRaises(ValueError):canonical(url)
    def test_parse_lines_and_coverage(self):
        p=article(HTML,URL);self.assertEqual(p['body'],'첫 원문\n둘째 줄');self.assertTrue(p['comments_complete'])
        p=article(HTML.replace('댓글 1','댓글 2'),URL);self.assertFalse(p['comments_complete'])
    def test_discovery_dedupe(self):
        self.assertEqual(len(listing(f'<a href="{URL}">a</a><a href="{URL}">b</a>')),1)
    def test_queue_priority(self):
        with tempfile.TemporaryDirectory() as d:
            db=DB(Path(d)/'archive.sqlite');db.enqueue(URL,'abc123');db.enqueue(URL,'abc123',30)
            self.assertEqual(db.rows('SELECT * FROM jobs')[0]['priority'],30)
if __name__=='__main__':unittest.main()
