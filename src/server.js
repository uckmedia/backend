// =============================================
// backend/src/server.js
// =============================================

const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 License Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Primary Domain: ${process.env.PRIMARY_DOMAIN || 'localhost'}`);
});