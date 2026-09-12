from pathlib import Path
from flask import Flask
from config import Config

from routes.book_routes import book_routes
from routes.loan_routes import loan_routes
from routes.auth_routes import auth_routes
from routes.user_routes import user_routes

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path=""
)

app.config.from_object(Config)

# Put backend routes under /api so they do not clash with frontend pages
app.register_blueprint(book_routes, url_prefix="/api")
app.register_blueprint(loan_routes, url_prefix="/api")
app.register_blueprint(auth_routes, url_prefix="/api")
app.register_blueprint(user_routes, url_prefix="/api")

@app.route("/")
def home():
    return app.send_static_file("index.html")

@app.route("/health")
def health():
    return {"message": "Library app running"}

if __name__ == "__main__":
    app.run(debug=True)