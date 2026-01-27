process.env.WA_DEFAULT_EPHEMERAL = "true";

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { generateReceipt } from "./receipt.js";
import { MESSAGES } from "./messages.js";

// Load environment
const env = Object.fromEntries(
  readFileSync(".env", "utf-8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")),
);

// Setup Logger
const logger = pino({ level: "debug" });

// Simple state storage
let userStates = existsSync("./state.json")
  ? JSON.parse(readFileSync("./state.json", "utf-8"))
  : {};

const saveState = () => {
  writeFileSync("./state.json", JSON.stringify(userStates, null, 2));
};

// Get or create user state
const getState = (phone) => {
  if (!userStates[phone]) {
    userStates[phone] = {
      state: "IDLE",
      data: { name: null },
      lastActivity: Date.now(),
    };
    saveState();
  }
  return userStates[phone];
};

const setState = (phone, state, data = {}) => {
  userStates[phone] = {
    state,
    data: { ...userStates[phone]?.data, ...data },
    lastActivity: Date.now(),
  };
  saveState();
};

let retryCount = 0;

// Start bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    browser: ["Ubuntu", "Chrome", "120.0.04"],
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    shouldIgnoreJid: (jid) => false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan this QR code with WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`❌ Connection closed. Status: ${statusCode}`);

      if (shouldReconnect) {
        retryCount++;
        const delay = Math.min(30000, retryCount * 5000);

        console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
        setTimeout(() => startBot(), delay);
      }
    }

    if (connection === "open") {
      retryCount = 0;
      console.log("✅ Bot connected and ready!\n");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    console.log("📨 RAW MESSAGE RECEIVED:", {
      from: msg.key.remoteJid,
      fromMe: msg.key.fromMe,
      messageType: Object.keys(msg.message || {}),
      isGroup: msg.key.remoteJid.includes("@g.us"),
    });

    if (!msg.message || msg.key.fromMe) {
      console.log("⏭️  Skipping: No message or from self");
      return;
    }

    const chatJid = msg.key.remoteJid;
    const isGroup = chatJid.includes("@g.us");

    if (isGroup) {
      console.log(`⏭️  Skipping group message from ${chatJid}`);
      return;
    }

    const phone = chatJid.split("@")[0];

    const messageText =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    const hasImage = msg.message?.imageMessage;

    console.log(`📩 From JID: ${chatJid}`);
    console.log(`📱 Phone ID: ${phone}`);
    console.log(`📝 Text: ${messageText || "[Media]"}`);
    console.log(`🖼️  Has Image: ${hasImage ? "YES" : "NO"}`);

    try {
      await handleMessage(
        sock,
        chatJid,
        phone,
        messageText.trim(),
        msg,
        hasImage,
      );
    } catch (error) {
      console.error("❌ Error in handleMessage:", error);
      console.error("Stack trace:", error.stack);

      try {
        await send(
          sock,
          chatJid,
          "⚠️ An error occurred. Please type MENU to restart.",
        );
      } catch (sendError) {
        console.error("❌ Failed to send error message:", sendError);
      }
    }
  });

  return sock;
}

