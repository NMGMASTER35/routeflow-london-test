"""CI helper utilities for verifying Neon preview branches.

This module performs a minimal smoke test against the Postgres database
provisioned for pull requests via the Neon GitHub Actions workflow. It ensures
that core tables are created and writable so that preview environments can rely
on the branch before deploying a backend instance.
"""

from __future__ import annotations

import sys
import uuid

from . import api


def _insert_sample_note(cursor, uid: str, note_id: str, title: str, content: str) -> None:
    """Insert or update a single profile note and verify the stored payload."""
    cursor.execute(
        """
        INSERT INTO profile_notes (uid, note_id, title, content)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (uid, note_id)
        DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            updated_at = NOW()
        RETURNING title, content;
        """,
        (uid, note_id, title, content),
    )
    persisted_title, persisted_content = cursor.fetchone()
    if persisted_title != title or persisted_content != content:
        raise RuntimeError(
            "Inserted note payload does not match returned row from Neon preview branch."
        )


def _assert_note_round_trip(cursor, uid: str, note_id: str, title: str, content: str) -> None:
    """Fetch the note to confirm read-after-write behaviour."""
    cursor.execute(
        "SELECT title, content FROM profile_notes WHERE uid = %s AND note_id = %s",
        (uid, note_id),
    )
    row = cursor.fetchone()
    if row != (title, content):
        raise RuntimeError(
            f"Preview branch returned an unexpected note payload: {row!r}"
        )


def _cleanup_sample_note(cursor, uid: str, note_id: str) -> None:
    """Remove the CI note to keep preview branches tidy."""
    cursor.execute(
        "DELETE FROM profile_notes WHERE uid = %s AND note_id = %s",
        (uid, note_id),
    )


def run_smoke_test() -> str:
    """Execute the Neon preview branch smoke test.

    Returns the identifier of the inserted note so callers can include it in log
    output if required.
    """

    api.init_database()

    uid = "ci-preview-user"
    note_id = f"ci-note-{uuid.uuid4().hex}"
    title = "Neon Workflow Smoke Test"
    content = "Ensuring preview database tables are ready."

    with api.get_connection() as connection:
        with connection.cursor() as cursor:
            _insert_sample_note(cursor, uid, note_id, title, content)
        connection.commit()

        with connection.cursor() as cursor:
            _assert_note_round_trip(cursor, uid, note_id, title, content)
            _cleanup_sample_note(cursor, uid, note_id)
        connection.commit()

    return note_id


def main() -> None:
    try:
        note_id = run_smoke_test()
    except Exception as exc:  # pragma: no cover - defensive logging for CI
        print("Neon preview smoke test failed:", exc, file=sys.stderr)
        raise
    else:
        print(
            "Neon preview smoke test completed successfully.",
            f"Inserted note id: {note_id}",
        )
    finally:
        try:
            api.connection_pool.closeall()
        except Exception:  # pragma: no cover - ensure CI never hides the root error
            pass


if __name__ == "__main__":
    main()
