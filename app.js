let products = Array.isArray(window.NEXUS_PRODUCTS) ? window.NEXUS_PRODUCTS : [];
let currentUser = null;
let apiAvailable = false;

const storage = createStorage();
let cart = readJson("nexusCart", {});
const pagePrefix = location.pathname.includes("/articles/") ? "../" : "";

const categoryMeta = {
  "sks-komplekt": {
    description: "Кабели, патч-панели, keystone-модули, патч-корды и 19-дюймовые компоненты СКС.",
    accent: "pill-blue",
  },
  "lyuchki-i-napolnye-korobki": {
    description: "Напольные лючки и коробки как часть инфраструктурной линейки Nexus.",
    accent: "pill-amber",
  },
  "rozetki-i-moduli": {
    description: "Силовые и слаботочные модули для единой инженерной системы объекта.",
    accent: "pill-green",
  },
};

const state = {
  search: "",
  category: new URLSearchParams(location.search).get("category") || "all",
  subcategory: "all",
  status: "all",
  unit: "all",
};

function pageHref(href) {
  if (/^(https?:|mailto:|tel:|#|\.\.\/)/.test(href)) return href;
  return `${pagePrefix}${href}`;
}

const els = {
  categoryGrid: document.querySelector("#categoryGrid"),
  popularProducts: document.querySelector("#popularProducts"),
  relatedProducts: document.querySelector("#relatedProducts"),
  productGrid: document.querySelector("#productGrid"),
  productPage: document.querySelector("#productPage"),
  catalogTitle: document.querySelector("#catalog-title"),
  catalogSummary: document.querySelector("#catalogSummary"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  subcategoryFilter: document.querySelector("#subcategoryFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  unitFilter: document.querySelector("#unitFilter"),
  cartItems: document.querySelector("#cartItems"),
  toast: document.querySelector("#toast"),
  leadForm: document.querySelector("#leadForm"),
  contactForm: document.querySelector("#contactForm"),
  partnerForm: document.querySelector("#partnerForm"),
  loginForm: document.querySelector("#loginForm"),
  partnerRegisterForm: document.querySelector("#partnerRegisterForm"),
  clearCartButton: document.querySelector("#clearCartButton"),
  menuToggle: document.querySelector(".menu-toggle"),
  mainNav: document.querySelector(".main-nav"),
  adminProductsCount: document.querySelector("#adminProductsCount"),
  adminLeadsCount: document.querySelector("#adminLeadsCount"),
  adminWorkspace: document.querySelector("#adminWorkspace"),
  accountPanel: document.querySelector("#accountPanel"),
  bonusShopPage: document.querySelector("#bonusShopPage"),
  productsStat: document.querySelector("[data-stat='products']"),
};

init();

async function init() {
  ensurePersistentNavigation();
  bindEvents();
  markActiveNav();
  await loadSession();
  await loadProducts();
  renderAll();
}

function bindEvents() {
  els.searchInput?.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProducts();
  });

  els.categoryFilter?.addEventListener("change", (event) => {
    state.category = event.target.value;
    if (!subcategoryOptions().some((option) => option.value === state.subcategory)) state.subcategory = "all";
    renderSubcategoryOptions();
    renderProducts();
  });

  els.subcategoryFilter?.addEventListener("change", (event) => {
    state.subcategory = event.target.value;
    renderProducts();
  });

  els.statusFilter?.addEventListener("change", (event) => {
    state.status = event.target.value;
    renderProducts();
  });

  els.unitFilter?.addEventListener("change", (event) => {
    state.unit = event.target.value;
    renderProducts();
  });

  document.addEventListener("click", async (event) => {
    const addButton = event.target.closest("[data-add]");
    const cartAction = event.target.closest("[data-cart-action]");
    const logoutButton = event.target.closest("[data-logout]");
    const approveButton = event.target.closest("[data-approve-user]");
    const redeemButton = event.target.closest("[data-redeem-ncoin]");
    const adminNcoinButton = event.target.closest("[data-ncoin-admin-action]");
    const shopToggleButton = event.target.closest("[data-toggle-bonus-item]");

    if (addButton) addToCart(Number(addButton.dataset.add));
    if (cartAction) handleCartAction(cartAction);
    if (logoutButton) await logout();
    if (approveButton) await approveUser(approveButton.dataset.approveUser);
    if (redeemButton) await redeemNcoin(redeemButton.dataset.redeemNcoin);
    if (adminNcoinButton) await handleAdminNcoinAction(adminNcoinButton);
    if (shopToggleButton) await toggleBonusItem(shopToggleButton.dataset.toggleBonusItem);
  });

  document.addEventListener("input", (event) => {
    const qtyInput = event.target.closest("[data-cart-qty]");
    if (!qtyInput) return;
    updateCartQty(Number(qtyInput.dataset.cartQty), Number(qtyInput.value));
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.matches("#ncoinPaidOrderForm")) await submitNcoinPaidOrder(event);
    if (event.target.matches("#bonusItemForm")) await submitBonusItem(event);
  });

  els.clearCartButton?.addEventListener("click", () => {
    cart = {};
    persistCart();
    renderCart();
    showToast("Заявка очищена");
  });

  els.leadForm?.addEventListener("submit", submitLead);
  els.contactForm?.addEventListener("submit", submitSimpleForm);
  els.partnerForm?.addEventListener("submit", submitSimpleForm);
  els.loginForm?.addEventListener("submit", submitLogin);
  els.partnerRegisterForm?.addEventListener("submit", submitPartnerRegister);
  document.querySelector("#ncoinPaidOrderForm")?.addEventListener("submit", submitNcoinPaidOrder);
  document.querySelector("#bonusItemForm")?.addEventListener("submit", submitBonusItem);

  els.menuToggle?.addEventListener("click", () => {
    const isOpen = els.mainNav?.classList.toggle("is-open");
    els.menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
  });

  els.mainNav?.addEventListener("click", () => {
    els.mainNav.classList.remove("is-open");
    els.menuToggle?.setAttribute("aria-expanded", "false");
  });
}

async function loadSession() {
  try {
    const response = await apiFetch("/api/session");
    apiAvailable = true;
    currentUser = response.user;
  } catch {
    apiAvailable = false;
    currentUser = null;
  }
}

async function loadProducts() {
  if (!apiAvailable) return;
  try {
    const response = await apiFetch("/api/products");
    products = response.products;
    currentUser = response.user;
  } catch {
    apiAvailable = false;
  }
}

function renderAll() {
  renderAuthPanel();
  if (els.categoryGrid) renderCategories();
  if (els.categoryFilter) renderFilters();
  if (els.popularProducts) renderPopular();
  if (els.productGrid) renderProducts();
  if (els.productPage) renderProductPage();
  renderCart();
  updateAdminCounts();
  renderAccount();
  renderBonusShopPage();
  renderAdmin();
  injectProductStructuredData();
  if (els.productsStat) els.productsStat.textContent = products.length;
}

function renderAuthPanel() {
  document.querySelectorAll(".auth-panel").forEach((item) => item.remove());
  const header = document.querySelector(".site-header");
  if (!header) return;

  const panel = document.createElement("div");
  panel.id = "authPanel";
  panel.className = currentUser ? "auth-panel is-authenticated" : "auth-panel is-guest";
  if (!currentUser) {
    panel.innerHTML = `
      <a class="text-link" href="${pageHref("login.html")}">Войти</a>
      <a class="button button-secondary auth-register" href="${pageHref("partner-register.html")}">Стать партнёром</a>
    `;
  } else {
    const status = userStatusLabel(currentUser);
    const role = currentUser.role === "admin" ? "Админ" : "Партнёр";
    panel.innerHTML = `
      <span class="pill auth-role-pill ${currentUser.status === "active" ? "pill-green" : "pill-amber"}">${role}: ${status}</span>
      <a class="text-link auth-company" href="${pageHref(currentUser.role === "admin" ? "admin.html" : "account.html")}">${escapeHtml(currentUser.company || currentUser.name)}</a>
      <button class="text-button auth-logout" type="button" data-logout>Выйти</button>
    `;
  }
  header.appendChild(panel);
  renderMobileQuickNav(header);
}

function ensurePersistentNavigation() {
  const nav = document.querySelector(".main-nav");
  if (!nav) return;

  const links = [...nav.querySelectorAll("a")];
  const hasBonus = links.some((link) => (link.getAttribute("href") || "").endsWith("bonus.html"));
  if (!hasBonus) {
    const bonusLink = document.createElement("a");
    bonusLink.href = pageHref("bonus.html");
    bonusLink.textContent = "Ncoin";
    const contactsLink = links.find((link) => (link.getAttribute("href") || "").endsWith("contacts.html"));
    nav.insertBefore(bonusLink, contactsLink || null);
  }
}

function renderMobileQuickNav(header) {
  header.querySelector(".mobile-quick-nav")?.remove();

  const quickNav = document.createElement("nav");
  quickNav.className = "mobile-quick-nav";
  quickNav.setAttribute("aria-label", "Быстрые действия");

  const accountHref = currentUser ? (currentUser.role === "admin" ? "admin.html" : "account.html") : "login.html";
  const accountLabel = currentUser ? "Кабинет" : "Вход";
  const fourthHref = currentUser ? "bonus.html" : "partner-register.html";
  const fourthLabel = currentUser ? "Ncoin" : "Партнёр";

  quickNav.innerHTML = `
    <a href="${pageHref("catalog.html")}">Каталог</a>
    <a href="${pageHref("request.html")}">КП <span class="cart-count">${cartTotal() || ""}</span></a>
    <a href="${pageHref(accountHref)}">${accountLabel}</a>
    <a href="${pageHref(fourthHref)}">${fourthLabel}</a>
  `;

  const current = location.pathname.split("/").pop() || "index.html";
  quickNav.querySelectorAll("a").forEach((link) => {
    if ((link.getAttribute("href") || "").endsWith(current)) link.classList.add("is-active");
  });

  header.appendChild(quickNav);
}

function renderCategories() {
  const groups = groupBy(products, "categorySlug");
  els.categoryGrid.innerHTML = Object.entries(groups)
    .map(([slug, items]) => {
      const first = items[0];
      const subgroups = new Set(items.map((product) => product.subgroup));
      const available = items.filter((product) => getAvailability(product) === "В наличии").length;
      const meta = categoryMeta[slug] || {};
      return `
        <article class="category-card">
          <img src="${first.image}" alt="${escapeHtml(first.group)}" />
          <div class="category-card-content">
            <div class="category-meta">
              <span class="pill ${meta.accent || ""}">${items.length} поз.</span>
              <span class="pill">${subgroups.size} подкатег.</span>
              <span class="pill">${available} в наличии</span>
            </div>
            <h3>${escapeHtml(first.group)}</h3>
            <p>${escapeHtml(meta.description || "Категория каталога Nexus.")}</p>
            <a class="button button-secondary" href="catalog.html?category=${slug}">Открыть категорию</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderFilters() {
  const categoryOptions = uniqueOptions(products, "categorySlug", (product) => product.group);
  const unitOptions = uniqueOptions(products, "unit", (product) => product.unit);
  setOptions(els.categoryFilter, [{ value: "all", label: "Все категории" }, ...categoryOptions]);
  setOptions(els.statusFilter, [
    { value: "all", label: "Все статусы" },
    { value: "В наличии", label: "В наличии" },
    { value: "Мало", label: "Мало" },
    { value: "Под заказ", label: "Под заказ" },
  ]);
  setOptions(els.unitFilter, [{ value: "all", label: "Все единицы" }, ...unitOptions]);
  els.categoryFilter.value = state.category;
  renderSubcategoryOptions();
}

function renderSubcategoryOptions() {
  setOptions(els.subcategoryFilter, [{ value: "all", label: "Все подкатегории" }, ...subcategoryOptions()]);
  els.subcategoryFilter.value = state.subcategory;
}

function subcategoryOptions() {
  const scoped = state.category === "all" ? products : products.filter((product) => product.categorySlug === state.category);
  return uniqueOptions(scoped, "subcategorySlug", (product) => product.subgroup);
}

function renderPopular() {
  const popular = products.filter((product) => product.popular).slice(0, 4);
  els.popularProducts.innerHTML = popular.map(renderProductCard).join("");
}

function renderProducts() {
  const filtered = getFilteredProducts();
  if (els.catalogTitle) {
    els.catalogTitle.textContent = catalogModeTitle();
  }

  els.productGrid.innerHTML = filtered.length
    ? filtered.map(renderProductCard).join("")
    : `<div class="empty-state">По выбранным фильтрам товаров не найдено. Попробуйте изменить запрос или категорию.</div>`;

  const inStock = filtered.filter((product) => getAvailability(product) === "В наличии").length;
  const lowStock = filtered.filter((product) => getAvailability(product) === "Мало").length;
  const byRequest = filtered.length - inStock - lowStock;
  const priceLabel = canSeeCommercialData() ? `Цены: ${priceGroupLabel(currentUser.priceGroup)}` : "Цены скрыты до входа";
  els.catalogSummary.innerHTML = `
    <span class="pill pill-blue">Найдено: ${filtered.length}</span>
    <span class="pill pill-green">В наличии: ${inStock}</span>
    ${canSeeCommercialData() ? `<span class="pill pill-amber">Мало: ${lowStock}</span>` : ""}
    <span class="pill">${byRequest > 0 ? `Под заказ: ${byRequest}` : "Под заказ: 0"}</span>
    <span class="pill">${priceLabel}</span>
  `;
}

function catalogModeTitle() {
  if (canSeeCommercialData()) return "Партнёрские цены и остатки";
  if (currentUser?.status === "pending") return "Доступ на модерации";
  return "Цена по запросу";
}

function renderProductCard(product) {
  const status = getAvailability(product);
  const statusClass = status === "В наличии" ? "pill-green" : "pill-amber";
  return `
    <article class="product-card" data-product="${product.id}">
      <div class="product-image">
        <img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span class="pill">${escapeHtml(product.group)}</span>
          <span class="pill ${statusClass}">${status}</span>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-spec">${escapeHtml(product.specification)}</p>
        ${commercialBlock(product)}
        <div class="product-actions">
          <button class="button button-primary" type="button" data-add="${product.id}">Добавить</button>
          <a class="button button-secondary" href="product.html?id=${product.id}">Подробнее</a>
        </div>
      </div>
    </article>
  `;
}

function commercialBlock(product) {
  if (product.price) {
    return `
      <div class="commercial-box is-visible">
        <strong>${formatKzt(product.price)} / ${escapeHtml(product.unit)}</strong>
        <span>Остаток: ${formatAmount(product.stockTotal)} ${escapeHtml(product.unit)}</span>
        <small>${priceGroupLabel(product.priceGroup)} · MOQ ${formatAmount(product.moq)} ${escapeHtml(product.unit)}</small>
      </div>
    `;
  }
  const message = currentUser?.status === "pending" ? "Цены и остатки откроются после подтверждения" : "Войдите, чтобы увидеть цену и остаток";
  return `
    <div class="commercial-box">
      <strong>Цена по запросу</strong>
      <span>${message}</span>
      <small>MOQ ${formatAmount(product.moq)} ${escapeHtml(product.unit)}</small>
    </div>
  `;
}

function renderProductPage() {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get("id"));
  const slug = params.get("slug");
  const product = products.find((item) => item.id === id || item.slug === slug) || products[0];
  const status = getAvailability(product);
  const rows = buildCharacteristics(product);
  document.title = `${product.name} - Nexus`;
  els.productPage.innerHTML = `
    <article class="product-detail product-detail-page">
      <div class="detail-media">
        <img src="${product.image}" alt="${escapeHtml(product.name)}" />
      </div>
      <div class="detail-copy">
        <div class="product-meta">
          <span class="pill">${escapeHtml(product.group)}</span>
          <span class="pill">${escapeHtml(product.subgroup)}</span>
          <span class="pill ${status === "В наличии" ? "pill-green" : "pill-amber"}">${status}</span>
        </div>
        <h1 class="detail-title">${escapeHtml(product.name)}</h1>
        <p>${escapeHtml(product.specification)}. Позиция входит в продуктовую линейку Nexus для СКС и инженерной инфраструктуры объекта.</p>
        ${commercialBlock(product)}
        ${warehouseBlock(product)}
        <div class="dialog-actions">
          <button class="button button-primary" type="button" data-add="${product.id}">Добавить в заявку</button>
          <a class="button button-secondary" href="request.html">Получить КП</a>
          ${!canSeeCommercialData() ? `<a class="button button-ghost" href="login.html">Войти для цены</a>` : ""}
        </div>
        <table class="spec-table"><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>
      </div>
    </article>
  `;

  if (els.relatedProducts) {
    els.relatedProducts.innerHTML = products
      .filter((item) => item.categorySlug === product.categorySlug && item.id !== product.id)
      .slice(0, 3)
      .map(renderProductCard)
      .join("");
  }
}

function warehouseBlock(product) {
  if (!product.stock) return "";
  return `
    <div class="stock-grid">
      <div><span>Склад Алматы</span><strong>${formatAmount(product.stock.almaty)} ${escapeHtml(product.unit)}</strong></div>
      <div><span>Склад Астана</span><strong>${formatAmount(product.stock.astana)} ${escapeHtml(product.unit)}</strong></div>
    </div>
  `;
}

function getFilteredProducts() {
  return products.filter((product) => {
    const haystack = [product.name, product.article, product.group, product.subgroup, product.specification, product.brand]
      .join(" ")
      .toLowerCase();

    return (
      (!state.search || haystack.includes(state.search)) &&
      (state.category === "all" || product.categorySlug === state.category) &&
      (state.subcategory === "all" || product.subcategorySlug === state.subcategory) &&
      (state.status === "all" || getAvailability(product) === state.status) &&
      (state.unit === "all" || product.unit === state.unit)
    );
  });
}

function buildCharacteristics(product) {
  const text = `${product.name} ${product.specification}`;
  const rows = [
    ["Артикул", product.article],
    ["Бренд", product.brand],
    ["Категория", product.group],
    ["Подкатегория", product.subgroup],
    ["Единица измерения", product.unit],
    ["MOQ", `${formatAmount(product.moq)} ${product.unit}`],
    ["Наличие", getAvailability(product)],
    ["Цена", product.price ? `${formatKzt(product.price)} / ${product.unit}` : "по запросу"],
  ];

  if (product.stockTotal !== undefined) rows.push(["Остаток", `${formatAmount(product.stockTotal)} ${product.unit}`]);
  const cableCategory = text.match(/Cat\.?\s?6A|Cat\.?\s?6|Cat\.?\s?5e/i)?.[0];
  const cableType = text.match(/U\/FTP|FTP|UTP/i)?.[0];
  const shell = text.match(/LSZH|PVC/i)?.[0];
  const length = text.match(/305\s*м/i)?.[0];
  const ports = text.match(/(\d+)\s*порт/i)?.[1];
  const format = text.match(/45x45|22,5x45|22\.5x45/i)?.[0];
  const modules = text.match(/(\d+)\s*модул/i)?.[1];

  if (cableCategory) rows.push(["Категория кабеля", cableCategory]);
  if (cableType) rows.push(["Тип / экранирование", cableType]);
  if (shell) rows.push(["Оболочка", shell]);
  if (length) rows.push(["Длина бухты", length]);
  if (ports) rows.push(["Количество портов", `${ports} порта`]);
  if (format) rows.push(["Формат", format.replace(".", ",")]);
  if (modules) rows.push(["Количество модулей", modules]);
  rows.push(["Документы", "сертификат, паспорт, инструкция и технический лист - по запросу"]);
  return rows;
}

function addToCart(productId) {
  const product = getProduct(productId);
  if (!product) return;
  cart[productId] = Math.max(1, Number(cart[productId] || 0) + 1);
  persistCart();
  renderCart();
  showToast(`${product.name} добавлен в заявку`);
}

function handleCartAction(button) {
  const productId = Number(button.dataset.productId);
  const action = button.dataset.cartAction;
  if (action === "increase") updateCartQty(productId, Number(cart[productId] || 0) + 1);
  if (action === "decrease") updateCartQty(productId, Number(cart[productId] || 0) - 1);
  if (action === "remove") {
    delete cart[productId];
    persistCart();
    renderCart();
  }
}

function updateCartQty(productId, qty) {
  const nextQty = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
  if (nextQty === 0) delete cart[productId];
  else cart[productId] = nextQty;
  persistCart();
  renderCart();
}

function renderCart() {
  const markup = cartMarkup();
  if (els.cartItems) els.cartItems.innerHTML = markup;
  const total = cartTotal();
  document.querySelectorAll(".cart-count").forEach((el) => {
    el.textContent = total ? String(total) : "";
    el.setAttribute("aria-label", `товаров в КП: ${total}`);
    el.classList.toggle("is-empty", total === 0);
  });
}

function cartMarkup() {
  const entries = cartEntries();
  if (!entries.length) return `<div class="empty-state">Заявка пока пустая. Добавьте позиции из каталога.</div>`;
  const rows = entries.map(({ product, qty }) => {
    const amount = product.price ? product.price * qty : null;
    return `
      <div class="cart-item">
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.article)} · ${escapeHtml(product.group)} · ${escapeHtml(product.unit)}</small>
          ${product.price ? `<small>${formatKzt(product.price)} × ${qty} = ${formatKzt(amount)}</small>` : `<small>Цена будет рассчитана в КП</small>`}
        </div>
        <div class="qty-control" aria-label="Количество">
          <button type="button" data-cart-action="decrease" data-product-id="${product.id}">−</button>
          <input data-cart-qty="${product.id}" type="number" min="1" value="${qty}" />
          <button type="button" data-cart-action="increase" data-product-id="${product.id}">+</button>
          <button class="remove-button" type="button" data-cart-action="remove" data-product-id="${product.id}">Удалить</button>
        </div>
      </div>
    `;
  });
  const total = entries.reduce((sum, item) => sum + Number(item.product.price || 0) * item.qty, 0);
  if (total) rows.push(`<div class="cart-total"><span>Итого по видимым ценам</span><strong>${formatKzt(total)}</strong></div>`);
  return rows.join("");
}

function cartEntries() {
  return Object.entries(cart)
    .map(([productId, qty]) => ({ product: getProduct(Number(productId)), qty: Number(qty) }))
    .filter((entry) => entry.product && entry.qty > 0);
}

function cartTotal() {
  return cartEntries().reduce((sum, entry) => sum + entry.qty, 0);
}

async function submitLead(event) {
  event.preventDefault();
  const entries = cartEntries();
  if (!entries.length) {
    showToast("Добавьте товары в заявку перед отправкой");
    return;
  }

  const client = Object.fromEntries(new FormData(els.leadForm).entries());
  try {
    await apiFetch("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        client,
        items: entries.map(({ product, qty }) => ({ productId: product.id, qty })),
      }),
    });
    showToast("Заявка отправлена и сохранена на сервере.");
  } catch {
    const leads = readJson("nexusLeads", []);
    leads.unshift({ id: Date.now(), createdAt: new Date().toISOString(), client, items: entries });
    storage.setItem("nexusLeads", JSON.stringify(leads.slice(0, 20)));
    showToast("Заявка сохранена в браузере. Сервер недоступен.");
  }
  cart = {};
  persistCart();
  els.leadForm.reset();
  renderCart();
  await renderAccount();
  await renderAdmin();
}

function submitSimpleForm(event) {
  event.preventDefault();
  event.currentTarget.reset();
  showToast("Форма отправлена. Для боевого запуска подключаются email и Telegram.");
}

async function submitLogin(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.loginForm).entries());
  try {
    const response = await apiFetch("/api/login", { method: "POST", body: JSON.stringify(payload) });
    currentUser = response.user;
    await loadProducts();
    showToast("Вход выполнен");
    location.href = currentUser.role === "admin" ? "admin.html" : "account.html";
  } catch (error) {
    showToast(error.message || "Не удалось войти");
  }
}

async function submitPartnerRegister(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.partnerRegisterForm).entries());
  try {
    await apiFetch("/api/register", { method: "POST", body: JSON.stringify(payload) });
    els.partnerRegisterForm.reset();
    showToast("Заявка отправлена. Администратор должен подтвердить доступ.");
  } catch (error) {
    showToast(error.message || "Не удалось отправить заявку");
  }
}

async function logout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } finally {
    currentUser = null;
    await loadProducts();
    renderAll();
    showToast("Вы вышли из аккаунта");
  }
}

async function loadNcoin() {
  try {
    return await apiFetch("/api/ncoin");
  } catch {
    return null;
  }
}

function ncoinOverviewMarkup(ncoin) {
  if (!ncoin) {
    return `
      <article class="auth-card ncoin-card">
        <p class="eyebrow">Ncoin</p>
        <h2>Бонусная программа</h2>
        <p>Ncoin становятся доступны активному партнёру после оплаты и закрытия заказа.</p>
        <a class="button button-secondary" href="bonus.html">Открыть бонусный магазин</a>
      </article>
    `;
  }

  return `
    <article class="auth-card ncoin-card">
      <p class="eyebrow">Ncoin</p>
      <h2>Бонусный баланс</h2>
      <div class="ncoin-balance">${formatNcoin(ncoin.summary.available)}</div>
      <div class="ncoin-stats">
        <span><strong>${formatNcoin(ncoin.summary.pending)}</strong><small>Ожидают начисления</small></span>
        <span><strong>${formatNcoin(ncoin.summary.reserved)}</strong><small>Ожидают списания</small></span>
        <span><strong>${formatNcoin(ncoin.summary.spent)}</strong><small>Списаны</small></span>
        <span><strong>${formatNcoin(ncoin.summary.expiringSoon)}</strong><small>Сгорят за 30 дней</small></span>
      </div>
      <p class="form-note">1 Ncoin = 1 ₸ бонусной ценности в бонусном магазине. Ncoin нельзя вывести деньгами или передать другой компании.</p>
      <div class="dialog-actions">
        <a class="button button-primary" href="bonus.html">Бонусный магазин</a>
        <a class="button button-secondary" href="catalog.html">Вернуться в каталог</a>
      </div>
    </article>
  `;
}

function ncoinOperationsMarkup(operations, limit = 8) {
  const rows = (operations || []).slice(0, limit);
  if (!rows.length) return `<div class="empty-state">Операций Ncoin пока нет.</div>`;
  return `
    <div class="ncoin-ledger">
      ${rows
        .map(
          (operation) => `
            <div class="ncoin-ledger-row">
              <div>
                <strong>${escapeHtml(ncoinOperationName(operation))}</strong>
                <small>${escapeHtml(operation.orderId || operation.itemTitle || operation.comment || "Nexus Ncoin")} · ${formatDate(operation.createdAt)}</small>
              </div>
              <span class="pill ${ncoinStatusClass(operation.status)}">${ncoinOperationStatusLabel(operation)}</span>
              <strong>${formatNcoin(operation.amount)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function bonusItemsMarkup(items, summary, limit = Infinity) {
  const visible = (items || []).slice(0, limit);
  if (!visible.length) return `<div class="empty-state">Бонусный магазин пока не заполнен.</div>`;
  const available = Number(summary?.available || 0);
  return `
    <div class="ncoin-shop-grid">
      ${visible
        .map((item) => {
          const canRedeem = currentUser && currentUser.status === "active" && currentUser.role === "partner" && available >= Number(item.cost || 0);
          return `
            <article class="ncoin-shop-item">
              <div class="category-meta">
                <span class="pill pill-blue">${bonusCategoryLabel(item.category)}</span>
                <span class="pill">${escapeHtml(item.availability || "По запросу")}</span>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description || "")}</p>
              <strong class="ncoin-price">${formatNcoin(item.cost)}</strong>
              ${item.conditions ? `<small>${escapeHtml(item.conditions)}</small>` : ""}
              <button class="button ${canRedeem ? "button-primary" : "button-secondary"}" type="button" data-redeem-ncoin="${escapeHtml(item.id)}" ${canRedeem ? "" : "disabled"}>
                ${canRedeem ? "Списать Ncoin" : "Недостаточно Ncoin"}
              </button>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

async function renderBonusShopPage() {
  if (!els.bonusShopPage) return;
  if (!currentUser) {
    els.bonusShopPage.innerHTML = `
      <div class="auth-card">
        <p class="eyebrow">Ncoin</p>
        <h2>Войдите как партнёр</h2>
        <p>Бонусный магазин доступен авторизованным партнёрам Nexus. После подтверждения аккаунта партнёр видит баланс, историю начислений и доступные бонусы.</p>
        <div class="dialog-actions">
          <a class="button button-primary" href="login.html">Войти</a>
          <a class="button button-secondary" href="partner-register.html">Стать партнёром</a>
        </div>
      </div>
      ${ncoinRulesMarkup()}
    `;
    return;
  }

  if (currentUser.status !== "active") {
    els.bonusShopPage.innerHTML = `
      <div class="auth-card">
        <p class="eyebrow">Ncoin</p>
        <h2>Доступ на модерации</h2>
        <p>Бонусный магазин откроется после подтверждения партнёрского аккаунта администратором Nexus.</p>
      </div>
      ${ncoinRulesMarkup()}
    `;
    return;
  }

  const ncoin = await loadNcoin();
  els.bonusShopPage.innerHTML = `
    <div class="section-heading row-heading">
      <div>
        <p class="eyebrow">Бонусный магазин</p>
        <h2>Доступно ${formatNcoin(ncoin?.summary?.available || 0)}</h2>
        <p>Коины начисляются за оплаченные заказы и списываются после подтверждения администратором.</p>
      </div>
      <a class="button button-secondary" href="account.html">История Ncoin</a>
    </div>
    ${ncoinOverviewMarkup(ncoin)}
    ${bonusItemsMarkup(ncoin?.shop || [], ncoin?.summary || {})}
    ${ncoinRulesMarkup(ncoin)}
  `;
}

function ncoinRulesMarkup(ncoin) {
  const restrictions = ncoin?.restrictions || [
    "Ncoin начисляются только после фактической оплаты заказа.",
    "Начисление считается от суммы товаров без НДС, доставки и дополнительных услуг.",
    "Ncoin нельзя обменять на деньги, вывести наличными или передать другой компании.",
    "Срок действия Ncoin — 12 месяцев с даты начисления.",
  ];
  return `
    <div class="ncoin-rules">
      <article><h3>Пороги начисления</h3><p>До 15 000 000 ₸ — 0,5%, от 15 000 000 ₸ — 1%, от 25 000 000 ₸ — 1,5% от суммы каждого отдельного оплаченного заказа.</p></article>
      <article><h3>Ограничения</h3>${restrictions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</article>
    </div>
  `;
}

async function redeemNcoin(itemId) {
  if (!currentUser) {
    location.href = "login.html";
    return;
  }
  try {
    await apiFetch("/api/ncoin/redeem", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    showToast("Заявка на списание Ncoin отправлена администратору.");
    await renderBonusShopPage();
    await renderAccount();
    await renderAdmin();
  } catch (error) {
    showToast(error.message || "Не удалось списать Ncoin");
  }
}

async function renderAccount() {
  if (!els.accountPanel) return;
  if (!currentUser) {
    els.accountPanel.innerHTML = `
      <div class="auth-card">
        <h2>Войдите в партнёрский кабинет</h2>
        <p>После подтверждения партнёр видит цены, точные остатки, историю заявок и персональные условия.</p>
        <div class="dialog-actions">
          <a class="button button-primary" href="login.html">Войти</a>
          <a class="button button-secondary" href="partner-register.html">Стать партнёром</a>
        </div>
      </div>
    `;
    return;
  }

  if (currentUser.status !== "active") {
    els.accountPanel.innerHTML = `
      <div class="auth-card">
        <p class="eyebrow">На модерации</p>
        <h2>${escapeHtml(currentUser.company)}</h2>
        <p>Ваша заявка на партнёрский доступ рассматривается. До подтверждения цены и точные остатки скрыты.</p>
      </div>
    `;
    return;
  }

  let leads = [];
  let ncoin = null;
  try {
    const [leadsResponse, ncoinResponse] = await Promise.all([apiFetch("/api/account/leads"), loadNcoin()]);
    leads = leadsResponse.leads;
    ncoin = ncoinResponse;
  } catch {}
  els.accountPanel.innerHTML = `
    <div class="account-grid">
      <article class="auth-card">
        <p class="eyebrow">Партнёр активен</p>
        <h2>${escapeHtml(currentUser.company)}</h2>
        <p>${escapeHtml(currentUser.name || "")} · ${escapeHtml(currentUser.city || "")}</p>
        <div class="category-meta">
          <span class="pill pill-green">Цены открыты</span>
          <span class="pill">Группа: ${priceGroupLabel(currentUser.priceGroup)}</span>
          <span class="pill">БИН: ${escapeHtml(currentUser.bin || "не указан")}</span>
        </div>
      </article>
      ${ncoinOverviewMarkup(ncoin)}
      <article class="auth-card">
        <h2>История заявок</h2>
        ${leads.length ? leads.map((lead) => `<p><strong>${escapeHtml(lead.id)}</strong> · ${escapeHtml(lead.status)} · ${lead.total ? formatKzt(lead.total) : "сумма по КП"}</p>`).join("") : "<p>Пока нет заявок.</p>"}
      </article>
      <article class="auth-card account-wide">
        <div class="section-heading row-heading">
          <div><p class="eyebrow">История Ncoin</p><h2>Начисления и списания</h2></div>
          <a class="text-link" href="bonus.html">Открыть магазин</a>
        </div>
        ${ncoinOperationsMarkup(ncoin?.operations || [], 8)}
      </article>
      <article class="auth-card account-wide">
        <div class="section-heading row-heading">
          <div><p class="eyebrow">Бонусный магазин</p><h2>Популярные бонусы</h2></div>
          <span class="pill pill-blue">1 Ncoin = 1 ₸</span>
        </div>
        ${bonusItemsMarkup(ncoin?.shop || [], ncoin?.summary || {}, 3)}
      </article>
    </div>
  `;
}

async function renderAdmin() {
  if (!els.adminWorkspace) return;
  if (!currentUser || currentUser.role !== "admin") {
    els.adminWorkspace.innerHTML = `
      <div class="auth-card">
        <h2>Доступ только для администратора</h2>
        <p>Войдите как администратор, чтобы подтверждать партнёров и видеть закрытые данные.</p>
        <a class="button button-primary" href="login.html">Войти</a>
      </div>
    `;
    return;
  }

  try {
    const [summary, usersResponse, ncoinAdmin] = await Promise.all([apiFetch("/api/admin/summary"), apiFetch("/api/admin/users"), apiFetch("/api/admin/ncoin")]);
    const partners = usersResponse.users.filter((user) => user.role === "partner");
    const ncoinAdminCards = `
      <article><h3>Ncoin доступны</h3><p>${formatNcoin(ncoinAdmin.totals.available)}</p></article>
      <article><h3>Ncoin ожидают</h3><p>${formatNcoin(ncoinAdmin.totals.pending)}</p></article>
      <article><h3>Ncoin списаны</h3><p>${formatNcoin(ncoinAdmin.totals.spent)}</p></article>
    `;
    els.adminWorkspace.innerHTML = `
      <div class="admin-grid">
        <article><h3>Товары с коммерческими данными</h3><p>${summary.commercialProducts}</p></article>
        <article><h3>Партнёры на модерации</h3><p>${summary.pendingPartners}</p></article>
        <article><h3>Заявки</h3><p>${summary.leads}</p></article>
        ${ncoinAdminCards}
      </div>
      <div class="admin-table-wrap">
        <h2>Партнёры</h2>
        <table class="admin-table">
          <thead><tr><th>Компания</th><th>Email</th><th>Статус</th><th>Группа</th><th>Действие</th></tr></thead>
          <tbody>
            ${partners.map((user) => `
              <tr>
                <td>${escapeHtml(user.company)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${userStatusLabel(user)}</td>
                <td>${priceGroupLabel(user.priceGroup)}</td>
                <td>${user.status === "pending" ? `<button class="button button-secondary" type="button" data-approve-user="${user.id}">Подтвердить</button>` : "Активен"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${adminNcoinMarkup(ncoinAdmin, partners)}
    `;
    updateAdminCounts(summary);
  } catch (error) {
    els.adminWorkspace.innerHTML = `<div class="empty-state">Не удалось загрузить админ-данные: ${escapeHtml(error.message)}</div>`;
  }
}

function adminNcoinMarkup(ncoinAdmin, partners) {
  const activePartners = partners.filter((partner) => partner.status === "active");
  return `
    <div class="admin-table-wrap ncoin-admin-panel">
      <div class="section-heading row-heading">
        <div>
          <p class="eyebrow">Ncoin</p>
          <h2>Начисление по оплаченному заказу</h2>
          <p>Сумма указывается только по товарам: без НДС, доставки и дополнительных услуг.</p>
        </div>
        <span class="pill pill-blue">Срок действия 12 месяцев</span>
      </div>
      <form class="ncoin-admin-form" id="ncoinPaidOrderForm">
        <label>Партнёр<select name="userId" required>${activePartners.map((partner) => `<option value="${escapeHtml(partner.id)}">${escapeHtml(partner.company)} · ${escapeHtml(partner.email)}</option>`).join("")}</select></label>
        <label>Номер оплаченного заказа<input name="orderId" required placeholder="Например: ORD-2026-001" /></label>
        <label>Сумма товаров без НДС<input name="orderAmountBase" type="number" min="1" step="1" required placeholder="15000000" /></label>
        <label class="checkbox-row"><input name="closeOrder" type="checkbox" checked /> Заказ закрыт, Ncoin сразу доступны</label>
        <label class="span-2">Комментарий<textarea name="comment" rows="2" placeholder="Оплата подтверждена, заказ закрыт"></textarea></label>
        <button class="button button-primary" type="submit">Начислить Ncoin</button>
      </form>
    </div>
    <div class="admin-table-wrap">
      <h2>Операции Ncoin</h2>
      <table class="admin-table">
        <thead><tr><th>Партнёр</th><th>Операция</th><th>Статус</th><th>Сумма</th><th>Основание</th><th>Действие</th></tr></thead>
        <tbody>${ncoinAdmin.operations.slice(0, 80).map(adminNcoinOperationRow).join("")}</tbody>
      </table>
    </div>
    <div class="admin-table-wrap ncoin-admin-panel">
      <div class="section-heading row-heading">
        <div><p class="eyebrow">Бонусный магазин</p><h2>Товары и услуги за Ncoin</h2></div>
        <span class="pill">Создание, редактирование и скрытие бонусов</span>
      </div>
      <form class="ncoin-admin-form" id="bonusItemForm">
        <label>ID для редактирования<input name="id" placeholder="bonus-free-delivery" /></label>
        <label>Название бонуса<input name="title" required placeholder="Бесплатная доставка" /></label>
        <label>Категория<select name="category">
          <option value="gifts">Подарки</option>
          <option value="tools">Инструменты</option>
          <option value="merch">Мерч</option>
          <option value="delivery">Доставка</option>
          <option value="services">Сервис</option>
          <option value="training">Обучение</option>
          <option value="documents">Документы</option>
          <option value="marketing">Маркетинг</option>
        </select></label>
        <label>Стоимость<input name="cost" type="number" min="1" step="1" required placeholder="80000" /></label>
        <label class="span-2">Описание<textarea name="description" rows="2" required></textarea></label>
        <label>Доступность<input name="availability" placeholder="По запросу" /></label>
        <label>Условия<input name="conditions" placeholder="При отсутствии задолженности" /></label>
        <button class="button button-primary" type="submit">Сохранить бонус</button>
      </form>
      <div class="ncoin-admin-shop">
        ${ncoinAdmin.shop.map((item) => `
          <article>
            <div><strong>${escapeHtml(item.title)}</strong><small>${bonusCategoryLabel(item.category)} · ${formatNcoin(item.cost)} · ${item.active ? "показывается" : "скрыт"}</small></div>
            <button class="button button-secondary" type="button" data-toggle-bonus-item="${escapeHtml(item.id)}">${item.active ? "Скрыть" : "Показать"}</button>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function adminNcoinOperationRow(operation) {
  return `
    <tr>
      <td>${escapeHtml(operation.company || operation.userId)}</td>
      <td>${escapeHtml(ncoinOperationName(operation))}</td>
      <td><span class="pill ${ncoinStatusClass(operation.status)}">${ncoinOperationStatusLabel(operation)}</span></td>
      <td>${formatNcoin(operation.amount)}</td>
      <td>${escapeHtml(operation.orderId || operation.itemTitle || operation.comment || "")}</td>
      <td>${adminNcoinActions(operation)}</td>
    </tr>
  `;
}

function adminNcoinActions(operation) {
  if (operation.type === "accrual" && operation.status === "pending") {
    return `
      <button class="button button-secondary" type="button" data-ncoin-admin-action="activate" data-operation-id="${escapeHtml(operation.id)}">Сделать доступными</button>
      <button class="text-button" type="button" data-ncoin-admin-action="cancel" data-operation-id="${escapeHtml(operation.id)}">Отменить</button>
    `;
  }
  if (operation.type === "accrual" && operation.status === "available") {
    return `<button class="text-button" type="button" data-ncoin-admin-action="cancel" data-operation-id="${escapeHtml(operation.id)}">Отменить при возврате</button>`;
  }
  if (operation.type === "redeem" && operation.status === "pending") {
    return `
      <button class="button button-secondary" type="button" data-ncoin-admin-action="confirm-spend" data-operation-id="${escapeHtml(operation.id)}">Подтвердить списание</button>
      <button class="text-button" type="button" data-ncoin-admin-action="cancel" data-operation-id="${escapeHtml(operation.id)}">Отклонить</button>
    `;
  }
  return "—";
}

async function submitNcoinPaidOrder(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.closeOrder = Boolean(event.currentTarget.elements.closeOrder?.checked);
  try {
    const response = await apiFetch("/api/admin/ncoin/paid-order", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    event.currentTarget.reset();
    showToast(`Начислено ${formatNcoin(response.operation.amount)} по ставке ${formatPercent(response.operation.rate)}.`);
    await renderAdmin();
  } catch (error) {
    showToast(error.message || "Не удалось начислить Ncoin");
  }
}

async function submitBonusItem(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await apiFetch("/api/admin/ncoin/shop", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    event.currentTarget.reset();
    showToast("Бонус сохранён.");
    await renderAdmin();
  } catch (error) {
    showToast(error.message || "Не удалось сохранить бонус");
  }
}

async function handleAdminNcoinAction(button) {
  const action = button.dataset.ncoinAdminAction;
  const operationId = button.dataset.operationId;
  const endpoints = {
    activate: "activate",
    cancel: "cancel",
    "confirm-spend": "confirm-spend",
  };
  if (!operationId || !endpoints[action]) return;
  try {
    await apiFetch(`/api/admin/ncoin/operations/${encodeURIComponent(operationId)}/${endpoints[action]}`, {
      method: "POST",
      body: JSON.stringify({ comment: "Действие выполнено в админ-панели Nexus" }),
    });
    showToast("Операция Ncoin обновлена.");
    await renderAdmin();
  } catch (error) {
    showToast(error.message || "Не удалось обновить операцию Ncoin");
  }
}

async function toggleBonusItem(itemId) {
  try {
    await apiFetch(`/api/admin/ncoin/shop/${encodeURIComponent(itemId)}/toggle`, { method: "POST" });
    showToast("Видимость бонуса изменена.");
    await renderAdmin();
  } catch (error) {
    showToast(error.message || "Не удалось изменить бонус");
  }
}

async function approveUser(userId) {
  try {
    await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/approve`, {
      method: "POST",
      body: JSON.stringify({ priceGroup: "dealer" }),
    });
    showToast("Партнёр подтверждён. Ему доступны цены и остатки.");
    await renderAdmin();
  } catch (error) {
    showToast(error.message || "Не удалось подтвердить партнёра");
  }
}

function updateAdminCounts(summary) {
  if (els.adminProductsCount) els.adminProductsCount.textContent = `${products.length} позиций из Excel`;
  if (els.adminLeadsCount) els.adminLeadsCount.textContent = summary ? `${summary.leads} заявок на сервере` : "0 заявок в текущем браузере";
}

function markActiveNav() {
  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href === current || (current === "" && href === "index.html")) link.classList.add("is-active");
  });
}

function getAvailability(product) {
  return product.stockStatus || product.availability || "Доступно по запросу";
}

function getProduct(productId) {
  return products.find((product) => product.id === productId);
}

function canSeeCommercialData() {
  return Boolean(currentUser && currentUser.status === "active" && ["partner", "admin", "manager"].includes(currentUser.role));
}

function userStatusLabel(user) {
  if (!user) return "";
  if (user.status === "active") return "активен";
  if (user.status === "pending") return "на модерации";
  if (user.status === "blocked") return "заблокирован";
  return user.status || "";
}

function priceGroupLabel(group) {
  return {
    standard: "стандарт",
    dealer: "дилер",
    project: "проектный партнёр",
    vip: "VIP",
  }[group] || "стандарт";
}

function uniqueOptions(items, valueKey, labelGetter) {
  const map = new Map();
  items.forEach((item) => {
    const value = item[valueKey];
    if (value && !map.has(value)) map.set(value, labelGetter(item));
  });
  return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function setOptions(select, options) {
  if (!select) return;
  select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("");
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function ncoinOperationName(operation) {
  if (operation.type === "accrual") return "Начисление за оплаченный заказ";
  if (operation.type === "redeem") return "Списание в бонусном магазине";
  if (operation.type === "adjustment") return "Ручная корректировка";
  if (operation.type === "expire") return "Сгорание Ncoin";
  return "Операция Ncoin";
}

function ncoinStatusLabel(status) {
  return {
    pending: "Ожидают начисления",
    available: "Доступны",
    spent: "Списаны",
    canceled: "Отменены",
    expired: "Сгорели",
  }[status] || status || "";
}

function ncoinOperationStatusLabel(operation) {
  if (operation.type === "redeem" && operation.status === "pending") return "Ожидает списания";
  return ncoinStatusLabel(operation.status);
}

function ncoinStatusClass(status) {
  return {
    pending: "pill-amber",
    available: "pill-green",
    spent: "pill-blue",
    canceled: "pill-amber",
    expired: "pill-amber",
  }[status] || "";
}

function bonusCategoryLabel(category) {
  return {
    gifts: "Подарки",
    tools: "Инструменты",
    merch: "Мерч",
    delivery: "Доставка",
    services: "Сервис",
    training: "Обучение",
    documents: "Документы",
    marketing: "Маркетинг",
    "special-services": "Спецуслуги",
  }[category] || "Бонус";
}

function formatNcoin(value) {
  return `${new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(Number(value || 0))} Ncoin`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value || 0) * 100)}%`;
}

function formatAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number % 1 === 0 ? String(number) : number.toFixed(1);
}

function formatKzt(value) {
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function persistCart() {
  storage.setItem("nexusCart", JSON.stringify(cart));
}

function readJson(key, fallback) {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createStorage() {
  try {
    const testKey = "__nexus_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    const memory = {};
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
      },
      setItem(key, value) {
        memory[key] = String(value);
      },
      removeItem(key) {
        delete memory[key];
      },
    };
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "API error");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 3200);
}

function injectProductStructuredData() {
  if (document.querySelector("[data-generated-schema]")) return;
  const graph = products.map((product) => ({
    "@type": "Product",
    name: product.name,
    sku: product.article,
    brand: { "@type": "Brand", name: product.brand },
    category: `${product.group} / ${product.subgroup}`,
    description: product.specification,
    offers: {
      "@type": "Offer",
      availability: getAvailability(product) === "В наличии" ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      priceSpecification: {
        "@type": "PriceSpecification",
        priceCurrency: "KZT",
        description: product.price ? "Партнёрская цена после авторизации" : "Цена по запросу",
      },
    },
  }));
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.generatedSchema = "true";
  script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
  document.head.appendChild(script);
}
