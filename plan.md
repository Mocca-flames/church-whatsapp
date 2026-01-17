# Church WhatsApp Bot - Baileys Implementation

## 🎯 Simple Demo Architecture

```
church-bot/
├── package.json
├── .env
├── index.js              # Main bot file
├── messages.js           # All message templates
├── receipt.js            # Receipt generator
├── state.json            # Simple state storage (file-based)
└── assets/
    └── logo.png          # Church logo
```

## 📦 Dependencies (Minimal)

```json
{
  "name": "church-whatsapp-bot",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.5",
    "qrcode-terminal": "^0.12.0",
    "canvas": "^2.11.2",
    "pino": "^8.19.0"
  }
}
```

## 🔧 Configuration (.env)

```env
# Admin
ADMIN_NUMBER=27123456789

# Church Details
CHURCH_NAME=Amazing Grace Church
BANK_NAME=FNB
ACCOUNT_NUMBER=1234567890
BRANCH_CODE=250655
PAYSHARP_NUMBER=0812345678

# Pricing (Rands)
PRICE_ONE_ON_ONE=500
PRICE_OIL=100
PRICE_SALT=50
PRICE_HOUSE_VISIT=800
```

## 📱 Main Bot (index.js)

```javascript
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  makeInMemoryStore 
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { generateReceipt } from './receipt.js';
import { MESSAGES } from './messages.js';

// Load environment
const env = Object.fromEntries(
  readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
);

// Simple state storage
let userStates = existsSync('./state.json') 
  ? JSON.parse(readFileSync('./state.json', 'utf-8'))
  : {};

const saveState = () => {
  writeFileSync('./state.json', JSON.stringify(userStates, null, 2));
};

// Get or create user state
const getState = (phone) => {
  if (!userStates[phone]) {
    userStates[phone] = { 
      state: 'IDLE', 
      data: {},
      lastActivity: Date.now()
    };
    saveState();
  }
  return userStates[phone];
};

const setState = (phone, state, data = {}) => {
  userStates[phone] = { 
    state, 
    data: { ...userStates[phone]?.data, ...data },
    lastActivity: Date.now()
  };
  saveState();
};

// Start bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: { level: 'silent' }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot connected and ready!\n');
    }
  });

  // Message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const phone = msg.key.remoteJid.split('@')[0];
    const isGroup = msg.key.remoteJid.includes('@g.us');
    
    // Only handle personal messages
    if (isGroup) return;

    const messageText = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || '';
    
    const hasImage = msg.message?.imageMessage;
    const hasLocation = msg.message?.locationMessage;

    console.log(`📩 ${phone}: ${messageText || '[Media]'}`);

    await handleMessage(sock, phone, messageText.trim(), msg, hasImage, hasLocation);
  });

  return sock;
}

// Message router
async function handleMessage(sock, phone, text, msg, hasImage, hasLocation) {
  const state = getState(phone);
  const upperText = text.toUpperCase();

  // Reset command
  if (upperText === 'MENU' || upperText === 'START') {
    setState(phone, 'IDLE');
    await send(sock, phone, MESSAGES.menu);
    return;
  }

  // Route based on state
  switch (state.state) {
    case 'IDLE':
      await send(sock, phone, MESSAGES.menu);
      setState(phone, 'MENU_SHOWN');
      break;

    case 'MENU_SHOWN':
      await handleMenuSelection(sock, phone, text);
      break;

    // ONE-ON-ONE FLOW
    case 'ONE_ON_ONE_DATE':
      await handleOneOnOneDate(sock, phone, text);
      break;

    case 'ONE_ON_ONE_PAYMENT':
      if (upperText === 'PAID') {
        await send(sock, phone, '📸 Please send proof of payment (screenshot)');
        setState(phone, 'ONE_ON_ONE_PROOF');
      }
      break;

    case 'ONE_ON_ONE_PROOF':
      if (hasImage) {
        await completeOneOnOne(sock, phone, msg);
      } else {
        await send(sock, phone, '❌ Please send an image (screenshot of payment)');
      }
      break;

    // PRODUCT FLOW (Oil/Salt)
    case 'PRODUCT_QUANTITY':
      await handleProductQuantity(sock, phone, text);
      break;

    case 'PRODUCT_CONFIRM':
      await handleProductConfirm(sock, phone, text);
      break;

    case 'PRODUCT_PAYMENT':
      if (upperText === 'PAID') {
        await send(sock, phone, '📸 Please send proof of payment');
        setState(phone, 'PRODUCT_PROOF');
      }
      break;

    case 'PRODUCT_PROOF':
      if (hasImage) {
        await completeProduct(sock, phone, msg);
      } else {
        await send(sock, phone, '❌ Please send an image');
      }
      break;

    // HOUSE VISIT FLOW
    case 'HOUSE_VISIT_CONFIRM':
      await handleHouseVisitConfirm(sock, phone, text);
      break;

    case 'HOUSE_VISIT_LOCATION':
      if (upperText === 'SKIP') {
        await send(sock, phone, MESSAGES.paymentInstructions(env));
        setState(phone, 'HOUSE_VISIT_PAYMENT', { locationPending: true });
      } else if (hasLocation) {
        const loc = msg.message.locationMessage;
        setState(phone, 'HOUSE_VISIT_PAYMENT', { 
          location: { lat: loc.degreesLatitude, lng: loc.degreesLongitude }
        });
        await send(sock, phone, '✅ Location saved!\n\n' + MESSAGES.paymentInstructions(env));
      } else {
        await send(sock, phone, '📍 Please send your location OR type SKIP');
      }
      break;

    case 'HOUSE_VISIT_PAYMENT':
      if (upperText === 'PAID') {
        await send(sock, phone, '📸 Please send proof of payment');
        setState(phone, 'HOUSE_VISIT_PROOF');
      }
      break;

    case 'HOUSE_VISIT_PROOF':
      if (hasImage) {
        await completeHouseVisit(sock, phone, msg);
      } else {
        await send(sock, phone, '❌ Please send an image');
      }
      break;

    default:
      await send(sock, phone, 'Type MENU to start');
  }
}

// Menu selection
async function handleMenuSelection(sock, phone, text) {
  switch (text) {
    case '1':
      await send(sock, phone, MESSAGES.oneOnOneInfo(env));
      await send(sock, phone, '📅 Reply with your preferred date:\n\nTUESDAY or SUNDAY');
      setState(phone, 'ONE_ON_ONE_DATE');
      break;

    case '2':
      await send(sock, phone, MESSAGES.productInfo('Oil', env));
      await send(sock, phone, '🔢 How many? (Reply with number 1-10)');
      setState(phone, 'PRODUCT_QUANTITY', { product: 'OIL' });
      break;

    case '3':
      await send(sock, phone, MESSAGES.productInfo('Salt', env));
      await send(sock, phone, '🔢 How many? (Reply with number 1-10)');
      setState(phone, 'PRODUCT_QUANTITY', { product: 'SALT' });
      break;

    case '4':
      await send(sock, phone, MESSAGES.houseVisitInfo(env));
      await send(sock, phone, '✅ Do you understand?\n\nReply: YES or NO');
      setState(phone, 'HOUSE_VISIT_CONFIRM');
      break;

    default:
      await send(sock, phone, '❌ Invalid option. Please select 1, 2, 3, or 4');
  }
}

// One-on-One handlers
async function handleOneOnOneDate(sock, phone, text) {
  const upper = text.toUpperCase();
  if (upper === 'TUESDAY' || upper === 'SUNDAY') {
    setState(phone, 'ONE_ON_ONE_PAYMENT', { date: upper });
    await send(sock, phone, MESSAGES.paymentInstructions(env));
    await send(sock, phone, '💰 After paying, reply with: PAID');
  } else {
    await send(sock, phone, '❌ Please reply with TUESDAY or SUNDAY');
  }
}

async function completeOneOnOne(sock, phone, msg) {
  const state = getState(phone);
  const orderNumber = `ORD${Date.now()}`;
  
  // Generate receipt
  const receiptPath = await generateReceipt({
    orderNumber,
    churchName: env.CHURCH_NAME,
    service: 'One-on-One with Prophet',
    date: state.data.date,
    amount: env.PRICE_ONE_ON_ONE,
    customer: phone
  });

  // Send receipt to customer
  await sendImage(sock, phone, receiptPath, '✅ *PAYMENT CONFIRMED*\n\n📄 Here is your receipt.\n\n✨ Show this to admin on your visit date.');
  
  // Notify admin
  await sendAdminNotification(sock, env.ADMIN_NUMBER, {
    customer: phone,
    service: 'One-on-One with Prophet',
    details: `Date: ${state.data.date}`,
    amount: env.PRICE_ONE_ON_ONE,
    orderNumber
  }, receiptPath);

  setState(phone, 'IDLE');
}

// Product handlers
async function handleProductQuantity(sock, phone, text) {
  const qty = parseInt(text);
  if (isNaN(qty) || qty < 1 || qty > 10) {
    await send(sock, phone, '❌ Please enter a number between 1 and 10');
    return;
  }

  const state = getState(phone);
  const product = state.data.product;
  const price = product === 'OIL' ? env.PRICE_OIL : env.PRICE_SALT;
  const total = qty * price;

  setState(phone, 'PRODUCT_CONFIRM', { quantity: qty, total });
  
  const name = product === 'OIL' ? 'Anointing Oil' : 'Covenant Salt';
  await send(sock, phone, 
    `📦 *ORDER SUMMARY*\n\n` +
    `Product: ${name}\n` +
    `Quantity: ${qty}\n` +
    `Total: R${total}\n\n` +
    `Confirm? Reply: YES or NO`
  );
}

async function handleProductConfirm(sock, phone, text) {
  if (text.toUpperCase() === 'YES') {
    await send(sock, phone, MESSAGES.paymentInstructions(env));
    await send(sock, phone, '💰 After paying, reply with: PAID');
    setState(phone, 'PRODUCT_PAYMENT');
  } else if (text.toUpperCase() === 'NO') {
    await send(sock, phone, 'Order cancelled. Type MENU to start over.');
    setState(phone, 'IDLE');
  } else {
    await send(sock, phone, '❌ Please reply YES or NO');
  }
}

async function completeProduct(sock, phone, msg) {
  const state = getState(phone);
  const orderNumber = `ORD${Date.now()}`;
  const product = state.data.product === 'OIL' ? 'Anointing Oil' : 'Covenant Salt';
  
  const receiptPath = await generateReceipt({
    orderNumber,
    churchName: env.CHURCH_NAME,
    service: product,
    quantity: state.data.quantity,
    amount: state.data.total,
    customer: phone
  });

  await sendImage(sock, phone, receiptPath, 
    `✅ *ORDER CONFIRMED*\n\n` +
    `📄 Here is your receipt.\n\n` +
    `🏪 Show this to admin to collect your ${product}.`
  );
  
  await sendAdminNotification(sock, env.ADMIN_NUMBER, {
    customer: phone,
    service: product,
    details: `Quantity: ${state.data.quantity}`,
    amount: state.data.total,
    orderNumber
  }, receiptPath);

  setState(phone, 'IDLE');
}

// House Visit handlers
async function handleHouseVisitConfirm(sock, phone, text) {
  if (text.toUpperCase() === 'YES') {
    await send(sock, phone, 
      '📍 Are you home now?\n\n' +
      '✅ YES - Send your location\n' +
      '❌ NO - Type SKIP (send location later)'
    );
    setState(phone, 'HOUSE_VISIT_LOCATION');
  } else {
    await send(sock, phone, 'Type MENU to see other services.');
    setState(phone, 'IDLE');
  }
}

async function completeHouseVisit(sock, phone, msg) {
  const state = getState(phone);
  const orderNumber = `ORD${Date.now()}`;
  
  const receiptPath = await generateReceipt({
    orderNumber,
    churchName: env.CHURCH_NAME,
    service: 'House Visit by Prophet',
    amount: env.PRICE_HOUSE_VISIT,
    customer: phone
  });

  await sendImage(sock, phone, receiptPath, 
    `✅ *BOOKING CONFIRMED*\n\n` +
    `📄 Here is your receipt.\n\n` +
    `📞 Prophet will call before visiting.\n` +
    `🏠 ${state.data.locationPending ? 'Please send your location before the visit.' : 'Stay ready!'}`
  );
  
  const locationInfo = state.data.locationPending 
    ? 'Location: PENDING (customer will send later)'
    : `Location: ${state.data.location.lat}, ${state.data.location.lng}`;

  await sendAdminNotification(sock, env.ADMIN_NUMBER, {
    customer: phone,
    service: 'House Visit',
    details: locationInfo,
    amount: env.PRICE_HOUSE_VISIT,
    orderNumber
  }, receiptPath);

  setState(phone, 'IDLE');
}

// Helper functions
async function send(sock, phone, text) {
  await sock.sendMessage(phone + '@s.whatsapp.net', { text });
}

async function sendImage(sock, phone, imagePath, caption) {
  await sock.sendMessage(phone + '@s.whatsapp.net', {
    image: { url: imagePath },
    caption
  });
}

async function sendAdminNotification(sock, adminPhone, order, receiptPath) {
  const message = 
    `🔔 *NEW ORDER*\n\n` +
    `Customer: +${order.customer}\n` +
    `Service: ${order.service}\n` +
    `${order.details}\n` +
    `Amount: R${order.amount}\n` +
    `Order: ${order.orderNumber}\n` +
    `Time: ${new Date().toLocaleString()}`;

  await sock.sendMessage(adminPhone + '@s.whatsapp.net', {
    image: { url: receiptPath },
    caption: message
  });
}

// Start
startBot();
```

