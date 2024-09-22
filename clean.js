require("dotenv").config();
const { deleteJobs } = require("./functions/createManyJobs");
const notifyTelegram = require("./functions/notifyTelegram");

const clean = async () => {
  const res = await deleteJobs();

  await notifyTelegram(`ga update –  ${res?.deleteCount} jobs deleted`);
};

clean();
