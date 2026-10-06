import importlib.util
import string
from pathlib import Path

spec = importlib.util.spec_from_file_location('check_secrets', Path(__file__).parents[1] / 'scripts/check_secrets.py')
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


def test_only_exact_known_synthetic_fixture_is_exempt():
    fixture = 'sk-' + string.ascii_lowercase + '123456'
    assert scanner.findings('tests/test_providers.py', fixture) == []
    assert scanner.findings('backend/live.py', fixture) == [1]
    assert scanner.findings('tests/test_providers.py', 'sk-' + 'q' * 32) == [1]


def test_dotenv_is_blocked_even_without_known_secret_pattern():
    assert scanner.findings('.env', 'APP_MODE=demo') == [0]
    assert scanner.findings('.env.example', 'LLM_API_KEY=') == []