## 📨 Messages Template (messages.js)

```javascript
export const MESSAGES = {
  menu: `🙏 *Welcome to ${process.env.CHURCH_NAME || 'Church'}*

Select a service:

1️⃣ One-on-One with Prophet
2️⃣ Anointing Oil
3️⃣ Covenant Salt
4️⃣ House Visit

Reply with number (1-4)`,

  oneOnOneInfo: (env) => 
    `✨ *ONE-ON-ONE WITH PROPHET*\n\n` +
    `Personal prophetic session\n` +
    `Duration: 30-45 minutes\n\n` +
    `💰 Price: R${env.PRICE_ONE_ON_ONE}`,

  productInfo: (type, env) => {
    const price = type === 'Oil' ? env.PRICE_OIL : env.PRICE_SALT;
    return `✨ *${type === 'Oil' ? 'ANOINTING OIL' : 'COVENANT SALT'}*\n\n` +
           `Blessed and prayed over\n` +
           `💰 Price: R${price} each`;
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
    `Number: ${env.PAYSHARP_NUMBER}`
};
```

## 🎨 Receipt Generator (receipt.js)

```javascript
import { createCanvas, loadImage } from 'canvas';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

export async function generateReceipt(data) {
  const width = 600;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = '#4A5568';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Logo (if exists)
  if (existsSync('./assets/logo.png')) {
    const logo = await loadImage('./assets/logo.png');
    ctx.drawImage(logo, width/2 - 60, 40, 120, 120);
  }

  // Church Name
  ctx.fillStyle = '#2D3748';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(data.churchName, width/2, 180);

  // Divider
  ctx.strokeStyle = '#CBD5E0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 210);
  ctx.lineTo(width - 80, 210);
  ctx.stroke();

  // Receipt Number
  ctx.fillStyle = '#718096';
  ctx.font = '18px Arial';
  ctx.fillText(`RECEIPT #${data.orderNumber}`, width/2, 250);
  
  // Date
  const dateStr = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  ctx.font = '16px Arial';
  ctx.fillText(dateStr, width/2, 280);

  // Service Details
  ctx.fillStyle = '#2D3748';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Service:', 80, 340);
  
  ctx.font = '20px Arial';
  ctx.fillText(data.service, 80, 375);

  if (data.quantity) {
    ctx.font = 'bold 22px Arial';
    ctx.fillText('Quantity:', 80, 420);
    ctx.font = '20px Arial';
    ctx.fillText(data.quantity.toString(), 80, 455);
  }

  if (data.date) {
    ctx.font = 'bold 22px Arial';
    ctx.fillText('Date:', 80, data.quantity ? 500 : 420);
    ctx.font = '20px Arial';
    ctx.fillText(data.date, 80, data.quantity ? 535 : 455);
  }

  // Amount Box
  const amountY = data.quantity || data.date ? 600 : 520;
  ctx.fillStyle = '#EDF2F7';
  ctx.fillRect(60, amountY - 40, width - 120, 80);
  
  ctx.fillStyle = '#2D3748';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('AMOUNT PAID', width/2, amountY - 5);
  
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#2F855A';
  ctx.fillText(`R ${data.amount}`, width/2, amountY + 35);

  // Customer
  ctx.fillStyle = '#718096';
  ctx.font = '16px Arial';
  ctx.fillText(`Customer: +${data.customer}`, width/2, amountY + 80);

  // Footer
  ctx.fillStyle = '#2D3748';
  ctx.font = 'bold 20px Arial';
  ctx.fillText('** SHOW TO ADMIN **', width/2, height - 80);

  // Save
  if (!existsSync('./receipts')) mkdirSync('./receipts');
  const filename = `./receipts/${data.orderNumber}.png`;
  writeFileSync(filename, canvas.toBuffer());
  
  return filename;
}
```

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Setup
cp .env.example .env
# Edit .env with your details

# 3. Add logo
mkdir assets
# Put logo.png in assets/

# 4. Run
npm start

# 5. Scan QR code with WhatsApp
# Done! Bot is ready.
```

## ✅ Testing Flow

```
You: hi
Bot: [Shows menu]

You: 1
Bot: [One-on-One info]
Bot: Reply with date...

You: SUNDAY
Bot: [Payment details]

You: PAID
Bot: Send proof...

You: [Send screenshot]
Bot: ✅ Receipt sent!
Admin: Gets notification
```

## 🎯 Key Features

- ✅ No database - uses `state.json` file
- ✅ Session persists in `auth_info/` folder
- ✅ Beautiful receipts with logo
- ✅ Admin notifications
- ✅ All 4 service flows work
- ✅ Simple to understand
- ✅ Easy to modify

## 📝 Notes

- State saved to file after each update
- Receipts saved in `./receipts/`
- Auth saved in `./auth_info/`
- Type `MENU` anytime to restart
- Works with 2 people simultaneously (demo ready!)