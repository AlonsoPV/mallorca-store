/**
 * Lightweight local API mock for Windows/dev without Postgres.
 * Serves the storefront + local-dev auth endpoints the Vite app expects on :8080.
 *
 *   node artifacts/api-server/local-mock-server.mjs
 */
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8080);

const hours = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
].map((day, index) => ({
  day,
  label: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][index],
  open: "08:00",
  close: "21:00",
  closed: false,
}));

function branch(id, name, slug, shortName, neighborhood) {
  return {
    id,
    name,
    slug,
    shortName,
    description: `Sucursal ${shortName} — datos mock para desarrollo local.`,
    address: `Av. Ejemplo ${id}00`,
    neighborhood,
    borough: "Miguel Hidalgo",
    city: "Ciudad de México",
    state: "CDMX",
    postalCode: "11000",
    country: "MX",
    latitude: 19.43,
    longitude: -99.2,
    phone: "5550000000",
    whatsapp: "525550000000",
    email: `${slug}@mallorca.local`,
    mapsUrl: "https://maps.google.com",
    openTableUrl: null,
    instagramUrl: null,
    imageUrl: "/images/mallorca-panettone-hero.jpg",
    gallery: [],
    hours,
    pickupAvailable: true,
    deliveryAvailable: true,
    deliveryRadiusKm: 8,
    minimumOrder: 250,
    preparationTimeMinutes: 60,
    deliveryTimeMinutes: 90,
    active: true,
    status: "active",
    branchCode: shortName.slice(0, 3).toUpperCase(),
    featured: false,
    ordersToday: id === 2 ? 14 : 9,
    alertsOpen: id === 2 ? 3 : 1,
    primaryResponsible: { name: id === 1 ? "Carlos Ruiz" : "Ana Pérez", email: `mgr${id}@mallorca.local`, role: "branch_manager" },
  };
}

const branches = [
  branch(1, "Mallorca Lomas", "lomas", "Lomas", "Lomas de Chapultepec"),
  branch(2, "Mallorca Reforma", "reforma", "Reforma", "Juárez"),
];

const categories = [
  {
    id: 1,
    name: "Pasteles",
    slug: "pasteles",
    description: "Pastelería clásica",
    imageUrl: "/images/mallorca-chocolate-cake.jpg",
    productCount: 2,
  },
  {
    id: 2,
    name: "Bollería",
    slug: "bolleria",
    description: "Horneado del día",
    imageUrl: "/images/mallorca-bolleria.jpg",
    productCount: 1,
  },
];

function availability(branchId, branchSlug, branchName, price) {
  return {
    branchId,
    branchSlug,
    branchName,
    available: true,
    inventory: 25,
    price,
    salePrice: null,
    preparationTimeMinutes: 60,
    pickupAvailable: true,
    deliveryAvailable: true,
  };
}

const products = [
  {
    id: 1,
    sku: "PSK-001",
    name: "Pastel de Chocolate",
    slug: "pastel-chocolate",
    shortDescription: "Bizcocho húmedo con ganache.",
    price: 680,
    salePrice: null,
    categoryName: "Pasteles",
    categorySlug: "pasteles",
    categories: [
      { id: 1, name: "Pasteles", slug: "pasteles", isPrimary: true },
      { id: 2, name: "Bollería", slug: "bolleria", isPrimary: false },
    ],
    tags: ["Chocolate", "Regalo"],
    crossSellProductIds: [3],
    imageUrl: "/images/mallorca-chocolate-cake.jpg",
    featured: true,
    seasonal: false,
    minimumLeadTimeHours: 4,
    availability: [
      availability(1, "lomas", "Mallorca Lomas", 680),
      availability(2, "reforma", "Mallorca Reforma", 680),
    ],
  },
  {
    id: 2,
    sku: "PAN-001",
    name: "Panettone Clásico",
    slug: "panettone-clasico",
    shortDescription: "Masa madre y frutas confitadas.",
    price: 520,
    salePrice: 480,
    categoryName: "Pasteles",
    categorySlug: "pasteles",
    categories: [{ id: 1, name: "Pasteles", slug: "pasteles", isPrimary: true }],
    tags: ["Navidad", "Temporada"],
    crossSellProductIds: [1, 3],
    imageUrl: "/images/mallorca-panettone-hero.jpg",
    featured: true,
    seasonal: true,
    minimumLeadTimeHours: 6,
    availability: [
      availability(1, "lomas", "Mallorca Lomas", 520),
      availability(2, "reforma", "Mallorca Reforma", 520),
    ],
  },
  {
    id: 3,
    sku: "BOL-001",
    name: "Croissant de Mantequilla",
    slug: "croissant-mantequilla",
    shortDescription: "Hojaldre laminado a mano.",
    price: 55,
    salePrice: null,
    categoryName: "Bollería",
    categorySlug: "bolleria",
    categories: [{ id: 2, name: "Bollería", slug: "bolleria", isPrimary: true }],
    tags: [],
    crossSellProductIds: [],
    imageUrl: "/images/mallorca-bolleria.jpg",
    featured: true,
    seasonal: false,
    minimumLeadTimeHours: 0,
    availability: [
      availability(1, "lomas", "Mallorca Lomas", 55),
      availability(2, "reforma", "Mallorca Reforma", 55),
    ],
  },
];

