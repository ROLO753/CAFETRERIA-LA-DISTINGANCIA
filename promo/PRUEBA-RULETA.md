# Combos promocionales y premios anteriores

La ruleta está pausada: no se aceptan nuevos giros ni se acreditan tokens. Los datos
anteriores se conservan y los premios pendientes siguen disponibles en el menú
del cliente y en Admin → Promociones para aprobarlos o marcarlos como canjeados.
Para la cerveza, verifica la mayoría de edad antes de entregar.

## Publicación

1. En Firebase Authentication, activa Google y autoriza el dominio del menú.
2. **Antes de publicar esta versión**, publica el contenido completo de
   `database.rules.json` en Realtime Database → Reglas. Conserva una copia de las
   reglas anteriores. Las reglas nuevas impiden solicitudes de giro y permiten
   las promociones independientes y sus reservas.
3. Publica los archivos, cierra las pestañas antiguas del admin y vuelve a abrirlo
   para procesar las solicitudes. Sin el admin abierto, las solicitudes esperan.

## Uso

- En Admin → Promociones, «Retirar combo» lo oculta e impide nuevos pedidos con
  esa reserva. «Activar combo» lo muestra de nuevo con las reservas intactas.
- Para un combo nuevo, modifica los campos y pulsa «Reemplazar por una promoción
  nueva». Tras confirmar, hay 10 reservas nuevas y se cancelan las anteriores;
  los pedidos ya guardados y los premios anteriores no se eliminan. Un carrito
  con el combo anterior debe actualizarse antes de hacer el pedido.
- «Guardar cambios» modifica el combo actual y mantiene sus reservas. Se avisa
  si ya hay reservas aprobadas. El flyer PNG estático no cambia automáticamente.
- Cada cuenta de Google puede reservar una unidad por promoción. El administrador
  aprueba cada solicitud; una reserva aprobada cuenta contra el límite aunque no
  se complete la compra. No se libera automáticamente.
- Los combos normales se agregan y borran en Admin → Productos, categoría
  «Ofertas y combos». Se puede configurar su existencia por separado.

Este sistema depende del navegador del administrador, de las reglas y de la
verificación manual; no garantiza una persona por cuenta ni sustituye un servidor
confiable. Antes de usarlo, verifica las reglas reales, el acceso con Google, las
reservas y los pedidos de invitados. Las pruebas locales no sustituyen esa
comprobación en Firebase.

## Pruebas locales

Ejecuta `node --test tests/*.test.js`. Para la prueba de navegador, sirve la raíz
del proyecto en `127.0.0.1:18759` y ejecuta `python tests/promo-campaign-browser.py`
con Playwright para Python y Google Chrome instalados. Firebase se simula; esta
prueba no comprueba las reglas reales de Database.
