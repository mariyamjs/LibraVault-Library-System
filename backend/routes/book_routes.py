from flask import Blueprint, jsonify, request
from auth_utils import admin_required
from services.book_service import add_book, get_all_books, get_book_by_id, search_books


book_routes = Blueprint("books", __name__)


@book_routes.route("/books", methods=["GET"])
def books():
    return jsonify(get_all_books())


@book_routes.route("/books/<int:book_id>", methods=["GET"])
def book(book_id):
    result = get_book_by_id(book_id)
    if result:
        return jsonify(result)
    return jsonify({"error": "Book not found"}), 404


@book_routes.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    return jsonify(search_books(query))


@book_routes.route("/books", methods=["POST"])
@admin_required
def create_book():
    data = request.get_json(silent=True) or {}
    result = add_book(data)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result), 201
