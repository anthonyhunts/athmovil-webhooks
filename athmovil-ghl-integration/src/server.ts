import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { config, validateConfig } from './config';

// Routes
import oauthRoutes from './routes/oauth';
import queryRoutes from './routes/query';
import webhookRoutes from './routes/webhooks';
import paymentRoutes from './routes/payments';

// Services
import { storage } from './services/storage';

const app = express();

// Validar configuracion
validateConfig();

// ===========================================
// MIDDLEWARE
// ===========================================

// CORS - permitir requests desde GHL
app.use(cors({
  origin: [
    'https://app.gohighlevel.com',
    'https://highlevel.com',
    /\.gohighlevel\.com$/,
    /\.highlevel\.com$/,
    config.baseUrl,
  ],
  credentials: true,
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
  },
}));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===========================================
// ROUTES
// ===========================================

// OAuth routes
app.use('/oauth', oauthRoutes);

// Query URL (para GHL)
app.use('/query', queryRoutes);

// Webhooks
app.use('/webhooks', webhookRoutes);

// Payments
app.use('/payments', paymentRoutes);

// ===========================================
// PAGES
// ===========================================

// Home page
app.get('/', (req, res) => {
  res.render('index', {
    title: 'ATH Movil para Go High Level',
    baseUrl: config.baseUrl,
    stats: storage.getStats(),
  });
});

// Setup page (despues de OAuth)
app.get('/setup', (req, res) => {
  const { locationId } = req.query;

  if (!locationId || typeof locationId !== 'string') {
    return res.redirect('/');
  }

  const location = storage.getLocation(locationId);

  res.render('setup', {
    title: 'Configurar ATH Movil',
    locationId,
    location,
    baseUrl: config.baseUrl,
    hasATHConfig: !!(location?.athmovilPublicToken),
  });
});

// Save ATH Movil config for a location
app.post('/setup', (req, res) => {
  const { locationId, athmovilPublicToken, athmovilPrivateToken } = req.body;

  if (!locationId) {
    return res.status(400).json({ success: false, message: 'locationId required' });
  }

  const location = storage.getLocation(locationId);
  if (!location) {
    return res.status(404).json({ success: false, message: 'Location not found' });
  }

  // Actualizar con credenciales de ATH Movil
  location.athmovilPublicToken = athmovilPublicToken;
  location.athmovilPrivateToken = athmovilPrivateToken;
  storage.saveLocation(location);

  res.json({ success: true, message: 'ATH Movil credentials saved' });
});

// Admin - ver locations instaladas
app.get('/admin/locations', (req, res) => {
  const locations = storage.getAllLocations();
  res.render('admin-locations', {
    title: 'Locations Instaladas',
    locations,
  });
});

// ===========================================
// HEALTH CHECK
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    stats: storage.getStats(),
  });
});

// ===========================================
// ERROR HANDLING
// ===========================================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).render('error', {
    title: 'Error',
    message: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'No Encontrado',
    message: 'La pagina que buscas no existe',
  });
});

// ===========================================
// START SERVER
// ===========================================

app.listen(config.port, () => {
  console.log('');
  console.log('🚀 ═══════════════════════════════════════════════════════');
  console.log('   ATH Movil + Go High Level Integration');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   🌐 Server:     ${config.baseUrl}`);
  console.log(`   📍 Port:       ${config.port}`);
  console.log(`   🔧 Mode:       ${config.nodeEnv}`);
  console.log('');
  console.log('   📋 Endpoints:');
  console.log(`      OAuth:      ${config.baseUrl}/oauth/authorize`);
  console.log(`      QueryURL:   ${config.baseUrl}/query`);
  console.log(`      PaymentsURL:${config.baseUrl}/payments/checkout`);
  console.log(`      Webhooks:   ${config.baseUrl}/webhooks/athmovil`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});

export default app;
