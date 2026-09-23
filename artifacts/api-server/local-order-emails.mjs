import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  receiptSnapshot,
  selectBranchEmail,
} from "../../lib/purchase-result.mjs";
import { buildOrderEmail } from "./order-receipt.mjs";
const root = new URL("../../.local/order-email-previews/", import.meta.url);
export async function previewOrderEmails(order, branch, assignments) {
  const receipt = receiptSnapshot(order, branch);
  const branchEmail = selectBranchEmail(assignments);
  const directory = new URL(`${encodeURIComponent(order.id)}/`, root);
  await mkdir(directory, { recursive: true });
  for (const audience of ["customer", "branch"]) {
    const recipient =
      audience === "customer" ? order.customerEmail : branchEmail;
    const link =
      audience === "customer"
        ? `http://localhost:19488/pedido/${encodeURIComponent(order.id)}/${encodeURIComponent(order.guestAccessToken)}`
        : `http://localhost:19488/admin/pedidos/${encodeURIComponent(order.id)}`;
    const email = await buildOrderEmail(receipt, audience, link);
    await writeFile(new URL(`${audience}.html`, directory), email.html, "utf8");
    await writeFile(
      new URL(`${audience}.pdf`, directory),
      Buffer.from(email.attachments[0].content, "base64"),
    );
    await writeFile(
      new URL(`${audience}.json`, directory),
      JSON.stringify({
        recipient,
        status: recipient ? "preview" : "missing_recipient",
        subject: email.subject,
      }),
      "utf8",
    );
  }
}
export async function previewEmailStatus(orderId) {
  const value = async (audience) => {
    try {
      const raw = JSON.parse(
        await readFile(
          fileURLToPath(
            new URL(`${encodeURIComponent(orderId)}/${audience}.json`, root),
          ),
          "utf8",
        ),
      );
      return { status: raw.status };
    } catch {
      return { status: "not_scheduled" };
    }
  };
  return { customer: await value("customer"), branch: await value("branch") };
}
