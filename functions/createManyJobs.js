const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_DB_URI;
const dbName = process.env.MONGO_DB_NAME;

const connectToDatabase = async () => {
  const options = {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  };

  let mongoClient = null;
  let database = null;

  if (!uri) {
    throw new Error("Please add your Mongo URI to .env.local");
  }

  try {
    if (mongoClient && database) {
      return { mongoClient, db: database };
    }
    if (process.env.NODE_ENV === "development") {
      if (!global._mongoClient) {
        mongoClient = await new MongoClient(uri, options).connect();
        global._mongoClient = mongoClient;
      } else {
        mongoClient = global._mongoClient;
      }
    } else {
      mongoClient = await new MongoClient(uri, options).connect();
    }
    database = await mongoClient.db(dbName);
    return { mongoClient, db: database };
  } catch (e) {
    console.error(e);
  }
};

const createManyJobs = async (data) => {
  const { db } = await connectToDatabase();
  const createdAt = new Date().toISOString();

  const filterPromise = data.map((d) =>
    db.collection("jobs").find({ link: d.link }).toArray()
  );

  const results = await Promise.all(filterPromise);
  const filterResults = results.flat();

  const filteredData = data.filter((d) => {
    const currentLink = d.link;
    const hasDuplicates = filterResults.some((r) => r.link === currentLink);

    return !hasDuplicates;
  });

  if (filteredData.length === 0) {
    return;
  }

  const formattedData = filteredData.map((d) => {
    const postedAt = Boolean(d?.schema?.datePosted)
      ? d?.schema?.datePosted
      : createdAt;

    return {
      ...d,
      createdAt,
      postedAt,
    };
  });

  const jobs = await db.collection("jobs").insertMany(formattedData);
  return jobs;
};

module.exports = createManyJobs;