// Message router
async function handleMessage(sock, chatJid, phone, text, msg, hasImage) {
  const state = getState(phone);
  const upperText = text.toUpperCase();

  console.log(`DEBUG: State for ${phone} is ${state.state}`);

  // Auto-reset to IDLE if inactive for more than 1 hour
  const ONE_HOUR = 60 * 60 * 1000;
  if (Date.now() - state.lastActivity > ONE_HOUR) {
    console.log(`DEBUG: Session expired for ${phone}, resetting to IDLE`);
    setState(phone, "IDLE");
  }

  // Global reset commands
  if (upperText === "MENU" || upperText === "START") {
    console.log(`DEBUG: Global reset for ${phone}`);
    setState(phone, "IDLE");
    await send(sock, chatJid, MESSAGES.menu);
    setState(phone, "MENU_SHOWN");
    return;
  }

  // Route based on state
  switch (state.state) {
    case "IDLE":
    case "MENU_SHOWN":
      if (!state.data.name) {
        console.log(
          `DEBUG: Name missing for ${phone}, transitioning to NAME_COLLECTION`,
        );
        await send(sock, chatJid, MESSAGES.askForName);
        setState(phone, "NAME_COLLECTION");
        return;
      }

      if (state.state === "IDLE") {
        console.log(`DEBUG: Sending menu to ${phone}`);
        await send(sock, chatJid, MESSAGES.menu);
        setState(phone, "MENU_SHOWN");
        break;
      } else {
        console.log(`DEBUG: Handling menu selection for ${phone}: ${text}`);
        const handled = await handleMenuSelection(sock, chatJid, phone, text);
        if (!handled) {
          await send(sock, chatJid, MESSAGES.menu);
        }
        break;
      }

    case "NAME_COLLECTION":
      if (text.length > 0) {
        console.log(`DEBUG: Name collected for ${phone}: ${text}`);
        setState(phone, "IDLE", { name: text });
        await send(sock, chatJid, `Thank you, ${text}! Let's get you moving.`);
        await handleMessage(sock, chatJid, phone, "MENU", msg, hasImage);
      } else {
        await send(sock, chatJid, "❌ Please enter your full name.");
      }
      break;

    // PATIENT DELIVERY FLOW
    case "PATIENT_DELIVERY_PICKUP":
      await handlePatientDeliveryPickup(sock, chatJid, phone, text);
      break;

    case "PATIENT_DELIVERY_HOSPITAL":
      await handlePatientDeliveryHospital(sock, chatJid, phone, text);
      break;

    case "PATIENT_DELIVERY_PAYMENT":
      if (upperText === "PAID") {
        await send(
          sock,
          chatJid,
          "📸 Please send proof of payment (screenshot)",
        );
        setState(phone, "PATIENT_DELIVERY_PROOF");
      }
      break;

    case "PATIENT_DELIVERY_PROOF":
      if (hasImage) {
        await completePatientDelivery(sock, chatJid, phone, msg);
      } else {
        await send(
          sock,
          chatJid,
          "❌ Please send an image (screenshot of payment)",
        );
      }
      break;

    // E-HAILING FLOW
    case "EHAILING_PICKUP":
      await handleEhailingPickup(sock, chatJid, phone, text);
      break;

    case "EHAILING_DROPOFF":
      await handleEhailingDropoff(sock, chatJid, phone, text);
      break;

    case "EHAILING_DISTANCE":
      await handleEhailingDistance(sock, chatJid, phone, text);
      break;

    case "EHAILING_CONFIRM":
      await handleEhailingConfirm(sock, chatJid, phone, text);
      break;

    case "EHAILING_PAYMENT":
      if (upperText === "PAID") {
        await send(sock, chatJid, "📸 Please send proof of payment");
        setState(phone, "EHAILING_PROOF");
      }
      break;

    case "EHAILING_PROOF":
      if (hasImage) {
        await completeEhailing(sock, chatJid, phone, msg);
      } else {
        await send(sock, chatJid, "❌ Please send an image");
      }
      break;

    // FOOD DELIVERY FLOW
    case "FOOD_RESTAURANT":
      await handleFoodRestaurant(sock, chatJid, phone, text);
      break;

    case "FOOD_DELIVERY_ADDRESS":
      await handleFoodDeliveryAddress(sock, chatJid, phone, text);
      break;

    case "FOOD_PAYMENT":
      if (upperText === "PAID") {
        await send(sock, chatJid, "📸 Please send proof of payment");
        setState(phone, "FOOD_PROOF");
      }
      break;

    case "FOOD_PROOF":
      if (hasImage) {
        await completeFoodDelivery(sock, chatJid, phone, msg);
      } else {
        await send(sock, chatJid, "❌ Please send an image");
      }
      break;

    // PATIENT TRANSPORT FLOW
    case "PATIENT_TRANSPORT_PICKUP":
      await handlePatientTransportPickup(sock, chatJid, phone, text);
      break;

    case "PATIENT_TRANSPORT_DESTINATION":
      await handlePatientTransportDestination(sock, chatJid, phone, text);
      break;

    case "PATIENT_TRANSPORT_PAYMENT":
      if (upperText === "PAID") {
        await send(sock, chatJid, "📸 Please send proof of payment");
        setState(phone, "PATIENT_TRANSPORT_PROOF");
      }
      break;

    case "PATIENT_TRANSPORT_PROOF":
      if (hasImage) {
        await completePatientTransport(sock, chatJid, phone, msg);
      } else {
        await send(sock, chatJid, "❌ Please send an image");
      }
      break;

    default:
      await send(sock, chatJid, "Type MENU to start");
  }
}

