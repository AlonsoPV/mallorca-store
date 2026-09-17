/**
 * Lightweight local API mock for Windows/dev without Postgres.
 * Serves the storefront + local-dev auth endpoints the Vite app expects on :8080.
 *
 *   node artifacts/api-server/local-mock-server.mjs
 */
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8080);

/** In-memory object store for local image uploads (mock only). */
const localObjects = new Map();

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
  const street = `Av. Ejemplo`;
  const externalNumber = `${id}00`;
  const borough = "Miguel Hidalgo";
  const city = "Ciudad de México";
  const state = "CDMX";
  const postalCode = "11000";
  const country = "MX";
  const address = [street, externalNumber].filter(Boolean).join(" ")
    + `, ${neighborhood}, ${borough}, ${city}, ${state}, ${postalCode}, ${country}`;
  return {
    id,
    name,
    slug,
    shortName,
    description: `Sucursal ${shortName} — datos mock para desarrollo local.`,
    street,
    externalNumber,
    internalNumber: null,
    address,
    neighborhood,
    borough,
    city,
    state,
    postalCode,
    country,
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
    freeDeliveryFrom: null,
    preparationTimeMinutes: 60,
    deliveryTimeMinutes: 90,
    pickupSlotIntervalMinutes: 30,
    pickupSlotCapacity: 8,
    deliveryFee: 90,
    active: true,
    status: "active",
    branchCode: shortName.slice(0, 3).toUpperCase(),
    featured: false,
    ordersToday: id === 2 ? 14 : 9,
    alertsOpen: id === 2 ? 3 : 1,
    primaryResponsible: {
      userId: id === 1 ? "user_mgr_lomas" : "user_mgr_reforma",
      name: id === 1 ? "Carlos Ruiz" : "Ana Pérez",
      email: `mgr${id}@mallorca.local`,
      role: "branch_manager",
    },
  };
}

function buildMockFormattedAddress(parts) {
  const line1 = [parts.street, parts.externalNumber, parts.internalNumber ? `Int. ${parts.internalNumber}` : null]
    .filter(Boolean)
    .join(" ");
  const rest = [
    parts.neighborhood,
    parts.borough,
    parts.city,
    parts.state,
    parts.postalCode,
    parts.country,
  ]
    .filter(Boolean)
    .join(", ");
  const built = [line1, rest].filter(Boolean).join(", ");
  return built || parts.address || "";
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

function availability(branchId, branchSlug, branchName, price, extra = {}) {
  const inventory = extra.inventory ?? 25;
  return {
    branchId,
    branchSlug,
    branchName,
    available: extra.available ?? true,
    inventory,
    physicalStock: inventory,
    reservedStock: extra.reservedStock ?? 0,
    availableStock: Math.max(0, inventory - (extra.reservedStock ?? 0)),
    minStock: extra.minStock ?? 3,
    criticalStock: extra.criticalStock ?? 1,
    autoAlertEnabled: extra.autoAlertEnabled !== false,
    alertState: extra.alertState ?? (inventory <= 0 ? "OUT_OF_STOCK" : "NORMAL"),
    price,
    salePrice: extra.salePrice ?? null,
    priceOverride: extra.priceOverride ?? null,
    salePriceOverride: extra.salePriceOverride ?? null,
    preparationTimeMinutes: extra.preparationTimeMinutes ?? 60,
    pickupAvailable: extra.pickupAvailable !== false,
    deliveryAvailable: extra.deliveryAvailable !== false,
    promotion: extra.promotion ?? null,
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
      availability(2, "reforma", "Mallorca Reforma", 55, { inventory: 1, alertState: "LOW_STOCK" }),
    ],
  },
];

let nextProductId = products.length + 1;
let nextPromotionId = 2;
const promotionsByProduct = new Map([
  [
    2,
    [
      {
        id: 1,
        name: "Temporada panettone",
        type: "amount",
        value: 40,
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: "2026-12-31T00:00:00.000Z",
        status: "active",
        finalPrice: 480,
        savings: 40,
        branchIds: [],
        createdAt: "2026-09-01T00:00:00.000Z",
        createdBy: "user_local_dev_admin",
        cancelledAt: null,
        cancelledBy: null,
      },
    ],
  ],
]);

function toAdminProductDetail(product) {
  return {
    ...product,
    description: product.description ?? product.shortDescription,
    gallery: product.gallery ?? [],
    ingredients: product.ingredients ?? null,
    allergens: product.allergens ?? null,
    conservation: product.conservation ?? null,
    weight: product.weight ?? null,
    portions: product.portions ?? null,
    variants: product.variants ?? [],
    tags: product.tags ?? [],
    status: product.status ?? "active",
    featured: Boolean(product.featured),
    seasonal: Boolean(product.seasonal),
    crossSellProductIds: product.crossSellProductIds ?? [],
  };
}

function applyBranchConfigurations(product, configurations) {
  if (!Array.isArray(configurations)) return product.availability;
  const byId = new Map(product.availability.map((row) => [row.branchId, row]));
  for (const config of configurations) {
    const branchRow = branches.find((item) => item.id === Number(config.branchId));
    if (!branchRow) continue;
    const previous = byId.get(branchRow.id) ?? availability(branchRow.id, branchRow.slug, branchRow.name, product.price);
    const inventory = config.inventory ?? previous.inventory;
    byId.set(branchRow.id, {
      ...previous,
      available: config.available ?? previous.available,
      inventory,
      physicalStock: inventory,
      reservedStock: previous.reservedStock ?? 0,
      availableStock: Math.max(0, inventory - (previous.reservedStock ?? 0)),
      minStock: config.minStock ?? previous.minStock,
      criticalStock: config.criticalStock === undefined ? previous.criticalStock : config.criticalStock,
      autoAlertEnabled: config.autoAlertEnabled ?? previous.autoAlertEnabled,
      priceOverride: config.priceOverride === undefined ? previous.priceOverride : config.priceOverride,
      salePriceOverride: config.salePriceOverride === undefined ? previous.salePriceOverride : config.salePriceOverride,
      pickupAvailable: config.pickupAvailable ?? previous.pickupAvailable,
      deliveryAvailable: config.deliveryAvailable ?? previous.deliveryAvailable,
      preparationTimeMinutes: config.preparationTimeMinutes ?? previous.preparationTimeMinutes,
      price: config.priceOverride ?? product.price,
    });
  }
  return [...byId.values()];
}