const localUser = {
  id: "user_local_dev_admin",
  email: "alpeva96@gmail.com",
  firstName: "Admin",
  lastName: "Local",
  phone: null,
  role: "admin",
};

function atToday(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function atTomorrow(hour, minute = 0) {
  const d = atToday(hour, minute);
  d.setDate(d.getDate() + 1);
  return d;
}

function makeOrder({
  id,
  orderNumber,
  status,
  branchId,
  customerName,
  customerPhone,
  fulfillmentMethod,
  scheduledStart,
  items,
  total,
}) {
  const branch = branches.find((b) => b.id === branchId);
  const scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60 * 1000);
  return {
    id,
    orderNumber,
    guestAccessToken: `guest_${id}`,
    status,
    paymentStatus: status === "pending_payment" ? "unpaid" : "paid",
    fulfillmentMethod,
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    createdAt: new Date(scheduledStart.getTime() - 60 * 60 * 1000).toISOString(),
    branchId,
    branchName: branch?.name ?? "Sucursal",
    customerName,
    customerEmail: `${customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    customerPhone,
    deliveryAddress: fulfillmentMethod === "delivery" ? "Calle Ejemplo 123" : null,
    subtotal: total,
    deliveryFee: fulfillmentMethod === "delivery" ? 50 : 0,
    total: fulfillmentMethod === "delivery" ? total + 50 : total,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

const orders = [
  makeOrder({
    id: "ord_1042",
    orderNumber: "1042",
    status: "preparing",
    branchId: 2,
    customerName: "Ana López",
    customerPhone: "5511111111",
    fulfillmentMethod: "pickup",
    scheduledStart: atToday(12, 0),
    total: 850,
    items: [
      { id: 1, productId: 3, variantId: null, sku: "BOL-001", name: "Croissant de Mantequilla", variantLabel: null, quantity: 2, unitPrice: 55, lineTotal: 110 },
      { id: 2, productId: 2, variantId: null, sku: "PAN-001", name: "Panettone Clásico", variantLabel: null, quantity: 1, unitPrice: 520, lineTotal: 520 },
    ],
  }),
  makeOrder({
    id: "ord_1043",
    orderNumber: "1043",
    status: "paid",
    branchId: 1,
    customerName: "Carlos Ruiz",
    customerPhone: "5522222222",
    fulfillmentMethod: "delivery",
    scheduledStart: atToday(12, 30),
    total: 680,
    items: [
      { id: 3, productId: 1, variantId: null, sku: "PSK-001", name: "Pastel de Chocolate", variantLabel: null, quantity: 1, unitPrice: 680, lineTotal: 680 },
    ],
  }),
  makeOrder({
    id: "ord_1045",
    orderNumber: "1045",
    status: "preparing",
    branchId: 2,
    customerName: "Ana López",
    customerPhone: "5511111111",
    fulfillmentMethod: "pickup",
    scheduledStart: atToday(14, 0),
    total: 630,
    items: [
      { id: 4, productId: 3, variantId: null, sku: "BOL-001", name: "Croissant de Mantequilla", variantLabel: null, quantity: 2, unitPrice: 55, lineTotal: 110 },
      { id: 5, productId: 2, variantId: null, sku: "PAN-001", name: "Panettone Clásico", variantLabel: null, quantity: 1, unitPrice: 520, lineTotal: 520 },
    ],
  }),
  makeOrder({
    id: "ord_1047",
    orderNumber: "1047",
    status: "paid",
    branchId: 1,
    customerName: "Carlos Ruiz",
    customerPhone: "5522222222",
    fulfillmentMethod: "delivery",
    scheduledStart: atTomorrow(10, 0),
    total: 680,
    items: [
      { id: 6, productId: 1, variantId: null, sku: "PSK-001", name: "Pastel de Chocolate", variantLabel: null, quantity: 1, unitPrice: 680, lineTotal: 680 },
    ],
  }),
];

const ORDER_TRANSITIONS = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function toOrderSummary(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
    scheduledStart: order.scheduledStart,
    branchId: order.branchId,
    branchName: order.branchName,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    fulfillmentMethod: order.fulfillmentMethod,
    itemCount: order.itemCount,
    items: order.items.map((i) => ({ name: i.name, quantity: i.quantity })),
  };
}

function send(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  });
  res.end(payload);
}

function requireLocalAuth(req, res) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase() === "bearer local-dev") return true;
  send(res, 401, { error: "Unauthorized" });
  return false;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function filterProducts(url) {
  let list = [...products];
  const featured = url.searchParams.get("featured");
  const categorySlug = url.searchParams.get("categorySlug");
  const search = url.searchParams.get("search")?.toLowerCase();
  const branchSlug = url.searchParams.get("branchSlug");

  if (featured === "true") list = list.filter((p) => p.featured);
  if (categorySlug) {
    list = list.filter(
      (p) =>
        p.categorySlug === categorySlug ||
        (p.categories ?? []).some((c) => c.slug === categorySlug),
    );
  }
  if (search) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.shortDescription.toLowerCase().includes(search),
    );
  }
  if (branchSlug) {
    list = list
      .map((p) => ({
        ...p,
        availability: p.availability.filter((a) => a.branchSlug === branchSlug),
      }))
      .filter((p) => p.availability.length > 0);
  }
  return list;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204);
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && (path === "/api/healthz" || path === "/healthz")) {
    send(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && path === "/api/branches") {
    send(res, 200, branches);
    return;
  }

  if (req.method === "GET" && path.startsWith("/api/branches/")) {
    const slug = path.slice("/api/branches/".length);
    const found = branches.find((b) => b.slug === slug);
    if (!found) {
      send(res, 404, { error: "Branch not found" });
      return;
    }
    send(res, 200, {
      ...found,
      products: filterProducts(new URL(`http://x/?branchSlug=${slug}`)),
    });
    return;
  }

  if (req.method === "GET" && path === "/api/categories") {
    send(res, 200, categories);
    return;
  }

  if (req.method === "GET" && path === "/api/products") {
    send(res, 200, filterProducts(url));
    return;
  }

  if (req.method === "GET" && path.startsWith("/api/products/")) {
    const slug = path.slice("/api/products/".length);
    const found = products.find((p) => p.slug === slug);
    if (!found) {
      send(res, 404, { error: "Product not found" });
      return;
    }
    send(res, 200, {
      ...found,
      description: found.shortDescription,
      gallery: found.imageUrl ? [] : [],
      ingredients: null,
      allergens: null,
      conservation: null,
      weight: null,
      portions: null,
      variants: [],
      tags: found.tags ?? [],
      crossSellProductIds: found.crossSellProductIds ?? [],
      status: "active",
    });
    return;
  }

  if (req.method === "GET" && path === "/api/me") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, localUser);
    return;
  }

  if (req.method === "PATCH" && path === "/api/me") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, localUser);
    return;
  }

  if (req.method === "GET" && path === "/api/me/orders") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, []);
    return;
  }

  if (req.method === "GET" && path === "/api/admin/summary") {
    if (!requireLocalAuth(req, res)) return;
    const start = atToday(0, 0);
    const end = atTomorrow(0, 0);
    const now = new Date();
    const inHour = new Date(now.getTime() + 60 * 60 * 1000);
    const todayOrders = orders.filter((o) => {
      const s = new Date(o.scheduledStart);
      return s >= start && s < end && o.status !== "cancelled";
    });
    send(res, 200, {
      totalProducts: products.length,
      activeProducts: products.length,
      totalBranches: branches.length,
      lowStockProducts: 1,
      outOfStockProducts: 0,
      ordersToday: todayOrders.length,
      ordersPending: orders.filter((o) => ["pending_payment", "paid", "preparing", "ready"].includes(o.status)).length,
      ordersNextHour: orders.filter((o) => {
        const s = new Date(o.scheduledStart);
        return s >= now && s < inHour && !["cancelled", "completed"].includes(o.status);
      }).length,
      alertsCount: 1,
      salesToday: todayOrders.reduce((sum, o) => sum + o.total, 0),
      branchSummaries: branches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        activeProducts: products.length,
        lowStockProducts: b.id === 2 ? 1 : 0,
      })),
    });
    return;
  }

  if (req.method === "GET" && path === "/api/admin/branches") {
    if (!requireLocalAuth(req, res)) return;
    send(
      res,
      200,
      branches.map((b) => ({
        ...b,
        deliveryFee: 0,
        taxRate: 0.16,
        timezone: "America/Mexico_City",
      })),
    );
    return;
  }

  if (req.method === "POST" && path === "/api/admin/branches") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        const id = Math.max(0, ...branches.map((b) => b.id)) + 1;
        const created = {
          ...branch(id, body.name || `Sucursal ${id}`, body.slug || `sucursal-${id}`, body.shortName || body.name || `S${id}`, body.neighborhood || "Centro"),
          ...body,
          id,
          branchCode: (body.branchCode || `B${id}`).toUpperCase(),
          status: body.status || "inactive",
          active: (body.status || "inactive") === "active",
          ordersToday: 0,
          alertsOpen: 0,
        };
        branches.push(created);
        send(res, 201, created);
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "GET" && path === "/api/admin/branches/export") {
    if (!requireLocalAuth(req, res)) return;
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
    res.end("branch_code,name,address,city,state,zip,phone,email,whatsapp,reservation_url,maps_url,active,status\n");
    return;
  }

  if (req.method === "GET" && path === "/api/admin/products") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, products);
    return;
  }

  if (req.method === "GET" && path === "/api/admin/orders") {
    if (!requireLocalAuth(req, res)) return;
    const status = url.searchParams.get("status");
    const branchId = url.searchParams.get("branchId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const fulfillmentMethod = url.searchParams.get("fulfillmentMethod");
    let rows = orders.map(toOrderSummary);
    if (status) rows = rows.filter((o) => o.status === status);
    if (branchId) rows = rows.filter((o) => o.branchId === Number(branchId));
    if (fulfillmentMethod) rows = rows.filter((o) => o.fulfillmentMethod === fulfillmentMethod);
    if (from) rows = rows.filter((o) => new Date(o.scheduledStart) >= new Date(from));
    if (to) rows = rows.filter((o) => new Date(o.scheduledStart) < new Date(to));
    send(res, 200, rows);
    return;
  }

  if (req.method === "POST" && path === "/api/admin/orders/preview") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        const lines = (body?.lines || []).map((line) => ({
          productId: line.productId ?? null,
          variantId: line.variantId ?? null,
          sku: line.manualLineItem ? "MANUAL" : "SKU",
          name: line.description || `Producto ${line.productId}`,
          variantLabel: null,
          quantity: line.quantity || 1,
          listUnitPrice: line.unitPrice || 100,
          unitPrice: line.unitPrice || 100,
          lineTotal: (line.unitPrice || 100) * (line.quantity || 1),
          promotionDiscount: 0,
          manualLineItem: Boolean(line.manualLineItem),
          available: true,
          inventory: 10,
          reason: null,
        }));
        const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
        send(res, 200, {
          lines,
          subtotal,
          promotionDiscountTotal: 0,
          discountAmount: 0,
          discountPercent: null,
          couponCode: null,
          couponDiscount: 0,
          deliveryFee: body?.fulfillmentMethod === "delivery" ? 80 : 0,
          total: subtotal + (body?.fulfillmentMethod === "delivery" ? 80 : 0),
          errors: [],
        });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "POST" && path === "/api/admin/orders") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        const id = `ord_manual_${Date.now()}`;
        const items = (body?.lines || []).map((line, idx) => ({
          id: idx + 1,
          productId: line.productId ?? null,
          variantId: line.variantId ?? null,
          sku: line.manualLineItem ? "MANUAL" : "SKU",
          name: line.description || `Producto ${line.productId}`,
          variantLabel: null,
          quantity: line.quantity || 1,
          unitPrice: line.unitPrice || 100,
          lineTotal: (line.unitPrice || 100) * (line.quantity || 1),
          manualLineItem: Boolean(line.manualLineItem),
        }));
        const subtotal = items.reduce((s, l) => s + l.lineTotal, 0);
        const order = {
          id,
          orderNumber: `M-MOCK${String(orders.length + 1).padStart(3, "0")}`,
          guestAccessToken: "mock-token",
          orderSource: body?.orderSource || "PHONE",
          status: body?.markPaid ? "paid" : "pending_payment",
          paymentStatus: body?.markPaid ? "paid" : "unpaid",
          paymentMethod: body?.paymentMethod || "PENDING",
          amountPaid: body?.markPaid ? subtotal : 0,
          fulfillmentMethod: body?.fulfillmentMethod || "pickup",
          scheduledStart: body?.scheduledStart || new Date().toISOString(),
          scheduledEnd: body?.scheduledStart || new Date().toISOString(),
          customerEmail: body?.customerEmail,
          customerName: body?.customerName,
          customerPhone: body?.customerPhone,
          deliveryAddress: body?.deliveryAddress ?? null,
          customerNotes: body?.customerNotes ?? null,
          productionNotes: body?.productionNotes ?? null,
          internalNotes: body?.internalNotes ?? null,
          subtotal,
          promotionDiscountTotal: 0,
          discountAmount: 0,
          deliveryFee: 0,
          total: subtotal,
          branchId: body?.branchId,
          branchName: branches.find((b) => b.id === body?.branchId)?.name,
          items,
          createdAt: new Date().toISOString(),
        };
        orders.unshift(order);
        send(res, 201, order);
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "GET" && path === "/api/admin/customers/search") {
    if (!requireLocalAuth(req, res)) return;
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const hits = orders
      .filter((o) =>
        String(o.customerName || "").toLowerCase().includes(q) ||
        String(o.customerEmail || "").toLowerCase().includes(q) ||
        String(o.customerPhone || "").includes(q),
      )
      .slice(0, 8)
      .map((o) => ({
        userId: null,
        name: o.customerName,
        email: o.customerEmail,
        phone: o.customerPhone,
        orderCount: 1,
        lastOrderAt: o.createdAt,
      }));
    send(res, 200, hits);
    return;
  }

  const orderMatch = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch) {
    if (!requireLocalAuth(req, res)) return;
    const order = orders.find((o) => o.id === orderMatch[1]);
    if (!order) {
      send(res, 404, { error: "Order not found" });
      return;
    }
    if (req.method === "GET") {
      send(res, 200, order);
      return;
    }
    if (req.method === "PATCH") {
      readJson(req)
        .then((body) => {
          const next = body?.status;
          const allowed = ORDER_TRANSITIONS[order.status] || [];
          if (!allowed.includes(next) && next !== order.status) {
            send(res, 409, { error: "Invalid status transition" });
            return;
          }
          order.status = next;
          if (next === "paid") order.paymentStatus = "paid";
          send(res, 200, order);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
  }

  const branchDetailMatch = path.match(/^\/api\/admin\/branches\/(\d+)$/);
  if (branchDetailMatch) {
    if (!requireLocalAuth(req, res)) return;
    const branchId = Number(branchDetailMatch[1]);
    const branchIdx = branches.findIndex((b) => b.id === branchId);
    const branch = branches[branchIdx];
    if (!branch) {
      send(res, 404, { error: "Branch not found" });
      return;
    }
    if (req.method === "GET") {
      const branchOrders = orders.filter((o) => o.branchId === branchId);
      send(res, 200, {
        branch: {
          ...branch,
          deliveryFee: 0,
          taxRate: 0.16,
          timezone: "America/Mexico_City",
          managerName: "María Pérez",
          managerEmail: "maria@mallorca.local",
          managerPhone: "5533333333",
          notificationPreferences: { email: true, inApp: true },
        },
        general: branch,
        contact: { phone: branch.phone, whatsapp: branch.whatsapp, email: branch.email, whatsappUrl: `https://wa.me/${String(branch.whatsapp || "").replace(/\D/g, "")}` },
        hours: branch.hours,
        specialHours: [],
        links: [],
        images: [],
        products: products.map((p) => ({
          product: p,
          configuration: { branchId, productId: p.id, available: true, inventory: 20 },
        })),
        inventory: products.map((p) => ({
          product: p,
          configuration: { branchId, productId: p.id, available: true, inventory: p.id === 2 && branchId === 2 ? 2 : 20, minStock: 5 },
        })),
        orders: branchOrders,
        alerts: branchId === 2
          ? [{ alert: { id: 1, state: "LOW_STOCK", stock: 2, minStock: 5 }, product: products[1] }]
          : [],
        notificationSettings: { email: true, inApp: true },
        team: [],
        audit: [],
        futureOrdersCount: 0,
        summary: {
          ordersToday: branch.ordersToday || 0,
          salesToday: 18500,
          alertsOpen: branch.alertsOpen || 0,
          outOfStock: 0,
          lowStockProducts: branchId === 2 ? ["Panettone Clásico"] : [],
          upcoming: branchOrders.slice(0, 3).map((o) => ({ id: o.id, scheduledStart: o.scheduledStart, status: o.status, total: o.total })),
        },
      });
      return;
    }
    if (req.method === "PATCH") {
      readJson(req)
        .then((body) => {
          branches[branchIdx] = { ...branch, ...body, id: branchId };
          if (body.status) {
            branches[branchIdx].active = body.status === "active";
          }
          send(res, 200, branches[branchIdx]);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
    if (req.method === "DELETE") {
      send(res, 409, { error: "La sucursal tiene historial operativo. Usa Archivar." });
      return;
    }
  }

  const branchActionMatch = path.match(/^\/api\/admin\/branches\/(\d+)\/(deactivate|archive|duplicate|audit)$/);
  if (branchActionMatch) {
    if (!requireLocalAuth(req, res)) return;
    const branchId = Number(branchActionMatch[1]);
    const action = branchActionMatch[2];
    const branchIdx = branches.findIndex((b) => b.id === branchId);
    const source = branches[branchIdx];
    if (!source) {
      send(res, 404, { error: "Branch not found" });
      return;
    }
    if (action === "audit" && req.method === "GET") {
      send(res, 200, []);
      return;
    }
    if (action === "deactivate" && req.method === "POST") {
      branches[branchIdx] = { ...source, status: "inactive", active: false };
      send(res, 200, branches[branchIdx]);
      return;
    }
    if (action === "archive" && req.method === "POST") {
      branches[branchIdx] = { ...source, status: "archived", active: false };
      send(res, 200, branches[branchIdx]);
      return;
    }
    if (action === "duplicate" && req.method === "POST") {
      readJson(req)
        .then((body) => {
          const id = Math.max(0, ...branches.map((b) => b.id)) + 1;
          const created = {
            ...source,
            id,
            name: body.name,
            branchCode: String(body.branchCode || `B${id}`).toUpperCase(),
            slug: body.slug || `sucursal-${id}`,
            shortName: body.shortName || body.name,
            status: "inactive",
            active: false,
            ordersToday: 0,
            alertsOpen: 0,
          };
          branches.push(created);
          send(res, 201, created);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
  }

  if (req.method === "GET" && path === "/api/admin/inventory/alerts") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, []);
    return;
  }

  if (req.method === "POST" && path === "/api/admin/inventory/alerts") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        send(res, 201, {
          alert: {
            id: Date.now(),
            ...body,
            source: "MANUAL",
            status: "OPEN",
            createdAt: new Date().toISOString(),
          },
        });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "PATCH" && path.startsWith("/api/admin/inventory/alerts/")) {
    if (!requireLocalAuth(req, res)) return;
    const id = Number(path.split("/").pop());
    readJson(req)
      .then((body) => send(res, 200, { alert: { id, ...body } }))
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "GET" && path === "/api/admin/inventory") {
    if (!requireLocalAuth(req, res)) return;
    let rowId = 1;
    const rows = [];
    for (const b of branches) {
      for (const p of products) {
        const inventory = 20 + p.id * 3;
        rows.push({
          branchProduct: {
            id: rowId++,
            branchId: b.id,
            productId: p.id,
            inventory,
            minStock: 5,
            criticalStock: 2,
            autoAlertEnabled: true,
            alertState: "NORMAL",
            price: p.price,
            salePrice: p.salePrice,
            available: true,
            preparationTimeMinutes: 60,
          },
          branch: b,
          product: p,
          reservedStock: 0,
          availableStock: inventory,
          criticalStock: 2,
          autoAlertEnabled: true,
          openAlertCount: 0,
          inventoryStatus: "NORMAL",
        });
      }
    }
    send(res, 200, rows);
    return;
  }

  if (req.method === "GET" && path === "/api/admin/reports/branches") {
    if (!requireLocalAuth(req, res)) return;
    send(
      res,
      200,
      branches.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        orderCount: 0,
        revenue: "0",
        inventoryCount: products.length * 20,
        inventoryValue: String(products.reduce((sum, p) => sum + p.price * 20, 0)),
        lowStockCount: 0,
        outOfStockCount: 0,
      })),
    );
    return;
  }

  if (req.method === "GET" && path === "/api/admin/users") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, [
      {
        id: localUser.id,
        name: `${localUser.firstName} ${localUser.lastName}`,
        email: localUser.email,
        role: localUser.role,
      },
    ]);
    return;
  }

  if (req.method === "GET" && path === "/api/admin/category-responsibles") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, []);
    return;
  }

  if (req.method === "GET" && /^\/api\/admin\/branches\/\d+\/assignments$/.test(path)) {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, []);
    return;
  }

  if (req.method === "GET" && path === "/api/fulfillment/slots") {
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const slots = ["10:00", "12:00", "14:00", "16:00", "18:00"].map((time, index) => {
      const start = new Date(`${date}T${String(10 + index * 2).padStart(2, "0")}:00:00.000-06:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        available: true,
        remainingCapacity: 8,
      };
    });
    send(res, 200, slots);
    return;
  }

  if (req.method === "POST" && path === "/api/admin/products/export") {
    if (!requireLocalAuth(req, res)) return;
    const header = "sku,name,price,status\n";
    const body = products.map((p) => `${p.sku},${p.name},${p.price},active`).join("\n");
    send(res, 200, {
      filename: "productos-mallorca.csv",
      contentType: "text/csv; charset=utf-8",
      content: header + body,
    });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/products/bulk") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        send(res, 200, { updated: Array.isArray(body?.ids) ? body.ids.length : 0, errors: [] });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  const dupMatch = path.match(/^\/api\/admin\/products\/(\d+)\/duplicate$/);
  if (req.method === "POST" && dupMatch) {
    if (!requireLocalAuth(req, res)) return;
    const source = products.find((p) => p.id === Number(dupMatch[1]));
    if (!source) {
      send(res, 404, { error: "Product not found" });
      return;
    }
    const copy = {
      ...source,
      id: products.length + 1,
      sku: `${source.sku}-COPY`,
      slug: `${source.slug}-copy`,
      name: `${source.name} (copia)`,
      status: "draft",
    };
    products.push(copy);
    send(res, 201, copy);
    return;
  }

  if (req.method === "GET" && path === "/api/admin/import-jobs") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, []);
    return;
  }

  if (req.method === "POST" && path === "/api/admin/products/import/preview") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, { rows: [], errors: [], valid: false });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/products/import") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, { imported: 0, created: 0, updated: 0, errors: [], jobId: "mock-job" });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/inventory/import/preview") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, { rows: [], errors: [], valid: true });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/inventory/import") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, { imported: 0, errors: [], jobId: "mock-inv-job" });
    return;
  }

  send(res, 404, {
    error: `Local mock has no route for ${req.method} ${path}`,
    hint: "Add DATABASE_URL and run the real api-server for full coverage.",
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[local-mock-api] listening on http://127.0.0.1:${PORT}`);
  console.log(`[local-mock-api] auth: Authorization: Bearer local-dev`);
});
