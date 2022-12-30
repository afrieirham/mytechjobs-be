const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

admin.initializeApp();

// every day at 12am
exports.crawl = functions
  .region("asia-southeast1")
  .pubsub.schedule("0 0 * * *")
  .timeZone("Asia/Kuala_Lumpur")
  .onRun(async () => {
    await run();
  });

exports.manual = functions
  .region("asia-southeast1")
  .https.onRequest(async (req, res) => {
    await run();
    res.json({ message: "success" });
  });

async function run() {
  console.log("hello world");
}
