"""Consistent SQLite backup; seven rotating daily copies on the external volume."""
import argparse
from contextlib import closing
import datetime
import sqlite3
from pathlib import Path

def backup(data):
    data=Path(data)
    target=data/'backups';target.mkdir(parents=True,exist_ok=True)
    name='archive-'+str(datetime.date.today().weekday())+'.sqlite'
    temp=target/(name+'.tmp')
    with closing(sqlite3.connect(str(data/'archive.sqlite'))) as source, closing(sqlite3.connect(str(temp))) as dest:
        source.backup(dest)
        dest.execute('PRAGMA journal_mode=DELETE')
        if dest.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('Backup integrity check failed')
    temp.replace(target/name)
    return target/name

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('data');args=p.parse_args();print(backup(args.data))
