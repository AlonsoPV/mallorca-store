import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogMailboxes,
  formatMailboxFrom,
  mailboxesReady,
  parseFromDisplayName,
  parseMailboxUpdate,
  publicMailbox,
} from "./mailbox-config.mjs";

test("app mailboxes are ready only with distinct pedidos, sucursal and contacto", () => {
  const catalog = catalogMailboxes([
    { role: "customer", address: "pedidos@mallorca.mx", passwordEncrypted: "v1:x" },
    { role: "branch", address: "sucursal@mallorca.mx", passwordEncrypted: "v1:y" },
    { role: "contact", address: "contacto@mallorca.mx" },
  ]);
  assert.equal(catalog.ready, true);
  assert.equal(catalog.source, "app");
  assert.equal(catalog.mailboxes.find((row) => row.role === "customer")?.configured, true);
  assert.equal(
    mailboxesReady([
      publicMailbox({ role: "customer", address: "mismo@mallorca.mx", passwordEncrypted: "v1:x" }),
      publicMailbox({ role: "branch", address: "mismo@mallorca.mx", passwordEncrypted: "v1:y" }),
      publicMailbox({ role: "contact", address: "contacto@mallorca.mx" }),
    ]),
    false,
  );
});

test("empty app rows fall back to env seeds without exposing a password", () => {
  const catalog = catalogMailboxes([], [
    {
      role: "system",
      address: "ecomm@pasteleria-mallorca.mx",
      displayName: "Mallorca Ecommerce",
      passwordConfigured: true,
    },
    {
      role: "customer",
      address: "pedidos@mallorca.mx",
      displayName: "Mallorca",
      passwordConfigured: true,
    },
    { role: "branch", address: "sucursal@mallorca.mx", passwordConfigured: true },
    { role: "contact", address: "contacto@mallorca.mx", displayName: "Contacto" },
  ]);
  assert.equal(catalog.ready, true);
  assert.equal(catalog.source, "env");
  assert.equal(catalog.mailboxes.find((row) => row.role === "system")?.address, "ecomm@pasteleria-mallorca.mx");
  assert.equal(catalog.mailboxes.find((row) => row.role === "customer")?.passwordConfigured, true);
  assert.equal(formatMailboxFrom("pedidos@mallorca.mx", "Mallorca"), "Mallorca <pedidos@mallorca.mx>");
  assert.equal(parseFromDisplayName("Mallorca <pedidos@mallorca.mx>"), "Mallorca");
});

test("mailbox updates keep Hostinger defaults and require a real address", () => {
  assert.equal(parseMailboxUpdate({ address: "no-es-correo" }).ok, false);
  const parsed = parseMailboxUpdate({
    address: "pedidos@mallorca.mx",
    displayName: "Pedidos Mallorca",
    password: "  secreto  ",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.smtpHost, "smtp.hostinger.com");
    assert.equal(parsed.data.smtpPort, 465);
    assert.equal(parsed.data.smtpUser, "pedidos@mallorca.mx");
    assert.equal(parsed.data.password, "secreto");
    assert.equal(parsed.data.smtpSecure, true);
  }
});
