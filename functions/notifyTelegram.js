const { stringifyUrl } = require("query-string");
const fetch = require("node-fetch");

const token = process.env.TELEGRAM_HTTP_TOKEN;
const chat_id = process.env.TELEGRAM_CHAT_ID;

const notifyTelegram = (text) => {
  // send telegram notification
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const telegramUrl = stringifyUrl({
    url,
    query: { chat_id, text },
  });
  return fetch(telegramUrl);
};

module.exports = notifyTelegram;
