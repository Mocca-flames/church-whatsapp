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

    syncFullHistory: false, // CRITICAL for 405 fix

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

  // IMPROVED Message handler with better debugging
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    // Debug: Log ALL incoming messages
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

    // CRITICAL: Use the FULL remoteJid, don't reconstruct it
    const chatJid = msg.key.remoteJid;
    const isGroup = chatJid.includes("@g.us");

    // Only handle personal messages
    if (isGroup) {
      console.log(`⏭️  Skipping group message from ${chatJid}`);
      return;
    }

    // Extract phone for state tracking (strip JID suffix)
    const phone = chatJid.split("@")[0];

    const messageText =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    const hasImage = msg.message?.imageMessage;
    const hasLocation = msg.message?.locationMessage;

    console.log(`📩 From JID: ${chatJid}`);
    console.log(`📱 Phone ID: ${phone}`);
    console.log(`📝 Text: ${messageText || "[Media]"}`);
    console.log(`🖼️  Has Image: ${hasImage ? "YES" : "NO"}`);
    console.log(`📍 Has Location: ${hasLocation ? "YES" : "NO"}`);

    try {
      // PASS THE FULL JID, NOT JUST THE PHONE NUMBER
      await handleMessage(
        sock,
        chatJid, // ← Changed from 'phone' to 'chatJid'
        phone, // ← Add phone separately for state tracking
        messageText.trim(),
        msg,
        hasImage,
        hasLocation,
      );
    } catch (error) {
      console.error("❌ Error in handleMessage:", error);
      console.error("Stack trace:", error.stack);

      // Send error message to user
      try {
        await send(
          sock,
          chatJid, // ← Changed from 'phone' to 'chatJid'
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
async function handleMessage(
  sock,
  chatJid,
  phone,
  text,
  msg,
  hasImage,
  hasLocation,
) {
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
      // Check if name is collected
      if (!state.data.name) {
        console.log(
          `DEBUG: Name missing for ${phone}, transitioning to NAME_COLLECTION`,
        );
        await send(sock, chatJid, MESSAGES.askForName);
        setState(phone, "NAME_COLLECTION");
        return;
      }

      // If name exists, proceed to menu logic
      if (state.state === "IDLE") {
        console.log(`DEBUG: Sending menu to ${phone}`);
        await send(sock, chatJid, MESSAGES.menu);
        setState(phone, "MENU_SHOWN");
        break;
      } else {
        // MENU_SHOWN
        console.log(`DEBUG: Handling menu selection for ${phone}: ${text}`);
        const handled = await handleMenuSelection(sock, chatJid, phone, text);
        if (!handled) {
          await send(sock, chatJid, MESSAGES.menu);
        }
        break;
      }

    case "NAME_COLLECTION":
      // Basic validation for name (must not be empty)
      if (text.length > 0) {
        console.log(`DEBUG: Name collected for ${phone}: ${text}`);
        setState(phone, "IDLE", { name: text });
        await send(
          sock,
          chatJid,
          `Thank you, ${text}! You can now use the menu.`,
        );
        // Fall through to IDLE to display the menu immediately
        await handleMessage(
          sock,
          chatJid,
          phone,
          "MENU",
          msg,
          hasImage,
          hasLocation,
        );
      } else {
        await send(sock, chatJid, "❌ Please enter your name and surname.");
      }
      break;

    // ONE-ON-ONE FLOW
    case "ONE_ON_ONE_DATE":
      await handleOneOnOneDate(sock, chatJid, phone, text);
      break;

    case "ONE_ON_ONE_PAYMENT":
      if (upperText === "PAID") {
        await send(
          sock,
          chatJid,
          "📸 Please send proof of payment (screenshot)",
        );
        setState(phone, "ONE_ON_ONE_PROOF");
      }
      break;

    case "ONE_ON_ONE_PROOF":
      if (hasImage) {
        await completeOneOnOne(sock, chatJid, phone, msg);
      } else {
        await send(
          sock,
          chatJid,
          "❌ Please send an image (screenshot of payment)",
        );
      }
      break;

    // PRODUCT FLOW (Oil/Salt)
    case "PRODUCT_QUANTITY":
      await handleProductQuantity(sock, chatJid, phone, text);
      break;

    case "PRODUCT_CONFIRM":
      await handleProductConfirm(sock, chatJid, phone, text);
      break;

    case "PRODUCT_PAYMENT":
      if (upperText === "PAID") {
        await send(sock, chatJid, "📸 Please send proof of payment");
        setState(phone, "PRODUCT_PROOF");
      }
      break;

    case "PRODUCT_PROOF":
      if (hasImage) {
        await completeProduct(sock, chatJid, phone, msg);
      } else {
        await send(sock, chatJid, "❌ Please send an image");
      }
      break;

    // HOUSE VISIT FLOW
    case "HOUSE_VISIT_CONFIRM":
      await handleHouseVisitConfirm(sock, chatJid, phone, text);
      break;

    case "HOUSE_VISIT_LOCATION":
      if (upperText === "SKIP") {
        await send(sock, chatJid, MESSAGES.paymentInstructions(env));
        setState(phone, "HOUSE_VISIT_PAYMENT", { locationPending: true });
      } else if (hasLocation) {
        const loc = msg.message.locationMessage;
        setState(phone, "HOUSE_VISIT_PAYMENT", {
          location: { lat: loc.degreesLatitude, lng: loc.degreesLongitude },
        });
        await send(
          sock,
          chatJid,
          "✅ Location saved!\n\n" + MESSAGES.paymentInstructions(env),
        );
        await send(sock, chatJid, "💰 After paying, reply with: PAID");
      } else {
        await send(sock, chatJid, "📍 Please send your location OR type SKIP");
      }
      break;

    case "HOUSE_VISIT_PAYMENT":
      if (upperText === "PAID") {
        await send(sock, chatJid, "📸 Please send proof of payment");
        setState(phone, "HOUSE_VISIT_PROOF");
      }
      break;

    case "HOUSE_VISIT_PROOF":
      if (hasImage) {
        await completeHouseVisit(sock, chatJid, phone, msg);
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
      await send(sock, chatJid, MESSAGES.oneOnOneInfo(env));
      await send(
        sock,
        chatJid,
        "📅 Reply with your preferred date:\n\nTUESDAY or SUNDAY",
      );
      setState(phone, "ONE_ON_ONE_DATE");
      return true;

    case "2":
      await send(sock, chatJid, MESSAGES.productInfo("Oil", env));
      await send(sock, chatJid, "🔢 How many? (Reply with number 1-10)");
      setState(phone, "PRODUCT_QUANTITY", { product: "OIL" });
      return true;

    case "3":
      await send(sock, chatJid, MESSAGES.productInfo("Salt", env));
      await send(sock, chatJid, "🔢 How many? (Reply with number 1-10)");
      setState(phone, "PRODUCT_QUANTITY", { product: "SALT" });
      return true;

    case "4":
      await send(sock, chatJid, MESSAGES.houseVisitInfo(env));
      await send(sock, chatJid, "✅ Do you understand?\n\nReply: YES or NO");
      setState(phone, "HOUSE_VISIT_CONFIRM");
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

// One-on-One handlers
async function handleOneOnOneDate(sock, chatJid, phone, text) {
  const upper = text.toUpperCase();
  if (upper === "TUESDAY" || upper === "SUNDAY") {
    setState(phone, "ONE_ON_ONE_PAYMENT", { date: upper });
    await send(sock, chatJid, MESSAGES.paymentInstructions(env));
    await send(sock, chatJid, "💰 After paying, reply with: PAID");
  } else {
    await send(sock, chatJid, "❌ Please reply with TUESDAY or SUNDAY");
  }
}

async function completeOneOnOne(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completeOneOnOne for ${phone}`);
  const state = getState(phone);
  const orderNumber = `ORD${Date.now()}`;

  // Generate receipt
  console.log(`DEBUG: Generating receipt for ${orderNumber}`);
  const receiptPath = await generateReceipt({
    orderNumber,
    churchName: env.CHURCH_NAME,
    service: "One-on-One with Prophet",
    date: state.data.date,
    amount: env.PRICE_ONE_ON_ONE,
    customer: state.data.name,
  });
  console.log(`DEBUG: Receipt generated at ${receiptPath}`);

  // Send receipt to customer
  console.log(`DEBUG: Sending receipt to customer ${phone}`);
  await sendImage(
    sock,
    chatJid,
    receiptPath,
    "✅ *PAYMENT CONFIRMED*\n\n📄 Here is your receipt.\n\n✨ Show this to admin on your visit date.",
  );
  console.log(`DEBUG: Receipt sent to customer ${phone}`);

  // Notify admin
  console.log(`DEBUG: Notifying admin ${env.ADMIN_NUMBER}`);
  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: "One-on-One with Prophet",
      details: `Date: ${state.data.date}`,
      amount: env.PRICE_ONE_ON_ONE,
      orderNumber,
    },
    receiptPath,
  );
  console.log(`DEBUG: Admin notified`);

  setState(phone, "IDLE");
}

// Product handlers
async function handleProductQuantity(sock, chatJid, phone, text) {
  const qty = parseInt(text);
  if (isNaN(qty) || qty < 1 || qty > 10) {
    await send(sock, chatJid, "❌ Please enter a number between 1 and 10");
    return;
  }

  const state = getState(phone);
  const product = state.data.product;
  const price = product === "OIL" ? env.PRICE_OIL : env.PRICE_SALT;
  const total = qty * price;

  setState(phone, "PRODUCT_CONFIRM", { quantity: qty, total });

  const name = product === "OIL" ? "Anointing Oil" : "Covenant Salt";
  await send(
    sock,
    chatJid,
    `📦 *ORDER SUMMARY*\n\n` +
      `Product: ${name}\n` +
      `Quantity: ${qty}\n` +
      `Total: R${total}\n\n` +
      `Confirm? Reply: YES or NO`,
  );
}

async function handleProductConfirm(sock, chatJid, phone, text) {
  if (text.toUpperCase() === "YES") {
    await send(sock, chatJid, MESSAGES.paymentInstructions(env));
    await send(sock, chatJid, "💰 After paying, reply with: PAID");
    setState(phone, "PRODUCT_PAYMENT");
  } else if (text.toUpperCase() === "NO") {
    await send(sock, chatJid, "Order cancelled. Type MENU to start over.");
    setState(phone, "IDLE");
  } else {
    await send(sock, chatJid, "❌ Please reply YES or NO");
  }
}

async function completeProduct(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completeProduct for ${phone}`);
  const state = getState(phone);
  const orderNumber = `ORD${Date.now()}`;
  const product =
    state.data.product === "OIL" ? "Anointing Oil" : "Covenant Salt";

  console.log(`DEBUG: Generating receipt for ${orderNumber}`);
  const receiptPath = await generateReceipt({
    orderNumber,
    churchName: env.CHURCH_NAME,
    service: product,
    quantity: state.data.quantity,
    amount: state.data.total,
    customer: state.data.name,
  });
  console.log(`DEBUG: Receipt generated at ${receiptPath}`);

  await sendImage(
    sock,
    chatJid,
    receiptPath,
    `✅ *ORDER CONFIRMED*\n\n` +
      `📄 Here is your receipt.\n\n` +
      `Show Pastor Favor ${product}.`,
  );
  console.log(`DEBUG: Receipt sent to customer ${phone}`);

  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: product,
      details: `Quantity: ${state.data.quantity}`,
      amount: state.data.total,
      orderNumber,
    },
    receiptPath,
  );
  console.log(`DEBUG: Admin notified`);

  setState(phone, "IDLE");
}

// House Visit handlers
async function handleHouseVisitConfirm(sock, chatJid, phone, text) {
  if (text.toUpperCase() === "YES") {
    await send(
      sock,
      chatJid,
      "📍 Are you home now?\n\n" +
        "✅ YES - Send your location\n" +
        "❌ NO - Type SKIP (send location later)",
    );
    setState(phone, "HOUSE_VISIT_LOCATION");
  } else {
    await send(sock, chatJid, "Type MENU to see other services.");
    setState(phone, "IDLE");
  }
}

async function completeHouseVisit(sock, chatJid, phone, msg) {
  console.log(`DEBUG: completeHouseVisit for ${phone}`);
  const state = getState(phone);
  const orderNumber = `ORD${Date.now()}`;

  console.log(`DEBUG: Generating receipt for ${orderNumber}`);
  const receiptPath = await generateReceipt({
    orderNumber,
    churchName: env.CHURCH_NAME,
    service: "House Visit by Prophet",
    amount: env.PRICE_HOUSE_VISIT,
    customer: state.data.name,
  });
  console.log(`DEBUG: Receipt generated at ${receiptPath}`);

  await sendImage(
    sock,
    chatJid,
    receiptPath,
    `✅ *BOOKING CONFIRMED*\n\n` +
      `📄 Here is your receipt.\n\n` +
      `🏠 ${state.data.locationPending ? "Please send your location before the visit." : "Stay ready!"}`,
  );
  console.log(`DEBUG: Receipt sent to customer ${phone}`);

  const locationInfo = state.data.locationPending
    ? "Location: PENDING (customer will send later)"
    : `Location: ${state.data.location.lat}, ${state.data.location.lng}`;

  await sendAdminNotification(
    sock,
    env.ADMIN_NUMBER,
    {
      customer: phone,
      service: "House Visit",
      details: locationInfo,
      amount: env.PRICE_HOUSE_VISIT,
      orderNumber,
    },
    receiptPath,
  );
  console.log(`DEBUG: Admin notified`);

  setState(phone, "IDLE");
}

// FIXED Helper functions with proper error handling and debugging
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
      `🔔 *NEW ORDER*\n\n` +
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

// Start
startBot();
