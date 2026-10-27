# Golflet iOS

App nativa SwiftUI (iOS 17+) para estadísticas de golf de jugadores argentinos cuyas tarjetas viven en los sitios Golfistics de cada club.

La UI está en español rioplatense (es-AR, voseo) y sigue el sistema de diseño de [golflet.vercel.app](https://golflet.vercel.app): off-white `#F7F5F0`, verde `#0F3D2E`, acento oro `#C8A86A`, Geist upright con cifras tabulares.

## Qué hay hoy

- Pantallas: Inicio, Resumen, Rondas, Detalle de ronda (tarjeta + notas), Cancha, Hoyo, Mi bolsa, Clubes.
- Cliente de API (`GolfletAPI`) con `MockAPIClient` (UI tests / Debug) y `LiveGolfletAPI` (Release) contra `https://golflet.vercel.app`.
- Auth nativa: `POST /api/auth/sign-up|sign-in/email`, header `set-auth-token`, `Authorization: Bearer` en Keychain.
- Vincular club (catálogo o URL + matrícula + clave, guardar clave opcional), Actualizar, notas/putts/GIR/fairways y bolsa en el servidor.
- Mientras se vincula o se toca Actualizar, overlay placeholder con pasos reales de `GET /api/sync-progress/:id` (el cliente manda `progress_id` en el POST y poll cada 700 ms). La animación de sync se redefine; queda un placeholder hasta el spec final.
- Fixtures anónimos (jugador **Jugador Demo**) de Jockey Club Buenos Aires.
- Notas de ronda, putts/GIR/fairway y distancias de bolsa en SwiftData.
- Credenciales de club solo en Keychain.
- Handicap WHS: diferencial `113/slope × (adjusted gross − course rating)`, tope net double bogey, mejores 8 de 20.

## Proyecto

El `.xcodeproj` no se commitea: lo genera [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
brew install xcodegen
xcodegen generate
xed Golflet.xcodeproj
```

Bundle ID: `com.sbuffose.golflet`. Team: `R56Y2GZ2M9`.

## CI / TestFlight

`.github/workflows/testflight.yml` (espejo del pipeline de Moments):

1. Genera el proyecto, build de simulador.
2. Unit tests y UI tests como *gate* real (`set -euo pipefail`; el status de `xcodebuild` decide; sin `|| true` en esa puerta).
3. En `main`, archiva con firma manual (`iPhone Distribution` / perfil `Golflet AppStore GHA`) y sube el IPA con `altool` + API key.

Secretos (mismos nombres y formatos que Moments): `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY`, `DIST_CERT_P12`, `DIST_CERT_PASSWORD`, `PROVISIONING_PROFILE`.

El número de build es `github.run_number + 100`.

Si App Store Connect todavía no tiene el registro de la app, el upload puede fallar: build y tests siguen verdes y el job deja un reporte.

## Fuentes

Geist Sans (OFL) desde el release oficial [vercel/geist-font](https://github.com/vercel/geist-font). Solo cortes upright (Regular / Medium / SemiBold). El sistema no usa itálica.
