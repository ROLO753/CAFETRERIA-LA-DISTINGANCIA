# Prueba de promociones

Esta versión es para pruebas con el panel de administración abierto. No requiere Blaze ni Cloud Functions. No se debe promocionar como sistema seguro de premios sin una revisión y un servidor confiable: los controles dependen del navegador del administrador, de las reglas de Database y de la verificación manual.

## Preparación

1. En Firebase Authentication, activa el proveedor **Google** y configura el correo de asistencia del proyecto.
2. En Authentication → Configuración → Dominios autorizados, agrega `rolo753.github.io` si no aparece. Si usas otro dominio, agrégalo también.
3. Publica el contenido completo de `database.rules.json` en Realtime Database → Reglas. Conserva una copia de las reglas anteriores. Las reglas actualizadas permiten a clientes con Google crear pedidos asociados a su propia cuenta; los pedidos sin cuenta siguen permitidos.
4. Publica los archivos de esta versión y abre el admin con la cuenta autorizada. Mantén el admin abierto durante la prueba. Se recomienda probar con una cuenta de Google distinta a la de administración.

## Funcionamiento

- Los clientes que quieran participar entran con Google antes de hacer el pedido. Los pedidos de invitados siguen funcionando, pero no acumulan tokens. El navegador del menú usa una sesión de Firebase separada de la del administrador.
- Al marcarse **entregado** un pedido con subtotal de productos de al menos RD$200, el admin acredita dos tokens una sola vez. No cuenta el delivery. Los pedidos anteriores a esta versión no tienen cuenta asociada y no acumulan tokens.
- Un giro cuesta cinco tokens. La aplicación selecciona un premio al azar en cada grupo de diez giros procesados entre todas las cuentas. Los otros nueve reciben mensajes sin premio. Si el admin está cerrado, las solicitudes esperan a que vuelva a abrirse.
- En **Promociones** el administrador aprueba los premios y registra cuándo se canjean. Compara el código de cuenta que muestra el cliente con el del panel; para la cerveza, verifica la mayoría de edad antes de entregar.
- Cada cuenta puede solicitar una reserva del combo. El administrador debe aprobarla. Hay diez reservas, una por cuenta, y el pedido consume esa reserva una sola vez. Una reserva aprobada cuenta contra el límite aunque no se complete la compra. Si se rechaza o abandona una reserva, esta versión no la libera automáticamente.
- En Admin → Promociones puedes editar nombre, descripción, precio e imagen del combo. Para la imagen, pega un enlace HTTPS o conserva el archivo `promo/combo-primeros-10.png`. El cambio se refleja en la sección de promociones del menú.
- Una persona puede tener varias cuentas de Google. El límite es por cuenta, no una prueba de identidad. El administrador debe verificar que el pedido y el canje correspondan a una persona antes de aceptarlos.
- Las solicitudes y los datos de promociones se guardan en la base de datos del proyecto. No se borran automáticamente al finalizar la prueba.

## Validación local

```sh
node --test tests/promo-engine.test.js
```

La lógica probada localmente no sustituye una prueba de las reglas y del acceso con Google en el proyecto real. Esta versión agrega la ruta `promoSettings` a las reglas y requiere volver a publicar el archivo actualizado después de fusionar. Antes de probar, verifica también que el dominio y el proveedor estén habilitados, que los invitados puedan pedir y que un usuario no pueda leer los datos promocionales de otra cuenta.
