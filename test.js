import { generateReceipt } from "./receipt.js"; // Ensure filename matches

const sampleData = {
  orderNumber: 158,
  companyName:"Molo-Tech",
  service: "Patient Delivery",
  details: "From: XYZ\nTo: ABC",
  amount: 100,
  customer: "John Doe",
};

(async () => {
  console.log("Generating receipt...");
  try {
    const filePath = await generateReceipt(sampleData);
    console.log("✅ Success! Receipt saved to:", filePath);
  } catch (error) {
    console.error("❌ Failed:", error);
  }
})();
