const { sub } = require("date-fns");
const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.MONGO_DB_URI;
const dbName = process.env.MONGO_DB_NAME;

const places = [
  "remote",
  "kuala-lumpur",
  "selangor",
  "putrajaya",
  "johor",
  "kedah",
  "kelantan",
  "melaka",
  "negeri-sembilan",
  "pahang",
  "perak",
  "perlis",
  "pulau-pinang",
  "sarawak",
  "terengganu",
  "labuan",
  "sabah",
];

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

const getWeeklyJobs = async () => {
  const { db } = await connectToDatabase();

  const pipeline = [
    {
      $addFields: {
        date: {
          $dateFromString: {
            dateString: "$createdAt",
          },
        },
      },
    },
    {
      $match: {
        date: {
          $gte: new Date(sub(new Date(), { days: 7 })),
        },
      },
    },
    {
      $match: {
        keywords: {
          $in: places.map((p) => p.replaceAll("-", " ")),
        },
      },
    },
    {
      $project: {
        source: 1,
        company: 1,
        title: 1,
        slug: 1,
        postedAt: 1,
        createdAt: 1,
        "schema.title": 1,
        "schema.hiringOrganization.name": 1,
      },
    },
  ];

  const cursor = await db
    .collection("jobs")
    .aggregate(pipeline)
    .sort({ createdAt: -1 })
    .toArray();

  const jobs = JSON.parse(JSON.stringify(cursor));

  return { jobs };
};

const getAllJobs = async () => {
  const { db } = await connectToDatabase();

  const pipeline = [
    {
      $project: {
        link: 1,
      },
    },
  ];

  const cursor = await db
    .collection("jobs")
    .aggregate(pipeline)
    .sort({ createdAt: 1 })
    .toArray();

  const jobs = JSON.parse(JSON.stringify(cursor));

  return { jobs };
};

const deleteJob = async (id) => {
  const { db } = await connectToDatabase();
  const job = await db.collection("jobs").deleteOne({ _id: ObjectId(id) });
  return job;
};

const createJobCount = async (count) => {
  const { db } = await connectToDatabase();
  await db
    .collection("job-count")
    .insert({ count, createdAt: new Date().toISOString() });
};

module.exports = {
  createManyJobs,
  getWeeklyJobs,
  getAllJobs,
  deleteJob,
  createJobCount,
};
