import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Servidor
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',

  // Go High Level
  ghl: {
    clientId: process.env.GHL_APP_CLIENT_ID || '',
    clientSecret: process.env.GHL_APP_CLIENT_SECRET || '',
    apiUrl: process.env.GHL_API_URL || 'https://services.leadconnectorhq.com',
    authUrl: process.env.GHL_AUTH_URL || 'https://marketplace.gohighlevel.com/oauth/chooselocation',
  },

  // ATH Movil
  athMovil: {
    publicToken: process.env.ATHMOVIL_PUBLIC_TOKEN || '',
    privateToken: process.env.ATHMOVIL_PRIVATE_TOKEN || '',
    apiUrl: process.env.ATHMOVIL_API_URL || 'https://payments.athmovil.com/api',
    webhookUrl: process.env.ATHMOVIL_WEBHOOK_URL || 'https://www.athmovil.com/transactions/webhook/post',
  },
};

// Validar configuracion requerida
export function validateConfig(): void {
  const required = [
    { key: 'GHL_APP_CLIENT_ID', value: config.ghl.clientId },
    { key: 'GHL_APP_CLIENT_SECRET', value: config.ghl.clientSecret },
    { key: 'ATHMOVIL_PUBLIC_TOKEN', value: config.athMovil.publicToken },
    { key: 'ATHMOVIL_PRIVATE_TOKEN', value: config.athMovil.privateToken },
  ];

  const missing = required.filter(r => !r.value);

  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required environment variables: ${missing.map(m => m.key).join(', ')}`);
  }

  if (missing.length > 0) {
    console.warn('⚠️  Missing environment variables (required for production):', missing.map(m => m.key).join(', '));
  }
}
