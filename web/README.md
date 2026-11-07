# Golflet web

Esta carpeta es el código de la app web que ya está publicada. No es un repositorio nuevo ni un proyecto de Vercel distinto.

El árbol se recuperó de `/workspace/golflet/platform` (ahí no había `.git`). El archivo original se llamaba `golflet-web` y tenía 401 archivos. Acá la raíz de Next es `web/`: `app/`, `lib/` y `public/` quedan como estaban.

## Despliegue que ya existe

- Proyecto: `golflet`
- Id: `prj_iWZ5Zt6Gw1iuIlPJ8bQ0bEPQE8mb`
- Equipo: `team_KEIgmGM7XHBFHU3w3EwKkwvz`
- Alias: `https://golflet.vercel.app`
- El deploy de producción se hizo por CLI, sin repo de git conectado. Este PR no cambia ese vínculo y no despliega.

No hay credenciales, `.env` ni `.vercel` en este árbol. La base y las claves siguen en el proyecto de Vercel.

## Qué hay que aplicar en la base antes de que el reintento de grupos sea durable

`db/schema.sql` suma la tabla `cmp_create_key`. Es aditiva. Si todavía no existe, crear un grupo sigue funcionando; el mismo pedido puede duplicarse hasta que la tabla esté creada. Los nombres de grupo no son únicos.

## Scripts

```bash
npm test
npm run build
```

`public/play-rules.js` se genera desde `lib/play-rules.ts` con `node web-build/gen-play-rules.mjs` (también corre en `prebuild`).

## Índice

El número de arriba es el índice oficial con la fecha más nueva. En Cambios, cada fila de abajo muestra el salto del índice y, debajo, la tarjeta que entró o salió: fecha, cancha, diferencial y gross si está. El diferencial es de la tarjeta. «Entró en las 8», «Salió de las 8», «Salió de las últimas 20» y «Entró en las últimas 20» dicen qué pasó. Si no hay 20 tarjetas de cada lado, o el grupo no cambió, el texto es «No puedo identificar la tarjeta.» El club de matrícula no se usa como cancha.

`npm run build` necesita `DATABASE_URL`: `lib/auth.ts` abre el pool al importarse. Sin esa variable el compilado y el chequeo de tipos terminan, y la recolección de `/admin` falla.
