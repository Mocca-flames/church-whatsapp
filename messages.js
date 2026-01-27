export const MESSAGES = {
  menu: `🚗 *Welcome to Molo-Tech Transportation!*

We provide reliable transport services:

1️⃣ *Patient Delivery* - Medical transport for expectant mothers
2️⃣ *E-hailing* - Quick rides anywhere in the city
3️⃣ *Food Delivery* - Fast food pickup & delivery
4️⃣ *Patient Transport* - Non-emergency medical transport

📱 Reply with *1, 2, 3, or 4* to book a service`,

  askForName: `👋 Welcome to Molo-Tech Transportation!

Before we proceed, please tell us your *full name*.`,

  // Patient Delivery
  patientDeliveryInfo: (env) => `👶 *PATIENT DELIVERY SERVICE*

🏥 Safe transport for expectant mothers to hospital/clinic
✅ Experienced drivers trained in patient care
⚡ Priority response - Available 24/7
🚨 Emergency support included

💰 *Price:* R${env.PRICE_PATIENT_DELIVERY}

📍 Next: We'll need your pickup and hospital locations`,

  // E-hailing
  ehailingInfo: (env) => `🚖 *E-HAILING SERVICE*

✅ Professional drivers
🚗 Clean, comfortable vehicles
⚡ Quick pickup times
💳 Affordable rates

💰 *Base fare:* R${env.PRICE_EHAILING_BASE}
💰 *Per km:* R${env.PRICE_EHAILING_PER_KM}

📍 Next: We'll need pickup and drop-off locations`,

  // Food Delivery
  foodDeliveryInfo: (env) => `🍔 *FOOD DELIVERY SERVICE*

🏪 We pick up from any restaurant
⚡ Fast delivery
📦 Safe food handling
✅ Direct to your door

💰 *Delivery fee:* R${env.PRICE_FOOD_DELIVERY}

📍 Next: We'll need restaurant location and your delivery address`,

  // Patient Transport
  patientTransportInfo: (env) => `🏥 *PATIENT TRANSPORT SERVICE*

🚑 Non-emergency medical transport
♿ Wheelchair accessible vehicles available
👨‍⚕️ Trained support staff
🏥 Hospital/clinic appointments
🏠 Home visits

💰 *Price:* R${env.PRICE_PATIENT_TRANSPORT}

📍 Next: We'll need pickup and destination locations`,

  paymentInstructions: (env) => `💳 *PAYMENT INSTRUCTIONS*

Please deposit to:
🏦 Bank: ${env.BANK_NAME}
👤 Account: ${env.ACCOUNT_NAME}
🔢 Number: ${env.ACCOUNT_NUMBER}
🔀 Type: ${env.ACCOUNT_TYPE}

📱 Or via eWallet:
📞 ${env.EWALLET_NUMBER}

⚠️ *Important:* Use your phone number as reference`,
};
