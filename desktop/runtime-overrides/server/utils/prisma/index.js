const { PrismaClient } = require("@prisma/client");

// npx prisma introspect
// npx prisma generate
// npx prisma migrate dev --name init -> ensures that db is in sync with schema
// npx prisma migrate reset -> resets the db

const logLevels = ["error", "info", "warn"]; // add "query" to debug query logs
const prisma = new PrismaClient({
  log: logLevels,
  ...(process.env.ACTELYO_DATABASE_URL
    ? { datasources: { db: { url: process.env.ACTELYO_DATABASE_URL } } }
    : {}),
});

module.exports = prisma;