// Menu selection
async function handleMenuSelection(sock, chatJid, phone, text) {
  switch (text) {
    case "1":
      await send(sock, chatJid, MESSAGES.patientDeliveryInfo(env));
      await send(
        sock,
        chatJid,
        "📍 Please describe your PICKUP location (address or area)",
      );
      setState(phone, "PATIENT_DELIVERY_PICKUP");
      return true;

    case "2":
      await send(sock, chatJid, MESSAGES.ehailingInfo(env));
      await send(
        sock,
        chatJid,
        "📍 Please describe your PICKUP location (address or area)",
      );
      setState(phone, "EHAILING_PICKUP");
      return true;

    case "3":
      await send(sock, chatJid, MESSAGES.foodDeliveryInfo(env));
      await send(
        sock,
        chatJid,
        "🏪 Please tell us the RESTAURANT name and location",
      );
      setState(phone, "FOOD_RESTAURANT");
      return true;

    case "4":
      await send(sock, chatJid, MESSAGES.patientTransportInfo(env));
      await send(
        sock,
        chatJid,
        "📍 Please describe your PICKUP location (address or area)",
      );
      setState(phone, "PATIENT_TRANSPORT_PICKUP");
      return true;

    default:
      await send(
        sock,
        chatJid,
        "❌ Invalid option. Please select 1, 2, 3, or 4",
      );
      return false;
  }
}

// ========== PATIENT DELIVERY HANDLERS ==========
async function handlePatientDeliveryPickup(sock, chatJid, phone, text) {
  setState(phone, "PATIENT_DELIVERY_HOSPITAL", { pickupLocation: text });
  await send(sock, chatJid, "🏥 Please provide the HOSPITAL/CLINIC location");
}

async function handlePatientDeliveryHospital(sock, chatJid, phone, text) {
  setState(phone, "PATIENT_DELIVERY_PAYMENT", { hospitalLocation: text });
  await send(sock, chatJid, MESSAGES.paymentInstructions(env));
  await send(sock, chatJid, "💰 After paying, reply with: PAID");
}

