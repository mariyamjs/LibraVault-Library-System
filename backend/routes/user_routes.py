from flask import Blueprint, jsonify, session
from auth_utils import admin_required, make_user_payload, self_or_admin_required
from database.db_connection import get_connection


user_routes = Blueprint("users", __name__)


@user_routes.route("/users/readers", methods=["GET"])
@admin_required
def list_readers():
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT user_id, full_name, email, role, created_at
        FROM Users
        WHERE LOWER(COALESCE(role, 'reader')) = 'reader'
        ORDER BY full_name ASC, user_id ASC
        """,
    ).fetchall()

    conn.close()
    return jsonify([make_user_payload(row) | {"created_at": row["created_at"]} for row in rows])


@user_routes.route("/users/admins", methods=["GET"])
@admin_required
def list_admins():
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT user_id, full_name, email, role, created_at
        FROM Users
        WHERE LOWER(COALESCE(role, 'reader')) = 'admin'
        ORDER BY full_name ASC, user_id ASC
        """,
    ).fetchall()

    conn.close()
    return jsonify([make_user_payload(row) | {"created_at": row["created_at"]} for row in rows])


@user_routes.route("/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    current_user, error = self_or_admin_required(user_id)
    if error:
        return error

    conn = get_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        """
        SELECT user_id, full_name, email, role, created_at
        FROM Users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    role = (user["role"] or "reader").lower()

    if role == "admin" and current_user["role"] != "admin":
        conn.close()
        return jsonify({"error": "Only admins can delete admin accounts"}), 403

    if role == "reader":
        active_loans = cursor.execute(
            """
            SELECT loan_id, copy_id
            FROM Loans
            WHERE user_id = ? AND return_date IS NULL
            """,
            (user_id,),
        ).fetchall()

        for loan in active_loans:
            cursor.execute(
                "UPDATE Loans SET return_date = date('now') WHERE loan_id = ?",
                (loan["loan_id"],),
            )
            cursor.execute(
                "UPDATE BookCopies SET status = 'available' WHERE copy_id = ?",
                (loan["copy_id"],),
            )

        cursor.execute(
            "DELETE FROM Reservations WHERE user_id = ?",
            (user_id,),
        )

    if role == "admin":
        admin_count = cursor.execute(
            """
            SELECT COUNT(*) AS count
            FROM Users
            WHERE LOWER(COALESCE(role, 'reader')) = 'admin'
            """,
        ).fetchone()["count"]

        if admin_count <= 1:
            conn.close()
            return jsonify({"error": "You cannot delete the last admin account"}), 409

    cursor.execute(
        "DELETE FROM Users WHERE user_id = ?",
        (user_id,),
    )

    conn.commit()
    conn.close()

    if int(current_user["user_id"]) == int(user_id):
        session.clear()

    return jsonify({
        "message": "User deleted successfully",
        "user_id": user_id,
        "role": role,
    })
