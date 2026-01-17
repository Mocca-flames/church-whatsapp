export const MESSAGES = {
  menu: `🙏 *Welcome to\n
   "Fountain of Prayer Ministries"}*

Select a service:

1️⃣ One-on-One with Prophet
2️⃣ Anointing Oil
3️⃣ Covenant Salt
4️⃣ House Visit

Reply with number (1-4)`,

  oneOnOneInfo: (env) =>
    `✨ *ONE-ON-ONE WITH PROPHET*\n\n` +
    `Personal prophetic session\n` +
    `💰 Price: R${env.PRICE_ONE_ON_ONE}`,

  productInfo: (type, env) => {
    const price = type === "Oil" ? env.PRICE_OIL : env.PRICE_SALT;
    return (
      `✨ *${type === "Oil" ? "ANOINTING OIL" : "COVENANT SALT"}*\n\n` +
      `Blessed and prayed over\n` +
      `💰 Price: R${price} each`
    );
  },

  houseVisitInfo: (env) =>
    `🏠 *HOUSE VISIT BY PROPHET*\n\n` +
    `The prophet will visit your home for:\n` +
    `• House blessing\n` +
    `• Prayer session\n` +
    `• Spiritual cleansing\n\n` +
    `⏰ Duration: 1-2 hours\n` +
    `💰 Price: R${env.PRICE_HOUSE_VISIT}\n\n` +
    `⚠️ Prophet will call 30min before arrival`,

  paymentInstructions: (env) =>
    `💳 *PAYMENT DETAILS*\n\n` +
    `*Bank Transfer:*\n` +
    `Bank: ${env.BANK_NAME}\n` +
    `Account: ${env.ACCOUNT_NUMBER}\n` +
    `Branch: ${env.BRANCH_CODE}\n\n` +
    `*Or PaySharp:*\n` +
    `Number: ${env.PAYSHARP_NUMBER}`,

  askForName:
    "📝 Before we proceed, what is your name and surname? (e.g., Thabo Molefe)",
};
