from functools import wraps
from flask import g, jsonify, session
from database.db_connection import get_connection


def make_user_payload(user):
    role = (user["role"] or "reader").lower()
    user_id = int(user["user_id"])

    return {
        "user_id": user_id,
        "full_name": user["full_name"],
        "email": user["email"],
        "role": role,
        "member_id": f"NL-{100000 + user_id}" if role == "reader" else None,
        "staff_id": f"ADM-{user_id:03d}" if role == "admin" else None,
    }


def get_session_user():
    user_id = session.get("user_id")
    if not user_id:
        return None

    conn = get_connection()
    cursor = conn.cursor()
    user = cursor.execute(
        """
        SELECT user_id, full_name, email, role
        FROM Users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    conn.close()

    if not user:
        session.clear()
        return None

    return make_user_payload(user)


def login_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        user = get_session_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        g.current_user = user
        return view_func(*args, **kwargs)

    return wrapped


def admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        user = get_session_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if user["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403
        g.current_user = user
        return view_func(*args, **kwargs)

    return wrapped


def reader_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        user = get_session_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if user["role"] != "reader":
            return jsonify({"error": "Reader access required"}), 403
        g.current_user = user
        return view_func(*args, **kwargs)

    return wrapped


def self_or_admin_required(path_user_id):
    user = get_session_user()
    if not user:
        return None, (jsonify({"error": "Authentication required"}), 401)

    if user["role"] == "admin" or int(user["user_id"]) == int(path_user_id):
        return user, None

    return None, (jsonify({"error": "You do not have access to this account"}), 403)
