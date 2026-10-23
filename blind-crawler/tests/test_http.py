import json
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
import requests

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1]
        cls.base='http://127.0.0.1:'+str(cls.port)
        cls.proc=subprocess.Popen([sys.executable,'-m','blind_archive.server','--no-collector','--host','127.0.0.1','--port',str(cls.port),'--data',cls.temp.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                requests.get(cls.base+'/api/health',timeout=1).raise_for_status();break
            except requests.RequestException:time.sleep(.1)
        else:raise RuntimeError('Test server did not start')
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate();cls.proc.wait(timeout=10);cls.temp.cleanup()
    def test_only_local_origin_and_host(self):
        self.assertEqual(requests.get(self.base+'/api/health',headers={'Host':'evil.test'}).status_code,403)
        self.assertEqual(requests.post(self.base+'/api/collect',headers={'Origin':'https://evil.test'},json={'url':'x'}).status_code,403)
    def test_ingest_auth_and_idempotency(self):
        payload={'event_key':'test-unique','title':'test','body':'body'}
        self.assertEqual(requests.post(self.base+'/api/notifications',json=payload).status_code,401)
        token=requests.get(self.base+'/api/setup').json()['ingest_token']
        for _ in range(2):
            r=requests.post(self.base+'/api/notifications',json=payload,headers={'Authorization':'Bearer '+token})
            self.assertEqual(r.status_code,202)
        self.assertEqual(len(requests.get(self.base+'/api/notifications').json()),1)
    def test_collect_rejects_other_hosts(self):
        self.assertEqual(requests.post(self.base+'/api/collect',json={'url':'http://127.0.0.1/secret'}).status_code,400)
    def test_health_and_missing_article(self):
        self.assertFalse(requests.get(self.base+'/api/health').json()['collector_enabled'])
        self.assertEqual(requests.get(self.base+'/api/posts/unknown').status_code,404)
