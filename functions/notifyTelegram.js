const { stringifyUrl } = require("query-string");
const fetch = require("node-fetch");

const token = process.env.TELEGRAM_HTTP_TOKEN;
const customer = process.env.TELEGRAM_CHAT_ID;
const admin = process.env.TELEGRAM_CHAT_ID_ADMIN;

const notifyTelegram = (text, isCustomer = false) => {
  // send telegram notification
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const telegramUrl = stringifyUrl({
    url,
    query: { chat_id: isCustomer ? customer : admin, text },
  });
  return fetch(telegramUrl);
};

module.exports = notifyTelegram;
