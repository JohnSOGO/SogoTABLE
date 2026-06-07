from pathlib import Path

from src.sogotable.revision import APP_VERSION, get_revision_summary


def test_revision_summary_uses_git_identity():
    summary = get_revision_summary(Path(__file__).resolve().parents[1])

    assert summary.version == APP_VERSION
    assert summary.revision
    assert summary.branch
    assert summary.format().startswith("SogoTable ")
