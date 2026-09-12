from flask import Blueprint, g, jsonify, request
from auth_utils import admin_required, get_session_user, reader_required, self_or_admin_required
from services.loan_service import (
    borrow_book,
    get_open_loans,
    get_open_reservations,
    get_user_loans,
    get_user_reservations,
    renew_loan,
    reserve_book,
    return_loan,
)


loan_routes = Blueprint("loans", __name__)


def result_response(result, success_code=200):
    if "error" not in result:
        return jsonify(result), success_code

    message = result["error"].lower()

    if "not found" in message:
        return jsonify(result), 404

    if "already" in message or "no available copies" in message or "limit" in message:
        return jsonify(result), 409

    if "authentication required" in message:
        return jsonify(result), 401

    return jsonify(result), 400


@loan_routes.route("/borrow/<int:book_id>", methods=["POST"])
@admin_required
def borrow(book_id):
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    due_days = data.get("due_days", 14)

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    result = borrow_book(int(user_id), book_id, due_days)
    return result_response(result, 201)


@loan_routes.route("/return-loan/<int:loan_id>", methods=["POST"])
@admin_required
def return_loan_route(loan_id):
    result = return_loan(loan_id)
    return result_response(result)


@loan_routes.route("/renew/<int:loan_id>", methods=["POST"])
@reader_required
def renew(loan_id):
    user_id = g.current_user["user_id"]
    result = renew_loan(loan_id, int(user_id))
    return result_response(result)


@loan_routes.route("/reserve/<int:book_id>", methods=["POST"])
@reader_required
def reserve(book_id):
    user_id = g.current_user["user_id"]
    result = reserve_book(int(user_id), book_id)
    return result_response(result, 201)


@loan_routes.route("/users/<int:user_id>/reservations", methods=["GET"])
def user_reservations(user_id):
    _user, error = self_or_admin_required(user_id)
    if error:
        return error
    return jsonify(get_user_reservations(user_id))


@loan_routes.route("/users/<int:user_id>/loans", methods=["GET"])
def user_loans(user_id):
    _user, error = self_or_admin_required(user_id)
    if error:
        return error
    return jsonify(get_user_loans(user_id))


@loan_routes.route("/loans/open", methods=["GET"])
def open_loans():
    rows = get_open_loans()
    current_user = get_session_user()

    if current_user and current_user["role"] == "admin":
        return jsonify(rows)

    sanitized = [
        {
            "loan_id": row["loan_id"],
            "book_id": row["book_id"],
            "copy_id": row["copy_id"],
            "due_date": row["due_date"],
        }
        for row in rows
    ]
    return jsonify(sanitized)


@loan_routes.route("/reservations/open", methods=["GET"])
def open_reservations():
    rows = get_open_reservations()
    current_user = get_session_user()

    if current_user and current_user["role"] == "admin":
        return jsonify(rows)

    sanitized = []
    current_user_id = int(current_user["user_id"]) if current_user else None

    for row in rows:
        item = {
            "reservation_id": row["reservation_id"],
            "book_id": row["book_id"],
            "reservation_date": row["reservation_date"],
        }
        if current_user and current_user["role"] == "reader" and int(row["user_id"]) == current_user_id:
            item["user_id"] = row["user_id"]
        sanitized.append(item)

    return jsonify(sanitized)
