from database.db_connection import get_connection

def get_all_books():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Fetch all books with their copies
    cursor.execute("SELECT * FROM Books")
    books = cursor.fetchall()

    all_books = []
    for b in books:
        book_id = b["book_id"]
        
        # Get copies for this book
        cursor.execute(
            "SELECT copy_id, status, location FROM BookCopies WHERE book_id=?",
            (book_id,)
        )
        copies = cursor.fetchall()
        copies_list = [dict(c) for c in copies] if copies else []

        book_dict = dict(b)
        book_dict["copies"] = copies_list
        all_books.append(book_dict)

    conn.close()
    return all_books

def get_book_by_id(book_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM Books WHERE book_id=?", (book_id,))
    book = cursor.fetchone()
    if not book:
        conn.close()
        return None

    # Get copies for this book
    cursor.execute(
        "SELECT copy_id, status, location FROM BookCopies WHERE book_id=?",
        (book_id,)
    )
    copies = cursor.fetchall()
    book_dict = dict(book)
    book_dict["copies"] = [dict(c) for c in copies] if copies else []

    conn.close()
    return book_dict

def search_books(query):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM Books WHERE title LIKE ?", (f"%{query}%",))
    books = cursor.fetchall()

    all_books = []
    for b in books:
        book_id = b["book_id"]
        cursor.execute(
            "SELECT copy_id, status, location FROM BookCopies WHERE book_id=?",
            (book_id,)
        )
        copies = cursor.fetchall()
        book_dict = dict(b)
        book_dict["copies"] = [dict(c) for c in copies] if copies else []
        all_books.append(book_dict)

    conn.close()
    return all_books

def add_book(data):
    conn = get_connection()
    cursor = conn.cursor()

    title = str(data.get("title") or "").strip()
    author = str(data.get("author") or "").strip()
    collection_name = str(data.get("collection_name") or "").strip()
    category = str(data.get("category") or "").strip()
    book_format = str(data.get("book_format") or "").strip()
    publication_year = data.get("publication_year")
    pages = data.get("pages")
    cover_url = str(data.get("cover_url") or "").strip()
    blurb = str(data.get("blurb") or "").strip()
    description = str(data.get("description") or "").strip()
    accent = str(data.get("accent") or "gold").strip()

    if not title or not author:
        conn.close()
        return {"error": "title and author are required"}

    cursor.execute(
        """
        INSERT INTO Books (
            title,
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
            accent
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            author,
            category or None,
            collection_name or None,
            book_format or None,
            int(publication_year) if publication_year not in (None, "",) else None,
            int(pages) if pages not in (None, "",) else None,
            4.5,
            cover_url or None,
            blurb or None,
            description or None,
            accent or "gold",
        )
    )

    book_id = cursor.lastrowid

    cursor.execute(
        """
        INSERT INTO BookCopies (book_id, status, location)
        VALUES (?, 'available', 'Main Shelf')
        """,
        (book_id,)
    )

    conn.commit()
    conn.close()

    return {
        "message": "Book added successfully",
        "book_id": book_id
    }