from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess


APP_VERSION = "0.1.0"


@dataclass(frozen=True)
class RevisionSummary:
    version: str
    revision: str
    branch: str
    dirty: bool

    def format(self) -> str:
        status = "dirty" if self.dirty else "clean"
        return f"SogoTABLE {self.version} rev {self.revision} branch {self.branch} {status}"


def get_revision_summary(repo_root: Path) -> RevisionSummary:
    revision = _git_short_hash(repo_root)
    branch = _git_branch(repo_root)
    dirty = _git_dirty(repo_root)
    return RevisionSummary(
        version=APP_VERSION,
        revision=revision,
        branch=branch,
        dirty=dirty,
    )


def _git_short_hash(repo_root: Path) -> str:
    result = _run_git(repo_root, "rev-parse", "--short", "HEAD")
    return result or "revision unavailable"


def _git_branch(repo_root: Path) -> str:
    result = _run_git(repo_root, "branch", "--show-current")
    return result or "unknown"


def _git_dirty(repo_root: Path) -> bool:
    result = _run_git(repo_root, "status", "--porcelain")
    return bool(result)


def _run_git(repo_root: Path, *args: str) -> str:
    try:
        completed = subprocess.run(
            ("git", *args),
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=False,
        )
    except (OSError, ValueError):
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()
