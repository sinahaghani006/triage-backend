const createApp = require('./app');
const { port } = require('./config/env');
const prisma = require('./config/prismaClient');

const app = createApp();

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`triage-backend-core listening on port ${port}`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
