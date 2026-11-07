// Jest setupFiles: runs before any module is imported in a test file.
process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '4';
process.env.OTP_PROVIDER = 'console';
process.env.APP_ORIGINS = 'http://localhost:5173';
process.env.MONGODB_URI = '';
