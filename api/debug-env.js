module.exports = function handler(req, res) {
  return res.status(200).json({
    NODE_ENV: process.env.NODE_ENV || null,
    VERCEL: process.env.VERCEL || null,
    VERCEL_ENV: process.env.VERCEL_ENV || null
  });
};
