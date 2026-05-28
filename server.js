const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const privateDir = path.join(root, "private");
const usersPath = path.join(privateDir, "users.json");
const leadsPath = path.join(privateDir, "leads.json");
const ncoinOperationsPath = path.join(privateDir, "ncoin-operations.json");
const ncoinSettingsPath = path.join(privateDir, "ncoin-settings.json");
const bonusShopPath = path.join(privateDir, "bonus-shop.json");
const privateCatalogPath = path.join(privateDir, "catalog-private.json");
const publicProductsPath = path.join(root, "data", "products.js");
const port = Number(process.env.PORT || 4174);
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

const sessions = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#087df0"/><path d="M18 46V18h7l14 17.3V18h7v28h-7L25 28.7V46z" fill="#fff"/></svg>`;

ensureSeedData();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/favicon.ico") {
      res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" });
      res.end(faviconSvg);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: "server_error", message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Nexus server running at http://${host}:${port}/`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/session") {
    sendJson(res, 200, { user: publicUser(getCurrentUser(req)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const users = await readJson(usersPath, []);
    const user = users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!user || user.passwordHash !== hashPassword(body.password || "")) {
      sendJson(res, 401, { error: "invalid_credentials", message: "Неверный email или пароль" });
      return;
    }

    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, user.id);
    res.setHeader("Set-Cookie", `nexus_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const sid = getCookie(req, "nexus_sid");
    if (sid) sessions.delete(sid);
    res.setHeader("Set-Cookie", "nexus_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readBody(req);
    const users = await readJson(usersPath, []);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !body.password || !body.company || !body.phone || !body.bin) {
      sendJson(res, 400, { error: "validation", message: "Заполните компанию, БИН, телефон, email и пароль" });
      return;
    }
    if (users.some((item) => item.email.toLowerCase() === email)) {
      sendJson(res, 409, { error: "exists", message: "Пользователь с таким email уже существует" });
      return;
    }

    const user = {
      id: `u_${Date.now()}`,
      role: "partner",
      status: "pending",
      priceGroup: "standard",
      company: String(body.company || "").trim(),
      bin: String(body.bin || "").trim(),
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      email,
      city: String(body.city || "").trim(),
      direction: String(body.direction || "").trim(),
      comment: String(body.comment || "").trim(),
      passwordHash: hashPassword(body.password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeJson(usersPath, users);
    sendJson(res, 201, { user: publicUser(user), message: "Заявка на партнёрский доступ отправлена" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/products") {
    const user = getCurrentUser(req);
    sendJson(res, 200, { products: await productsForUser(user), user: publicUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/leads") {
    const user = getCurrentUser(req);
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      sendJson(res, 400, { error: "empty_cart", message: "В заявке нет товаров" });
      return;
    }

    const products = await productsForUser(user);
    const leadItems = items
      .map((item) => {
        const product = products.find((candidate) => candidate.id === Number(item.productId));
        if (!product) return null;
        const qty = Math.max(1, Math.floor(Number(item.qty || 1)));
        return {
          article: product.article,
          name: product.name,
          category: product.group,
          qty,
          unit: product.unit,
          price: product.price || null,
          amount: product.price ? product.price * qty : null,
          stockTotal: product.stockTotal ?? null,
        };
      })
      .filter(Boolean);

    const leads = await readJson(leadsPath, []);
    const lead = {
      id: `L-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "новая",
      source: user ? "partner-account" : "public-site",
      userId: user?.id || null,
      partner: user ? publicUser(user) : null,
      client: body.client || {},
      items: leadItems,
      total: leadItems.reduce((sum, item) => sum + Number(item.amount || 0), 0) || null,
    };
    leads.unshift(lead);
    await writeJson(leadsPath, leads.slice(0, 200));
    sendJson(res, 201, { lead });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/account/leads") {
    const user = requireUser(req, res);
    if (!user) return;
    const leads = await readJson(leadsPath, []);
    sendJson(res, 200, { leads: leads.filter((lead) => lead.userId === user.id) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ncoin") {
    const user = requireUser(req, res);
    if (!user) return;
    if (!canAccessNcoin(user)) {
      sendJson(res, 403, { error: "ncoin_access_denied", message: "Ncoin доступен после подтверждения партнёрского аккаунта." });
      return;
    }
    sendJson(res, 200, await ncoinBundleForUser(user));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ncoin/redeem") {
    const user = requireUser(req, res);
    if (!user) return;
    if (!canAccessNcoin(user)) {
      sendJson(res, 403, { error: "ncoin_access_denied", message: "Ncoin доступен после подтверждения партнёрского аккаунта." });
      return;
    }
    if (user.debtBlocked) {
      sendJson(res, 403, { error: "debt_blocked", message: "Списание Ncoin заблокировано из-за просроченной задолженности." });
      return;
    }

    const body = await readBody(req);
    const shop = await readJson(bonusShopPath, []);
    const item = shop.find((candidate) => candidate.id === body.itemId && candidate.active);
    if (!item) {
      sendJson(res, 404, { error: "bonus_item_not_found", message: "Бонус недоступен или скрыт." });
      return;
    }

    const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
    const operations = await loadNcoinOperations(settings);
    const summary = ncoinSummary(user.id, operations);
    if (summary.available < Number(item.cost || 0)) {
      sendJson(res, 400, { error: "not_enough_ncoin", message: "Недостаточно доступных Ncoin для списания." });
      return;
    }

    const operation = {
      id: ncoinId(),
      userId: user.id,
      company: user.company,
      type: "redeem",
      status: "pending",
      amount: Number(item.cost || 0),
      itemId: item.id,
      itemTitle: item.title,
      category: item.category,
      createdAt: new Date().toISOString(),
      comment: String(body.comment || "Ожидает подтверждения списания администратором"),
      source: "bonus-shop",
    };
    operations.unshift(operation);
    await writeJson(ncoinOperationsPath, operations);
    sendJson(res, 201, { operation, ...(await ncoinBundleForUser(user)) });
    return;
  }

  if (url.pathname.startsWith("/api/admin/")) {
    await handleAdminApi(req, res, url);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function handleAdminApi(req, res, url) {
  const user = requireAdmin(req, res);
  if (!user) return;

  if (req.method === "GET" && url.pathname === "/api/admin/summary") {
    const users = await readJson(usersPath, []);
    const leads = await readJson(leadsPath, []);
    const privateCatalog = await readJson(privateCatalogPath, []);
    sendJson(res, 200, {
      users: users.length,
      pendingPartners: users.filter((item) => item.role === "partner" && item.status === "pending").length,
      leads: leads.length,
      commercialProducts: privateCatalog.length,
      priceGroups: ["standard", "dealer", "project", "vip"],
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const users = await readJson(usersPath, []);
    sendJson(res, 200, { users: users.map(publicUser) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/ncoin") {
    const users = await readJson(usersPath, []);
    const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
    const operations = await loadNcoinOperations(settings);
    const shop = await readJson(bonusShopPath, []);
    const userMap = new Map(users.map((item) => [item.id, item]));
    const enrichedOperations = operations.map((operation) => ({
      ...operation,
      company: userMap.get(operation.userId)?.company || operation.company,
    }));
    const partners = users
      .filter((item) => item.role === "partner")
      .map((item) => ({ ...publicUser(item), ncoin: ncoinSummary(item.id, operations) }));
    const totals = partners.reduce(
      (acc, item) => {
        acc.available += item.ncoin.available;
        acc.pending += item.ncoin.pending;
        acc.reserved += item.ncoin.reserved;
        acc.spent += item.ncoin.spent;
        acc.expired += item.ncoin.expired;
        return acc;
      },
      { available: 0, pending: 0, reserved: 0, spent: 0, expired: 0 },
    );
    sendJson(res, 200, { partners, operations: enrichedOperations, shop, settings, totals });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/ncoin/paid-order") {
    const body = await readBody(req);
    const users = await readJson(usersPath, []);
    const target = users.find((item) => item.id === body.userId && item.role === "partner");
    const orderAmountBase = Math.floor(Number(body.orderAmountBase || 0));
    const orderId = String(body.orderId || "").trim();
    if (!target || target.status !== "active") {
      sendJson(res, 400, { error: "partner_not_active", message: "Выберите активного партнёра для начисления Ncoin." });
      return;
    }
    if (!orderId || orderAmountBase <= 0) {
      sendJson(res, 400, { error: "invalid_paid_order", message: "Укажите номер заказа и сумму товаров без НДС, доставки и услуг." });
      return;
    }

    const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
    const operations = await loadNcoinOperations(settings);
    if (operations.some((operation) => operation.type === "accrual" && operation.orderId === orderId)) {
      sendJson(res, 409, { error: "order_already_accrued", message: "По этому заказу Ncoin уже начислены." });
      return;
    }

    const now = new Date();
    const isClosed = Boolean(body.closeOrder);
    const rate = ncoinRate(orderAmountBase);
    const operation = {
      id: ncoinId(),
      userId: target.id,
      company: target.company,
      type: "accrual",
      status: isClosed ? "available" : "pending",
      orderId,
      orderAmountBase,
      excluded: "vat_delivery_services",
      rate,
      amount: calculateNcoin(orderAmountBase),
      createdAt: now.toISOString(),
      paidAt: now.toISOString(),
      availableAt: isClosed ? now.toISOString() : null,
      expiresAt: isClosed ? addMonths(now, settings.validityMonths).toISOString() : null,
      comment: String(body.comment || (isClosed ? "Заказ оплачен и закрыт" : "Заказ оплачен, ожидает закрытия")),
      source: "admin-paid-order",
    };
    operations.unshift(operation);
    await writeJson(ncoinOperationsPath, operations);
    sendJson(res, 201, { operation, summary: ncoinSummary(target.id, operations) });
    return;
  }

  const activateNcoinMatch = url.pathname.match(/^\/api\/admin\/ncoin\/operations\/([^/]+)\/activate$/);
  if (req.method === "POST" && activateNcoinMatch) {
    const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
    const operations = await loadNcoinOperations(settings);
    const operation = operations.find((item) => item.id === activateNcoinMatch[1]);
    if (!operation || operation.type !== "accrual" || operation.status !== "pending") {
      sendJson(res, 400, { error: "operation_not_pending_accrual", message: "Можно активировать только ожидающее начисление." });
      return;
    }
    const now = new Date();
    operation.status = "available";
    operation.availableAt = now.toISOString();
    operation.expiresAt = addMonths(now, settings.validityMonths).toISOString();
    operation.activatedAt = now.toISOString();
    operation.activatedBy = user.id;
    await writeJson(ncoinOperationsPath, operations);
    sendJson(res, 200, { operation, summary: ncoinSummary(operation.userId, operations) });
    return;
  }

  const cancelNcoinMatch = url.pathname.match(/^\/api\/admin\/ncoin\/operations\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancelNcoinMatch) {
    const body = await readBody(req);
    const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
    const operations = await loadNcoinOperations(settings);
    const operation = operations.find((item) => item.id === cancelNcoinMatch[1]);
    if (!operation || ["spent", "expired", "canceled"].includes(operation.status)) {
      sendJson(res, 400, { error: "operation_not_cancelable", message: "Эту операцию нельзя отменить." });
      return;
    }
    operation.status = "canceled";
    operation.canceledAt = new Date().toISOString();
    operation.canceledBy = user.id;
    operation.cancelReason = String(body.comment || "Отменено администратором");
    await writeJson(ncoinOperationsPath, operations);
    sendJson(res, 200, { operation, summary: ncoinSummary(operation.userId, operations) });
    return;
  }

  const confirmSpendMatch = url.pathname.match(/^\/api\/admin\/ncoin\/operations\/([^/]+)\/confirm-spend$/);
  if (req.method === "POST" && confirmSpendMatch) {
    const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
    const operations = await loadNcoinOperations(settings);
    const operation = operations.find((item) => item.id === confirmSpendMatch[1]);
    if (!operation || operation.type !== "redeem" || operation.status !== "pending") {
      sendJson(res, 400, { error: "operation_not_pending_redeem", message: "Можно подтвердить только ожидающее списание." });
      return;
    }
    const spendableBeforeThisRequest = ncoinSummary(
      operation.userId,
      operations.filter((item) => item.id !== operation.id),
    ).available;
    if (spendableBeforeThisRequest < Number(operation.amount || 0)) {
      sendJson(res, 400, { error: "not_enough_ncoin", message: "У партнёра недостаточно доступных Ncoin для подтверждения списания." });
      return;
    }
    operation.status = "spent";
    operation.spentAt = new Date().toISOString();
    operation.confirmedBy = user.id;
    await writeJson(ncoinOperationsPath, operations);
    sendJson(res, 200, { operation, summary: ncoinSummary(operation.userId, operations) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/ncoin/shop") {
    const body = await readBody(req);
    const shop = await readJson(bonusShopPath, []);
    const cost = Math.floor(Number(body.cost || 0));
    const title = String(body.title || "").trim();
    if (!title || cost <= 0) {
      sendJson(res, 400, { error: "invalid_bonus_item", message: "Укажите название бонуса и стоимость в Ncoin." });
      return;
    }
    const id = String(body.id || "").trim() || `bonus-${Date.now()}`;
    const existing = shop.find((item) => item.id === id);
    const item = {
      id,
      title,
      category: String(body.category || "special-services").trim(),
      description: String(body.description || "").trim(),
      cost,
      availability: String(body.availability || "По запросу").trim(),
      conditions: String(body.conditions || "").trim(),
      active: body.active === undefined ? true : Boolean(body.active),
      updatedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, item);
    else shop.unshift({ ...item, createdAt: new Date().toISOString() });
    await writeJson(bonusShopPath, shop);
    sendJson(res, existing ? 200 : 201, { item: existing || item, shop });
    return;
  }

  const toggleShopMatch = url.pathname.match(/^\/api\/admin\/ncoin\/shop\/([^/]+)\/toggle$/);
  if (req.method === "POST" && toggleShopMatch) {
    const shop = await readJson(bonusShopPath, []);
    const item = shop.find((candidate) => candidate.id === toggleShopMatch[1]);
    if (!item) {
      sendJson(res, 404, { error: "bonus_item_not_found" });
      return;
    }
    item.active = !item.active;
    item.updatedAt = new Date().toISOString();
    await writeJson(bonusShopPath, shop);
    sendJson(res, 200, { item, shop });
    return;
  }

  const approveMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/approve$/);
  if (req.method === "POST" && approveMatch) {
    const body = await readBody(req);
    const users = await readJson(usersPath, []);
    const target = users.find((item) => item.id === approveMatch[1]);
    if (!target) {
      sendJson(res, 404, { error: "user_not_found" });
      return;
    }
    target.status = "active";
    target.priceGroup = ["standard", "dealer", "project", "vip"].includes(body.priceGroup) ? body.priceGroup : "dealer";
    target.approvedAt = new Date().toISOString();
    target.approvedBy = user.id;
    await writeJson(usersPath, users);
    sendJson(res, 200, { user: publicUser(target) });
    return;
  }

  sendJson(res, 404, { error: "admin_not_found" });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname.includes("..") || pathname.startsWith("/private/")) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(root) || filePath.startsWith(privateDir)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, {
      "content-type": mime[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function productsForUser(user) {
  const publicProducts = getPublicProducts();
  const privateCatalog = await readJson(privateCatalogPath, []);
  const privateMap = new Map(privateCatalog.map((item) => [item.article, item]));
  const canSeeCommercial = user && user.status === "active" && ["partner", "admin", "manager"].includes(user.role);
  const priceGroup = user?.priceGroup || "standard";

  return publicProducts.map((product) => {
    const privateInfo = privateMap.get(product.article);
    const base = { ...product };
    if (!privateInfo) return base;

    base.availability = privateInfo.quantity > 0 ? "В наличии" : "Под заказ";
    if (canSeeCommercial) {
      base.price = privateInfo.prices[priceGroup] || privateInfo.prices.standard || null;
      base.priceCurrency = "KZT";
      base.priceGroup = priceGroup;
      base.stockTotal = privateInfo.quantity;
      base.stock = privateInfo.stock;
      base.stockStatus = stockStatus(privateInfo.quantity);
    }
    return base;
  });
}

function getPublicProducts() {
  const source = fs.readFileSync(publicProductsPath, "utf8");
  return JSON.parse(source.replace(/^window\.NEXUS_PRODUCTS = /, "").replace(/;\s*$/, ""));
}

function stockStatus(quantity) {
  if (quantity <= 0) return "Под заказ";
  if (quantity < 20) return "Мало";
  return "В наличии";
}

function canAccessNcoin(user) {
  return Boolean(user && user.status === "active" && ["partner", "admin", "manager"].includes(user.role));
}

async function ncoinBundleForUser(user) {
  const settings = await readJson(ncoinSettingsPath, defaultNcoinSettings());
  const operations = await loadNcoinOperations(settings);
  const shop = await readJson(bonusShopPath, []);
  const userOperations = operations.filter((operation) => operation.userId === user.id);
  return {
    settings,
    summary: ncoinSummary(user.id, operations),
    operations: userOperations,
    shop: shop.filter((item) => item.active),
    restrictions: [
      "Ncoin начисляются только после фактической оплаты заказа.",
      "Начисление считается от суммы товаров без НДС, доставки и дополнительных услуг.",
      "При возврате товара начисленные Ncoin отменяются.",
      "Ncoin нельзя обменять на деньги, вывести наличными или передать другой компании.",
      "При просроченной задолженности списание Ncoin блокируется.",
      "Срок действия Ncoin — 12 месяцев с даты начисления.",
    ],
  };
}

async function loadNcoinOperations(settings) {
  const operations = await readJson(ncoinOperationsPath, []);
  const changed = normalizeNcoinOperations(operations, settings);
  if (changed) await writeJson(ncoinOperationsPath, operations);
  return operations;
}

function normalizeNcoinOperations(operations) {
  const now = Date.now();
  let changed = false;
  operations.forEach((operation) => {
    if (operation.type === "accrual" && operation.status === "available" && operation.expiresAt && Date.parse(operation.expiresAt) < now) {
      operation.status = "expired";
      operation.expiredAt = new Date().toISOString();
      changed = true;
    }
  });
  return changed;
}

function ncoinSummary(userId, operations) {
  const scoped = operations.filter((operation) => operation.userId === userId);
  const availableAccrual = scoped
    .filter((operation) => operation.type === "accrual" && operation.status === "available")
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const pending = scoped
    .filter((operation) => operation.type === "accrual" && operation.status === "pending")
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const spent = scoped
    .filter((operation) => operation.type === "redeem" && operation.status === "spent")
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const reserved = scoped
    .filter((operation) => operation.type === "redeem" && operation.status === "pending")
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const canceled = scoped
    .filter((operation) => operation.status === "canceled")
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const expired = scoped
    .filter((operation) => operation.status === "expired")
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);
  const expiringSoon = scoped
    .filter((operation) => operation.type === "accrual" && operation.status === "available" && isExpiringSoon(operation.expiresAt))
    .reduce((sum, operation) => sum + Number(operation.amount || 0), 0);

  return {
    available: Math.max(0, availableAccrual - spent - reserved),
    availableAccrual,
    pending,
    reserved,
    spent,
    canceled,
    expired,
    expiringSoon,
    totalEarned: scoped
      .filter((operation) => operation.type === "accrual" && ["pending", "available", "expired"].includes(operation.status))
      .reduce((sum, operation) => sum + Number(operation.amount || 0), 0),
  };
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false;
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return false;
  const now = Date.now();
  const days30 = 30 * 24 * 60 * 60 * 1000;
  return expires >= now && expires <= now + days30;
}

function ncoinRate(orderAmountBase) {
  const amount = Number(orderAmountBase || 0);
  if (amount >= 25_000_000) return 0.015;
  if (amount >= 15_000_000) return 0.01;
  return 0.005;
}

function calculateNcoin(orderAmountBase) {
  return Math.floor(Number(orderAmountBase || 0) * ncoinRate(orderAmountBase));
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(months || 12));
  return next;
}

function ncoinId() {
  return `NC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function defaultNcoinSettings() {
  return {
    valueRate: 1,
    validityMonths: 12,
    accrualBase: "goods_without_vat_delivery_services",
    thresholds: [
      { from: 0, to: 14_999_999, rate: 0.005 },
      { from: 15_000_000, to: 24_999_999, rate: 0.01 },
      { from: 25_000_000, to: null, rate: 0.015 },
    ],
    restrictions: {
      onlyPaidOrders: true,
      cancelOnReturn: true,
      noCashExchange: true,
      nonTransferable: true,
      blockRedemptionOnOverdueDebt: true,
    },
  };
}

function getCurrentUser(req) {
  const sid = getCookie(req, "nexus_sid");
  if (!sid || !sessions.has(sid)) return null;
  const users = readJsonSync(usersPath, []);
  return users.find((user) => user.id === sessions.get(sid)) || null;
}

function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) sendJson(res, 401, { error: "unauthorized" });
  return user;
}

function requireAdmin(req, res) {
  const user = getCurrentUser(req);
  if (!user || user.role !== "admin") {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return user;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function readJsonSync(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(`nexus:${password}`).digest("hex");
}

function seedPassword(envName, fallback) {
  const value = process.env[envName];
  if (value) return value;
  if (isProduction) {
    throw new Error(`${envName} is required in production`);
  }
  return fallback;
}

function ensureSeedData() {
  fs.mkdirSync(privateDir, { recursive: true });
  if (!fs.existsSync(usersPath)) {
    const adminPassword = seedPassword("ADMIN_PASSWORD", "admin123");
    const partnerPassword = seedPassword("PARTNER_PASSWORD", "partner123");
    const users = [
      {
        id: "admin",
        role: "admin",
        status: "active",
        priceGroup: "vip",
        company: "Nexus",
        bin: "",
        name: "Администратор Nexus",
        phone: "+7 700 000 00 00",
        email: "admin@nexus.kz",
        city: "Алматы",
        direction: "Администрирование",
        passwordHash: hashPassword(adminPassword),
        createdAt: new Date().toISOString(),
      },
      {
        id: "partner-demo",
        role: "partner",
        status: "active",
        priceGroup: "dealer",
        company: "ТОО Demo Partner",
        bin: "123456789012",
        name: "Партнёр Nexus",
        phone: "+7 700 111 22 33",
        email: "partner@nexus.kz",
        city: "Алматы",
        direction: "Монтаж СКС",
        passwordHash: hashPassword(partnerPassword),
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
      },
      {
        id: "partner-pending",
        role: "partner",
        status: "pending",
        priceGroup: "standard",
        company: "ТОО Pending Partner",
        bin: "990011223344",
        name: "Партнёр на модерации",
        phone: "+7 701 000 00 00",
        email: "pending@nexus.kz",
        city: "Астана",
        direction: "Проектирование",
        passwordHash: hashPassword(partnerPassword),
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), "utf8");
  }
  if (!fs.existsSync(leadsPath)) {
    fs.writeFileSync(leadsPath, "[]\n", "utf8");
  }
  if (!fs.existsSync(ncoinSettingsPath)) {
    fs.writeFileSync(ncoinSettingsPath, JSON.stringify(defaultNcoinSettings(), null, 2), "utf8");
  }
  if (!fs.existsSync(bonusShopPath)) {
    const shop = [
      {
        id: "bonus-free-delivery",
        title: "Бесплатная доставка по Казахстану",
        category: "delivery",
        description: "Компенсация доставки для следующего партнёрского заказа Nexus.",
        cost: 80000,
        availability: "По запросу",
        conditions: "Доступно при отсутствии просроченной задолженности.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-priority-assembly",
        title: "Приоритетная сборка заказа",
        category: "services",
        description: "Передача заказа в ускоренную сборку после подтверждения менеджером.",
        cost: 50000,
        availability: "По запросу",
        conditions: "Срок зависит от наличия продукции на складе.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-installer-training",
        title: "Обучение монтажников СКС",
        category: "training",
        description: "Техническая сессия по продуктовой линейке Nexus для команды партнёра.",
        cost: 180000,
        availability: "По расписанию",
        conditions: "Формат и дата согласуются с менеджером.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-tool-kit",
        title: "Набор инструментов монтажника",
        category: "tools",
        description: "Практичный комплект для монтажных работ с кабелем и модулями.",
        cost: 250000,
        availability: "Ограничено",
        conditions: "Выдаётся после подтверждения списания.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-merch",
        title: "Фирменный мерч Nexus",
        category: "merch",
        description: "Брендированные материалы для команды партнёра.",
        cost: 35000,
        availability: "В наличии",
        conditions: "Состав набора зависит от доступности.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-doc-pack",
        title: "Пакет сертификатов и технических листов",
        category: "documents",
        description: "Подготовка расширенного комплекта документации под проект.",
        cost: 20000,
        availability: "Цифровой бонус",
        conditions: "Документы отправляются на email партнёра.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-marketing-pack",
        title: "Маркетинговые материалы для дилера",
        category: "marketing",
        description: "Каталоги, презентации и продуктовые материалы Nexus для продаж.",
        cost: 60000,
        availability: "По запросу",
        conditions: "Для активных дилеров и проектных партнёров.",
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "bonus-gift",
        title: "Подарок для партнёрской команды",
        category: "gifts",
        description: "Бонусный подарок, который менеджер подберёт под профиль партнёра.",
        cost: 120000,
        availability: "По запросу",
        conditions: "Ncoin не обмениваются на денежный эквивалент.",
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(bonusShopPath, JSON.stringify(shop, null, 2), "utf8");
  }
  if (!fs.existsSync(ncoinOperationsPath)) {
    const now = new Date();
    const operations = [
      {
        id: "NC-DEMO-AVAILABLE",
        userId: "partner-demo",
        company: "ТОО Demo Partner",
        type: "accrual",
        status: "available",
        orderId: "ORD-DEMO-25000000",
        orderAmountBase: 25000000,
        excluded: "vat_delivery_services",
        rate: 0.015,
        amount: 375000,
        createdAt: now.toISOString(),
        paidAt: now.toISOString(),
        availableAt: now.toISOString(),
        expiresAt: addMonths(now, 12).toISOString(),
        comment: "Демо-начисление: заказ оплачен и закрыт",
        source: "seed",
      },
      {
        id: "NC-DEMO-PENDING",
        userId: "partner-demo",
        company: "ТОО Demo Partner",
        type: "accrual",
        status: "pending",
        orderId: "ORD-DEMO-10000000",
        orderAmountBase: 10000000,
        excluded: "vat_delivery_services",
        rate: 0.005,
        amount: 50000,
        createdAt: now.toISOString(),
        paidAt: now.toISOString(),
        availableAt: null,
        expiresAt: null,
        comment: "Демо-начисление: заказ оплачен, ожидает закрытия",
        source: "seed",
      },
    ];
    fs.writeFileSync(ncoinOperationsPath, JSON.stringify(operations, null, 2), "utf8");
  }
}
