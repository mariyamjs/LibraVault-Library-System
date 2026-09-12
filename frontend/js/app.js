(function () {
  const STORAGE_KEYS = {
    user: "nocturne_user",
    suggestions: "nocturne_suggestions",
    homepageSearch: "nocturne_homepage_search",
    viewedBooks: "nocturne_viewed_books",
    searchHistory: "nocturne_search_history",
  };

  let API_BOOKS = [];
  let API_USER_RESERVATIONS = [];
  let API_USER_LOANS = [];
  let API_OPEN_LOANS = [];
  let API_ACTIVE_RESERVATIONS = [];
  let API_READERS = [];
  let API_ADMINS = [];
  const REC_POOLS = (window.LibraryData && window.LibraryData.recommendationPools) || {};

  function $(selector, scope = document) {
    return scope.querySelector(selector);
  }

  function $all(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  }

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function formatDate(dateInput) {
    if (!dateInput) return "—";
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toast(message) {
    let node = $("#toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "toast";
      node.className = "toast";
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove("show"), 2600);
  }

  function setYear() {
    $all("[data-year]").forEach((el) => {
      el.textContent = new Date().getFullYear();
    });
  }

  function getSuggestions() {
    return readJSON(STORAGE_KEYS.suggestions, []);
  }

  function saveSuggestions(items) {
    writeJSON(STORAGE_KEYS.suggestions, items);
  }

  function getViewedBooks() {
    return readJSON(STORAGE_KEYS.viewedBooks, []);
  }

  function saveViewedBooks(items) {
    writeJSON(STORAGE_KEYS.viewedBooks, items);
  }

  function getSearchHistory() {
    return readJSON(STORAGE_KEYS.searchHistory, []);
  }

  function saveSearchHistory(items) {
    writeJSON(STORAGE_KEYS.searchHistory, items);
  }
  
  function buildSessionFromApiUser(user) {
  if (!user) return null;

  return {
    id: String(user.user_id),
    name: user.full_name,
    email: normalizeEmail(user.email),
    memberId: user.role === "admin" ? user.staff_id : user.member_id,
    role: user.role
  };
}


async function apiPost(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

async function apiGet(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

async function apiDelete(url) {
  const response = await fetch(url, {
    method: "DELETE",
    credentials: "same-origin"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

async function fetchCurrentUserFromApi() {
  try {
    const data = await apiGet("/api/me");
    const user = data.user ? buildSessionFromApiUser(data.user) : null;
    setUser(user);
    return user;
  } catch (error) {
    setUser(null);
    return null;
  }
}
async function loginApi({ email, password, role }) {
  return apiPost("/api/login", {
    email: normalizeEmail(email),
    password,
    role
  });
}
async function fetchReadersFromApi() {
  try {
    const data = await apiGet("/api/users/readers");

    API_READERS = Array.isArray(data)
      ? data.map((user) => ({
          id: String(user.user_id),
          name: user.full_name,
          email: normalizeEmail(user.email),
          memberId: user.member_id,
          role: user.role
        }))
      : [];
  } catch (error) {
    console.error("Could not load readers from API:", error);
    API_READERS = [];
  }
}

async function fetchAdminsFromApi() {
  try {
    const data = await apiGet("/api/users/admins");

    API_ADMINS = Array.isArray(data)
      ? data.map((user) => ({
          id: String(user.user_id),
          name: user.full_name,
          email: normalizeEmail(user.email),
          staffId: user.staff_id,
          role: user.role
        }))
      : [];
  } catch (error) {
    console.error("Could not load admins from API:", error);
    API_ADMINS = [];
  }
}

async function deleteUserApi(userId) {
  return apiDelete(`/api/users/${encodeURIComponent(userId)}`);
}

async function fetchUserReservationsFromApi() {
  const user = getUser();

  if (!user || user.role !== "reader") {
    API_USER_RESERVATIONS = [];
    return;
  }

  try {
    const data = await apiGet(`/api/users/${encodeURIComponent(user.id)}/reservations`);

    API_USER_RESERVATIONS = Array.isArray(data)
      ? data.map((entry) => ({
          ...entry,
          bookId: String(entry.book_id)
        }))
      : [];
  } catch (error) {
    console.error("Could not load reservations from API:", error);
    API_USER_RESERVATIONS = [];
  }
}

async function fetchUserLoansFromApi() {
  const user = getUser();

  if (!user || user.role !== "reader") {
    API_USER_LOANS = [];
    return;
  }

  try {
    const data = await apiGet(`/api/users/${encodeURIComponent(user.id)}/loans`);

    API_USER_LOANS = Array.isArray(data)
      ? data.map((entry) => ({
          loanId: String(entry.loan_id),
          bookId: String(entry.book_id),
          copyId: String(entry.copy_id),
          checkedOutAt: entry.borrow_date,
          dueDate: entry.due_date,
          renewals: Number(entry.renewal_count || 0)
        }))
      : [];
  } catch (error) {
    console.error("Could not load loans from API:", error);
    API_USER_LOANS = [];
  }
}

async function fetchOpenLoansFromApi() {
  try {
    const data = await apiGet("/api/loans/open");

    API_OPEN_LOANS = Array.isArray(data)
      ? data.map((entry) => ({
          loanId: String(entry.loan_id),
          bookId: String(entry.book_id),
          borrowerName: entry.full_name,
          borrowerEmail: entry.email,
          memberId: entry.member_id,
          checkedOutAt: entry.borrow_date,
          dueDate: entry.due_date,
          renewals: Number(entry.renewal_count || 0)
        }))
      : [];
  } catch (error) {
    console.error("Could not load open loans from API:", error);
    API_OPEN_LOANS = [];
  }
}

async function fetchActiveReservationsFromApi() {
  try {
    const data = await apiGet("/api/reservations/open");

    API_ACTIVE_RESERVATIONS = Array.isArray(data)
      ? data.map((entry) => ({
          reservationId: String(entry.reservation_id),
          userId: String(entry.user_id),
          bookId: String(entry.book_id),
          reservationDate: entry.reservation_date,
          reserverName: entry.full_name,
          reserverEmail: entry.email,
          memberId: entry.member_id
        }))
      : [];
  } catch (error) {
    console.error("Could not load active reservations from API:", error);
    API_ACTIVE_RESERVATIONS = [];
  }
}

async function registerApi({ name, email, password, role, adminKey = "" }) {
  return apiPost("/api/register", {
    full_name: normalizeName(name),
    email: normalizeEmail(email),
    password,
    role,
    admin_key: adminKey
  });
}

async function resetPasswordApi({ email, password, role }) {
  return apiPost("/api/reset-password", {
    email: normalizeEmail(email),
    password,
    role
  });
}
  
  function normalizeApiBook(raw) {
  return {
    id: String(raw.slug || raw.book_id),
    book_id: raw.book_id,
    title: raw.title || "Untitled",
    author: raw.author || "Unknown author",
    collection: raw.collection_name || raw.collection || "General Collection",
    genre: raw.category || raw.genre || "General",
    format: raw.book_format || raw.format || "Book",
    year: raw.publication_year || raw.year || "",
    pages: Number(raw.pages) || 0,
    rating: Number(raw.rating) || 0,
    cover:
      raw.cover_url ||
      raw.cover ||
      "https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg",
    accent: raw.accent || "gold",
    blurb: raw.blurb || raw.description || "No summary available yet.",
    description: raw.description || raw.blurb || "No description available yet.",
    publisher: raw.publisher || "",
    copies: Array.isArray(raw.copies) ? raw.copies : []
  };
}

async function fetchBooksFromApi() {
  try {
    const data = await apiGet("/api/books");
    API_BOOKS = Array.isArray(data) ? data.map(normalizeApiBook) : [];
  } catch (error) {
    console.error("Could not load books from /api/books:", error);
    API_BOOKS = [];
    toast("Could not load catalog from the server.");
  }
}

  function recordBookView(bookId) {
    if (!bookId) return;
    const history = getViewedBooks().filter((id) => id !== bookId);
    history.unshift(bookId);
    saveViewedBooks(history.slice(0, 12));
  }

  function recordSearch(query) {
    const cleanQuery = String(query || "").trim();
    if (cleanQuery.length < 2) return;
    const normalized = cleanQuery.toLowerCase();
    const history = getSearchHistory().filter((item) => item.toLowerCase() !== normalized);
    history.unshift(cleanQuery);
    saveSearchHistory(history.slice(0, 8));
  }

  function setUser(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.user);
      return;
    }
    writeJSON(STORAGE_KEYS.user, user);
  }

  function findReaderById(id) {
  return API_READERS.find((reader) => String(reader.id) === String(id)) || null;
}

function findAdminById(id) {
  return API_ADMINS.find((admin) => String(admin.id) === String(id)) || null;
}


  function getUser() {
    const raw = readJSON(STORAGE_KEYS.user, null);
    if (!raw || !raw.role || !raw.email) return null;
    return raw;
  }


  function getOpenCirculation() {
    return API_OPEN_LOANS;
  }

  function getActiveReservations() {
    return API_ACTIVE_RESERVATIONS;
  }

  function getLoanForBook(bookId) {
    return getOpenCirculation().find((entry) => String(entry.bookId) === String(bookId)) || null;
  }

  function getReservationForBook(bookId) {
    return getActiveReservations().find((entry) => String(entry.bookId) === String(bookId)) || null;
  }

  function getAllBooks() {
    const currentUser = getUser();

    return [...API_BOOKS].map((book) => {
      const lookupId = book.book_id || book.id;
      const loan = getLoanForBook(lookupId);
      const reservation = getReservationForBook(lookupId);
      const reservedByCurrentUser = Boolean(
        reservation && currentUser && currentUser.role === "reader" && String(reservation.userId) === String(currentUser.id)
      );

      return {
        ...book,
        available: !loan && !reservation,
        borrower: loan
          ? {
              name: loan.borrowerName,
              email: loan.borrowerEmail,
              memberId: loan.memberId,
              dueDate: loan.dueDate
            }
          : null,
        reservation: reservation
          ? {
              userId: reservation.userId,
              name: reservation.reserverName,
              email: reservation.reserverEmail,
              memberId: reservation.memberId,
              reservedAt: reservation.reservationDate
            }
          : null,
        reservedByCurrentUser
      };
    });
  }

  function getBookById(id) {
  return getAllBooks().find((book) => String(book.id) === String(id)) || null;
}

function getBookByBookId(bookId) {
  return getAllBooks().find((book) => String(book.book_id) === String(bookId)) || null;
}


  function getUserReservations() {
    return API_USER_RESERVATIONS;
  }

  function getUserLoans() {
    return API_USER_LOANS;
  }


  async function deleteReaderAccount(readerId) {
  try {
    const result = await deleteUserApi(readerId);

    await fetchReadersFromApi();
    await fetchOpenLoansFromApi();
    await fetchActiveReservationsFromApi();
    await fetchUserLoansFromApi();
    await fetchUserReservationsFromApi();
    await fetchBooksFromApi();

    const currentUser = getUser();
    if (currentUser && currentUser.role === "reader" && String(currentUser.id) === String(readerId)) {
      setUser(null);
      return { ok: true, loggedOut: true, result };
    }

    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

  async function deleteAdminAccount(adminId) {
  try {
    const result = await deleteUserApi(adminId);

    await fetchAdminsFromApi();

    const currentUser = getUser();
    if (currentUser && currentUser.role === "admin" && String(currentUser.id) === String(adminId)) {
      setUser(null);
      return { ok: true, loggedOut: true, result };
    }

    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

  function updateHeaderUserState() {
  const user = getUser();
  const loginLinks = $all("[data-login-link]");
  const logoutButtons = $all("[data-logout]");
  const adminLinks = $all("[data-admin-link]");

  // Hide any separate logout buttons since you want just one top-right button
  logoutButtons.forEach((button) => {
    button.hidden = true;
    button.onclick = null;
  });

  loginLinks.forEach((link) => {
    if (user) {
      link.textContent = "Logout";
      link.setAttribute("href", "#");

      link.onclick = async (event) => {
        event.preventDefault();

        try {
          await apiPost("/api/logout", {});
        } catch (error) {
          console.error("Logout failed:", error);
        }

        setUser(null);
        API_USER_RESERVATIONS = [];
        API_USER_LOANS = [];
        API_OPEN_LOANS = [];
        API_ACTIVE_RESERVATIONS = [];
        API_READERS = [];
        API_ADMINS = [];

        toast("You have been signed out.");
        updateHeaderUserState();
        renderTopPicks();
        renderCatalogPage();
        renderAccountPage();
        renderBookDetailPage();
        renderRecommendationsPage();
        renderAdminPage();

        const page = document.body.dataset.page;
        if (page === "account" || page === "admin") {
          setTimeout(() => {
            window.location.href = "login.html";
          }, 250);
        }
      };
    } else {
      link.textContent = "Login";
      link.setAttribute("href", "login.html");
      link.onclick = null;
    }
  });

  adminLinks.forEach((link) => {
    link.hidden = !(user && user.role === "admin");
  });
}
  async function reserveBook(bookId) {
    const user = getUser();

    if (!user || user.role !== "reader") {
      toast("Please sign in as a reader to reserve books.");
      return;
    }

    if (!bookId) {
      toast("This book is missing its database id.");
      return;
    }

    try {
      const result = await apiPost(`/api/reserve/${encodeURIComponent(bookId)}`, {});

      await fetchUserReservationsFromApi();
      await fetchActiveReservationsFromApi();
      await fetchBooksFromApi();
      await fetchOpenLoansFromApi();

      toast(result.message || "Book reserved to your library account.");
      renderTopPicks();
      renderCatalogPage();
      renderRecommendationsPage();
      renderAdminPage();
      renderAccountPage();
      renderBookDetailPage();
      refreshReservationButtons();
    } catch (error) {
      toast(error.message);
    }
  }

  async function renewLoan(loanId) {
  const user = getUser();

  if (!user || user.role !== "reader") {
    toast("Please sign in as a reader to renew books.");
    return;
  }

  try {
    const result = await apiPost(`/api/renew/${encodeURIComponent(loanId)}`, {});

    await fetchUserLoansFromApi();
    await fetchOpenLoansFromApi();

    toast(result.message || "Loan renewed for two more weeks.");
    renderAccountPage();
    renderAdminPage();
    renderCatalogPage();
    renderBookDetailPage();
  } catch (error) {
    toast(error.message);
  }
}

  function addSuggestion(title, author, reason) {
    const user = getUser();
    const suggestions = getSuggestions();
    suggestions.unshift({
      id: createId("suggestion"),
      title,
      author,
      reason,
      createdAt: new Date().toISOString(),
      submittedBy: user ? user.name : "Guest Reader",
      submittedByEmail: user ? user.email : ""
    });
    saveSuggestions(suggestions);
    toast("Your recommendation has been added.");
  }

  async function addBook(payload) {
  const user = getUser();

  if (!user || user.role !== "admin") {
    toast("Admin access is required to add books.");
    return false;
  }

  try {
    const result = await apiPost("/api/books", {
      title: payload.title,
      author: payload.author,
      collection_name: payload.collection,
      category: payload.genre,
      book_format: payload.format,
      publication_year: payload.year,
      pages: payload.pages,
      cover_url: payload.cover,
      blurb: payload.blurb,
      description: payload.description,
      accent: payload.accent || "gold"
    });

    await fetchBooksFromApi();
    await fetchOpenLoansFromApi();
    await fetchActiveReservationsFromApi();

    const currentUser = getUser();
    if (currentUser && currentUser.role === "reader") {
      await fetchUserLoansFromApi();
      await fetchUserReservationsFromApi();
    }

    toast(result.message || "Book added successfully.");
    renderAdminPage();
    renderCatalogPage();
    renderBookDetailPage();
    renderTopPicks();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

  async function checkOutBook(bookId, readerId, dueDays) {
  const user = getUser();

  if (!user || user.role !== "admin") {
    toast("Admin access is required for circulation actions.");
    return false;
  }

  if (!bookId || !readerId) {
    toast("Please choose both a title and a reader account.");
    return false;
  }

  try {
    const result = await apiPost(`/api/borrow/${encodeURIComponent(bookId)}`, {
      user_id: Number(readerId),
      due_days: Number(dueDays) || 14
    });

    await fetchOpenLoansFromApi();
    await fetchActiveReservationsFromApi();
    await fetchBooksFromApi();

    const currentUser = getUser();
    if (currentUser && currentUser.role === "reader") {
      await fetchUserLoansFromApi();
      await fetchUserReservationsFromApi();
    }

    toast(result.message || "Book checked out successfully.");
    renderAdminPage();
    renderCatalogPage();
    renderBookDetailPage();
    renderAccountPage();
    renderTopPicks();
    renderRecommendationsPage();
    refreshReservationButtons();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

  async function returnLoan(loanId) {
  const user = getUser();

  if (!user || user.role !== "admin") {
    toast("Admin access is required for circulation actions.");
    return;
  }

  try {
    const result = await apiPost(`/api/return-loan/${encodeURIComponent(loanId)}`, {});

    await fetchOpenLoansFromApi();
    await fetchActiveReservationsFromApi();
    await fetchBooksFromApi();

    const currentUser = getUser();
    if (currentUser && currentUser.role === "reader") {
      await fetchUserLoansFromApi();
      await fetchUserReservationsFromApi();
    }

    toast(result.message || "Book marked as returned.");
    renderAdminPage();
    renderCatalogPage();
    renderBookDetailPage();
    renderAccountPage();
    renderTopPicks();
    renderRecommendationsPage();
    refreshReservationButtons();
  } catch (error) {
    toast(error.message);
  }
}

  function getBookAvailabilityLabel(book) {
    if (book.borrower) return "Currently on loan";
    if (book.reservation) return book.reservedByCurrentUser ? "Reserved for you" : "Reserved";
    return "Available now";
  }

  function getReserveButtonModel(book) {
    if (book.reservedByCurrentUser) {
      return {
        text: "Reserved",
        className: "btn-secondary is-static",
        disabled: true
      };
    }

    if (book.borrower) {
      return {
        text: "On loan",
        className: "btn-secondary is-static",
        disabled: true
      };
    }

    if (book.reservation) {
      return {
        text: "Unavailable",
        className: "btn-secondary is-static",
        disabled: true
      };
    }

    return {
      text: "Reserve",
      className: "btn-secondary js-reserve",
      disabled: false
    };
  }

  function bookCard(book) {
    const button = getReserveButtonModel(book);
    const availability = getBookAvailabilityLabel(book);

    return `
      <article class="catalog-card">
        <div class="catalog-card-media">
          <img src="${book.cover}" alt="${escapeHtml(book.title)} cover mood image">
          <span class="catalog-badge">${escapeHtml(book.collection)}</span>
        </div>
        <div class="catalog-card-body">
          <div class="catalog-topline">
            <span class="pill">${escapeHtml(book.genre)}</span>
            <span class="subtle">${escapeHtml(book.format)}</span>
          </div>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="catalog-byline">by ${escapeHtml(book.author)}</p>
          <p>${escapeHtml(book.blurb)}</p>
          <div class="catalog-meta">
            <span>${escapeHtml(book.year)}</span>
            <span>${escapeHtml(book.pages)} pages</span>
            <span>${escapeHtml(book.rating)} ★</span>
          </div>
          <div class="catalog-status ${book.available ? "available" : "unavailable"}">${availability}</div>
          <div class="catalog-actions">
            <a class="ghost-link" href="book.html?id=${encodeURIComponent(book.id)}">View details</a>
            <button class="${button.className}" data-book-id="${escapeHtml(String(book.book_id || ""))}" ${button.disabled ? "disabled" : ""}>
              ${button.text}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function recommendationCard(book, note) {
    const button = getReserveButtonModel(book);
    const availability = getBookAvailabilityLabel(book);

    return `
      <article class="catalog-card">
        <div class="catalog-card-media">
          <img src="${book.cover}" alt="${escapeHtml(book.title)} cover mood image">
          <span class="catalog-badge">${escapeHtml(book.collection)}</span>
        </div>
        <div class="catalog-card-body">
          <div class="catalog-topline">
            <span class="pill">${escapeHtml(book.genre)}</span>
            <span class="subtle">${escapeHtml(book.format)}</span>
          </div>
          <p class="label">${escapeHtml(note)}</p>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="catalog-byline">by ${escapeHtml(book.author)}</p>
          <p>${escapeHtml(book.blurb)}</p>
          <div class="catalog-meta">
            <span>${escapeHtml(book.year)}</span>
            <span>${escapeHtml(book.pages)} pages</span>
            <span>${escapeHtml(book.rating)} ★</span>
          </div>
          <div class="catalog-status ${book.available ? "available" : "unavailable"}">${availability}</div>
          <div class="catalog-actions">
            <a class="ghost-link" href="book.html?id=${encodeURIComponent(book.id)}">View details</a>
            <button class="${button.className}" data-book-id="${escapeHtml(String(book.book_id || ""))}" ${button.disabled ? "disabled" : ""}>
              ${button.text}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function attachReserveButtons(scope = document) {
    $all(".js-reserve", scope).forEach((button) => {
      button.addEventListener("click", () => reserveBook(button.dataset.bookId));
    });
  }

  function refreshReservationButtons() {
    $all("button[data-book-id]").forEach((button) => {
      if (button.classList.contains("js-checkout-reservation")) {
        return;
      }

      const book = getBookByBookId(button.dataset.bookId);
      if (!book) return;

      const state = getReserveButtonModel(book);
      button.disabled = state.disabled;
      button.textContent = state.text;
      button.className = state.className;
    });
  }

  function handleHomepageSearch() {
    const form = $("#homepageSearchForm");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const searchInput = $("#homepageSearchInput");
      const value = searchInput ? searchInput.value : "";
      recordSearch(value);
      localStorage.setItem(STORAGE_KEYS.homepageSearch, value.trim());
      window.location.href = "catalog.html";
    });
  }

  function renderTopPicks() {
    const target = $("#topPicksGrid");
    if (!target) return;
    const picks = getAllBooks().slice(0, 4);
    target.innerHTML = picks.map(bookCard).join("");
    attachReserveButtons(target);
    refreshReservationButtons();
  }

  function renderCatalogPage() {
    const grid = $("#catalogGrid");
    if (!grid) return;

    const books = getAllBooks();
    const searchInput = $("#catalogSearch");
    const collectionSelect = $("#collectionFilter");
    const availabilitySelect = $("#availabilityFilter");

    const initialSearch = localStorage.getItem(STORAGE_KEYS.homepageSearch) || "";
    if (searchInput && !searchInput.value) {
      searchInput.value = initialSearch;
      localStorage.removeItem(STORAGE_KEYS.homepageSearch);
    }

    const collections = [...new Set(books.map((book) => book.collection))];
    if (collectionSelect && collectionSelect.options.length <= 1) {
      collections.forEach((collection) => {
        const opt = document.createElement("option");
        opt.value = collection;
        opt.textContent = collection;
        collectionSelect.appendChild(opt);
      });
    }

    function applyFilters() {
      const rawQuery = (searchInput ? searchInput.value : "").trim();
      const query = rawQuery.toLowerCase();
      const collection = collectionSelect ? collectionSelect.value : "";
      const availability = availabilitySelect ? availabilitySelect.value : "";

      if (searchInput && searchInput.dataset.lastRecorded !== rawQuery && rawQuery.length >= 2) {
        recordSearch(rawQuery);
        searchInput.dataset.lastRecorded = rawQuery;
      }

      const filtered = books.filter((book) => {
        const haystack = [book.title, book.author, book.genre, book.collection, book.description, book.blurb]
          .join(" ")
          .toLowerCase();

        const matchesQuery = !query || haystack.includes(query);
        const matchesCollection = !collection || book.collection === collection;
        const matchesAvailability =
          !availability ||
          (availability === "available" && book.available) ||
          (availability === "unavailable" && !book.available);

        return matchesQuery && matchesCollection && matchesAvailability;
      });

      const countNode = $("#catalogCount");
      if (countNode) countNode.textContent = `${filtered.length} titles`;

      grid.innerHTML = filtered.length
        ? filtered.map(bookCard).join("")
        : `<div class="empty-state"><h3>No matching titles</h3><p>Try a different keyword or clear one of the filters.</p></div>`;

      attachReserveButtons(grid);
      refreshReservationButtons();
    }

    [searchInput, collectionSelect, availabilitySelect].forEach((control) => {
      if (control) {
        control.addEventListener("input", applyFilters);
        control.addEventListener("change", applyFilters);
      }
    });

    applyFilters();
  }

  function renderBookDetailPage() {
    const shell = $("#bookDetailShell");
    if (!shell) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "secret-history";
    const book = getBookById(id) || getAllBooks()[0];
    if (!book) return;

    recordBookView(book.id);

    const button = getReserveButtonModel(book);
    const availability = getBookAvailabilityLabel(book);
    const user = getUser();

    shell.innerHTML = `
      <section class="book-hero">
        <div class="book-cover-shell">
          <img src="${book.cover}" alt="${escapeHtml(book.title)} cover mood image">
        </div>
        <div class="book-copy">
          <div class="eyebrow">Catalog Detail</div>
          <h2>${escapeHtml(book.title)}</h2>
          <p class="book-author">by ${escapeHtml(book.author)}</p>
          <p>${escapeHtml(book.description)}</p>
          <div class="book-stats">
            <span class="meta-chip">${escapeHtml(book.collection)}</span>
            <span class="meta-chip">${escapeHtml(book.genre)}</span>
            <span class="meta-chip">${escapeHtml(book.format)}</span>
            <span class="meta-chip">${escapeHtml(book.pages)} pages</span>
          </div>
          <div class="catalog-status ${book.available ? "available" : "unavailable"}">
            ${availability}
          </div>
          <div class="book-actions">
            <button class="${button.className}" data-book-id="${escapeHtml(String(book.book_id || ""))}" ${button.disabled ? "disabled" : ""}>
              ${button.text === "Reserve" ? "Reserve this title" : button.text}
            </button>
            <a class="btn-secondary" href="catalog.html">Back to catalog</a>
          </div>
        </div>
      </section>

      <section class="detail-panels">
        <article class="detail-panel">
          <span class="label">Why readers love it</span>
          <h3>Atmosphere, scholarship, and mood</h3>
          <p>${escapeHtml(book.blurb)}</p>
        </article>
        <article class="detail-panel">
          <span class="label">Borrowing notes</span>
          <h3>Reservation and renewal ready</h3>
          <p>${book.available ? "This title is available for checkout or reservation." : book.borrower ? "This title is currently checked out." : book.reservedByCurrentUser ? "This title is reserved for your account." : "This title is currently reserved and unavailable."}</p>
          ${
            user && user.role === "admin" && book.borrower
              ? `<p class="account-subline">Currently with <strong>${escapeHtml(book.borrower.name)}</strong> · ${escapeHtml(book.borrower.email)} · ${escapeHtml(book.borrower.memberId)} · Due ${formatDate(book.borrower.dueDate)}</p>`
              : ""
          }
          ${
            user && user.role === "admin" && book.reservation
              ? `<p class="account-subline">Reserved by <strong>${escapeHtml(book.reservation.name)}</strong> · ${escapeHtml(book.reservation.email)} · ${escapeHtml(book.reservation.memberId)} · Since ${formatDate(book.reservation.reservedAt)}</p>`
              : ""
          }
        </article>
      </section>
    `;

    attachReserveButtons(shell);
    refreshReservationButtons();
  }

  function renderAccountPage() {
    const accountShell = $("#accountShell");
    if (!accountShell) return;

    const user = getUser();
    if (!user) {
      accountShell.innerHTML = `
        <div class="empty-state">
          <h3>Please login to view your library account</h3>
          <p>Your reserved books, loans, and reader profile will appear here after sign-in.</p>
          <a class="btn" href="login.html">Go to login</a>
        </div>
      `;
      return;
    }

    if (user.role === "admin") {
      accountShell.innerHTML = `
        <div class="empty-state">
          <h3>You are signed in as an admin</h3>
          <p>Use the admin desk to add books, check titles in and out, view borrower records, and manage accounts.</p>
          <a class="btn" href="admin.html">Open admin desk</a>
        </div>
      `;
      return;
    }

    const loans = getUserLoans();
    const activeLoanIds = new Set(loans.map((loan) => String(loan.bookId)));
    const reservations = getUserReservations()
      .filter((entry) => !activeLoanIds.has(String(entry.bookId)))
      .map((entry) => getBookByBookId(entry.bookId))
      .filter(Boolean);
    const loanCards = loans.length
      ? loans
          .map((loan) => {
            const book = getBookByBookId(loan.bookId);
            if (!book) return "";
            return `
              <article class="account-card">
                <div class="account-card-top">
                  <div>
                    <span class="label">Current loan</span>
                    <h3>${escapeHtml(book.title)}</h3>
                    <p>by ${escapeHtml(book.author)}</p>
                  </div>
                  <span class="pill">Renewals used: ${loan.renewals || 0}/2</span>
                </div>
                <p>Due date: ${formatDate(loan.dueDate)}</p>
                <div class="catalog-actions compact">
                  <a class="ghost-link" href="book.html?id=${encodeURIComponent(book.id)}">View detail</a>
                  <button class="btn-secondary js-renew" data-loan-id="${escapeHtml(loan.loanId)}" ${(loan.renewals || 0) >= 2 ? "disabled" : ""}>Renew</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state small"><p>No active loans right now. Once an admin checks out a title to your account, it will appear here.</p></div>`;

    const reservationCards = reservations.length
      ? reservations
          .map(
            (book) => `
          <article class="account-card compact-card">
            <span class="label">Reserved title</span>
            <h3>${escapeHtml(book.title)}</h3>
            <p>by ${escapeHtml(book.author)}</p>
            <a class="ghost-link" href="book.html?id=${encodeURIComponent(book.id)}">Open title</a>
          </article>
        `
          )
          .join("")
      : `<div class="empty-state small"><p>No reservations yet. Reserve a title from the catalog.</p></div>`;

    accountShell.innerHTML = `
      <section class="account-hero">
        <div>
          <div class="eyebrow">Reader Account</div>
          <h2>Welcome back, ${escapeHtml(user.name)}</h2>
          <p>Your private library dashboard keeps loans, reservations, and account settings in one elegant space.</p>
          <p class="account-subline">Signed in with ${escapeHtml(user.email)}</p>
        </div>
        <div class="account-summary">
          <div class="summary-card">
            <span class="label">Member ID</span>
            <strong>${escapeHtml(user.memberId)}</strong>
          </div>
          <div class="summary-card">
            <span class="label">Loans</span>
            <strong>${loans.length}</strong>
          </div>
          <div class="summary-card">
            <span class="label">Reservations</span>
            <strong>${reservations.length}</strong>
          </div>
        </div>
      </section>

      <section class="account-section">
        <div class="section-heading">
          <div>
            <div class="eyebrow">Renew books</div>
            <h3>Current loans</h3>
          </div>
        </div>
        <div class="account-grid">${loanCards}</div>
      </section>

      <section class="account-section">
        <div class="section-heading">
          <div>
            <div class="eyebrow">Reserved list</div>
            <h3>Books waiting for you</h3>
          </div>
        </div>
        <div class="account-grid two-col">${reservationCards}</div>
      </section>

      <section class="account-section">
        <div class="section-heading">
          <div>
            <div class="eyebrow">Account settings</div>
            <h3>Manage your reader account</h3>
          </div>
        </div>
        <div class="account-grid two-col">
          <article class="account-card compact-card">
            <span class="label">Security</span>
            <h3>Password reset</h3>
            <p>Use the forgot password flow on the login page whenever you want to update your reader password.</p>
            <a class="ghost-link" href="login.html">Open forgot password</a>
          </article>
          <article class="account-card compact-card danger-card">
            <span class="label">Danger zone</span>
            <h3>Delete this account</h3>
            <p>Deleting your account removes your reader profile and clears the related reservations and loan records returned by the backend.</p>
            <button class="btn-secondary danger-button js-delete-current-reader" type="button">Delete reader account</button>
          </article>
        </div>
      </section>
    `;

    $all(".js-renew", accountShell).forEach((button) => {
      button.addEventListener("click", () => renewLoan(button.dataset.loanId));
    });

    const deleteButton = $(".js-delete-current-reader", accountShell);
    if (deleteButton) {
        deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete this reader account? This will also remove your related reservations and active loan records.");
        if (!confirmed) return;
        const result = await deleteReaderAccount(user.id);
        if (!result.ok) {
          toast(result.message);
          return;
        }

        toast("Reader account deleted.");
        updateHeaderUserState();

        setTimeout(() => {
          window.location.href = "login.html";
        }, 250);
      });
    }
  }

  function flattenRecommendationPool(profile) {
    const pool = REC_POOLS[profile] || REC_POOLS.classics || {};
    const ids = [];
    Object.values(pool).forEach((group) => {
      (group || []).forEach((id) => {
        if (!ids.includes(id)) ids.push(id);
      });
    });
    return ids;
  }

function getReaderHistoryIds(user) {
  if (!user || user.role !== "reader") return [];

  const reservationIds = API_USER_RESERVATIONS.map((entry) =>
    String(entry.bookId || entry.book_id)
  );

  const loanIds = API_USER_LOANS.map((entry) =>
    String(entry.bookId || entry.book_id)
  );

  return [...new Set([...reservationIds, ...loanIds])];
}

  function inferRecommendationProfile(seedBooks, searchHistory) {
    const searchable = [
      ...seedBooks.map((book) => `${book.genre} ${book.collection} ${book.title} ${book.description || ""}`),
      ...searchHistory
    ]
      .join(" ")
      .toLowerCase();

    if (/(history|archive|historical|research|monastic|rose|historian)/.test(searchable)) {
      return "history";
    }

    if (/(student|campus|academia|theory|philosophy|scholar|class|study|villains|secret history|stoner)/.test(searchable)) {
      return "student";
    }

    return "classics";
  }

  function buildHistoryPills(context) {
    const pills = [];
    if (context.viewedTitles.length) pills.push(`${context.viewedTitles.length} recently viewed`);
    if (context.readerHistoryTitles.length) pills.push(`${context.readerHistoryTitles.length} account history matches`);
    if (context.searchHistory.length) pills.push(`Searches: ${context.searchHistory.slice(0, 2).join(" · ")}`);
    if (!pills.length) pills.push("Start browsing to personalize this shelf");
    return pills;
  }

  function buildRecommendationContext() {
    const user = getUser();
    const viewedIds = getViewedBooks().map(String).filter(Boolean);
    const viewedTitles = viewedIds.map(getBookById).filter(Boolean);
    const readerHistoryIds = getReaderHistoryIds(user);
    const readerHistoryTitles = readerHistoryIds.map(getBookById).filter(Boolean);
    const searchHistory = getSearchHistory();
    const seedBooks = [];
    [...readerHistoryTitles, ...viewedTitles].forEach((book) => {
      if (book && !seedBooks.some((entry) => entry.id === book.id)) {
        seedBooks.push(book);
      }
    });

    return {
      user,
      viewedIds,
      viewedTitles,
      readerHistoryIds,
      readerHistoryTitles,
      searchHistory,
      seedBooks,
      profile: inferRecommendationProfile(seedBooks, searchHistory)
    };
  }

  function scoreRecommendation(book, context, poolIds) {
    const seedBooks = context.seedBooks;
    const genres = new Set(seedBooks.map((item) => item.genre));
    const collections = new Set(seedBooks.map((item) => item.collection));
    const authors = new Set(seedBooks.map((item) => item.author));
    const formats = new Set(seedBooks.map((item) => item.format));
    const readerHistoryIds = new Set(context.readerHistoryIds);
    const viewedIds = new Set(context.viewedIds);
    const searchTerms = context.searchHistory.map((term) => term.toLowerCase());
    const haystack = [book.title, book.author, book.genre, book.collection, book.description || "", book.blurb || ""]
      .join(" ")
      .toLowerCase();

    let score = 0;
    const reasons = [];

    if (authors.has(book.author)) {
      score += 6;
      reasons.push("By an author already in your history");
    }
    if (genres.has(book.genre)) {
      score += 4;
      reasons.push(
        context.readerHistoryTitles.some((item) => item.genre === book.genre)
          ? "Aligned with your account history"
          : "Similar to books you viewed recently"
      );
    }
    if (collections.has(book.collection)) {
      score += 3;
      reasons.push("From a collection you keep returning to");
    }
    if (formats.has(book.format)) {
      score += 1;
      reasons.push("Matches the format you browse most");
    }
    if (poolIds.includes(book.id)) {
      score += 2;
      reasons.push("Strong fit for your reading profile");
    }

    searchTerms.forEach((term) => {
      if (term.length > 2 && haystack.includes(term)) {
        score += 1;
      }
    });

    if (readerHistoryIds.size) {
      score += 0.3;
    } else if (viewedIds.size) {
      score += 0.15;
    }

    const note =
      reasons[0] ||
      (context.searchHistory.length
        ? "Selected using your recent browsing and search history"
        : "A foundational Nocturne Library pick");

    return { score, note };
  }

  function buildAutomaticRecommendations(limit = 4) {
    const context = buildRecommendationContext();
    const poolIds = flattenRecommendationPool(context.profile);
    const seedIdSet = new Set(context.seedBooks.map((book) => book.id));

    let scored = getAllBooks()
      .filter((book) => !seedIdSet.has(book.id))
      .map((book) => {
        const { score, note } = scoreRecommendation(book, context, poolIds);
        return { book, score, note };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score - a.score) || (b.book.rating - a.book.rating));

    if (!scored.length) {
      scored = flattenRecommendationPool(context.profile)
        .map((id) => getBookById(id))
        .filter(Boolean)
        .map((book, index) => ({
          book,
          score: 10 - index,
          note: index === 0 ? "Signature Nocturne starting point" : "A beautiful place to begin"
        }));
    }

    return {
      context,
      picks: scored.slice(0, limit)
    };
  }

  function renderRecommendationResults() {
    const resultNode = $("#recResults");
    if (!resultNode) return;

    const { picks } = buildAutomaticRecommendations();
    resultNode.innerHTML = picks
      .map((entry) => recommendationCard(entry.book, entry.note))
      .join("");

    attachReserveButtons(resultNode);
    refreshReservationButtons();
  }

function renderRecommendationsPage() {
  const resultNode = $("#recResults");
  if (!resultNode) return;

  const panel = resultNode.parentElement;
  const panelLabel = panel ? panel.querySelector(".label") : null;
  const panelTitle = panel ? panel.querySelector("h4") : null;
  const panelCopy = panel ? panel.querySelector(".account-subline") : null;

  const user = getUser();

  if (!user) {
    if (panelLabel) panelLabel.hidden = true;
    if (panelTitle) panelTitle.hidden = true;
    if (panelCopy) panelCopy.hidden = true;

    resultNode.classList.remove("rec-results");
    resultNode.innerHTML = `
      <div class="empty-state">
        <h3>Please login to view recommendations</h3>
        <p>Personalized recommendations are shown for reader accounts after sign-in.</p>
        <a class="btn" href="login.html">Go to login</a>
      </div>
    `;
    return;
  }

  if (user.role === "admin") {
    if (panelLabel) panelLabel.hidden = true;
    if (panelTitle) panelTitle.hidden = true;
    if (panelCopy) panelCopy.hidden = true;

    resultNode.classList.remove("rec-results");
    resultNode.innerHTML = `
      <div class="empty-state">
        <h3>You are signed in as an admin</h3>
        <p>Use the admin desk to add books, check titles in and out, view borrower records, and manage accounts.</p>
        <a class="btn" href="admin.html">Open admin desk</a>
      </div>
    `;
    return;
  }

  if (panelLabel) panelLabel.hidden = false;
  if (panelTitle) panelTitle.hidden = false;
  if (panelCopy) panelCopy.hidden = false;

  resultNode.classList.add("rec-results");
  renderRecommendationResults();
}

  function renderSuggestionListPreview() {
    const node = $("#suggestionPreview");
    if (!node) return;
    const suggestions = getSuggestions().slice(0, 3);
    node.innerHTML = suggestions
      .map(
        (item) => `
      <article class="mini-suggestion">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.author)}</span>
        <p>${escapeHtml(item.reason)}</p>
      </article>
    `
      )
      .join("");
  }

  function showAuthView(viewName) {
    $all(".auth-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.authView === viewName);
    });

    $all(".auth-view").forEach((panel) => {
      const isActive = panel.dataset.authPanel === viewName;
      panel.hidden = !isActive;
      panel.classList.toggle("active", isActive);
    });
  }

  function handleLoginPage() {
  if (!$('[data-auth-panel="signin"]')) return;

  $all(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => showAuthView(button.dataset.authView));
  });

  const signInForm = $("#signInForm");
  if (signInForm) {
    signInForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const role = ($('input[name="loginRole"]:checked') || {}).value || "reader";
      const email = $("#loginEmail").value;
      const password = $("#loginPassword").value;

      try {
        const result = await loginApi({ email, password, role });
        const sessionUser = buildSessionFromApiUser(result.user);

        setUser(sessionUser);

        toast(role === "admin" ? "Admin access granted." : "Welcome back to Nocturne Library.");
        updateHeaderUserState();

        setTimeout(() => {
          window.location.href = role === "admin" ? "admin.html" : "account.html";
        }, 250);
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const readerSignupForm = $("#readerSignupForm");
  if (readerSignupForm) {
    readerSignupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = $("#readerName").value;
      const email = $("#readerEmail").value;
      const password = $("#readerPassword").value;
      const confirm = $("#readerPasswordConfirm").value;

      if (password !== confirm) {
        toast("Reader passwords do not match.");
        return;
      }

      try {
        const result = await registerApi({
          name,
          email,
          password,
          role: "reader"
        });

        const sessionUser = buildSessionFromApiUser(result.user);

        setUser(sessionUser);

        toast("Reader account created.");
        updateHeaderUserState();

        setTimeout(() => {
          window.location.href = "account.html";
        }, 250);
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const adminSignupForm = $("#adminSignupForm");
  if (adminSignupForm) {
    adminSignupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = $("#adminName").value;
      const email = $("#adminEmail").value;
      const password = $("#adminPassword").value;
      const confirm = $("#adminPasswordConfirm").value;
      const key = $("#adminCreationKey").value;

      if (password !== confirm) {
        toast("Admin passwords do not match.");
        return;
      }

      try {
        const result = await registerApi({
          name,
          email,
          password,
          role: "admin",
          adminKey: key
        });

        const sessionUser = buildSessionFromApiUser(result.user);

        setUser(sessionUser);

        toast("Admin account created.");
        updateHeaderUserState();

        setTimeout(() => {
          window.location.href = "admin.html";
        }, 250);
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const forgotPasswordForm = $("#forgotPasswordForm");
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const role = ($('input[name="resetRole"]:checked') || {}).value || "reader";
      const email = $("#resetEmail").value;
      const password = $("#resetPassword").value;
      const confirm = $("#resetPasswordConfirm").value;

      if (password !== confirm) {
        toast("The new passwords do not match.");
        return;
      }

      try {
        await resetPasswordApi({ email, password, role });

        forgotPasswordForm.reset();
        toast("Password updated. You can sign in now.");
        showAuthView("signin");

        const roleField = $all('input[name="loginRole"]');
        roleField.forEach((input) => {
          input.checked = input.value === role;
        });

        $("#loginEmail").value = normalizeEmail(email);
        $("#loginPassword").value = "";
      } catch (error) {
        toast(error.message);
      }
    });
  }
}


  function renderAdminPage() {
    const shell = $("#adminShell");
    if (!shell) return;

    const user = getUser();
    if (!user || user.role !== "admin") {
      shell.innerHTML = `
        <div class="empty-state">
          <h3>Admin access only</h3>
          <p>Please sign in with an admin email and password to manage books, circulation, and accounts.</p>
          <a class="btn" href="login.html">Go to login</a>
        </div>
      `;
      return;
    }

    const books = getAllBooks();
    const readers = API_READERS;
    const admins = API_ADMINS;
    const openLoans = getOpenCirculation();
    const reservations = getActiveReservations();
    const availableBooks = books.filter((book) => book.available);

    const checkoutOptions = availableBooks.length
  ? availableBooks
      .map(
        (book) => `<option value="${escapeHtml(String(book.book_id || ""))}">${escapeHtml(book.title)} — ${escapeHtml(book.author)}</option>`
      )
      .join("")
  : `<option value="">No available titles</option>`;

    const readerOptions = readers.length
      ? readers
          .map(
            (reader) => `<option value="${escapeHtml(reader.id)}">${escapeHtml(reader.name)} — ${escapeHtml(reader.email)} (${escapeHtml(reader.memberId)})</option>`
          )
          .join("")
      : `<option value="">No reader accounts yet</option>`;

    const openLoanCards = openLoans.length
      ? openLoans
          .map((loan) => {
            const book = getBookByBookId(loan.bookId);
            if (!book) return "";
            return `
              <article class="account-card">
                <div class="loan-card-head">
                  <div>
                    <span class="label">Open circulation record</span>
                    <h3>${escapeHtml(book.title)}</h3>
                    <p>by ${escapeHtml(book.author)}</p>
                  </div>
                  <span class="pill">Due ${formatDate(loan.dueDate)}</span>
                </div>
                <div class="loan-detail-list">
                  <div><strong>Borrower:</strong> ${escapeHtml(loan.borrowerName)}</div>
                  <div><strong>Email:</strong> ${escapeHtml(loan.borrowerEmail)}</div>
                  <div><strong>Member ID:</strong> ${escapeHtml(loan.memberId)}</div>
                  <div><strong>Checked out:</strong> ${formatDate(loan.checkedOutAt)}</div>
                </div>
                <div class="split-actions">
                  <a class="ghost-link" href="book.html?id=${encodeURIComponent(book.id)}">Open title</a>
                  <button class="btn-secondary js-return-loan" data-loan-id="${escapeHtml(loan.loanId)}">Mark returned</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state small admin-empty"><p>No books are currently checked out.</p></div>`;

    const managementCards = books
      .map(
        (book) => `
      <article class="account-card compact-card">
        <div class="management-head">
          <div>
            <span class="label">${escapeHtml(book.collection)}</span>
            <h3>${escapeHtml(book.title)}</h3>
            <p>by ${escapeHtml(book.author)}</p>
          </div>
          <span class="pill">${book.borrower ? "Checked out" : book.reservation ? "Reserved" : "Available"}</span>
        </div>
        <div class="meta-list">
          <div><strong>Format:</strong> ${escapeHtml(book.format)}</div>
          <div><strong>Genre:</strong> ${escapeHtml(book.genre)}</div>
          ${
            book.borrower
              ? `<div><strong>Holder:</strong> ${escapeHtml(book.borrower.name)} · ${escapeHtml(book.borrower.email)}</div>
                 <div><strong>Due:</strong> ${formatDate(book.borrower.dueDate)}</div>`
              : book.reservation
              ? `<div><strong>Reserved for:</strong> ${escapeHtml(book.reservation.name)} · ${escapeHtml(book.reservation.email)}</div>
                 <div><strong>Reserved on:</strong> ${formatDate(book.reservation.reservedAt)}</div>`
              : `<div><strong>Status:</strong> On shelf and ready for checkout</div>`
          }
        </div>
      </article>
    `
      )
      .join("");

    const readerCards = readers.length
      ? readers
          .map(
            (reader) => `
        <article class="account-card compact-card directory-card">
          <span class="label">Reader account</span>
          <h3>${escapeHtml(reader.name)}</h3>
          <p>${escapeHtml(reader.email)}</p>
          <p class="field-note">${escapeHtml(reader.memberId)}</p>
          <div class="catalog-actions compact">
            <button class="btn-secondary danger-button js-delete-reader" data-reader-id="${escapeHtml(reader.id)}" type="button">Delete reader</button>
          </div>
        </article>
      `
          )
          .join("")
      : `<div class="empty-state small"><p>No reader accounts have been created yet.</p></div>`;

    const reservationCards = reservations.length
      ? reservations
          .map((reservation) => {
            const book = getBookByBookId(reservation.bookId);
            if (!book) return "";
            return `
              <article class="account-card compact-card">
                <span class="label">Active reservation</span>
                <h3>${escapeHtml(book.title)}</h3>
                <p>by ${escapeHtml(book.author)}</p>
                <p>${escapeHtml(reservation.reserverName)} · ${escapeHtml(reservation.reserverEmail)}</p>
                <p class="field-note">${escapeHtml(reservation.memberId)} · Reserved ${formatDate(reservation.reservationDate)}</p>
                <div class="catalog-actions compact">
                  <a class="ghost-link" href="book.html?id=${encodeURIComponent(book.id)}">Open title</a>
                  <button class="btn js-checkout-reservation" data-book-id="${escapeHtml(String(reservation.bookId))}" data-reader-id="${escapeHtml(String(reservation.userId))}" type="button">Check out</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state small admin-empty"><p>No active reservations right now.</p></div>`;

    const adminCards = admins.length
      ? admins
          .map(
            (admin) => `
        <article class="account-card compact-card directory-card ${admin.id === user.id ? "current-admin-card" : ""}">
          <span class="label">Admin account</span>
          <h3>${escapeHtml(admin.name)}</h3>
          <p>${escapeHtml(admin.email)}</p>
          <p class="field-note">${escapeHtml(admin.staffId)}${admin.id === user.id ? " · current session" : ""}</p>
          <div class="catalog-actions compact">
            <button class="btn-secondary danger-button js-delete-admin" data-admin-id="${escapeHtml(admin.id)}" type="button">Delete admin</button>
          </div>
        </article>
      `
          )
          .join("")
      : `<div class="empty-state small"><p>No admin accounts remain.</p></div>`;

    shell.innerHTML = `
      <section class="account-hero">
        <div>
          <div class="eyebrow">Admin desk</div>
          <h2>Circulation, catalog, and account records</h2>
          <p>Use this admin desk to add books, check titles in and out, view who currently has a book, and manage reader and admin accounts through the backend and database.</p>
          <p class="account-subline">Signed in as ${escapeHtml(user.name)} · ${escapeHtml(user.email)}</p>
        </div>
        <div class="account-summary">
          <div class="summary-card">
            <span class="label">Catalog size</span>
            <strong>${books.length}</strong>
          </div>
          <div class="summary-card">
            <span class="label">Checked out</span>
            <strong>${openLoans.length}</strong>
          </div>
          <div class="summary-card">
            <span class="label">Reserved</span>
            <strong>${reservations.length}</strong>
          </div>
          <div class="summary-card">
            <span class="label">Accounts</span>
            <strong>${readers.length + admins.length}</strong>
          </div>
        </div>
      </section>

      <section class="admin-layout">
        <div class="admin-grid">
          <article class="admin-panel">
            <span class="label">Catalog management</span>
            <h3>Add a new book</h3>
            <p>This creates a real backend record and saves it to the database.</p>
            <form id="adminAddBookForm" class="admin-form two-col">
              <div class="form-group">
                <label for="adminBookTitle">Title</label>
                <input id="adminBookTitle" required>
              </div>
              <div class="form-group">
                <label for="adminBookAuthor">Author</label>
                <input id="adminBookAuthor" required>
              </div>
              <div class="form-group">
                <label for="adminBookCollection">Collection</label>
                <input id="adminBookCollection" value="Curator's Cabinet">
              </div>
              <div class="form-group">
                <label for="adminBookGenre">Genre</label>
                <input id="adminBookGenre" value="Dark Academia">
              </div>
              <div class="form-group">
                <label for="adminBookFormat">Format</label>
                <select id="adminBookFormat">
                  <option>Hardcover</option>
                  <option>Paperback</option>
                  <option>Journal</option>
                  <option>Archive Copy</option>
                </select>
              </div>
              <div class="form-group">
                <label for="adminBookYear">Publication year</label>
                <input id="adminBookYear" type="number" value="2026">
              </div>
              <div class="form-group">
                <label for="adminBookPages">Pages</label>
                <input id="adminBookPages" type="number" value="320">
              </div>
              <div class="form-group">
                <label for="adminBookCover">Cover image URL</label>
                <input id="adminBookCover" placeholder="Optional image URL">
              </div>
              <div class="form-group full-width">
                <label for="adminBookBlurb">Short blurb</label>
                <textarea id="adminBookBlurb" required></textarea>
              </div>
              <div class="form-group full-width">
                <label for="adminBookDescription">Description</label>
                <textarea id="adminBookDescription" required></textarea>
              </div>
              <div class="full-width split-actions">
                <button class="btn" type="submit">Add book to catalog</button>
                <span class="inline-stat">Saved through backend API</span>
              </div>
            </form>
          </article>

          <article class="admin-panel">
            <span class="label">Circulation desk</span>
            <h3>Check out a book</h3>
            <p>Choose an available title and assign it to an existing reader account so the borrower can be tracked cleanly.</p>
            <form id="adminCheckoutForm" class="admin-form">
              <div class="form-group">
                <label for="checkoutBook">Available title</label>
                <select id="checkoutBook" ${availableBooks.length ? "" : "disabled"}>${checkoutOptions}</select>
              </div>
              <div class="form-group">
                <label for="checkoutReader">Reader account</label>
                <select id="checkoutReader" ${readers.length ? "" : "disabled"}>${readerOptions}</select>
              </div>
              <div class="form-group">
                <label for="checkoutDays">Loan period (days)</label>
                <select id="checkoutDays">
                  <option value="14">14 days</option>
                  <option value="21">21 days</option>
                  <option value="28">28 days</option>
                </select>
              </div>
              <div class="split-actions">
                <button class="btn" type="submit" ${(availableBooks.length && readers.length) ? "" : "disabled"}>Check out book</button>
                <span class="inline-stat">${availableBooks.length} titles ready · ${readers.length} reader accounts</span>
              </div>
            </form>

            <div class="notice-banner">
              Admin accounts can be created from the login page with the admin creation key. Reader and admin accounts can both be deleted below.
            </div>
          </article>
        </div>

        <article class="admin-panel">
          <span class="label">Live status</span>
          <h3>Books currently checked out</h3>
          <div class="loans-grid">${openLoanCards}</div>
        </article>

        <article class="admin-panel">
          <span class="label">Reservation queue</span>
          <h3>Reader reservations</h3>
          <div class="loans-grid">${reservationCards}</div>
        </article>

        <article class="admin-panel">
          <span class="label">Borrower visibility</span>
          <h3>Catalog status and current holder</h3>
          <div class="management-grid">${managementCards}</div>
        </article>

        <article class="admin-panel">
          <span class="label">Account directory</span>
          <h3>Reader and admin accounts</h3>
          <div class="account-registry-grid">
            <div>
              <div class="section-heading section-heading-tight">
                <div>
                  <div class="eyebrow">Readers</div>
                  <h3>${readers.length} reader accounts</h3>
                </div>
              </div>
              <div class="management-grid">${readerCards}</div>
            </div>
            <div>
              <div class="section-heading section-heading-tight">
                <div>
                  <div class="eyebrow">Admins</div>
                  <h3>${admins.length} admin accounts</h3>
                </div>
              </div>
              <div class="management-grid">${adminCards}</div>
            </div>
          </div>
        </article>

        <article class="admin-panel">
          <span class="label">Current admin</span>
          <h3>Account settings</h3>
          <p class="field-note">You can reset passwords from the login page or delete this admin account here if needed.</p>
          <div class="split-actions">
            <a class="ghost-link" href="login.html">Open forgot password</a>
            <button class="btn-secondary danger-button js-delete-current-admin" type="button">Delete current admin account</button>
          </div>
        </article>
      </section>
    `;

const addForm = $("#adminAddBookForm");
if (addForm) {
  addForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const ok = await addBook({
      title: $("#adminBookTitle").value.trim(),
      author: $("#adminBookAuthor").value.trim(),
      collection: $("#adminBookCollection").value.trim(),
      genre: $("#adminBookGenre").value.trim(),
      format: $("#adminBookFormat").value,
      year: $("#adminBookYear").value,
      pages: $("#adminBookPages").value,
      cover: $("#adminBookCover").value.trim(),
      blurb: $("#adminBookBlurb").value.trim(),
      description: $("#adminBookDescription").value.trim(),
      accent: "gold"
    });

    if (!ok) return;

    addForm.reset();
    $("#adminBookCollection").value = "Curator's Cabinet";
    $("#adminBookGenre").value = "Dark Academia";
    $("#adminBookFormat").value = "Hardcover";
    $("#adminBookYear").value = "2026";
    $("#adminBookPages").value = "320";
  });
}

    const checkoutForm = $("#adminCheckoutForm");
    if (checkoutForm) {
      checkoutForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const bookId = $("#checkoutBook").value;
        const readerId = $("#checkoutReader").value;

        if (!bookId || !readerId) {
          toast("Please choose both a title and a reader account.");
          return;
        }

        const ok = await checkOutBook(bookId, readerId, $("#checkoutDays").value);
        if (!ok) return;
        checkoutForm.reset();
        $("#checkoutDays").value = "14";
      });
    }

    $all(".js-return-loan", shell).forEach((button) => {
      button.addEventListener("click", () => returnLoan(button.dataset.loanId));
    });

    $all(".js-checkout-reservation", shell).forEach((button) => {
      button.addEventListener("click", async () => {
        const bookId = button.dataset.bookId;
        const readerId = button.dataset.readerId;

        if (!bookId || !readerId) {
          toast("This reservation is missing its book or reader reference.");
          return;
        }

        const ok = await checkOutBook(bookId, readerId, 14);
        if (!ok) return;
      });
    });

    $all(".js-delete-reader", shell).forEach((button) => {
      button.addEventListener("click", async () => {
        const reader = findReaderById(button.dataset.readerId);
        if (!reader) return;

        const confirmed = window.confirm(`Delete reader account for ${reader.name}?`);
        if (!confirmed) return;

        const result = await deleteReaderAccount(reader.id);

        if (!result.ok) {
          toast(result.message);
          return;
        }

        toast("Reader account deleted.");
        renderAdminPage();
        renderCatalogPage();
        renderBookDetailPage();
        renderAccountPage();

        if (result.loggedOut) {
          setTimeout(() => {
            window.location.href = "login.html";
          }, 250);
        }
      });
    });

    $all(".js-delete-admin", shell).forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete this admin account?");
        if (!confirmed) return;

        const result = await deleteAdminAccount(button.dataset.adminId);

        if (!result.ok) {
          toast(result.message);
          return;
        }

        toast("Admin account deleted.");
        updateHeaderUserState();
        renderAdminPage();

        if (result.loggedOut) {
          setTimeout(() => {
            window.location.href = "login.html";
          }, 250);
        }
      });
    });

    const deleteCurrentAdmin = $(".js-delete-current-admin", shell);
    if (deleteCurrentAdmin) {
      deleteCurrentAdmin.addEventListener("click", async () => {
        const confirmed = window.confirm("Delete the current admin account?");
        if (!confirmed) return;

        const result = await deleteAdminAccount(user.id);

        if (!result.ok) {
          toast(result.message);
          return;
        }

        toast("Admin account deleted.");
        updateHeaderUserState();

        setTimeout(() => {
          window.location.href = "login.html";
        }, 250);
      });
    }
  }

  function activateNav() {
    const page = document.body.dataset.page;
    $all("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) {
        link.classList.add("active-link");
      }
    });
  }

async function init() {
  setYear();
  activateNav();
  handleHomepageSearch();
  handleLoginPage();

  await fetchCurrentUserFromApi();
  updateHeaderUserState();

  await fetchBooksFromApi();
  await fetchOpenLoansFromApi();
  await fetchActiveReservationsFromApi();

  const user = getUser();
  if (user && user.role === "reader") {
    await fetchUserReservationsFromApi();
    await fetchUserLoansFromApi();
  }

  if (user && user.role === "admin") {
    await fetchReadersFromApi();
    await fetchAdminsFromApi();
  }

  renderTopPicks();
  renderCatalogPage();
  renderBookDetailPage();
  renderAccountPage();
  renderRecommendationsPage();
  renderAdminPage();
  refreshReservationButtons();
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
})();
