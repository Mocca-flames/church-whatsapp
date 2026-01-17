import { createCanvas, loadImage } from "canvas";
import { writeFileSync, existsSync, mkdirSync } from "fs";

export async function generateReceipt(data) {
  const width = 600;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Colors (70-20-10 Rule)
  const cNeutral = "#FFFFFF"; // 70% Base
  const cSubtle = "#F1F5F9"; // Secondary Neutral
  const cPrimary = "#1E3A8A"; // 20% Brand (Deep Blue)
  const cAccent = "#059669"; // 10% Action (Emerald Green)
  const cTextMain = "#1E293B"; // Text
  const cTextMuted = "#64748B"; // Labels

  // ================= BACKGROUND =================
  ctx.fillStyle = cSubtle;
  ctx.fillRect(0, 0, width, height);

  // ================= MAIN WHITE CARD =================
  const margin = 40;
  ctx.fillStyle = cNeutral;
  // Subtle shadow for depth
  ctx.shadowColor = "rgba(0,0,0,0.05)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 16);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // ================= LOGO & HEADER =================
  let currentY = 100;

  if (existsSync("./assets/logo.png")) {
    const logo = await loadImage("./assets/logo.png");
    ctx.drawImage(logo, width / 2 - 35, currentY - 40, 70, 70);
    currentY += 60;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = cPrimary;
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(data.churchName.toUpperCase(), width / 2, currentY);

  currentY += 40;
  ctx.fillStyle = cTextMuted;
  ctx.font = "500 16px sans-serif";
  ctx.fillText(`OFFICIAL PAYMENT RECEIPT`, width / 2, currentY);

  // Divider
  currentY += 30;
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin + 40, currentY);
  ctx.lineTo(width - margin - 40, currentY);
  ctx.stroke();

  // ================= TRANSACTION DETAILS =================
  currentY += 50;

  function drawRow(label, value) {
    ctx.textAlign = "left";
    ctx.fillStyle = cTextMuted;
    ctx.font = "600 14px sans-serif";
    ctx.fillText(label.toUpperCase(), margin + 50, currentY);

    ctx.textAlign = "right";
    ctx.fillStyle = cTextMain;
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(value, width - margin - 50, currentY);

    currentY += 45;
  }

  drawRow("Receipt No", `#${data.orderNumber}`);
  drawRow("Service", data.service);
  drawRow("Customer", data.customer);
  if (data.quantity) drawRow("Quantity", data.quantity.toString());
  drawRow("Date", data.date || new Date().toLocaleDateString("en-ZA"));

  // ================= AMOUNT SECTION (The Focus) =================
  currentY += 30;
  const amtBoxW = width - margin * 2 - 80;
  const amtBoxX = (width - amtBoxW) / 2;

  // Background for amount (very light green tint)
  ctx.fillStyle = "#F0FDF4";
  roundRect(ctx, amtBoxX, currentY, amtBoxW, 110, 12);
  ctx.fill();

  // Border for amount
  ctx.strokeStyle = "#DCFCE7";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = cAccent;
  ctx.font = "600 14px sans-serif";
  ctx.fillText("TOTAL AMOUNT PAID", width / 2, currentY + 35);

  ctx.font = "bold 48px sans-serif";
  ctx.fillText(`R ${data.amount}`, width / 2, currentY + 85);

  // ================= FOOTER / STATUS =================
  currentY += 160;

  ctx.fillStyle = cTextMuted;
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("Please Show Pastor Favor.", width / 2, height - 80);

  // ================= SAVE =================
  if (!existsSync("./receipts")) mkdirSync("./receipts");
  const filename = `./receipts/${data.orderNumber}.png`;
  writeFileSync(filename, canvas.toBuffer());

  return filename;
}

// Optimized Rounded Rect Helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
