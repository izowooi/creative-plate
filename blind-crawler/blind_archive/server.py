import argparse
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from .db import DB
from .parser import canonical,CHANNELS
from .collector import Collector

ROOT=Path(__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--host',default='0.0.0.0')
    parser.add_argument('--port',type=int,default=5067)
    parser.add_argument('--data',default=os.environ.get('BLIND_DATA_DIR',str(ROOT/'data')))
    parser.add_argument('--no-collector',action='store_true')
    args=parser.parse_args()
    data=Path(args.data);data.mkdir(parents=True,exist_ok=True)
    os.chmod(data,0o700)
    config_path=data/'config.json'
    config=json.loads(config_path.read_text()) if config_path.exists() else {'channels':CHANNELS,'poll_seconds':600,'request_delay_seconds':5,'expand_comments':True,'comment_budget_seconds':60,'revisit_days':7}
    if not config_path.exists():
        config_path.write_text(json.dumps(config,ensure_ascii=False,indent=2))
    token_path=data/'ingest-token'
    if not token_path.exists():
        token_path.write_text(secrets.token_urlsafe(32));os.chmod(token_path,0o600)
    token=token_path.read_text().strip()
    db=DB(data/'archive.sqlite')
    stop=threading.Event()
    gate={'pause_until':0}
    collector=Collector(db,config,gate)
    comment_collector=Collector(db,config)
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self,fmt,*values):
            logging.info('%s %s',self.client_address[0],fmt%values)

        def send_json(self,obj,status=200):
            raw=json.dumps(obj,ensure_ascii=False).encode()
            self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(raw)

        def allowed(self):
            ip=ipaddress.ip_address(self.client_address[0])
            if not (ip.is_private or ip.is_loopback):
                self.send_json({'error':'LAN only'},403);return False
            host=self.headers.get('Host','').split(':')[0]
            # Mitigate DNS rebinding; this server is only for numeric LAN addresses.
            try:
                addr=ipaddress.ip_address(host)
                good=addr.is_private or addr.is_loopback
            except ValueError:
                good=host=='localhost'
            if not good:
                self.send_json({'error':'Use a local IP address'},403);return False
            origin=self.headers.get('Origin')
            if origin and urlsplit(origin).netloc != self.headers.get('Host'):
                self.send_json({'error':'Cross-origin requests disabled'},403);return False
            if self.headers.get('Sec-Fetch-Site')=='cross-site':
                self.send_json({'error':'Cross-site requests disabled'},403);return False
            return True

        def do_GET(self):
            if not self.allowed():return
            p=urlsplit(self.path);q=parse_qs(p.query)
            if p.path=='/api/health':
                return self.send_json({'ok':True,'collector_enabled':not args.no_collector,'worker_alive':worker.is_alive() if worker else False,'comment_worker_alive':comment_worker.is_alive() if comment_worker else False,'paused_until':collector.pause_until,'comments_paused_until':comment_collector.pause_until,'browser_error':comment_collector.browser_error,**db.overview()})
            if p.path=='/api/posts':
                try:offset=max(0,int(q.get('offset',['0'])[0]))
                except ValueError:return self.send_json({'error':'Invalid offset'},400)
                return self.send_json(db.find(q.get('q',[''])[0][:200],q.get('channel',[''])[0],offset))
            if p.path.startswith('/api/posts/'):
                result=db.detail(p.path.rsplit('/',1)[1])
                return self.send_json(result or {'error':'Not found'},200 if result else 404)
            if p.path=='/api/notifications':
                return self.send_json(db.rows('SELECT * FROM notifications ORDER BY id DESC LIMIT 100'))
            if p.path=='/api/setup':
                return self.send_json({'channels':config['channels'],'poll_seconds':config['poll_seconds'],'ingest_token':token,'endpoint':'/api/notifications'})
            files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
            if p.path=='/downloads/blind-notifier.apk':
                path=ROOT/'artifacts'/'blind-notifier.apk';mime='application/vnd.android.package-archive'
            elif p.path in files:
                path=ROOT/'static'/files[p.path];mime={'html':'text/html','js':'text/javascript','css':'text/css'}[path.suffix[1:]]+'; charset=utf-8'
            else:return self.send_json({'error':'Not found'},404)
            if not path.exists():return self.send_json({'error':'아직 빌드되지 않았습니다.'},404)
            raw=path.read_bytes();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'");self.end_headers();self.wfile.write(raw)

        def do_POST(self):
            if not self.allowed():return
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=131072:return self.send_json({'error':'Invalid payload size'},413)
                obj=json.loads(self.rfile.read(size))
                if not isinstance(obj,dict):raise ValueError('JSON object required')
                if self.path=='/api/notifications':
                    if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):
                        return self.send_json({'error':'Invalid device token'},401)
                    title=str(obj.get('title',''))[:1000];body=str(obj.get('body',''))[:12000]
                    key=str(obj.get('event_key') or hashlib.sha256((title+body+str(obj.get('posted_at',''))).encode()).hexdigest())[:256]
                    url=str(obj.get('url',''))[:3000];pid=None
                    if url:
                        try:url,pid=canonical(url)
                        except ValueError:url=''
                    if pid:db.enqueue(url,pid,20)
                    db.execute('INSERT OR IGNORE INTO notifications(received,event_key,title,body,url,status,post_id) VALUES(?,?,?,?,?,?,?)',(time.time(),key,title,body,url,'matched' if pid else 'unmatched',pid))
                    db.match_notifications()
                    return self.send_json({'ok':True,'matched':bool(pid)},202)
                if self.path=='/api/collect':
                    url,pid=canonical(str(obj.get('url','')))
                    db.enqueue(url,pid,30)
                    return self.send_json({'ok':True,'id':pid},202)
                return self.send_json({'error':'Not found'},404)
            except (ValueError,TypeError) as e:return self.send_json({'error':str(e)},400)
            except Exception:
                logging.exception('request failure');return self.send_json({'error':'Internal error'},500)

    def guarded(target):
        while not stop.is_set():
            try:target(stop)
            except Exception:
                logging.exception('Worker failed; retrying in 30 seconds')
                db.event('worker_restart','작업자 예외로 30초 후 재시작')
                stop.wait(30)

    def maintain():
        import shutil
        from scripts.backup import backup
        last_day=None
        while not stop.is_set():
            day=time.strftime('%Y-%m-%d')
            if day!=last_day:
                try:
                    backup(data);db.event('backup','일관된 SQLite 백업 및 무결성 검사 완료');last_day=day
                except Exception as e:db.event('backup_error',str(e))
            if shutil.disk_usage(data).free<5*1024**3:
                gate['pause_until']=time.time()+600
                db.event('disk_low','남은 공간 5GiB 미만으로 수집 일시 중단')
            stop.wait(60)

    worker=None
    comment_worker=None
    if not args.no_collector:
        worker=threading.Thread(target=guarded,args=(collector.run,),daemon=True,name='collector');worker.start()
        comment_worker=threading.Thread(target=guarded,args=(comment_collector.run_comments,),daemon=True,name='comments');comment_worker.start()
    maintenance=threading.Thread(target=maintain,daemon=True,name='maintenance');maintenance.start()
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    def shutdown(signum,frame):
        stop.set();threading.Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,shutdown);signal.signal(signal.SIGINT,shutdown)
    db.event('startup','서비스 시작: port '+str(args.port))
    try:server.serve_forever()
    finally:
        stop.set();server.server_close()
        if worker:worker.join(timeout=15)
        if comment_worker:comment_worker.join(timeout=5)

if __name__=='__main__':main()