const carts = new Map();
let cartItemSeq = 1;

function cartView(cart) {
  const subtotal = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const quantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    id: cart.id,
    branch: cart.branch,
    items: cart.items,
    subtotal,
    quantity,
    maxLeadTimeMinutes: 60,
  };
}

function productSellable(product, branchId) {
  const row = product.availability.find((item) => item.branchId === branchId);
  return row?.inventory ?? 0;
}

const localUser = {
  id: "user_local_dev_admin",
  email: "alpeva96@gmail.com",
  firstName: "Admin",
  lastName: "Local",
  phone: null,
  role: "admin",
};

const mockUsers = [
  localUser,
  {
    id: "user_mgr_lomas",
    email: "mgr1@mallorca.local",
    firstName: "Carlos",
    lastName: "Ruiz",
    phone: null,
    role: "branch_manager",
  },
  {
    id: "user_mgr_reforma",
    email: "mgr2@mallorca.local",
    firstName: "Ana",
    lastName: "Pérez",
    phone: null,
    role: "branch_manager",
  },
];

/** @type {Array<{ id: number, branchId: number, userId: string, role: string, isPrimary: boolean, active: boolean }>} */
let branchAssignments = [
  { id: 1, branchId: 1, userId: "user_mgr_lomas", role: "branch_manager", isPrimary: true, active: true },
  { id: 2, branchId: 2, userId: "user_mgr_reforma", role: "branch_manager", isPrimary: true, active: true },
];
let nextAssignmentId = 3;

function findMockUser(userId) {
  return mockUsers.find((u) => u.id === userId) || null;
}

function teamForBranch(branchId) {
  return branchAssignments
    .filter((a) => a.branchId === branchId && a.active !== false)
    .map((a) => {
      const user = findMockUser(a.userId);
      return {
        id: a.id,
        userId: a.userId,
        role: a.role,
        isPrimary: a.isPrimary,
        active: a.active,
        user: user
          ? {
              id: user.id,
              name: `${user.firstName} ${user.lastName}`.trim(),
              email: user.email,
              role: user.role,
            }
          : { id: a.userId, name: a.userId, email: null, role: a.role },
      };
    });
}

function syncPrimaryResponsible(branchId) {
  const idx = branches.findIndex((b) => b.id === branchId);
  if (idx < 0) return;
  const primary = teamForBranch(branchId).find((t) => t.isPrimary);
  if (primary?.user) {
    branches[idx].primaryResponsible = {
      userId: primary.user.id,
      name: primary.user.name,
      email: primary.user.email,
      role: primary.role,
    };
  }
}

const inventoryStock = new Map();

function deriveInventoryStatus(available, minStock, criticalStock) {
  if (available <= 0) return "OUT_OF_STOCK";
  if (criticalStock != null && criticalStock > 0 && available <= criticalStock) return "CRITICAL_STOCK";
  if (minStock > 0 && available <= minStock) return "LOW_STOCK";
  return "NORMAL";
}

function defaultInventoryQty(branchId, productId) {
  if (productId === 2 && branchId === 2) return 2;
  if (productId === 3 && branchId === 1) return 0;
  if (productId === 3 && branchId === 2) return 2;
  return 20 + productId * 3;
}

function getInventoryQty(branchId, productId) {
  const key = `${branchId}:${productId}`;
  if (!inventoryStock.has(key)) inventoryStock.set(key, defaultInventoryQty(branchId, productId));
  return inventoryStock.get(key);
}

function setInventoryQty(branchId, productId, qty) {
  inventoryStock.set(`${branchId}:${productId}`, Math.max(0, qty));
}

function makeInventoryRow(branch, product) {
  const inventory = getInventoryQty(branch.id, product.id);
  const minStock = 5;
  const criticalStock = 2;
  const reserved = 0;
  const available = Math.max(0, inventory - reserved);
  const status = deriveInventoryStatus(available, minStock, criticalStock);
  return {
    branchProduct: {
      id: branch.id * 1000 + product.id,
      branchId: branch.id,
      productId: product.id,
      inventory,
      minStock,
      criticalStock,
      autoAlertEnabled: true,
      alertState: status,
      price: product.price,
      salePrice: product.salePrice,
      available: true,
      preparationTimeMinutes: 60,
    },
    branch,
    product,
    reservedStock: reserved,
    availableStock: available,
    criticalStock,
    autoAlertEnabled: true,
    openAlertCount: status === "NORMAL" ? 0 : 1,
    inventoryStatus: status,
  };
}

