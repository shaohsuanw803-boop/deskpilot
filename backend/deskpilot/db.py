"""Single-process SQLite object store with atomic application transactions."""
import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .policy import redact


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f'{prefix}_{uuid.uuid4().hex[:16]}'


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None, timeout=30)
        self.conn.execute('PRAGMA journal_mode=WAL')
        self.conn.execute('PRAGMA busy_timeout=30000')
        self.conn.execute('CREATE TABLE IF NOT EXISTS objects '
                          '(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL, '
                          'PRIMARY KEY(kind,id))')
        self._depth = 0

    @contextmanager
    def transaction(self):
        with self.lock:
            depth = self._depth
            self.conn.execute('BEGIN IMMEDIATE' if depth == 0 else f'SAVEPOINT nested_{depth}')
            self._depth += 1
            try:
                yield self
            except BaseException:
                self.conn.execute('ROLLBACK' if depth == 0 else f'ROLLBACK TO nested_{depth}')
                if depth:
                    self.conn.execute(f'RELEASE nested_{depth}')
                raise
            else:
                self.conn.execute('COMMIT' if depth == 0 else f'RELEASE nested_{depth}')
            finally:
                self._depth -= 1

    def get(self, kind: str, object_id: str):
        with self.lock:
            row = self.conn.execute('SELECT data FROM objects WHERE kind=? AND id=?',
                                    (kind, object_id)).fetchone()
        return json.loads(row[0]) if row else None

    def list(self, kind: str) -> list[dict]:
        with self.lock:
            rows = self.conn.execute('SELECT data FROM objects WHERE kind=? ORDER BY rowid', (kind,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def put(self, kind: str, item: dict) -> dict:
        with self.lock:
            value = dict(item)
            value['id'] = str(value['id'])
            value['updated_at'] = now()
            value.setdefault('created_at', value['updated_at'])
            self.conn.execute('INSERT INTO objects(kind,id,data) VALUES(?,?,?) '
                              'ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data',
                              (kind, value['id'], json.dumps(value, ensure_ascii=False)))
        return value

    def delete(self, kind: str, object_id: str):
        with self.lock:
            self.conn.execute('DELETE FROM objects WHERE kind=? AND id=?', (kind, object_id))

    def audit(self, actor, action, target, details=None):
        return self.put('audit', {'id': new_id('evt'), 'actor': actor, 'action': action,
                                 'target': target, 'details': redact(details or {}), 'at': now()})

    def close(self):
        with self.lock:
            self.conn.close()
