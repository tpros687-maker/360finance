# Token permanente de Meta (WhatsApp Cloud API)

El `META_ACCESS_TOKEN` que estás usando es un token temporal que **expira cada 24 hs**.
Para producción necesitás un **token permanente** generado a través de un **System User**
del Business Manager. Estos tokens son de larga duración y representan un servicio
automatizado (el bot) que no depende de que ninguna persona esté logueada.

> Requisito previo: tu app de WhatsApp tiene que estar vinculada a un **Meta Business
> Account** (Business Manager). No se puede generar un token permanente desde una cuenta
> personal.

---

## Paso a paso

1. **Entrá a Business Settings**
   Abrí <https://business.facebook.com> y, arriba a la derecha, seleccioná la cuenta de
   negocio correcta. Después entrá a **Configuración del negocio** (Business Settings).

2. **Creá un System User**
   En el menú lateral: **Usuarios → Usuarios del sistema** (Users → System Users).
   Tocá **Agregar** (Add), poné un nombre claro (por ejemplo `WhatsAppBot360`) y elegí
   el rol **Administrador** (Admin). Confirmá con **Crear usuario del sistema**.

3. **Asignale el activo de WhatsApp**
   Con el System User seleccionado, tocá **Asignar activos** (Assign Assets) y elegí
   **Cuentas de WhatsApp** (WhatsApp Business Account). Marcá tu WABA y dale
   **Control total** (Full Control). Guardá.

   > Conviene también asignarle tu **App** como activo (en Apps → asignar la app del bot),
   > para que el token tenga acceso a ella.

4. **Generá el token**
   Seguís con el System User seleccionado → **Generar nuevo token** (Generate New Token).
   - Elegí tu **App** (la de WhatsApp del bot).
   - En permisos marcá **`whatsapp_business_management`** y
     **`whatsapp_business_messaging`**.
   - Tocá **Generar token**.

5. **Copiá el token YA**
   Meta lo muestra **una sola vez**. Copialo y guardalo en un lugar seguro de inmediato.
   Empieza con `EAA...` igual que el temporal, pero este no expira a las 24 hs.

6. **Actualizá Railway**
   En el proyecto del backend en Railway → pestaña **Variables** → editá
   **`META_ACCESS_TOKEN`** y pegá el nuevo token. Guardá; Railway redeploya solo.
   No hace falta cambiar `META_PHONE_NUMBER_ID` ni `META_VERIFY_TOKEN`.

---

## Verificación

Después del redeploy, mandá un mensaje cualquiera al WhatsApp del bot. Si responde, el
token quedó bien. También podés validarlo a mano (reemplazá `TOKEN` y el phone number id):

```bash
curl "https://graph.facebook.com/v19.0/1141547282374620?fields=verified_name,quality_rating" \
  -H "Authorization: Bearer TOKEN"
```

Si devuelve datos del número (no un error `190 / OAuthException`), el token es válido.

Para confirmar que NO expira, podés inspeccionarlo en el
**Access Token Debugger**: <https://developers.facebook.com/tools/debug/accesstoken/>.
Pegá el token y fijate que en **Expires** diga **Never**.

---

## Notas de seguridad

- El token va **solo** como variable de entorno (`META_ACCESS_TOKEN` en Railway).
  Nunca lo pongas en el código ni lo subas al repo.
- Si alguna vez se filtra, revocá el token desde el mismo System User y generá uno nuevo.
- El System User y sus permisos quedan guardados, así que regenerar un token a futuro
  es solo repetir el paso 4.

---

### Fuentes
- Meta for Developers — System User access token:
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/>
- Guía System User 2026 (Anjok Technologies):
  <https://anjoktechnologies.in/blog/how-to-generate-permanent-access-token-for-whatsapp-cloud-api-system-user-method-2026-guide->
