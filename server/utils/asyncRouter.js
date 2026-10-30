const express = require('express');

function asyncRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(
      path,
      ...handlers.map(handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next))
    );
  }
  return router;
}

module.exports = { asyncRouter };