async function completePatientDelivery(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completePatientDelivery for ${phone}`);
  const state = getState(phone);
  const orderNumber = `MT${Date.now()}`;

  const receiptPath = await generateReceipt({
    orderNumber,
    companyName: env.COMPANY_NAME,
    service: "Patient Delivery",
    details: `From: ${state.data.pickupLocation}\nTo: ${state.data.hospitalLocation}`,
    amount: env.PRICE_PATIENT_DELIVERY,
    customer: state.data.name,
  });

  await sendImage(
    sock,
    chatJid,
    receiptPath,
    `✅ *BOOKING CONFIRMED*\n\n📄 Your receipt\n🚗 Driver will contact you shortly\n⚡ Emergency priority service`,
  );

  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: "Patient Delivery",
      details: `Pickup: ${state.data.pickupLocation}\nHospital: ${state.data.hospitalLocation}`,
      amount: env.PRICE_PATIENT_DELIVERY,
      orderNumber,
    },
    receiptPath,
  );

  setState(phone, "IDLE");
}

// ========== E-HAILING HANDLERS ==========
async function handleEhailingPickup(sock, chatJid, phone, text) {
  setState(phone, "EHAILING_DROPOFF", { pickupLocation: text });
  await send(sock, chatJid, "📍 Please describe your DROP-OFF location");
}

async function handleEhailingDropoff(sock, chatJid, phone, text) {
  setState(phone, "EHAILING_DISTANCE", { dropoffLocation: text });
  await send(
    sock,
    chatJid,
    "🚗 Please estimate the distance in kilometers (e.g., 5 or 10)",
  );
}

async function handleEhailingDistance(sock, chatJid, phone, text) {
  const distance = parseFloat(text);
  if (isNaN(distance) || distance < 1) {
    await send(
      sock,
      chatJid,
      "❌ Please enter a valid distance (e.g., 5 or 10)",
    );
    return;
  }

  const state = getState(phone);
  const baseFare = parseFloat(env.PRICE_EHAILING_BASE);
  const perKm = parseFloat(env.PRICE_EHAILING_PER_KM);
  const total = baseFare + distance * perKm;

  setState(phone, "EHAILING_CONFIRM", { distance, total });

  await send(
    sock,
    chatJid,
    `🚖 *RIDE SUMMARY*\n\n` +
      `From: ${state.data.pickupLocation}\n` +
      `To: ${state.data.dropoffLocation}\n` +
      `Distance: ${distance}km\n` +
      `Total: R${total.toFixed(2)}\n\n` +
      `Confirm? Reply: YES or NO`,
  );
}

async function handleEhailingConfirm(sock, chatJid, phone, text) {
  if (text.toUpperCase() === "YES") {
    await send(sock, chatJid, MESSAGES.paymentInstructions(env));
    await send(sock, chatJid, "💰 After paying, reply with: PAID");
    setState(phone, "EHAILING_PAYMENT");
  } else if (text.toUpperCase() === "NO") {
    await send(sock, chatJid, "Booking cancelled. Type MENU to start over.");
    setState(phone, "IDLE");
  } else {
    await send(sock, chatJid, "❌ Please reply YES or NO");
  }
}

async function completeEhailing(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completeEhailing for ${phone}`);
  const state = getState(phone);
  const orderNumber = `MT${Date.now()}`;

  const receiptPath = await generateReceipt({
    orderNumber,
    companyName: env.COMPANY_NAME,
    service: "E-hailing Service",
    details: `From: ${state.data.pickupLocation}\nTo: ${state.data.dropoffLocation}\nDistance: ${state.data.distance}km`,
    amount: state.data.total,
    customer: state.data.name,
  });

  await sendImage(
    sock,
    chatJid,
    receiptPath,
    `✅ *RIDE BOOKED*\n\n📄 Your receipt\n🚗 Driver will arrive shortly`,
  );

  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: "E-hailing",
      details: `Pickup: ${state.data.pickupLocation}\nDropoff: ${state.data.dropoffLocation}\nDistance: ${state.data.distance}km`,
      amount: state.data.total,
      orderNumber,
    },
    receiptPath,
  );

  setState(phone, "IDLE");
}

// ========== FOOD DELIVERY HANDLERS ==========
async function handleFoodRestaurant(sock, chatJid, phone, text) {
  setState(phone, "FOOD_DELIVERY_ADDRESS", { restaurant: text });
  await send(sock, chatJid, "📍 Please provide your DELIVERY address");
}

async function handleFoodDeliveryAddress(sock, chatJid, phone, text) {
  setState(phone, "FOOD_PAYMENT", { deliveryAddress: text });
  await send(sock, chatJid, MESSAGES.paymentInstructions(env));
  await send(sock, chatJid, "💰 After paying, reply with: PAID");
}

