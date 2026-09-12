from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from auth_utils import get_session_user
from database.db_connection import get_connection


auth_routes = Blueprint("auth", __name__)


def normalize_email(value):
    return str(value or "").strip().lower()


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


@auth_routes.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    full_name = str(data.get("full_name") or "").strip()
    email = normalize_email(data.get("email"))
    password = str(data.get("password") or "")
    role = str(data.get("role") or "reader").strip().lower()
    admin_key = str(data.get("admin_key") or "").strip()

    if not full_name or not email or not password:
        return jsonify({"error": "full_name, email, and password are required"}), 400

    if role not in ("reader", "admin"):
        return jsonify({"error": "role must be reader or admin"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if role == "admin" and admin_key != current_app.config["ADMIN_CREATION_KEY"]:
        return jsonify({"error": "Invalid admin creation key"}), 403

    conn = get_connection()
    cursor = conn.cursor()

    existing = cursor.execute(
        "SELECT user_id FROM Users WHERE email = ?",
        (email,)
    ).fetchone()

    if existing:
        conn.close()
        return jsonify({"error": "An account already exists with that email"}), 409

    password_hash = generate_password_hash(password)

    cursor.execute(
        """
        INSERT INTO Users (full_name, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        """,
        (full_name, email, password_hash, role)
    )
    conn.commit()

    user = cursor.execute(
        "SELECT * FROM Users WHERE user_id = ?",
        (cursor.lastrowid,)
    ).fetchone()

    conn.close()

    session.clear()
    session.permanent = True
    session["user_id"] = int(user["user_id"])

    return jsonify({
        "message": "User registered",
        "user": make_user_payload(user)
    }), 201


@auth_routes.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = normalize_email(data.get("email"))
    password = str(data.get("password") or "")
    requested_role = str(data.get("role") or "").strip().lower()

    if not email or not password:
        return jsonify({"error": "email and password are required"}), 400

    conn = get_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        "SELECT * FROM Users WHERE email = ?",
        (email,)
    ).fetchone()

    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    actual_role = (user["role"] or "reader").lower()
    if requested_role and requested_role != actual_role:
        return jsonify({"error": f"This account is registered as {actual_role}, not {requested_role}"}), 403

    session.clear()
    session.permanent = True
    session["user_id"] = int(user["user_id"])

    return jsonify({
        "message": "Login successful",
        "user": make_user_payload(user)
    })


@auth_routes.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"})


@auth_routes.route("/me", methods=["GET"])
def me():
    user = get_session_user()
    if not user:
        return jsonify({"user": None})
    return jsonify({"user": user})


@auth_routes.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}

    email = normalize_email(data.get("email"))
    new_password = str(data.get("password") or "")
    requested_role = str(data.get("role") or "").strip().lower()

    if not email or not new_password:
        return jsonify({"error": "email and password are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn = get_connection()
    cursor = conn.cursor()

    user = cursor.execute(
        "SELECT * FROM Users WHERE email = ?",
        (email,)
    ).fetchone()

    if not user:
        conn.close()
        return jsonify({"error": "No account found with that email"}), 404

    actual_role = (user["role"] or "reader").lower()
    if requested_role and requested_role != actual_role:
        conn.close()
        return jsonify({"error": f"This account is registered as {actual_role}, not {requested_role}"}), 403

    password_hash = generate_password_hash(new_password)

    cursor.execute(
        "UPDATE Users SET password_hash = ? WHERE user_id = ?",
        (password_hash, user["user_id"])
    )
    conn.commit()
    conn.close()

    return jsonify({"message": "Password updated successfully"})
