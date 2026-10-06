"""Scan tracked/index/history content without printing matched secrets. No network."""
import argparse
import hashlib
import re
import subprocess
from pathlib import Path

PATTERNS = [re.compile(r'\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
            re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]

# Audited synthetic fixture: prefix + ordered lowercase alphabet + six digits.
# Match only this exact value in these exact tests, including the original commit.
FIXTURE_DIGEST = '82be8a4d9cdebab78235e6d0618fdea34065fcb6f498073283ff4ec7376e551a'
FIXTURE_PATHS = {'tests/test_providers.py', 'tests/test_rag.py', 'tests/test_store_policy.py'}


def findings(path, text):
    if Path(path).name.startswith('.env') and Path(path).name != '.env.example':
        return [0]
    result = []
    for number, line in enumerate(text.splitlines(), 1):
        for pattern in PATTERNS:
            for match in pattern.finditer(line):
                if path.replace('\\', '/') in FIXTURE_PATHS and hashlib.sha256(match.group().encode()).hexdigest() == FIXTURE_DIGEST:
                    continue
                result.append(number)
    return sorted(set(result))


def git(*args):
    return subprocess.check_output(['git', *args])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--history', action='store_true')
    args = parser.parse_args()
    refs = git('rev-list', '--all').decode().splitlines() if args.history else [None]
    failed, count, seen = [], 0, set()
    for ref in refs:
        paths = (git('ls-tree', '-r', '--name-only', '-z', ref) if ref else git('ls-files', '-z')).decode().split('\0')
        for path in filter(None, paths):
            object_name = f'{ref}:{path}' if ref else f':{path}'
            blob = git('rev-parse', object_name).strip()
            if (path, blob) in seen:
                continue
            seen.add((path, blob))
            content = git('show', object_name)
            try:
                text = content.decode('utf-8')
            except UnicodeDecodeError:
                continue
            count += 1
            for line in findings(path, text):
                failed.append(f'{path}:{line} ({ref[:8] if ref else "index"})')
    for item in failed:
        print('Potential secret: ' + item)  # Never display matched text.
    print(f'Scanned {count} unique tracked text versions; findings={len(failed)}. Heuristic check, not a DLP guarantee.')
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