async function completeFoodDelivery(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completeFoodDelivery for ${phone}`);
  const state = getState(phone);
  const orderNumber = `MT${Date.now()}`;

  const receiptPath = await generateReceipt({
    orderNumber,
    companyName: env.COMPANY_NAME,
    service: "Food Delivery",
    details: `Restaurant: ${state.data.restaurant}\nDeliver to: ${state.data.deliveryAddress}`,
    amount: env.PRICE_FOOD_DELIVERY,
    customer: state.data.name,
  });

  await sendImage(
    sock,
    chatJid,
    receiptPath,
    `✅ *DELIVERY CONFIRMED*\n\n📄 Your receipt\n🍔 Driver will pick up your food and deliver soon`,
  );

  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: "Food Delivery",
      details: `Restaurant: ${state.data.restaurant}\nDeliver to: ${state.data.deliveryAddress}`,
      amount: env.PRICE_FOOD_DELIVERY,
      orderNumber,
    },
    receiptPath,
  );

  setState(phone, "IDLE");
}

// ========== PATIENT TRANSPORT HANDLERS ==========
async function handlePatientTransportPickup(sock, chatJid, phone, text) {
  setState(phone, "PATIENT_TRANSPORT_DESTINATION", { pickupLocation: text });
  await send(
    sock,
    chatJid,
    "🏥 Please provide the DESTINATION (hospital/clinic/home)",
  );
}

async function handlePatientTransportDestination(sock, chatJid, phone, text) {
  setState(phone, "PATIENT_TRANSPORT_PAYMENT", { destination: text });
  await send(sock, chatJid, MESSAGES.paymentInstructions(env));
  await send(sock, chatJid, "💰 After paying, reply with: PAID");
}

async function completePatientTransport(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completePatientTransport for ${phone}`);
  const state = getState(phone);
  const orderNumber = `MT${Date.now()}`;

  const receiptPath = await generateReceipt({
    orderNumber,
    companyName: env.COMPANY_NAME,
    service: "Patient Transport",
    details: `From: ${state.data.pickupLocation}\nTo: ${state.data.destination}`,
    amount: env.PRICE_PATIENT_TRANSPORT,
    customer: state.data.name,
  });

  await sendImage(
    sock,
    chatJid,
    receiptPath,
    `✅ *TRANSPORT CONFIRMED*\n\n📄 Your receipt\n🚗 Trained medical transport driver will arrive shortly`,
  );

  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: "Patient Transport",
      details: `Pickup: ${state.data.pickupLocation}\nDestination: ${state.data.destination}`,
      amount: env.PRICE_PATIENT_TRANSPORT,
      orderNumber,
    },
    receiptPath,
  );

  setState(phone, "IDLE");
}

// ========== HELPER FUNCTIONS ==========
async function send(sock, chatJid, text) {
  try {
    console.log(`📤 Sending to ${chatJid}: ${text.substring(0, 50)}...`);
    const result = await sock.sendMessage(chatJid, { text });
    console.log(`✅ Message sent successfully to ${chatJid}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send message to ${chatJid}:`, error);
    console.error("Error details:", error.message);
    throw error;
  }
}

async function sendImage(sock, chatJid, imagePath, caption) {
  try {
    console.log(`📤 Sending image ${imagePath} to ${chatJid}`);
    const buffer = readFileSync(imagePath);
    console.log(`Image buffer size: ${buffer.length} bytes`);

    const result = await sock.sendMessage(chatJid, {
      image: buffer,
      caption,
    });

    console.log(`✅ Image sent successfully to ${chatJid}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send image to ${chatJid}:`, error);
    console.error("Error details:", error.message);
    throw error;
  }
}

async function sendAdminNotification(sock, adminPhone, order, receiptPath) {
  if (!adminPhone || adminPhone.trim() === "") {
    console.log("⏭️  Skipping admin notification: ADMIN_NUMBER is empty.");
    return;
  }
  try {
    const jid = adminPhone.includes("@")
      ? adminPhone
      : `${adminPhone}@s.whatsapp.net`;
    console.log(`📤 Sending admin notification to ${jid}`);

    const customerPhone = order.customer.startsWith("+")
      ? order.customer
      : `+${order.customer}`;

    const message =
      `🔔 *NEW BOOKING*\n\n` +
      `Customer: ${customerPhone}\n` +
      `Service: ${order.service}\n` +
      `${order.details}\n` +
      `Amount: R${order.amount}\n` +
      `Order: ${order.orderNumber}\n` +
      `Time: ${new Date().toLocaleString()}`;

    const buffer = readFileSync(receiptPath);
    console.log(`Admin notification buffer size: ${buffer.length} bytes`);

    const result = await sock.sendMessage(jid, {
      image: buffer,
      caption: message,
    });

    console.log(`✅ Admin notification sent successfully`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send admin notification:`, error);
    console.error("Error details:", error.message);
    throw error;
  }
}

const MOLO_HOSPITAL_DESTINATION = "Molo-Hospital";

// Start
startBot();