function allInventoryRows() {
  const rows = [];
  for (const b of branches) {
    for (const p of products) {
      rows.push(makeInventoryRow(b, p));
    }
  }
  return rows;
}

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
  paymentMethod,
  paymentStatus,
  amountPaid,
  productionNotes,
  customerNotes,
  internalNotes,
  orderSource,
}) {
  const branch = branches.find((b) => b.id === branchId);
  const scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60 * 1000);
  const createdAt = new Date(scheduledStart.getTime() - 60 * 60 * 1000);
  const resolvedPaymentMethod =
    paymentMethod ??
    (status === "confirmed" || status === "ready"
      ? "CASH_ON_PICKUP"
      : status === "pending_payment"
        ? "PENDING"
        : "CASH");
  const resolvedPaymentStatus =
    paymentStatus ??
    (resolvedPaymentMethod === "CASH_ON_PICKUP" || status === "pending_payment" || status === "confirmed"
      ? "unpaid"
      : "paid");
  const resolvedAmountPaid =
    amountPaid ??
    (resolvedPaymentStatus === "unpaid" || resolvedPaymentStatus === "processing" ? 0 : total);
  return {
    id,
    orderNumber,
    guestAccessToken: `guest_${id}`,
    orderSource: orderSource ?? "WHATSAPP",
    status,
    paymentStatus: resolvedPaymentStatus,
    paymentMethod: resolvedPaymentMethod,
    amountPaid: resolvedAmountPaid,
    paidAt: resolvedPaymentStatus === "paid" ? createdAt.toISOString() : null,
    fulfillmentMethod,
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    createdAt: createdAt.toISOString(),
    branchId,
    branchName: branch?.name ?? "Sucursal",
    customerName,
    customerEmail: `${customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    customerPhone,
    deliveryAddress: fulfillmentMethod === "delivery" ? "Calle Ejemplo 123, Col. Roma, CP 06700" : null,
    deliveryAddressSnapshot: fulfillmentMethod === "delivery"
      ? {
          street: "Calle Ejemplo",
          externalNumber: "123",
          neighborhood: "Roma",
          postalCode: "06700",
          references: "Portón negro",
        }
      : null,
    customerNotes: customerNotes ?? null,
    productionNotes: productionNotes ?? null,
    internalNotes: internalNotes ?? null,
    subtotal: total,
    promotionDiscountTotal: 0,
    discountAmount: 0,
    couponDiscount: 0,
    deliveryFee: fulfillmentMethod === "delivery" ? 50 : 0,
    total: fulfillmentMethod === "delivery" ? total + 50 : total,
    items: items.map((item) => ({ imageUrl: null, ...item })),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    audit: [
      {
        id: 1,
        action: "ORDER_CREATED",
        reason: null,
        actorUserId: "user_admin",
        actorName: "Admin",
        createdAt: createdAt.toISOString(),
        payload: null,
      },
      {
        id: 2,
        action: "STATUS_CHANGED",
        reason: null,
        actorUserId: "user_admin",
        actorName: "Admin",
        createdAt: new Date(createdAt.getTime() + 60_000).toISOString(),
        payload: { status },
      },
    ],
  };
}

const orders = [
  makeOrder({
    id: "ord_cash_1",
    orderNumber: "CASH1",
    status: "confirmed",
    paymentMethod: "CASH_ON_PICKUP",
    paymentStatus: "unpaid",
    amountPaid: 0,
    branchId: 2,
    customerName: "María Efectivo",
    customerPhone: "5533333333",
    fulfillmentMethod: "pickup",
    scheduledStart: atToday(13, 0),
    total: 680,
    items: [
      { id: 90, productId: 1, variantId: null, sku: "PSK-001", name: "Pastel de Chocolate", variantLabel: null, quantity: 1, unitPrice: 680, lineTotal: 680 },
    ],
  }),
  makeOrder({
    id: "ord_1042",
    orderNumber: "1042",
    status: "ready",
    paymentMethod: "CASH_ON_PICKUP",
    paymentStatus: "unpaid",
    amountPaid: 0,
    branchId: 2,
    customerName: "Ana López",
    customerPhone: "5511111111",
    fulfillmentMethod: "pickup",
    scheduledStart: atToday(12, 0),
    total: 850,
    productionNotes: "Escribir Feliz cumpleaños Ana.",
    items: [
      { id: 1, productId: 3, variantId: null, sku: "BOL-001", name: "Croissant de Mantequilla", variantLabel: null, quantity: 2, listUnitPrice: 55, unitPrice: 55, lineTotal: 110 },
      { id: 2, productId: 2, variantId: null, sku: "PAN-001", name: "Panettone Clásico", variantLabel: null, quantity: 1, listUnitPrice: 520, unitPrice: 370, lineTotal: 370, promotionId: 1 },
      { id: 21, productId: 1, variantId: null, sku: "PSK-001", name: "Pastel de Chocolate", variantLabel: "Mediano", quantity: 1, listUnitPrice: 450, unitPrice: 370, lineTotal: 370 },
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
  confirmed: ["preparing", "cancelled"],
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
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod ?? null,
    amountPaid: order.amountPaid ?? 0,
    itemCount: order.itemCount,
    items: order.items.map((i) => ({ name: i.name, quantity: i.quantity })),
  };
}

const paymentMethodConfigs = [
  {
    code: "CASH_ON_PICKUP",
    name: "Efectivo al recoger",
    provider: "CASH_ON_PICKUP",
    enabled: true,
    sortOrder: 10,
    allowPickup: true,
    allowDelivery: false,
    configurationStatus: "configured",
    customerLabel: "Efectivo al recoger",
    customerDescription: "Pagas en sucursal al recoger tu pedido.",
  },
  {
    code: "MERCADO_PAGO",
    name: "Mercado Pago",
    provider: "MERCADO_PAGO",
    enabled: false,
    sortOrder: 20,
    allowPickup: true,
    allowDelivery: true,
    configurationStatus: "not_configured",
    customerLabel: "Mercado Pago",
    customerDescription: "Pago en línea. Disponible cuando el comercio lo configure.",
  },
];

const paymentProviders = {
  MERCADO_PAGO: {
    provider: "MERCADO_PAGO",
    sandbox: true,
    configured: false,
    publicKeyMasked: null,
    accessTokenConfigured: false,
    webhookSecretConfigured: false,
    publicKey: "",
    accessToken: "",
    webhookSecret: "",
  },
};

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

  if (req.method === "GET" && path === "/api/checkout/payment-methods") {
    const fulfillmentMethod = url.searchParams.get("fulfillmentMethod") || "pickup";
    const methods = paymentMethodConfigs.filter((method) => {
      if (!method.enabled || method.configurationStatus !== "configured") return false;
      if (!["CASH_ON_PICKUP", "MERCADO_PAGO", "ONLINE"].includes(method.code)) return false;
      if (fulfillmentMethod === "pickup" && !method.allowPickup) return false;
      if (fulfillmentMethod === "delivery" && !method.allowDelivery) return false;
      return true;
    }).map((method) => ({
      code: method.code,
      name: method.name,
      provider: method.provider,
      customerLabel: method.customerLabel,
      customerDescription: method.customerDescription,
      allowPickup: method.allowPickup,
      allowDelivery: method.allowDelivery,
    }));
    send(res, 200, methods);
    return;
  }

  if (req.method === "GET" && path === "/api/catalog/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
      "x-accel-buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      res.end();
    });
    return;
  }

  if (req.method === "POST" && path === "/api/storage/uploads/request-url") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const objectPath = `/objects/uploads/${id}`;
        const uploadURL = `/api/storage/uploads/put/${id}`;
        send(res, 200, {
          uploadURL,
          objectPath,
          metadata: {
            name: body.name || "upload",
            size: body.size || 0,
            contentType: body.contentType || "application/octet-stream",
          },
        });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  const putMatch = path.match(/^\/api\/storage\/uploads\/put\/([^/]+)$/);
  if (req.method === "PUT" && putMatch) {
    const id = putMatch[1];
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] || "application/octet-stream";
      localObjects.set(id, { buffer, contentType });
      res.writeHead(200, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      });
      res.end();
    });
    req.on("error", () => send(res, 500, { error: "Upload failed" }));
    return;
  }

  const objectMatch = path.match(/^\/api\/storage\/objects\/uploads\/([^/]+)$/);
  if (req.method === "GET" && objectMatch) {
    const stored = localObjects.get(objectMatch[1]);
    if (!stored) {
      send(res, 404, { error: "Object not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": stored.contentType,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    });
    res.end(stored.buffer);
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

  if (req.method === "POST" && path === "/api/cart/session") {
    readJson(req)
      .then((body) => {
        const found = branches.find((b) => b.id === Number(body?.branchId));
        if (!found) {
          send(res, 404, { error: "Branch not found" });
          return;
        }
        const id = `cart_${Date.now()}`;
        const cart = { id, branch: found, items: [] };
        carts.set(id, cart);
        send(res, 200, cartView(cart));
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "GET" && path.startsWith("/api/cart/") && !path.includes("/items") && !path.includes("/branch-preview")) {
    const id = path.slice("/api/cart/".length);
    const cart = carts.get(id);
    if (!cart) {
      send(res, 404, { error: "Cart not found" });
      return;
    }
    send(res, 200, cartView(cart));
    return;
  }

  if (req.method === "POST" && path.endsWith("/branch-preview") && path.startsWith("/api/cart/")) {
    const id = path.slice("/api/cart/".length, path.indexOf("/branch-preview"));
    const cart = carts.get(id);
    readJson(req)
      .then((body) => {
        const target = branches.find((b) => b.id === Number(body?.branchId));
        if (!cart || !target) {
          send(res, 404, { error: "Cart or branch not found" });
          return;
        }
        const items = cart.items.map((item) => {
          const product = products.find((p) => p.id === item.productId);
          const avail = product?.availability.find((row) => row.branchId === target.id);
          const price = avail?.salePrice ?? avail?.price ?? item.unitPrice;
          return {
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            quantity: item.quantity,
            available: Boolean(avail?.available && (avail.inventory ?? 0) >= item.quantity),
            inventory: avail?.inventory ?? 0,
            price: avail?.price ?? item.unitPrice,
            salePrice: avail?.salePrice ?? null,
            unitPrice: item.unitPrice,
          };
        });
        send(res, 200, { branch: target, items, unavailableItems: items.filter((item) => !item.available) });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "POST" && /\/api\/cart\/[^/]+\/items$/.test(path)) {
    const id = path.split("/")[3];
    const cart = carts.get(id);
    readJson(req)
      .then((body) => {
        if (!cart) {
          send(res, 404, { error: "Cart not found" });
          return;
        }
        const product = products.find((p) => p.id === Number(body?.productId));
        if (!product) {
          send(res, 409, { error: "Product unavailable" });
          return;
        }
        const existing = cart.items.find((item) => item.productId === product.id && item.variantId == null);
        const resulting = (existing?.quantity ?? 0) + Number(body?.quantity || 1);
        if (resulting > productSellable(product, cart.branch.id)) {
          send(res, 409, { error: "Insufficient inventory" });
          return;
        }
        const price = product.salePrice ?? product.price;
        if (existing) {
          existing.quantity = resulting;
          existing.lineTotal = resulting * existing.unitPrice;
        } else {
          cart.items.push({
            id: cartItemSeq++,
            productId: product.id,
            variantId: null,
            sku: product.sku,
            name: product.name,
            variantLabel: null,
            quantity: resulting,
            unitPrice: price,
            lineTotal: price * resulting,
            imageUrl: product.imageUrl,
          });
        }
        send(res, 200, cartView(cart));
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if ((req.method === "PATCH" || req.method === "DELETE") && /\/api\/cart\/[^/]+\/items\/\d+$/.test(path)) {
    const parts = path.split("/");
    const cart = carts.get(parts[3]);
    const itemId = Number(parts[5]);
    if (!cart) {
      send(res, 404, { error: "Cart not found" });
      return;
    }
    const item = cart.items.find((row) => row.id === itemId);
    if (req.method === "DELETE") {
      cart.items = cart.items.filter((row) => row.id !== itemId);
      send(res, 200, cartView(cart));
      return;
    }
    readJson(req)
      .then((body) => {
        const product = products.find((p) => p.id === item?.productId);
        const quantity = Number(body?.quantity || 0);
        if (!item || !product || quantity > productSellable(product, cart.branch.id)) {
          send(res, 409, { error: "Insufficient inventory or item not found" });
          return;
        }
        item.quantity = quantity;
        item.lineTotal = quantity * item.unitPrice;
        send(res, 200, cartView(cart));
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "POST" && path === "/api/fulfillment/delivery-validation") {
    readJson(req)
      .then((body) => {
        const lat = Number(body?.latitude);
        const lng = Number(body?.longitude);
        const eligible = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat - 19.43) < 0.2 && Math.abs(lng + 99.2) < 0.2;
        send(res, 200, {
          eligible,
          distanceKm: eligible ? 1.2 : 18,
          radiusKm: 8,
          deliveryFee: eligible ? 80 : 0,
          reason: eligible ? null : "Tu ubicación está fuera del área de cobertura.",
        });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  if (req.method === "POST" && path === "/api/orders") {
    readJson(req)
      .then((body) => {
        const cart = carts.get(body?.cartId);
        if (!cart || !cart.items.length) {
          send(res, 409, { error: "Cart is empty" });
          return;
        }
        const subtotal = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
        const deliveryFee = body?.fulfillmentMethod === "delivery" ? 80 : 0;
        const paymentMethod = body?.paymentMethod
          || (body?.fulfillmentMethod === "pickup" ? "CASH_ON_PICKUP" : "PENDING");
        if (paymentMethod === "CASH_ON_PICKUP" && body?.fulfillmentMethod !== "pickup") {
          send(res, 400, { error: "CASH_ON_PICKUP is only available for pickup", code: "PAYMENT_METHOD_NOT_ALLOWED" });
          return;
        }
        const cashPickup = paymentMethod === "CASH_ON_PICKUP";
        const id = `ord_sf_${Date.now()}`;
        const order = {
          id,
          orderNumber: `M-MOCK${String(orders.length + 1).padStart(3, "0")}`,
          guestAccessToken: `guest_${id}`,
          status: cashPickup ? "confirmed" : "pending_payment",
          paymentStatus: "unpaid",
          paymentMethod,
          amountPaid: 0,
          fulfillmentMethod: body?.fulfillmentMethod || "pickup",
          scheduledStart: body?.scheduledStart || new Date().toISOString(),
          scheduledEnd: body?.scheduledStart || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          branchId: cart.branch.id,
          branchName: cart.branch.name,
          customerName: body?.customerName,
          customerEmail: body?.customerEmail,
          customerPhone: body?.customerPhone,
          deliveryAddress: body?.deliveryAddress ?? null,
          subtotal,
          deliveryFee,
          total: subtotal + deliveryFee,
          items: cart.items,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        };
        orders.unshift(order);
        carts.delete(cart.id);
        send(res, 201, order);
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  const guestOrder = path.match(/^\/api\/guest\/orders\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && guestOrder) {
    const found = orders.find((o) => o.id === guestOrder[1]);
    if (!found) {
      send(res, 404, { error: "Order not found" });
      return;
    }
    send(res, 200, found);
    return;
  }

  if (req.method === "GET" && path.startsWith("/api/orders/")) {
    const id = path.slice("/api/orders/".length);
    const found = orders.find((o) => o.id === id);
    if (!found) {
      send(res, 404, { error: "Order not found" });
      return;
    }
    send(res, 200, found);
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
      ordersPending: orders.filter((o) => ["pending_payment", "confirmed", "paid", "preparing", "ready"].includes(o.status)).length,
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
        deliveryFee: b.deliveryFee ?? 90,
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
        created.address = buildMockFormattedAddress({
          street: created.street,
          externalNumber: created.externalNumber,
          internalNumber: created.internalNumber,
          neighborhood: created.neighborhood,
          borough: created.borough,
          city: created.city,
          state: created.state,
          postalCode: created.postalCode,
          country: created.country,
          address: body.address,
        });
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

  const adminBranchMatch = path.match(/^\/api\/admin\/branches\/(\d+)$/);
  if (adminBranchMatch) {
    if (!requireLocalAuth(req, res)) return;
    const id = Number(adminBranchMatch[1]);
    const idx = branches.findIndex((b) => b.id === id);
    if (idx < 0) {
      send(res, 404, { error: "Branch not found" });
      return;
    }
    if (req.method === "GET") {
      const b = branches[idx];
      const branchOrders = orders.filter((o) => o.branchId === id);
      send(res, 200, {
        branch: {
          ...b,
          deliveryFee: b.deliveryFee ?? 0,
          taxRate: 0.16,
          timezone: "America/Mexico_City",
          managerName: b.managerName || "María Pérez",
          managerEmail: b.managerEmail || "maria@mallorca.local",
          managerPhone: b.managerPhone || "5533333333",
          notificationPreferences: b.notificationPreferences || { email: true, inApp: true },
        },
        general: b,
        contact: {
          phone: b.phone,
          email: b.email,
          whatsapp: b.whatsapp,
          whatsappUrl: b.whatsapp ? `https://wa.me/${String(b.whatsapp).replace(/\D/g, "")}` : null,
        },
        hours: b.hours,
        specialHours: b.specialHours || [],
        links: b.links || [],
        images: b.images || [],
        notificationSettings: b.notificationPreferences || { email: true, inApp: true },
        products: products.map((p) => ({
          product: p,
          configuration: { branchId: id, productId: p.id, available: true, inventory: 20 },
        })),
        inventory: products.map((p) => ({
          product: p,
          configuration: {
            branchId: id,
            productId: p.id,
            available: true,
            inventory: p.id === 2 && id === 2 ? 2 : 20,
            minStock: 5,
          },
        })),
        orders: branchOrders,
        alerts: id === 2
          ? [{ alert: { id: 1, state: "LOW_STOCK", stock: 2, minStock: 5 }, product: products[1] }]
          : [],
        team: teamForBranch(id),
        audit: [],
        futureOrdersCount: 0,
        summary: {
          ordersToday: b.ordersToday || 0,
          salesToday: 18500,
          alertsOpen: b.alertsOpen || 0,
          outOfStock: 0,
          lowStockProducts: id === 2 ? ["Panettone Clásico"] : [],
          upcoming: branchOrders.slice(0, 3).map((o) => ({
            id: o.id,
            scheduledStart: o.scheduledStart,
            status: o.status,
            total: o.total,
          })),
        },
      });
      return;
    }
    if (req.method === "PATCH") {
      readJson(req)
        .then((body) => {
          const prev = branches[idx];
          const next = {
            ...prev,
            ...body,
            id,
            active: (body.status ?? prev.status) === "active",
          };
          const hasStructured =
            body.street !== undefined ||
            body.externalNumber !== undefined ||
            body.internalNumber !== undefined ||
            body.neighborhood !== undefined ||
            body.borough !== undefined ||
            body.city !== undefined ||
            body.state !== undefined ||
            body.postalCode !== undefined ||
            body.country !== undefined;
          if (hasStructured) {
            next.address = buildMockFormattedAddress({
              street: next.street,
              externalNumber: next.externalNumber,
              internalNumber: next.internalNumber,
              neighborhood: next.neighborhood,
              borough: next.borough,
              city: next.city,
              state: next.state,
              postalCode: next.postalCode,
              country: next.country,
              address: body.address ?? prev.address,
            });
          }
          branches[idx] = next;
          send(res, 200, next);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
    if (req.method === "DELETE") {
      send(res, 409, { error: "La sucursal tiene historial operativo. Usa Archivar." });
      return;
    }
  }

  if (req.method === "GET" && path === "/api/admin/products") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, products);
    return;
  }

  if (req.method === "POST" && path === "/api/admin/products") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        const primary = categories.find((item) => item.id === (body.primaryCategoryId ?? body.categoryId)) ?? categories[0];
        const created = {
          id: nextProductId++,
          sku: body.sku,
          name: body.name,
          slug: body.slug,
          shortDescription: body.shortDescription ?? "",
          description: body.description ?? body.shortDescription ?? "",
          price: body.price,
          salePrice: body.salePrice ?? null,
          categoryName: primary.name,
          categorySlug: primary.slug,
          categories: (body.categoryIds?.length ? body.categoryIds : [primary.id]).map((id, index) => {
            const category = categories.find((item) => item.id === id) ?? primary;
            return {
              id: category.id,
              name: category.name,
              slug: category.slug,
              isPrimary: id === (body.primaryCategoryId ?? primary.id) || index === 0,
            };
          }),
          tags: body.tags ?? [],
          crossSellProductIds: body.crossSellProductIds ?? [],
          imageUrl: body.imageUrl ?? null,
          gallery: body.gallery ?? [],
          featured: Boolean(body.featured),
          seasonal: Boolean(body.seasonal),
          minimumLeadTimeHours: body.minimumLeadTimeHours ?? 0,
          status: body.status ?? "draft",
          availability: applyBranchConfigurations(
            { availability: [], price: body.price },
            body.branchConfigurations ?? [],
          ),
        };
        products.push(created);
        send(res, 201, toAdminProductDetail(created));
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  const productPromosMatch = path.match(/^\/api\/admin\/products\/(\d+)\/promotions$/);
  if (productPromosMatch) {
    if (!requireLocalAuth(req, res)) return;
    const productId = Number(productPromosMatch[1]);
    const product = products.find((item) => item.id === productId);
    if (!product) {
      send(res, 404, { error: "Product not found" });
      return;
    }
    if (req.method === "GET") {
      send(res, 200, promotionsByProduct.get(productId) ?? []);
      return;
    }
    if (req.method === "POST") {
      readJson(req)
        .then((body) => {
          const list = promotionsByProduct.get(productId) ?? [];
          const created = {
            id: nextPromotionId++,
            name: body.name,
            type: body.type,
            value: body.value,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
            status: "scheduled",
            finalPrice: body.type === "percentage"
              ? Math.round(product.price * (1 - body.value / 100) * 100) / 100
              : body.type === "fixed"
                ? body.value
                : Math.max(0, product.price - body.value),
            savings: 0,
            branchIds: body.branchIds ?? [],
            createdAt: new Date().toISOString(),
            createdBy: "user_local_dev_admin",
            cancelledAt: null,
            cancelledBy: null,
          };
          created.savings = Math.max(0, product.price - created.finalPrice);
          list.unshift(created);
          promotionsByProduct.set(productId, list);
          send(res, 201, created);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
  }

  const productPromoItemMatch = path.match(/^\/api\/admin\/products\/(\d+)\/promotions\/(\d+)$/);
  if (productPromoItemMatch && req.method === "PATCH") {
    if (!requireLocalAuth(req, res)) return;
    const productId = Number(productPromoItemMatch[1]);
    const promotionId = Number(productPromoItemMatch[2]);
    const list = promotionsByProduct.get(productId) ?? [];
    const index = list.findIndex((item) => item.id === promotionId);
    if (index < 0) {
      send(res, 404, { error: "Promotion not found" });
      return;
    }
    readJson(req)
      .then((body) => {
        list[index] = { ...list[index], ...body, id: promotionId };
        promotionsByProduct.set(productId, list);
        send(res, 200, list[index]);
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  const productPromoCancelMatch = path.match(/^\/api\/admin\/products\/(\d+)\/promotions\/(\d+)\/cancel$/);
  if (productPromoCancelMatch && req.method === "POST") {
    if (!requireLocalAuth(req, res)) return;
    const productId = Number(productPromoCancelMatch[1]);
    const promotionId = Number(productPromoCancelMatch[2]);
    const list = promotionsByProduct.get(productId) ?? [];
    const index = list.findIndex((item) => item.id === promotionId);
    if (index < 0) {
      send(res, 404, { error: "Promotion not found" });
      return;
    }
    list[index] = {
      ...list[index],
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledBy: "user_local_dev_admin",
    };
    send(res, 200, list[index]);
    return;
  }

  const adminProductMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
  if (adminProductMatch) {
    if (!requireLocalAuth(req, res)) return;
    const productId = Number(adminProductMatch[1]);
    const index = products.findIndex((item) => item.id === productId);
    if (index < 0) {
      send(res, 404, { error: "Producto no encontrado" });
      return;
    }
    if (req.method === "GET") {
      send(res, 200, toAdminProductDetail(products[index]));
      return;
    }
    if (req.method === "PATCH") {
      readJson(req)
        .then((body) => {
          const previous = products[index];
          const next = {
            ...previous,
            ...body,
            id: productId,
            availability: applyBranchConfigurations(previous, body.branchConfigurations),
          };
          if (body.primaryCategoryId || body.categoryId) {
            const primary = categories.find((item) => item.id === (body.primaryCategoryId ?? body.categoryId));
            if (primary) {
              next.categoryName = primary.name;
              next.categorySlug = primary.slug;
            }
          }
          products[index] = next;
          send(res, 200, toAdminProductDetail(next));
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
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
          status: body?.paymentMethod === "CASH_ON_PICKUP"
            ? "confirmed"
            : body?.markPaid ? "paid" : "pending_payment",
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
          audit: [
            {
              id: 1,
              action: "CREATED_MANUAL",
              reason: null,
              actorUserId: "user_admin",
              actorName: "Admin",
              createdAt: new Date().toISOString(),
              payload: null,
            },
          ],
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

  if (req.method === "GET" && path === "/api/admin/payment-methods") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, paymentMethodConfigs);
    return;
  }

  const paymentMethodMatch = path.match(/^\/api\/admin\/payment-methods\/([^/]+)$/);
  if (paymentMethodMatch && req.method === "PATCH") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        const code = decodeURIComponent(paymentMethodMatch[1]);
        const current = paymentMethodConfigs.find((row) => row.code === code);
        if (!current) {
          send(res, 404, { error: "Payment method not found" });
          return;
        }
        if (code === "CASH_ON_PICKUP" && body?.allowDelivery === true) {
          send(res, 400, { error: "Cash on pickup cannot be enabled for delivery", code: "DELIVERY_NOT_ALLOWED" });
          return;
        }
        Object.assign(current, body, code === "CASH_ON_PICKUP" ? { allowDelivery: false } : {});
        send(res, 200, current);
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
    return;
  }

  const providerMatch = path.match(/^\/api\/admin\/payment-providers\/([^/]+)$/);
  if (providerMatch) {
    if (!requireLocalAuth(req, res)) return;
    const provider = decodeURIComponent(providerMatch[1]).toUpperCase();
    if (provider !== "MERCADO_PAGO") {
      send(res, 404, { error: "Unknown provider" });
      return;
    }
    if (req.method === "GET") {
      const row = paymentProviders.MERCADO_PAGO;
      send(res, 200, {
        provider: row.provider,
        sandbox: row.sandbox,
        configured: row.configured,
        publicKeyMasked: row.publicKeyMasked,
        accessTokenConfigured: row.accessTokenConfigured,
        webhookSecretConfigured: row.webhookSecretConfigured,
      });
      return;
    }
    if (req.method === "PUT") {
      readJson(req)
        .then((body) => {
          const row = paymentProviders.MERCADO_PAGO;
          row.sandbox = body?.sandbox ?? row.sandbox;
          if (body?.publicKey) {
            row.publicKey = body.publicKey;
            row.publicKeyMasked = `${String(body.publicKey).slice(0, 4)}••••`;
          }
          if (body?.accessToken) {
            row.accessToken = body.accessToken;
            row.accessTokenConfigured = true;
            row.configured = true;
          }
          if (body?.webhookSecret) {
            row.webhookSecret = body.webhookSecret;
            row.webhookSecretConfigured = true;
          }
          send(res, 200, {
            provider: row.provider,
            sandbox: row.sandbox,
            configured: row.configured,
            publicKeyMasked: row.publicKeyMasked,
            accessTokenConfigured: row.accessTokenConfigured,
            webhookSecretConfigured: row.webhookSecretConfigured,
          });
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
  }

  const orderPaymentMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/payment$/);
  if (orderPaymentMatch && req.method === "POST") {
    if (!requireLocalAuth(req, res)) return;
    const order = orders.find((o) => o.id === orderPaymentMatch[1]);
    if (!order) {
      send(res, 404, { error: "Order not found" });
      return;
    }
    readJson(req)
      .then((body) => {
        if (order.paymentStatus === "paid") {
          send(res, 409, { error: "Payment already recorded", code: "PAYMENT_ALREADY_RECORDED" });
          return;
        }
        const amountPaid = body?.amountPaid ?? order.total;
        order.paymentStatus = amountPaid < order.total ? "partially_paid" : "paid";
        order.amountPaid = amountPaid;
        order.paymentMethod = body?.paymentMethod || order.paymentMethod;
        order.paymentNote = body?.paymentNote ?? null;
        order.paidAt = new Date().toISOString();
        order.audit = [
          ...(order.audit || []),
          {
            id: Date.now(),
            action: "PAYMENT_RECORDED",
            reason: body?.paymentNote || null,
            actorUserId: "user_admin",
            actorName: "Admin",
            createdAt: order.paidAt,
            payload: { amountPaid, method: order.paymentMethod },
          },
        ];
        send(res, 200, order);
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
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
          if (next === "cancelled" && order.paymentStatus === "unpaid") order.paymentStatus = "cancelled";
          if (next === "completed" && order.paymentStatus !== "paid" && !body?.confirmUnpaidComplete) {
            send(res, 409, { error: "Order is still unpaid", code: "UNPAID_ON_COMPLETE" });
            return;
          }
          order.audit = [
            ...(order.audit || []),
            {
              id: Date.now(),
              action: next === "cancelled" ? "CANCELLED" : "STATUS_CHANGED",
              reason: body?.cancelReason || null,
              actorUserId: "user_admin",
              actorName: "Admin",
              createdAt: new Date().toISOString(),
              payload: { status: next },
            },
          ];
          send(res, 200, order);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
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
    const branchId = url.searchParams.get("branchId");
    const state = url.searchParams.get("state");
    const categoryId = url.searchParams.get("categoryId");
    const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim().toLowerCase();
    const rows = allInventoryRows().filter((row) => {
      if (branchId && Number(branchId) !== row.branch.id) return false;
      if (state && state !== "all" && row.inventoryStatus !== state) return false;
      if (categoryId && Number(categoryId) !== row.product.categories?.[0]?.id) return false;
      if (search) {
        const hay = `${row.product.name} ${row.product.sku}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
    send(res, 200, rows);
    return;
  }

  if (req.method === "GET" && path === "/api/admin/inventory/matrix") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, allInventoryRows());
    return;
  }

  if (req.method === "POST" && path === "/api/admin/inventory/update") {
    if (!requireLocalAuth(req, res)) return;
    readJson(req)
      .then((body) => {
        let branchId = body.branchId;
        let productId = body.productId;
        if (body.branchProductId && (branchId == null || productId == null)) {
          const match = allInventoryRows().find((row) => row.branchProduct.id === body.branchProductId);
          if (match) {
            branchId = match.branch.id;
            productId = match.product.id;
          }
        }
        const current = allInventoryRows().find(
          (row) => row.branch.id === Number(branchId) && row.product.id === Number(productId),
        );
        if (!current) {
          send(res, 404, { error: "Inventory record not found" });
          return;
        }
        const previous = current.branchProduct.inventory;
        const next =
          body.quantity != null ? Math.max(0, Number(body.quantity)) : Math.max(0, previous + Number(body.delta || 0));
        setInventoryQty(current.branch.id, current.product.id, next);
        const updated = makeInventoryRow(current.branch, current.product);
        send(res, 200, {
          inventory: updated.branchProduct,
          ledger: {
            id: Date.now(),
            movement: "adjustment",
            quantityDelta: next - previous,
            previousBalance: previous,
            newBalance: next,
            reason: body.reason || "Ajuste mock",
          },
        });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
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
    send(
      res,
      200,
      mockUsers.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        role: u.role,
      })),
    );
    return;
  }

  if (req.method === "GET" && path === "/api/admin/category-responsibles") {
    if (!requireLocalAuth(req, res)) return;
    send(res, 200, []);
    return;
  }

  const assignmentMatch = path.match(/^\/api\/admin\/branches\/(\d+)\/assignments(?:\/([^/]+))?$/);
  if (assignmentMatch) {
    if (!requireLocalAuth(req, res)) return;
    const branchId = Number(assignmentMatch[1]);
    const pathUserId = assignmentMatch[2] ? decodeURIComponent(assignmentMatch[2]) : null;
    if (req.method === "GET" && !pathUserId) {
      send(res, 200, teamForBranch(branchId));
      return;
    }
    if (req.method === "PUT" && !pathUserId) {
      readJson(req)
        .then((body) => {
          const userId = body.userId;
          if (!userId || !findMockUser(userId)) {
            send(res, 404, { error: "User not found" });
            return;
          }
          const existing = branchAssignments.find((a) => a.branchId === branchId && a.userId === userId);
          if (existing) {
            send(res, 409, { error: "Assignment already exists" });
            return;
          }
          if (body.isPrimary) {
            for (const a of branchAssignments) {
              if (a.branchId === branchId) a.isPrimary = false;
            }
          }
          const row = {
            id: nextAssignmentId++,
            branchId,
            userId,
            role: body.role || "branch_manager",
            isPrimary: Boolean(body.isPrimary),
            active: true,
          };
          branchAssignments.push(row);
          syncPrimaryResponsible(branchId);
          send(res, 201, row);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
    if (req.method === "PATCH" && !pathUserId) {
      readJson(req)
        .then((body) => {
          const row = branchAssignments.find((a) => a.branchId === branchId && a.userId === body.userId);
          if (!row) {
            send(res, 404, { error: "Assignment not found" });
            return;
          }
          if (body.isPrimary) {
            for (const a of branchAssignments) {
              if (a.branchId === branchId) a.isPrimary = false;
            }
            row.isPrimary = true;
          }
          if (body.role != null) row.role = body.role;
          if (body.active != null) row.active = body.active;
          if (body.isPrimary != null) row.isPrimary = body.isPrimary;
          syncPrimaryResponsible(branchId);
          send(res, 200, row);
        })
        .catch(() => send(res, 400, { error: "Invalid body" }));
      return;
    }
    if (req.method === "DELETE" && pathUserId) {
      const before = branchAssignments.length;
      branchAssignments = branchAssignments.filter(
        (a) => !(a.branchId === branchId && a.userId === pathUserId),
      );
      if (branchAssignments.length === before) {
        send(res, 404, { error: "Assignment not found" });
        return;
      }
      syncPrimaryResponsible(branchId);
      send(res, 204);
      return;
    }
  }

  if (req.method === "GET" && path === "/api/fulfillment/slots") {
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const method = url.searchParams.get("method") || "pickup";
    const hours = method === "delivery" ? ["12:00", "14:00", "16:00", "18:00"] : ["10:00", "12:00", "14:00", "16:00", "18:00"];
    const slots = hours.map((time) => {
      const start = new Date(`${date}T${time}:00.000-06:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        available: true,
        remainingCapacity: method === "delivery" ? 4 : 8,
      };
    });
    send(res, 200, slots);
    return;
  }

  if (req.method === "POST" && path === "/api/orders/preview") {
    readJson(req)
      .then((body) => {
        const subtotal = Number(body?.subtotal) || 320;
        const deliveryFee = body?.fulfillmentMethod === "delivery" ? 80 : 0;
        send(res, 200, {
          lines: [],
          subtotal,
          promotionDiscountTotal: 0,
          discountAmount: 0,
          discountPercent: null,
          couponCode: null,
          couponDiscount: 0,
          deliveryFee,
          total: subtotal + deliveryFee,
          errors: [],
        });
      })
      .catch(() => send(res, 400, { error: "Invalid body" }));
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
