import type { Prisma } from "@prisma/client";
import { escapeHtml } from "../utils/html.js";
import { formatNgn } from "../utils/money.js";

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

// Wrap content in a simple, mobile-friendly email frame
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:8px">
          <tr><td style="background:#111;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold;border-radius:8px 8px 0 0">PAT Footwear Collection</td></tr>
          <tr><td style="padding:24px">
            <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
            ${bodyHtml}
          </td></tr>
        </table>
        <p style="font-size:12px;color:#888">You received this email because an order was placed at PFC.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Order lines as an HTML table (all customer text is escaped)
export function itemsHtml(order: OrderWithItems): string {
  const rows = order.items
    .map((i) => {
      const sizes = Object.entries(i.sizeBreakdown as Record<string, number>)
        .map(([size, n]) => `Size ${escapeHtml(size)}: ${n}`)
        .join(" · ");
      const price =
        i.unitPriceNgn != null ? formatNgn(i.quantity * i.unitPriceNgn) : "";
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px">
          <strong>${escapeHtml(i.productNameSnapshot)}</strong>${i.color ? ` · ${escapeHtml(i.color)}` : ""}<br>
          <span style="color:#666">${sizes}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;white-space:nowrap">${i.quantity} pairs<br>${price}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`;
}

// Order lines as plain text (for email clients that do not show HTML)
export function itemsText(order: OrderWithItems): string {
  return order.items
    .map((i) => {
      const sizes = Object.entries(i.sizeBreakdown as Record<string, number>)
        .map(([size, n]) => `  Size ${size}: ${n}`)
        .join("\n");
      return `- ${i.productNameSnapshot}${i.color ? ` (${i.color})` : ""}\n${sizes}`;
    })
    .join("\n");
}

// Total line shared by both emails
export function totalLine(order: OrderWithItems): string {
  return order.subtotalNgn != null
    ? `${order.totalQuantity} pairs · ${formatNgn(order.subtotalNgn)}`
    : `${order.totalQuantity} pairs`;
}

// Design details of a custom request (image, type and colour note), as HTML
export function designHtml(order: OrderWithItems): string {
  return order.items
    .filter((i) => i.designImageUrl || i.colorNote || i.footwearType)
    .map(
      (i) => `<div style="margin:12px 0;font-size:14px">
        ${i.footwearType ? `<p style="margin:0 0 4px"><strong>Type:</strong> ${escapeHtml(i.footwearType)}</p>` : ""}
        ${i.colorNote ? `<p style="margin:0 0 8px"><strong>Colour:</strong> ${escapeHtml(i.colorNote)}</p>` : ""}
        ${
          i.designImageUrl
            ? `<a href="${escapeHtml(i.designImageUrl)}"><img src="${escapeHtml(i.designImageUrl)}" alt="Design image" width="240" style="max-width:100%;border-radius:6px;border:1px solid #eee"></a>`
            : ""
        }
      </div>`,
    )
    .join("");
}

// Design details as plain text
export function designText(order: OrderWithItems): string {
  return order.items
    .map((i) =>
      [
        i.footwearType ? `Type: ${i.footwearType}` : "",
        i.colorNote ? `Colour: ${i.colorNote}` : "",
        i.designImageUrl ? `Design image: ${i.designImageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n");
}
