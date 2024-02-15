require("dotenv").config();
const notifyTelegram = require("./functions/notifyTelegram");

async function run() {
  await notifyTelegram("hello from github actions");
}

run();
