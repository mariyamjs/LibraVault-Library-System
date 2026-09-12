import json
import os
import re
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "library.db"
DATA_JS_PATH = BASE_DIR / "frontend" / "js" / "data.js"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def extract_books_from_data_js(data_js_path: Path):
    """
    Reads frontend/js/data.js and extracts the books array from:
    window.LibraryData = { books: [ ... ], recommendationPools: ... }
    """
    raw = data_js_path.read_text(encoding="utf-8")

    match = re.search(r"books\s*:\s*\[(.*?)\]\s*,\s*recommendationPools\s*:", raw, re.DOTALL)
    if not match:
        raise ValueError("Could not find books array inside frontend/js/data.js")

    books_block = match.group(1)

    # Convert JS object keys to JSON keys:
    # { id: "x", title: "y" } -> { "id": "x", "title": "y" }
    books_json_like = "[" + books_block + "]"
    books_json_like = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', books_json_like)

    try:
        books = json.loads(books_json_like)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse books from data.js: {e}")

    if not isinstance(books, list):
        raise ValueError("Parsed books data is not a list.")

    return books


def insert_book(conn, book):
    """
    Insert one book if its slug does not already exist.
    Returns the book_id of the existing/new row.
    """
    slug = book.get("id")
    title = book.get("title")
    author = book.get("author")
    category = book.get("genre")
    collection_name = book.get("collection")
    book_format = book.get("format")
    publication_year = book.get("year")
    pages = book.get("pages")
    rating = book.get("rating")
    cover_url = book.get("cover")
    blurb = book.get("blurb")
    description = book.get("description")
    accent = book.get("accent")

    if not slug or not title:
        raise ValueError(f"Book is missing required fields: slug={slug!r}, title={title!r}")

    existing = conn.execute(
        "SELECT book_id FROM Books WHERE slug = ?",
        (slug,)
    ).fetchone()

    if existing:
        return existing["book_id"], False

    cursor = conn.execute(
        """
        INSERT INTO Books (
            slug,
            title,
            isbn,
            author,
            category,
            collection_name,
            book_format,
            publication_year,
            pages,
            rating,
            cover_url,
            blurb,
            description,
            accent,
            publisher
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            slug,
            title,
            None,  # isbn
            author,
            category,
            collection_name,
            book_format,
            publication_year,
            pages,
            rating,
            cover_url,
            blurb,
            description,
            accent,
            None,  # publisher
        )
    )

    return cursor.lastrowid, True


def ensure_at_least_one_copy(conn, book_id, available=True):
    """
    Create one copy only if the book has no copies yet.
    """
    existing_copy = conn.execute(
        "SELECT copy_id FROM BookCopies WHERE book_id = ? LIMIT 1",
        (book_id,)
    ).fetchone()

    if existing_copy:
        return False

    status = "available" if available else "borrowed"
    location = "Main Shelf"

    conn.execute(
        """
        INSERT INTO BookCopies (book_id, status, location)
        VALUES (?, ?, ?)
        """,
        (book_id, status, location)
    )
    return True


def main():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    if not DATA_JS_PATH.exists():
        raise FileNotFoundError(f"Frontend data file not found: {DATA_JS_PATH}")

    books = extract_books_from_data_js(DATA_JS_PATH)

    inserted_books = 0
    skipped_books = 0
    inserted_copies = 0
    skipped_copies = 0

    conn = get_connection()
    try:
        for book in books:
            book_id, inserted = insert_book(conn, book)
            if inserted:
                inserted_books += 1
            else:
                skipped_books += 1

            copy_inserted = ensure_at_least_one_copy(
                conn,
                book_id,
                available=bool(book.get("available", True))
            )
            if copy_inserted:
                inserted_copies += 1
            else:
                skipped_copies += 1

        conn.commit()

    finally:
        conn.close()

    print("Seeding complete.")
    print(f"Books inserted: {inserted_books}")
    print(f"Books skipped (already existed): {skipped_books}")
    print(f"Copies inserted: {inserted_copies}")
    print(f"Copies skipped (already existed): {skipped_copies}")


if __name__ == "__main__":
    main()