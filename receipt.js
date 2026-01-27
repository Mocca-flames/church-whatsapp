import { createCanvas, loadImage } from "canvas";
import { writeFileSync } from "fs";

export async function generateReceipt(data) {
  const {
    orderNumber,
    companyName = "Molo-Tech Transportation",
    service,
    details = "",
    amount,
    customer,
  } = data;

  // Canvas setup
  const width = 800;
  const height = 1100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const logo = await loadImage("assets/logo.png");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Header background - Modern gradient
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#667eea");
  gradient.addColorStop(1, "#764ba2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, 200);

  // Logo
  ctx.drawImage(logo, 50, 30, 120, 120);

  // Company name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px Arial";
  ctx.textAlign = "left";
  ctx.fillText(companyName.toUpperCase(), 200, 80);

  // Tagline
  ctx.font = "20px Arial";
  ctx.fillText("Your Trusted Transport Partner", 200, 110);

  // Receipt title
  ctx.fillStyle = "#4f46e5";
  ctx.font = "bold 36px Arial";
  ctx.fillText("RECEIPT", width / 2, 270);

  // Order number
  ctx.fillStyle = "#374151";
  ctx.font = "24px Arial";
  ctx.fillText(`Order #${orderNumber}`, width / 2, 310);

  // Divider line
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 340);
  ctx.lineTo(width - 50, 340);
  ctx.stroke();

  // Receipt details
  ctx.textAlign = "left";
  ctx.font = "24px Arial";
  let yPos = 390;

  // Customer
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Customer:", 80, yPos);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 24px Arial";
  ctx.fillText(customer, 250, yPos);

  // Service
  yPos += 60;
  ctx.font = "24px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Service:", 80, yPos);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 24px Arial";
  ctx.fillText(service, 250, yPos);

  // Details (multi-line support)
  if (details) {
    yPos += 60;
    ctx.font = "24px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Details:", 80, yPos);

    ctx.fillStyle = "#111827";
    ctx.font = "22px Arial";
    const detailLines = details.split("\n");
    detailLines.forEach((line, index) => {
      ctx.fillText(line, 250, yPos + index * 35);
    });
    yPos += (detailLines.length - 1) * 35;
  }

  // Date
  yPos += 60;
  ctx.font = "24px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Date:", 80, yPos);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 24px Arial";
  ctx.fillText(new Date().toLocaleDateString(), 250, yPos);

  // Divider line
  yPos += 60;
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, yPos);
  ctx.lineTo(width - 50, yPos);
  ctx.stroke();

  // Amount section
  yPos += 80;
  ctx.fillStyle = "#4f46e5";
  ctx.font = "30px Arial";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL AMOUNT:", 80, yPos);

  ctx.font = "bold 50px Arial";
  ctx.fillStyle = "#10b981";
  ctx.textAlign = "right";
  ctx.fillText(`R${amount}`, width - 80, yPos);

  // Status
  yPos += 90;
  ctx.fillStyle = "#d1fae5";
  ctx.fillRect(50, yPos - 40, width - 100, 70);
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.strokeRect(50, yPos - 40, width - 100, 70);
  ctx.fillStyle = "#065f46";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✓ PAID", width / 2, yPos);

  // Footer
  yPos += 110;
  ctx.fillStyle = "#6b7280";
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    "Thank you for choosing Molo-Tech Transportation!",
    width / 2,
    yPos,
  );

  yPos += 40;
  ctx.font = "18px Arial";
  ctx.fillText("Keep this receipt for your records", width / 2, yPos);

  yPos += 40;
  ctx.fillText("For support: contact@molotech.co.za", width / 2, yPos);

  // Save
  const filename = `receipt_${orderNumber}.png`;
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(filename, buffer);

  return filename;
}
