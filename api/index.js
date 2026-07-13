// Vercel entry point. Vercel's Node runtime treats any file under /api as a
// serverless function; exporting the Express app directly works because
// Vercel's @vercel/node builder can wrap a plain (req, res) => app handler.
// Everything else (routes, middleware, business logic) stays in src/ —
// this file is intentionally a thin adapter, not a second copy of the app.
const createApp = require('../src/app');

const app = createApp();

module.exports = app;
