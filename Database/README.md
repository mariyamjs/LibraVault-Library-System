## Database

The system uses SQLite.

The database schema is defined in:

database/schema.sql

Tables include:

- Users
- Books
- BookCopies
- Loans
- Reservations

To initialize the database:

sqlite3 library.db < database/schema.sq

It shows relationships between major entities such as:

• Books  
• Users  
• Loans  
• Reservations  

Primary keys and foreign keys illustrate how records connect across tables.

---

## Data Flow Diagram

This diagram represents the **lifecycle of library interactions**, including:

1. User authentication
2. Book discovery
3. Borrowing / reservations
4. database updates
5. dashboard analytics

The diagram demonstrates how user actions propagate through the backend and database layers.

---

## Dashboard Analytics Flow

This diagram illustrates how **operational metrics are generated and displayed** in the dashboard interface.

Metrics include:

- borrowing activity
- overdue items
- reservation demand
- recommendation performance
- system health indicators

These metrics are derived from database queries and aggregated for visualization in the dashboard UI.

---

# Purpose of These Diagrams

The diagrams serve several purposes:

• documentation of system design  
• onboarding for new contributors  
• architectural reference during development  
• explanation of component relationships  

They also help ensure that the frontend dashboard, backend services, and database schema remain aligned as the system evolves.

---

# Future Diagram Additions

Planned diagrams include:

• API endpoint architecture  
• recommendation engine pipeline  
• data analytics workflow  
• distributed system expansion model

These additions will further document how LibraVault scales as the platform grows.

# Visual Diagrams

## System Architecture
![System Architecture](architecture.png)

## Database Schema
![Database Schema](database_schema.png)

## Data Flow
![Data Flow](dataflow.png)