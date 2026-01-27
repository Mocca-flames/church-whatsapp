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
  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Header background - Transportation blue
  ctx.fillStyle = "#1e40af";
  ctx.fillRect(0, 0, width, 180);

  // Company name
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText(companyName.toUpperCase(), width / 2, 70);

  // Tagline
  ctx.font = "24px Arial";
  ctx.fillText("Your Trusted Transport Partner", width / 2, 110);

  // Receipt title
  ctx.fillStyle = "#1e40af";
  ctx.font = "bold 36px Arial";
  ctx.fillText("RECEIPT", width / 2, 250);

  // Order number
  ctx.fillStyle = "#374151";
  ctx.font = "24px Arial";
  ctx.fillText(`Order #${orderNumber}`, width / 2, 290);

  // Divider line
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 320);
  ctx.lineTo(width - 50, 320);
  ctx.stroke();

  // Receipt details
  ctx.textAlign = "left";
  ctx.font = "22px Arial";
  let yPos = 370;

  // Customer
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Customer:", 80, yPos);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial";
  ctx.fillText(customer, 250, yPos);

  // Service
  yPos += 50;
  ctx.font = "22px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Service:", 80, yPos);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial";
  ctx.fillText(service, 250, yPos);

  // Details (multi-line support)
  if (details) {
    yPos += 50;
    ctx.font = "22px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Details:", 80, yPos);
    
    ctx.fillStyle = "#111827";
    ctx.font = "20px Arial";
    const detailLines = details.split("\n");
    detailLines.forEach((line, index) => {
      ctx.fillText(line, 250, yPos + (index * 30));
    });
    yPos += (detailLines.length - 1) * 30;
  }

  // Date
  yPos += 50;
  ctx.font = "22px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Date:", 80, yPos);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial";
  ctx.fillText(new Date().toLocaleDateString(), 250, yPos);

  // Divider line
  yPos += 50;
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, yPos);
  ctx.lineTo(width - 50, yPos);
  ctx.stroke();

  // Amount section
  yPos += 70;
  ctx.fillStyle = "#1e40af";
  ctx.font = "28px Arial";
  ctx.fillText("TOTAL AMOUNT:", 80, yPos);

  ctx.font = "bold 48px Arial";
  ctx.fillStyle = "#059669";
  ctx.textAlign = "right";
  ctx.fillText(`R${amount}`, width - 80, yPos);

  // Status
  yPos += 80;
  ctx.fillStyle = "#10b981";
  ctx.fillRect(50, yPos - 35, width - 100, 60);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✓ PAID", width / 2, yPos);

  // Footer
  yPos += 100;
  ctx.fillStyle = "#6b7280";
  ctx.font = "18px Arial";
  ctx.fillText("Thank you for choosing Molo-Tech Transportation!", width / 2, yPos);
  
  yPos += 35;
  ctx.font = "16px Arial";
  ctx.fillText("Keep this receipt for your records", width / 2, yPos);

  yPos += 35;
  ctx.fillText("For support: contact@molotech.co.za", width / 2, yPos);

  // Save
  const filename = `receipt_${orderNumber}.png`;
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(filename, buffer);

  return filename;
}