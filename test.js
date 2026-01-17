import { generateReceipt } from "./receipt.js"; // Ensure filename matches

const sampleData = {
  churchName: "Fountain of Prayer Ministries",
  orderNumber: "884210",
  service: "Special Building Fund",
  customer: "Thabo Molefe",
  amount: "550.00",
  date: "24 May 2024",
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
