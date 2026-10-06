import argparse
import base64
from copy import deepcopy
import json

from .config import Settings
from .db import Store
from .policy import USERS


def main():
    parser = argparse.ArgumentParser(prog='deskpilot')
    parser.add_argument('command', choices=['init', 'serve', 'check', 'index-cloud', 'export-audit'])
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    settings = Settings()
    if args.command == 'serve':
        import uvicorn
        from uvicorn.config import LOGGING_CONFIG
        log_config = deepcopy(LOGGING_CONFIG)
        log_config['loggers']['deskpilot.http'] = {
            'handlers': ['default'], 'level': 'INFO', 'propagate': False}
        uvicorn.run('deskpilot.api:app', host='127.0.0.1', port=args.port, workers=1,
                    log_config=log_config)
        return
    from .api import seed_knowledge
    from .knowledge import KnowledgeService
    store = Store(settings.data_dir / 'deskpilot.sqlite')
    service = None
    try:
        if args.command == 'init':
            seed_knowledge(store, settings)
            print(f"Initialized {len(store.list('document'))} fictional documents. No cloud calls were made.")
        elif args.command == 'export-audit':
            print(json.dumps(store.list('audit'), ensure_ascii=False, indent=2))
        else:
            if settings.app_mode != 'cloud' or settings.cloud_missing():
                print(json.dumps({'ok': False, 'mode': settings.app_mode, 'missing': settings.cloud_missing(),
                                  'message': 'No API request sent. Configure .env and APP_MODE=cloud first.'}, indent=2))
                raise SystemExit(1)
            service = KnowledgeService(store, settings)
            if args.command == 'check':
                result = service.providers.connectivity_check()
                print(json.dumps(result, ensure_ascii=False, indent=2))
                if result.get('ok') is False:
                    raise SystemExit(1)
            else:
                failures = []
                for document in store.list('document'):
                    if document['status'] != 'published' or not document.get('cloud_allowed'):
                        continue
                    job = store.get('ingestion_job', document['job_id'])
                    result = service.ingest(job['filename'], base64.b64decode(job['content_b64']),
                                             document, USERS['admin'], document_id=document['id'])
                    if result.get('pending_state') == 'prepared':
                        service.publish(document['id'], USERS['admin'])
                        print(f"Indexed {document['id']}")
                    else:
                        failures.append(document['id'])
                        print(f"Failed {document['id']}: {result.get('error')}")
                if failures:
                    raise SystemExit(1)
    finally:
        if service:
            service.close()
        store.close()


if __name__ == '__main__':
    main()
