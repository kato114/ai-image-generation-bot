import { createRequire } from "module";
import axios from "axios";
const require = createRequire(import.meta.url);
const TelegramBot = require("node-telegram-bot-api");
const dotenv = require("dotenv");

const userMessageTime = new Map();

dotenv.config();
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
let lastMessageTime = 0;
async function createPrediction1(text) {
  const response = await axios.post(
    "https://api.replicate.com/v1/predictions",
    {
      // Pinned to a specific version of Stable Diffusion
      // See https://replicate.com/stability-ai/stable-diffussion/versions
      version:
        "436b051ebd8f68d23e83d22de5e198e0995357afef113768c20f0b6fcef23c8b", //stable-diffussion
      // This is the text prompt that will be submitted by a form on the frontend
      input: { prompt: text },
    },
    {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  const prediction = response.data;
  return prediction;
}

async function getPredictionStatus(id) {
  const response = await axios.get(
    "https://api.replicate.com/v1/predictions/" + id,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      },
    }
  );

  const prediction = response.data;
  console.log(response);
  return prediction;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pending = async (sentMessage, chatId, username) => {
  let index = 14;
  while (index > 0) {
    index--;
    await sleep(1000);
    bot.editMessageText(
      "@" +
        username +
        " You're in cooldown mode please wait " +
        index +
        " seconds.",
      {
        chat_id: chatId,
        message_id: sentMessage.message_id,
      }
    );
  }
};

bot.onText(/\/image (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const now = Date.now();

  if (userMessageTime.has(chatId)) {
    lastMessageTime = userMessageTime.get(chatId);
    const timeDifference = now - lastMessageTime;
    lastMessageTime = now;

    if (timeDifference < 15 * 1000) {
      bot
        .sendMessage(
          chatId,
          "@" + username + " You're in cooldown mode please wait 14 seconds."
        )
        .then((sentMessage) => {
          pending(sentMessage, chatId, username);
        });
      return;
    }
  }

  // Update the last message time for this user
  userMessageTime.set(chatId, now);
  bot.sendMessage(chatId, "Generating Images for @" + username);
  // const image = await generateImage(match[1]);
  const prediction = await createPrediction1(match[1]);
  let response = null;
  let nCount = 0;
  while (prediction.status !== "succeeded" && prediction.status !== "failed") {
    await sleep(1000);
    nCount++;
    if (nCount >= 15) {
      break;
    }
    response = await getPredictionStatus(prediction.id);
    if (response.err || response.output) {
      break;
    }
  }
  if (response.output) {
    bot.sendPhoto(chatId, response.output[response.output.length - 1], {
      caption: "Generated for @" + username + ": " + match[1],
      reply_to_message_id: msg.message_id,
    });
  } else {
    bot.sendMessage(chatId, "Sorry. I don't support NSFW images.");
  }
});

bot.startPolling();
