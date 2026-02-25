require('dotenv').config();
const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId: '699d9386d93cc1dc427f6f03' }, process.env.JWT_SECRET || 'fallback_development_secret_voice_multi_tenant_123', { expiresIn: '1h' });
console.log(token);
