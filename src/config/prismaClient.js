const { PrismaClient } = require('@prisma/client');

// Serverless-safe singleton: on Vercel, each function invocation can reuse
// a "warm" container between requests, but a fresh module load (cold start)
// would otherwise create a brand new PrismaClient (and connection pool)
// every time. Caching the instance on `global` survives across invocations
// in the same warm container and avoids exhausting Neon's connection limit.
// In local dev this is harmless — it's just a normal singleton.
const globalForPrisma = global;

const prisma = globalForPrisma.__prismaClient || new PrismaClient();
globalForPrisma.__prismaClient = prisma;

module.exports = prisma;
