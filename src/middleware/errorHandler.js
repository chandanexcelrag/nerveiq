/**
 * errorHandler.js
 *
 * Global Express error handler. Deliberately logs only the error message
 * and stack trace - NEVER req.body - so journal content never ends up in
 * server logs even on a crash path.
 */

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${req.method} ${req.path} ->`, err.message);

  if (res.headersSent) {
    // If we were mid-SSE-stream, just end the connection cleanly.
    return res.end();
  }

  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on our end. Please try again.' : err.message
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found.' });
}

module.exports = { errorHandler, notFoundHandler };
