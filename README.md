# LibraVault README

## Overview
LibraVault is a Flask + SQLite library management system. The **frontend is served by the Flask backend**, so you should run the backend server and then open the app in your browser. The project supports reader/admin accounts, browsing the catalog, borrowing, reservations, renewals, account management, and admin book management.

## Project structure
- `backend/` - Flask app, API routes, services, and auth/session logic
- `frontend/` - HTML/CSS/JS interface
- `Database/` - schema and scripts to initialize/seed the SQLite database
- `library.db` - included SQLite database file
- `.env` - app secrets/config such as `SECRET_KEY` and `ADMIN_CREATION_KEY`

## Prerequisites
Install the following before running the project:
- Python 3.9+
- pip

## How to Run This Project

### 1) Open the project folder
```powershell
cd LibraVault
```

### 2) Create and activate a virtual environment
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3) Install dependencies
Use the requirements file and then add dotenv:
```powershell
pip install -r backend\requirements.txt
pip install python-dotenv
```

### 4) Start the server
Run the Flask app from inside the `backend` folder:
```powershell
cd backend
py app.py
```

You should see Flask start on something like:
```text
http://127.0.0.1:5000
```

### 5) Open the app
In your browser, go to:

```text
http://127.0.0.1:5000
```

## Creating accounts
- **Reader account:** use the sign-up form on the login page.
- **Admin account:** use the admin sign-up option and enter the admin creation key stored in `.env`.

### Reader features
- Register and log in
- Browse/search the book catalog
- Reserve available titles
- View active loans and reservations
- Renew loans
- Reset password

### Admin features
- Create admin accounts using the admin key
- Add new books
- Borrow books to reader accounts
- Return loans
- View readers, admins, open loans, and reservations
- Delete accounts (with safeguards such as preventing deletion of the last admin)

## Troubleshooting
### `ModuleNotFoundError: No module named 'flask'`
Install dependencies inside your virtual environment:
```powershell
pip install Flask Werkzeug python-dotenv
```

### `ModuleNotFoundError: No module named 'dotenv'`
Install python-dotenv:
```powershell
pip install python-dotenv
```

## Suggested run command summary
```powershell
cd LibraVault
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install python-dotenv
cd backend
py app.py
```
