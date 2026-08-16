"""Общие помощники пайплайна."""
import json
import os
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VENDOR = os.path.join(REPO_ROOT, "vendor")
DATA_DIR = os.path.join(REPO_ROOT, "web", "src", "data")
ICONS_DIR = os.path.join(REPO_ROOT, "web", "public", "icons", "cargo")


def vendor_meta(repo_dir_name):
    """Версия источника: тег/коммит vendor-клона."""
    repo = os.path.join(VENDOR, repo_dir_name)
    def git(*args):
        return subprocess.run(
            ["git", "-C", repo, *args], capture_output=True, text=True
        ).stdout.strip()
    return {
        "source": repo_dir_name,
        "commit": git("rev-parse", "--short", "HEAD"),
        "describe": git("describe", "--tags", "--always"),
    }


def write_json(filename, payload):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{filename}: {os.path.getsize(path) // 1024} KiB")
    return path
