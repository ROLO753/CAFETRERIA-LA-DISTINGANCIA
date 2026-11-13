# Combos promocionales y premios anteriores

El combo promocional se pide directamente desde el menú: no requiere cuenta de
Google ni aprobación previa y se puede agregar más de una unidad. El pedido se
guarda y se procesa igual que los demás pedidos. El combo promocional no tiene
un control automático de existencias; el administrador puede retirarlo cuando
se agote o cambiar sus datos en Admin → Promociones. Los demás combos siguen
administrándose en Productos y pueden tener existencias configuradas.

- «Retirar combo» lo oculta e impide hacer pedidos con él; «Activar combo» lo
  vuelve a mostrar.
- Para reemplazarlo, cambia los campos y pulsa «Reemplazar combo». Los pedidos
  ya realizados y los datos históricos no se borran. Si el combo cambia o se
  retira mientras está en el carrito, el cliente debe quitarlo y revisar el menú.
- Las reservas anteriores ya no son necesarias. La ruleta sigue pausada y sus
  premios anteriores se conservan. El cliente puede entrar con Google desde
  «Consultar premios anteriores»; el administrador puede aprobar o marcar como
  canjeados esos premios. Para cerveza, verifica la mayoría de edad.

## Mis pedidos

El botón «Mis pedidos» abre el historial únicamente cuando el cliente lo pulsa.
Los pedidos nuevos guardan su información en el navegador de ese dispositivo;
el estado se consulta en línea y se conserva el último estado conocido. Las
personas que usen el mismo navegador pueden ver esa información. Al borrar los
datos del navegador o cambiar de dispositivo el historial no se traslada. Para
los pedidos anteriores solo se muestra el seguimiento que ya estaba guardado;
los detalles antiguos no pueden recuperarse desde el navegador del cliente.

Si el almacenamiento del navegador falla, el pedido sigue guardado en la base de
datos y la pantalla de confirmación avisa que no se pudo guardar el historial.
El historial local no modifica ni borra los pedidos del administrador.

## Pruebas locales

Ejecuta `node --test tests/*.test.js`. Para la prueba de navegador, sirve la raíz
del proyecto en `127.0.0.1:18759` y ejecuta `python tests/promo-campaign-browser.py`
con Playwright para Python y Google Chrome instalados. Firebase se simula; esta
prueba no comprueba las reglas reales de Database.
