from datetime import date, timedelta
from database.db_connection import get_connection


def _member_id_for_user(user_id):
    return f"NL-{100000 + int(user_id)}"


def get_user_loans(user_id):
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT
            l.loan_id,
            l.user_id,
            bc.book_id,
            l.copy_id,
            l.borrow_date,
            l.due_date,
            l.return_date,
            l.renewal_count
        FROM Loans l
        JOIN BookCopies bc ON l.copy_id = bc.copy_id
        WHERE l.user_id = ? AND l.return_date IS NULL
        ORDER BY l.due_date ASC, l.loan_id DESC
        """,
        (user_id,)
    ).fetchall()

    conn.close()
    return [dict(row) for row in rows]


def get_open_loans():
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT
            l.loan_id,
            l.user_id,
            u.full_name,
            u.email,
            bc.book_id,
            l.copy_id,
            l.borrow_date,
            l.due_date,
            l.return_date,
            l.renewal_count
        FROM Loans l
        JOIN Users u ON l.user_id = u.user_id
        JOIN BookCopies bc ON l.copy_id = bc.copy_id
        WHERE l.return_date IS NULL
        ORDER BY l.due_date ASC, l.loan_id DESC
        """
    ).fetchall()

    result = []
    for row in rows:
        item = dict(row)
        item["member_id"] = _member_id_for_user(item["user_id"])
        result.append(item)

    conn.close()
    return result


def borrow_book(user_id, book_id, due_days=14):
    conn = get_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        "SELECT user_id FROM Users WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    if not user:
        conn.close()
        return {"error": "User not found"}

    active_reservation = cursor.execute(
        """
        SELECT reservation_id, user_id
        FROM Reservations
        WHERE book_id = ? AND status = 'active'
        ORDER BY reservation_date ASC, reservation_id ASC
        LIMIT 1
        """,
        (book_id,)
    ).fetchone()

    if active_reservation and int(active_reservation["user_id"]) != int(user_id):
        conn.close()
        return {"error": "This title is reserved for another reader"}

    copy = cursor.execute(
        """
        SELECT copy_id
        FROM BookCopies
        WHERE book_id = ? AND status = 'available'
        LIMIT 1
        """,
        (book_id,)
    ).fetchone()

    if not copy:
        conn.close()
        return {"error": "No available copies"}

    today = date.today()
    due_date = today + timedelta(days=max(int(due_days or 14), 1))

    cursor.execute(
        """
        INSERT INTO Loans (user_id, copy_id, borrow_date, due_date, renewal_count)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, copy["copy_id"], today.isoformat(), due_date.isoformat(), 0)
    )

    loan_id = cursor.lastrowid

    cursor.execute(
        "UPDATE BookCopies SET status = 'borrowed' WHERE copy_id = ?",
        (copy["copy_id"],)
    )

    cursor.execute(
        "UPDATE Reservations SET status = 'fulfilled' WHERE book_id = ? AND status = 'active'",
        (book_id,)
    )

    conn.commit()
    conn.close()

    return {
        "message": "Book checked out successfully",
        "loan_id": loan_id,
        "book_id": book_id,
        "due_date": due_date.isoformat()
    }


def return_loan(loan_id):
    conn = get_connection()
    cursor = conn.cursor()

    loan = cursor.execute(
        """
        SELECT loan_id, copy_id
        FROM Loans
        WHERE loan_id = ? AND return_date IS NULL
        """,
        (loan_id,)
    ).fetchone()

    if not loan:
        conn.close()
        return {"error": "No active loan found"}

    today = date.today().isoformat()

    cursor.execute(
        "UPDATE Loans SET return_date = ? WHERE loan_id = ?",
        (today, loan_id)
    )

    cursor.execute(
        "UPDATE BookCopies SET status = 'available' WHERE copy_id = ?",
        (loan["copy_id"],)
    )

    conn.commit()
    conn.close()

    return {"message": "Book marked as returned", "loan_id": loan_id}


def renew_loan(loan_id, user_id):
    conn = get_connection()
    cursor = conn.cursor()

    loan = cursor.execute(
        """
        SELECT loan_id, user_id, due_date, renewal_count
        FROM Loans
        WHERE loan_id = ? AND user_id = ? AND return_date IS NULL
        """,
        (loan_id, user_id)
    ).fetchone()

    if not loan:
        conn.close()
        return {"error": "No active loan found"}

    current_renewals = int(loan["renewal_count"] or 0)
    if current_renewals >= 2:
        conn.close()
        return {"error": "Renewal limit reached"}

    current_due = date.fromisoformat(loan["due_date"])
    new_due = current_due + timedelta(days=14)

    cursor.execute(
        """
        UPDATE Loans
        SET due_date = ?, renewal_count = ?
        WHERE loan_id = ?
        """,
        (new_due.isoformat(), current_renewals + 1, loan_id)
    )

    conn.commit()
    conn.close()

    return {
        "message": "Loan renewed for two more weeks",
        "loan_id": loan_id,
        "due_date": new_due.isoformat(),
        "renewal_count": current_renewals + 1
    }


def reserve_book(user_id, book_id):
    conn = get_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        "SELECT user_id FROM Users WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    if not user:
        conn.close()
        return {"error": "User not found"}

    book = cursor.execute(
        "SELECT book_id FROM Books WHERE book_id = ?",
        (book_id,)
    ).fetchone()
    if not book:
        conn.close()
        return {"error": "Book not found"}

    existing = cursor.execute(
        """
        SELECT reservation_id
        FROM Reservations
        WHERE user_id = ? AND book_id = ? AND status = 'active'
        """,
        (user_id, book_id)
    ).fetchone()

    if existing:
        conn.close()
        return {"error": "You already have an active reservation for this book"}

    active_reservation = cursor.execute(
        """
        SELECT reservation_id
        FROM Reservations
        WHERE book_id = ? AND status = 'active'
        LIMIT 1
        """,
        (book_id,)
    ).fetchone()

    if active_reservation:
        conn.close()
        return {"error": "This book is already reserved"}

    today = date.today().isoformat()

    cursor.execute(
        """
        INSERT INTO Reservations (user_id, book_id, reservation_date, status)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, book_id, today, "active")
    )

    conn.commit()
    conn.close()

    return {"message": "Book reserved successfully", "book_id": book_id}


def get_user_reservations(user_id):
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT reservation_id, user_id, book_id, reservation_date, status
        FROM Reservations
        WHERE user_id = ? AND status = 'active'
        ORDER BY reservation_date DESC, reservation_id DESC
        """,
        (user_id,)
    ).fetchall()

    conn.close()
    return [dict(row) for row in rows]


def get_open_reservations():
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT
            r.reservation_id,
            r.user_id,
            r.book_id,
            r.reservation_date,
            r.status,
            u.full_name,
            u.email
        FROM Reservations r
        JOIN Users u ON r.user_id = u.user_id
        WHERE r.status = 'active'
        ORDER BY r.reservation_date DESC, r.reservation_id DESC
        """
    ).fetchall()

    result = []
    for row in rows:
        item = dict(row)
        item["member_id"] = _member_id_for_user(item["user_id"])
        result.append(item)

    conn.close()
    return result
