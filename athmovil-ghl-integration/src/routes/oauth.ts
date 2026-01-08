import { Router, Request, Response } from 'express';
import { ghlService } from '../services/ghl';
import { storage } from '../services/storage';
import { config } from '../config';
import { StoredLocation } from '../types';

const router = Router();

/**
 * GET /oauth/authorize
 * Inicia el flujo de OAuth - redirige al usuario a GHL para autorizar
 */
router.get('/authorize', (req: Request, res: Response) => {
  const state = Math.random().toString(36).substring(7);

  // Guardar state en session para validar despues
  (req.session as any).oauthState = state;

  const authUrl = ghlService.getAuthorizationUrl(state);
  console.log('🔐 Redirecting to GHL OAuth:', authUrl);

  res.redirect(authUrl);
});

/**
 * GET /oauth/callback
 * GHL redirige aqui despues de que el usuario autoriza
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  // Verificar si hubo error
  if (error) {
    console.error('❌ OAuth error:', error);
    return res.status(400).render('error', {
      title: 'Error de Autorizacion',
      message: `GHL retorno un error: ${error}`,
    });
  }

  // Verificar que tenemos el codigo
  if (!code || typeof code !== 'string') {
    return res.status(400).render('error', {
      title: 'Error de Autorizacion',
      message: 'No se recibio codigo de autorizacion',
    });
  }

  try {
    // Intercambiar codigo por tokens
    const tokens = await ghlService.exchangeCodeForTokens(code);

    // Guardar la location con sus tokens
    const location: StoredLocation = {
      locationId: tokens.locationId,
      companyId: tokens.companyId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      installedAt: new Date(),
    };

    storage.saveLocation(location);

    console.log('✅ OAuth complete for location:', tokens.locationId);

    // Redirigir a la pagina de configuracion
    res.redirect(`/setup?locationId=${tokens.locationId}`);
  } catch (err: any) {
    console.error('❌ OAuth callback error:', err);
    res.status(500).render('error', {
      title: 'Error de Autorizacion',
      message: err.message || 'Error procesando autorizacion',
    });
  }
});

/**
 * GET /oauth/install
 * URL para instalar la app - usa esto para compartir con clientes
 */
router.get('/install', (req: Request, res: Response) => {
  res.render('install', {
    title: 'Instalar ATH Movil para Go High Level',
    baseUrl: config.baseUrl,
  });
});

/**
 * POST /oauth/uninstall
 * Webhook que GHL llama cuando desinstalan la app
 */
router.post('/uninstall', (req: Request, res: Response) => {
  const { locationId } = req.body;

  if (locationId) {
    storage.deleteLocation(locationId);
    console.log('🗑️ App uninstalled from location:', locationId);
  }

  res.status(200).json({ success: true });
});

export default router;
