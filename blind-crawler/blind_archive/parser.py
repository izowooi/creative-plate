"""Parse only visible Blind web content. Never treat list previews as full bodies."""
import re
from urllib.parse import urlsplit, unquote, quote
from bs4 import BeautifulSoup

BASE = 'https://www.teamblind.com'
CHANNELS = ['블라블라', '썸·연애', '결혼생활', '토픽 베스트']

def canonical(url):
    p = urlsplit(url if '://' in url else BASE + url)
    path = unquote(p.path).rstrip('/')
    if p.hostname != 'www.teamblind.com' or not re.fullmatch(r'/kr/post/[^/]+-[A-Za-z0-9]+', path):
        raise ValueError('블라인드 공개 게시글 URL만 등록할 수 있습니다.')
    return BASE + quote(path, safe='/-'), path.rsplit('-', 1)[1]

def text(el):
    return el.get_text('\n', strip=True) if el else ''

def listing(html):
    soup = BeautifulSoup(html, 'html.parser')
    posts = {}
    for a in soup.select('a[href*="/kr/post/"]'):
        try:
            url, pid = canonical(a['href'])
        except ValueError:
            continue
        if pid not in posts:
            posts[pid] = {'id': pid, 'url': url}
    return list(posts.values())

def article(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.select_one('.article-view-contents .contents-txt')
    root = soup.select_one('.contents')
    title = root.select_one('h1') if root else None
    if body is None or title is None:
        raise ValueError('본문을 확인하지 못했습니다. 삭제·로그인·차단 여부를 확인하세요.')
    url, pid = canonical(url)
    comments = []
    for c in soup.select('.article-comments .wrap-comment[id]'):
        ct = c.select_one('.cmt-txt')
        if ct is None:
            continue
        reply = c.find_parent(class_='wrap-reply')
        parent = None
        if reply:
            previous = reply.find_previous_sibling(class_='wrap-comment')
            parent = previous.get('id') if previous else None
        comments.append({'id': c['id'], 'parent_id': parent,
                         'author': text(c.select_one('.name')), 'body': text(ct)})
    heading = soup.select_one('.comments_function h2, .comments_function h3')
    match = re.search(r'댓글\s*([\d,]+)', text(heading))
    expected = int(match[1].replace(',', '')) if match else None
    channels = root.select('.article-view-head h2 a[href*="/kr/topics/"]') or root.select('a[href*="/kr/topics/"]')
    channel = channels[-1] if channels else None
    more = soup.select('.article-comments .btn-reply')
    return {'id': pid, 'url': url, 'title': text(title), 'body': text(body),
            'channel': text(channel), 'comments': comments, 'expected_comments': expected,
            'comments_complete': expected is not None and len(comments) >= expected and not more}
