"""Shared helpers for the extractors: paths, vendor bootstraps, JSON I/O."""
import importlib
import json
import os
import subprocess
import sys
from types import SimpleNamespace

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VENDOR = os.path.join(REPO_ROOT, "vendor")
DATA_DIR = os.path.join(REPO_ROOT, "web", "src", "data")
ICONS_DIR = os.path.join(REPO_ROOT, "web", "public", "icons", "cargo")


def bootstrap_iron_horse(with_render_docs=False):
    """Import the Iron Horse python model without compiling the NewGRF.

    Iron Horse reads its command line at import time and resolves paths relative to
    the working directory, so the order below matters: chdir, then argv, then sys.path,
    only then the imports. Recipe: vendor/iron-horse/src/id_report.py.
    Returns a namespace: iron_horse, global_constants, DocHelper, polar_fox_constants,
    and render_docs when asked (it pulls in the graphics stack).
    """
    root = os.path.join(VENDOR, "iron-horse")
    os.chdir(root)
    sys.argv = ["export", "--grf-name=iron-horse"]
    sys.path.insert(0, os.path.join(root, "src"))
    ns = SimpleNamespace(
        root=root,
        iron_horse=importlib.import_module("iron_horse"),
        global_constants=importlib.import_module("global_constants"),
        DocHelper=importlib.import_module("doc_helper").DocHelper,
        polar_fox_constants=importlib.import_module("polar_fox.constants"),
    )
    if with_render_docs:
        ns.render_docs = importlib.import_module("render_docs")
    return ns


def bootstrap_firs():
    """Import the FIRS python model; same caveats as bootstrap_iron_horse()."""
    root = os.path.join(VENDOR, "firs")
    os.chdir(root)
    sys.path.insert(0, os.path.join(root, "src"))
    return SimpleNamespace(
        root=root,
        firs=importlib.import_module("firs"),
        utils=importlib.import_module("utils"),
        DocHelper=importlib.import_module("docs.doc_helper").DocHelper,
    )


def load_json(filename):
    """Read one of the generated web/src/data/*.json files."""
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)


def vendor_meta(repo_dir_name):
    """Source version: tag/commit of the vendor clone."""
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
