module.exports = function handler(req, res) {
  return res.status(200).json({
    env: 'vercel',
    node: process.version,
    timestamp: new Date().toISOString()
  });
};
