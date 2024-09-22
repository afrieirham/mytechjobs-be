require("dotenv").config();
const { deleteJobs } = require("./functions/createManyJobs");
const notifyTelegram = require("./functions/notifyTelegram");

const clean = async () => {
  const res = await deleteJobs();

  await notifyTelegram(`ga update –  ${res?.deletedCount} jobs deleted`);

  console.log(res);
};

clean();
