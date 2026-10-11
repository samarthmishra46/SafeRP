import ast
from pathlib import Path

DOMAIN = Path(__file__).resolve().parent.parent / "core" / "domain"
FORBIDDEN = {"django", "rest_framework", "requests", "redis", "urllib", "http", "socket"}


def test_domain_layer_has_no_io_or_django_imports():
    for path in DOMAIN.glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                names = [node.module or ""]
            else:
                continue
            for name in names:
                assert name.split(".")[0] not in FORBIDDEN, f"{path.name} imports {name}"
