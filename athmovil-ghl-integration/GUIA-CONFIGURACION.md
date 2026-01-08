# Guía Completa: ATH Móvil + Go High Level

Esta guía te llevará paso a paso para configurar la integración de ATH Móvil con Go High Level.

## Índice

1. [Requisitos Previos](#1-requisitos-previos)
2. [Crear App en Go High Level Marketplace](#2-crear-app-en-go-high-level-marketplace)
3. [Configurar Variables de Entorno](#3-configurar-variables-de-entorno)
4. [Desplegar el Servidor](#4-desplegar-el-servidor)
5. [Instalar en Sub-cuentas](#5-instalar-en-sub-cuentas)
6. [Configurar ATH Móvil](#6-configurar-ath-móvil)
7. [Probar la Integración](#7-probar-la-integración)
8. [Solución de Problemas](#8-solución-de-problemas)

---

## 1. Requisitos Previos

### Go High Level
- [ ] Cuenta de Go High Level con acceso al Marketplace
- [ ] Permisos de administrador en las sub-cuentas donde quieres instalar

### ATH Móvil Business
- [ ] Cuenta de ATH Móvil Business activa
- [ ] Tarjeta ATH registrada y verificada
- [ ] Acceso a tus API Keys (Public Token y Private Token)

### Técnicos
- [ ] Node.js v18+ instalado
- [ ] Servidor con HTTPS (Render, Heroku, Railway, VPS, etc.)
- [ ] Dominio propio (recomendado)

---

## 2. Crear App en Go High Level Marketplace

### Paso 2.1: Acceder al Developer Portal

1. Ve a [https://marketplace.gohighlevel.com](https://marketplace.gohighlevel.com)
2. Inicia sesión con tu cuenta de GHL
3. Haz clic en "My Apps" → "Create App"

### Paso 2.2: Configuración Básica

```
App Name:           ATH Móvil Payments
App Description:    Acepta pagos con ATH Móvil en Puerto Rico
App Logo:           [Sube tu logo]
Distribution:       Private (solo para tus sub-cuentas)
```

### Paso 2.3: Configurar OAuth

En la pestaña "Auth":

```
Redirect URL:       https://TU-DOMINIO.com/oauth/callback
Webhook URL:        https://TU-DOMINIO.com/webhooks/ghl
```

### Paso 2.4: Configurar Scopes

Selecciona estos permisos:
- [x] `payments.readonly`
- [x] `payments.write`
- [x] `locations.readonly`

### Paso 2.5: Configurar Payment Provider

En la pestaña "Payment Provider":

```
Provider Name:      ATH Móvil
Description:        Paga con ATH Móvil - Puerto Rico
Logo URL:           https://TU-DOMINIO.com/images/athmovil-logo.png
Query URL:          https://TU-DOMINIO.com/query
Payments URL:       https://TU-DOMINIO.com/payments/checkout
```

**Tipos de pago soportados:**
- [x] OneTime (pagos únicos)
- [ ] Recurring (NO soportado por ATH Móvil)
- [ ] Off Session (NO soportado por ATH Móvil)

### Paso 2.6: Guardar Credenciales

Después de crear la app, copia:
- **Client ID**: Lo usarás en `GHL_APP_CLIENT_ID`
- **Client Secret**: Lo usarás en `GHL_APP_CLIENT_SECRET`

---

## 3. Configurar Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Edita el archivo con tus credenciales:

```env
# GO HIGH LEVEL
GHL_APP_CLIENT_ID=tu_client_id_de_ghl
GHL_APP_CLIENT_SECRET=tu_client_secret_de_ghl

# ATH MOVIL (credenciales por defecto - cada location puede tener las suyas)
ATHMOVIL_PUBLIC_TOKEN=tu_public_token
ATHMOVIL_PRIVATE_TOKEN=tu_private_token

# SERVIDOR
PORT=3000
NODE_ENV=production
BASE_URL=https://tu-dominio.com
SESSION_SECRET=genera_un_string_aleatorio_largo_aqui
```

### Generar SESSION_SECRET

```bash
# En Linux/Mac:
openssl rand -base64 32

# En Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 4. Desplegar el Servidor

### Opción A: Render.com (Recomendado - Gratis)

1. Crea cuenta en [render.com](https://render.com)
2. Conecta tu repositorio de GitHub
3. Crea un "New Web Service"
4. Configura:
   ```
   Build Command:    npm install && npm run build
   Start Command:    npm start
   ```
5. Agrega las variables de entorno
6. Despliega

### Opción B: Railway

1. Crea cuenta en [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo"
3. Agrega variables de entorno
4. Railway detectará automáticamente Node.js

### Opción C: VPS (DigitalOcean, Linode, etc.)

```bash
# Clonar repositorio
git clone TU_REPO
cd athmovil-ghl-integration

# Instalar dependencias
npm install

# Compilar
npm run build

# Iniciar con PM2
npm install -g pm2
pm2 start dist/server.js --name athmovil-ghl

# Configurar Nginx como reverse proxy
# Obtener certificado SSL con Certbot
```

---

## 5. Instalar en Sub-cuentas

### Paso 5.1: Obtener Link de Instalación

Tu link de instalación es:
```
https://TU-DOMINIO.com/oauth/install
```

### Paso 5.2: Instalar en una Sub-cuenta

1. Abre el link de instalación
2. Haz clic en "Conectar con Go High Level"
3. Selecciona la sub-cuenta (location) donde quieres instalar
4. Autoriza los permisos
5. Serás redirigido a la página de configuración

### Paso 5.3: Controlar Quién Puede Instalar

Como la app es **Private**, solo tú puedes compartir el link de instalación.

**Para agregar una nueva sub-cuenta:**
1. Envía el link de instalación al administrador de esa sub-cuenta
2. O instálala tú mismo si tienes acceso

**Para remover acceso:**
1. Ve a `/admin/locations` en tu servidor
2. O desinstala directamente desde GHL

---

## 6. Configurar ATH Móvil

### Paso 6.1: Obtener API Keys de ATH Móvil

1. Abre la app **ATH Móvil Business** en tu teléfono
2. Ve a **Configuración** (Settings)
3. Busca la sección **"Desarrollo"** o **"Development"**
4. Copia tu **Public Token** y **Private Token**

### Paso 6.2: Configurar en la App

Después de instalar en una sub-cuenta:

1. Serás redirigido a `/setup?locationId=xxx`
2. Ingresa tu Public Token de ATH Móvil
3. Ingresa tu Private Token de ATH Móvil
4. Haz clic en "Guardar Configuración"

### Paso 6.3: Modo de Prueba

Para probar sin procesar pagos reales:
1. Marca la casilla "Usar modo de prueba"
2. Esto usará el token `dummy`
3. En la app ATH Móvil Personal, configura el public token como "dummy" para simular pagos

---

## 7. Probar la Integración

### Paso 7.1: Activar en GHL

1. En tu sub-cuenta de GHL, ve a:
   **Settings** → **Integrations** → **Payments**

2. Busca "ATH Móvil" en la lista

3. Haz clic en **"Connect"**

4. Luego haz clic en **"Set as Default"**

### Paso 7.2: Crear un Producto de Prueba

1. Ve a **Payments** → **Products**
2. Crea un producto de prueba ($1.00)
3. Genera un link de pago

### Paso 7.3: Probar el Pago

1. Abre el link de pago
2. Verás la opción "Pagar con ATH Móvil"
3. Ingresa un número de teléfono de ATH Móvil
4. Confirma el pago en la app ATH Móvil
5. Verifica que la transacción aparece en GHL

---

## 8. Solución de Problemas

### Error: "Location not configured"

**Causa:** La sub-cuenta no tiene credenciales de ATH Móvil configuradas.

**Solución:**
1. Ve a `/setup?locationId=TU_LOCATION_ID`
2. Ingresa las credenciales de ATH Móvil

### Error: "OAuth failed"

**Causa:** Las credenciales de GHL son incorrectas.

**Solución:**
1. Verifica `GHL_APP_CLIENT_ID` y `GHL_APP_CLIENT_SECRET`
2. Asegúrate que la Redirect URL en GHL coincide con tu dominio

### El pago no se completa

**Posibles causas:**
1. El usuario no confirmó en la app ATH Móvil
2. El pago expiró (timeout de 10 minutos)
3. El usuario canceló

**Verificar:**
- Revisa los logs del servidor
- Consulta el estado en `/admin/locations`

### Webhooks no llegan

**Verificar:**
1. Tu servidor es accesible públicamente (HTTPS)
2. La URL del webhook está correctamente configurada
3. ATH Móvil puede alcanzar tu servidor

**Probar:**
```bash
curl -X POST https://TU-DOMINIO.com/webhooks/athmovil \
  -H "Content-Type: application/json" \
  -d '{"transactionType":"test","status":"completed"}'
```

---

## Contacto y Soporte

### ATH Móvil Business
- Teléfono: (787) 773-5466
- Soporte técnico: https://forms.gle/ZSeL8DtxVNP2K2iDA

### Go High Level
- Documentación: https://marketplace.gohighlevel.com/docs

---

## Próximos Pasos

1. [ ] Configurar monitoreo y alertas
2. [ ] Implementar base de datos persistente (PostgreSQL)
3. [ ] Agregar logging más detallado
4. [ ] Configurar backups
