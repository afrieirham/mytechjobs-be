require("dotenv").config();
const notifyTelegram = require("./functions/notifyTelegram");

async function run() {
  await notifyTelegram("cron outsource");
}

run();
