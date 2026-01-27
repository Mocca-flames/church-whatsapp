import { createCanvas, loadImage } from "canvas";
import { writeFileSync } from "fs";

export async function generateReceipt(data) {
  const {
    orderNumber,
    companyName = "Molo-Tech",
    service,
    details = "",
    amount,
    customer,
  } = data;

  // --- Configuration ---
  const width = 800;
  const height = 1200; // Slightly taller for better spacing
  const padding = 50;

  // Modern Color Palette (Transportation / Logistics Theme)
  const colors = {
    bg: "#f1f5f9", // Slate-100 (App background)
    card: "#ffffff", // White (Ticket surface)
    primary: "#1e293b", // Slate-800 (Headings)
    secondary: "#64748b", // Slate-500 (Labels)
    accent: "#3b82f6", // Blue-500 (Branding)
    success: "#10b981", // Emerald-500 (Paid Status)
    divider: "#e2e8f0", // Slate-200
    textDark: "#0f172a", // Slate-900
  };

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // --- Helpers ---

  // Helper: Draw Rounded Rectangle
  const roundRect = (x, y, w, h, radius) => {
    if (w < 2 * radius) radius = w / 2;
    if (h < 2 * radius) radius = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    return ctx;
  };

  // Helper: Write Label/Value Pair
  const drawField = (label, value, x, y, align = "left") => {
    ctx.textAlign = align;

    // Label
    ctx.fillStyle = colors.secondary;
    ctx.font = "600 24px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), x, y);

    // Value
    ctx.fillStyle = colors.textDark;
    ctx.font = "bold 32px 'Segoe UI', Arial, sans-serif";
    // Check if value is too long, if so, shrink font slightly
    if (value.length > 25) ctx.font = "bold 26px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(value, x, y + 35);
  };

  // --- 1. Background (App View) ---
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  // --- 2. The Ticket (Card) ---
  // Shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 15;

  // Card Shape
  ctx.fillStyle = colors.card;
  roundRect(
    padding,
    padding,
    width - padding * 2,
    height - padding * 2,
    30,
  ).fill();

  // Reset shadow for text
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // --- 3. Header Section ---
  let yPos = 130;

  // Try to load logo, fallback to text if missing
  try {
    const logo = await loadImage("assets/logo.png");
    // Draw Logo Centered
    const logoWidth = 100;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    ctx.drawImage(logo, width / 2 - logoWidth / 2, 60, logoWidth, logoHeight);
    yPos += logoHeight + 20;
  } catch (e) {
    // Fallback Icon (Truck/Bus representation)
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(width / 2, 100, 40, 0, Math.PI * 2);
    ctx.fill();
    yPos = 180;
  }

  // Company Name
  ctx.textAlign = "center";
  ctx.fillStyle = colors.primary;
  ctx.font = "bold 40px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(companyName, width / 2, yPos);

  // Receipt Label
  yPos += 40;
  ctx.fillStyle = colors.secondary;
  ctx.font = "24px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("Transportation Receipt", width / 2, yPos);

  // --- 4. Amount & Status (Hero Section) ---
  yPos += 80;

  // Price Background Pill
  ctx.fillStyle = "#eff6ff"; // Light Blue bg
  roundRect(width / 2 - 200, yPos - 50, 400, 100, 50).fill();

  // Amount
  ctx.fillStyle = colors.accent;
  ctx.font = "bold 60px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`R${amount}`, width / 2, yPos + 20);

  // Status Badge
  yPos += 90;
  const statusText = "PAYMENT SUCCESSFUL";
  ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
  const textWidth = ctx.measureText(statusText).width;
  const badgeWidth = textWidth + 60;

  ctx.fillStyle = colors.success;
  roundRect(width / 2 - badgeWidth / 2, yPos - 25, badgeWidth, 40, 20).fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText("✓ " + statusText, width / 2, yPos + 2);

  // --- 5. Divider (Ticket Tear Line) ---
  yPos += 80;
  const dividerY = yPos;

  // Dashed Line
  ctx.strokeStyle = colors.divider;
  ctx.lineWidth = 4;
  ctx.setLineDash([15, 15]);
  ctx.beginPath();
  ctx.moveTo(padding, dividerY);
  ctx.lineTo(width - padding, dividerY);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash

  // Cutout Notches (Left and Right) to look like a ticket
  ctx.fillStyle = colors.bg;
  ctx.beginPath();
  ctx.arc(padding, dividerY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width - padding, dividerY, 20, 0, Math.PI * 2);
  ctx.fill();

  // --- 6. Trip Details Grid ---
  yPos += 80;
  const leftCol = padding + 40;
  const rightCol = width - padding - 40;

  // Row 1: Date & Time
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-ZA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  drawField("Date", dateStr, leftCol, yPos, "left");
  drawField("Time", timeStr, rightCol, yPos, "right");

  // Row 2: Customer & Order
  yPos += 100;
  drawField("Passenger", customer, leftCol, yPos, "left");
  drawField("Order ID", `#${orderNumber}`, rightCol, yPos, "right");

  // --- 7. Service / Route Visual ---
  yPos += 100;

  // Gray container for Service Details
  ctx.fillStyle = "#f8fafc";
  const boxHeight = details ? 180 : 120;
  roundRect(leftCol, yPos, width - padding * 2 - 80, boxHeight, 15).fill();

  // Service Icon (A to B visual)
  const boxPadding = 30;
  const contentY = yPos + boxPadding + 10;

  // Draw a "Route" line visual
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(leftCol + boxPadding + 7, contentY + 5);
  ctx.lineTo(leftCol + boxPadding + 7, contentY + 45); // Vertical line connecting dots
  ctx.stroke();

  // Start Dot
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(leftCol + boxPadding + 7, contentY, 6, 0, Math.PI * 2);
  ctx.fill();

  // End Square
  ctx.fillStyle = colors.primary;
  ctx.fillRect(leftCol + boxPadding + 4, contentY + 45, 6, 6);

  // Text
  ctx.textAlign = "left";

  // Service Name
  ctx.fillStyle = colors.secondary;
  ctx.font = "600 20px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("SERVICE TYPE", leftCol + boxPadding + 30, contentY);

  ctx.fillStyle = colors.textDark;
  ctx.font = "bold 28px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(service, leftCol + boxPadding + 30, contentY + 30);

  // Extra Details (if any)
  if (details) {
    ctx.fillStyle = colors.secondary;
    ctx.font = "22px 'Segoe UI', Arial, sans-serif";
    const detailLines = details.split("\n");
    // Only show first 2 lines to fit styling
    detailLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, leftCol + boxPadding + 30, contentY + 70 + i * 30);
    });
  }

  // --- 8. Footer (Barcode / Legal) ---
  const footerY = height - padding - 40;

  // Simulated Barcode
  const barcodeX = width / 2 - 150;
  const barcodeY = footerY - 80;
  ctx.fillStyle = colors.textDark;

  // Generate random bars to look like a barcode
  let currentX = barcodeX;
  while (currentX < barcodeX + 300) {
    const barWidth = Math.random() * 4 + 2;
    ctx.fillRect(currentX, barcodeY, barWidth, 40);
    currentX += barWidth + (Math.random() * 5 + 2);
  }

  // Footer Text
  ctx.textAlign = "center";
  ctx.fillStyle = colors.secondary;
  ctx.font = "18px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("Retain this ticket for your records.", width / 2, footerY);

  // Save
  const filename = `receipt_${orderNumber}.png`;
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(filename, buffer);

  return filename;
}
