# Administrador de Propiedades Colombia — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** Construir desde cero la app web (en español) para administrar propiedades en Colombia: unidades con canon, servicios mixtos con subcontadores, cobro mensual, pagos en efectivo con recibo de caja y entregas confirmadas por el propietario.

**Arquitectura:** Toda la lógica de dinero (cálculo de servicios, generación de cobros, consecutivo de recibos, aplicación de pagos, entregas) vive en funciones SQL transaccionales de Postgres/Supabase, protegidas con RLS. El frontend es JavaScript sin frameworks que solo llama esas funciones (`supabase.rpc`) y lee tablas/vistas. Las funciones SQL se prueban localmente con PGlite (Postgres en WebAssembly) ejecutando las migraciones reales.

**Tecnología:** Postgres (Supabase), `@supabase/supabase-js` v2 por CDN, JS ES modules sin build, GitHub Pages, Node 20+ con `node:test` y `@electric-sql/pglite` solo para pruebas.

**Spec:** `docs/superpowers/specs/2026-10-04-administrador-propiedades-colombia-design.md`

## Restricciones globales

- Todo texto visible en español: interfaz, errores (`raise exception` con mensajes en español), WhatsApp.
- Dinero en pesos enteros: columnas `bigint`, sin decimales. Formato `$1.250.000` (`Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})`).
- Fechas `dd/mm/aaaa`; zona `America/Bogota`. Periodo = texto `'AAAA-MM'` validado con `check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$')`.
- Tipos de unidad exactamente: `apartamento`, `apartaestudio`, `local`.
- Pagos solo en efectivo: no existe columna ni campo de medio de pago.
- Los pagos nunca se borran (sin política DELETE en `pagos`); se anulan con motivo.
- Ningún dato de la app de Australia; sin semillas de datos reales.
- WhatsApp: enlaces `https://wa.me/57<10 dígitos>?text=<mensaje codificado>`.
- Las migraciones no crean el esquema `auth` (Supabase ya lo tiene); las pruebas lo simulan con `test/apoyo/auth_simulado.sql`.

## Foco de revisión

1. **Doble clic en "Registrar pago"** → un solo recibo. Prueba en Tarea 4 (`clave` repetida devuelve el mismo recibo).
2. **Anular un recibo con pagos posteriores** → los saldos y la aplicación FIFO de los demás pagos quedan correctos. Prueba en Tarea 4.
3. **Factura compartida cargada después de generar cobros** → se agrega la línea al cobro existente sin duplicar el arriendo. Prueba en Tarea 3.
4. **Número de teléfono con espacios, guiones o `+57`** → enlace de WhatsApp válido. Prueba en Tarea 8.
5. **Inquilino con dos contratos en el tiempo (se cambió de unidad)** → ve ambos estados de cuenta, nunca la unidad del nuevo inquilino de su unidad anterior. Prueba en Tarea 6.

---

## Estructura de archivos

```
supabase/migrations/
  001_base.sql            perfiles, propietarios, propiedades, unidades, inquilinos, contratos, helpers de rol
  002_servicios.sql       servicios, subcontadores, facturas_servicio, lecturas, distribucion_servicio, funciones de cálculo
  003_cobros.sql          cobros, lineas_cobro, generar_cobros, prorrateo
  004_pagos.sql           consecutivos, pagos, aplicacion_pagos, registrar_pago, anular_recibo, reaplicar_pagos
  005_entregas.sql        entregas, registrar_entrega, responder_entrega
  006_rls.sql             políticas RLS de todas las tablas
  007_reportes.sql        vistas de reportes
  008_almacenamiento.sql  bucket 'soportes' y políticas
test/
  apoyo/auth_simulado.sql esquema auth mínimo (users, uid())
  apoyo/db.js             crea PGlite, aplica auth_simulado + migraciones, helpers comoAdmin/comoUsuario
  *.test.js               una por migración + formato/whatsapp
lib/  supabaseClient.js, auth.js, formato.js, whatsapp.js
services/  un archivo por dominio (propiedades, contratos, servicios, cobros, pagos, entregas, reportes)
vistas/  admin/*.js, inquilino.js, propietario.js, login.js
index.html, styles.css, app.js (enrutador por rol), config.js (URL y clave pública de Supabase)
package.json (solo devDependencies de prueba; script "test": "node --test test/")
```

---

### Tarea 1: Esqueleto, arnés de pruebas y esquema base

**Archivos:**
- Crear: `package.json`, `.gitignore`, `test/apoyo/auth_simulado.sql`, `test/apoyo/db.js`, `supabase/migrations/001_base.sql`
- Prueba: `test/001_base.test.js`

**Interfaces:**
- Produce (`test/apoyo/db.js`):
  - `nuevaDb(): Promise<PGlite>` — base limpia con todas las migraciones de `supabase/migrations/` en orden alfabético.
  - `comoUsuario(db, uid: string, fn: (db) => Promise<T>): Promise<T>` — ejecuta con `set role authenticated` y `set request.jwt.claim.sub = uid`, y restaura.
  - `crearUsuario(db, {rol, propietario_id?, inquilino_id?}): Promise<string /*uid*/>`.
- Produce (SQL):
  - Tablas `propietarios(id, nombre, documento, telefono, correo)`, `propiedades(id, nombre, direccion, ciudad, propietario_id)`, `unidades(id, propiedad_id, tipo, identificador, canon bigint, estado)`, `inquilinos(id, nombre, documento, telefono, correo)`, `contratos(id, unidad_id, inquilino_id, fecha_inicio date, fecha_fin date null, canon bigint, dia_pago int check 1..28, estado)`.
  - `perfiles(id uuid pk references auth.users, rol text check in ('admin','inquilino','propietario'), propietario_id, inquilino_id)`.
  - `es_admin() returns boolean`, `mi_propietario() returns uuid`, `mi_inquilino() returns uuid` (security definer, leen `perfiles` con `auth.uid()`).
  - Al insertar contrato: `canon` toma el de la unidad si viene null; unidad pasa a `ocupada`. Al terminar: unidad pasa a `disponible`.

- [ ] **Paso 1: Pruebas que fallan** en `test/001_base.test.js`:
  - `una unidad solo admite un contrato activo` → segundo insert activo lanza error (índice único parcial `where estado='activo'`).
  - `el contrato copia el canon de la unidad` → unidad canon 1200000, contrato sin canon → contrato.canon = 1200000; luego cambiar la unidad a 1300000 deja el contrato en 1200000.
  - `tipo de unidad inválido se rechaza` → `'bodega'` lanza error.
  - `crear contrato marca la unidad ocupada y terminarlo la libera`.
- [ ] **Paso 2:** `npm install -D @electric-sql/pglite` y `npm test` → FALLA (tablas inexistentes).
- [ ] **Paso 3:** Escribir `auth_simulado.sql` (`auth.users(id uuid pk)`, `auth.uid()` leyendo `current_setting('request.jwt.claim.sub', true)`, rol `authenticated`), `db.js` y `001_base.sql`.
- [ ] **Paso 4:** `npm test` → PASA.
- [ ] **Paso 5:** Commit `feat: esquema base y arnés de pruebas`.

### Tarea 2: Servicios y cálculo por subcontador

**Archivos:** Crear `supabase/migrations/002_servicios.sql`; Prueba `test/002_servicios.test.js`

**Interfaces:**
- Consume: `unidades`, `contratos` (Tarea 1).
- Produce:
  - `servicios(id, propiedad_id, tipo check in ('agua','energia','gas','internet','otro'), empresa, numero_cuenta, modalidad check in ('individual','compartido'), medida check in ('kWh','m³') null, unidad_id null)` — `unidad_id` obligatorio si individual.
  - `subcontadores(id, servicio_id, unidad_id, identificador, lectura_inicial numeric)`.
  - `facturas_servicio(id, servicio_id, periodo, valor bigint, consumo_principal numeric null, vencimiento date, archivo text null, cerrada bool default false, diferencia bigint null)`, único `(servicio_id, periodo)`.
  - `lecturas(id, subcontador_id, periodo, lectura numeric, cambio_contador bool default false, foto text null)`, único `(subcontador_id, periodo)`.
  - `distribucion_servicio(factura_id, unidad_id, contrato_id null, consumo numeric null, valor bigint)`.
  - `calcular_servicio(p_factura uuid) returns table(unidad_id uuid, contrato_id uuid, consumo numeric, valor bigint)` — sin guardar.
  - `alertas_servicio(p_factura uuid) returns table(tipo text, mensaje text)` — tipos `suma_mayor_principal`, `falta_lectura`.
  - `cerrar_servicio(p_factura uuid) returns void` — guarda distribución y diferencia, marca cerrada; si hay `falta_lectura` lanza `'Falta la lectura de: <identificadores>'`.
- Reglas (spec §5): lectura anterior = lectura del periodo previo o `lectura_inicial`; si `cambio_contador`, consumo = lectura − `lectura_inicial` actualizada en el subcontador. Lectura menor que la anterior sin `cambio_contador` → trigger lanza `'La lectura es menor que la anterior'`. Tarifa = valor ÷ consumo_principal; valor unidad = `round(consumo * tarifa)`. Unidades sin contrato activo en el periodo: `contrato_id` null, su valor no se cobra y se suma a la diferencia. `diferencia = valor − suma(valor de unidades con contrato)`. Individual: una fila con el valor completo.

- [ ] **Paso 1: Pruebas que fallan:**
  - `ejemplo de la spec` → factura 600000 por 1000 kWh; Apto 201 consumo 300 → 180000; Local 1 consumo 550 → 330000; diferencia 90000.
  - `lectura menor se rechaza` y `cambio de contador la acepta` (consumo = lectura nueva − lectura inicial del nuevo contador).
  - `unidad desocupada suma a la diferencia` → consumo 100 de unidad sin contrato con tarifa 600 → diferencia aumenta 60000, sin fila cobrable.
  - `no cierra si falta una lectura` → error con el identificador.
  - `alerta si los subcontadores superan al principal` → `alertas_servicio` devuelve `suma_mayor_principal`; `cerrar_servicio` igual permite cerrar.
  - `servicio individual carga el valor completo a su unidad`.
- [ ] **Paso 2:** `npm test` → FALLA.
- [ ] **Paso 3:** Implementar `002_servicios.sql`.
- [ ] **Paso 4:** `npm test` → PASA.
- [ ] **Paso 5:** Commit `feat: servicios con subcontadores`.

### Tarea 3: Cobros mensuales

**Archivos:** Crear `supabase/migrations/003_cobros.sql`; Prueba `test/003_cobros.test.js`

**Interfaces:**
- Consume: `contratos`, `distribucion_servicio`, `facturas_servicio.cerrada`.
- Produce:
  - `cobros(id, contrato_id, periodo, fecha_limite date, total bigint, saldo bigint, estado check in ('pendiente','parcial','pagado'))`, único `(contrato_id, periodo)`.
  - `lineas_cobro(id, cobro_id, concepto check in ('arriendo','servicio'), factura_id null, descripcion, valor bigint)`, único `(cobro_id, concepto, factura_id)` con `nulls not distinct`.
  - `arriendo_proporcional(p_canon bigint, p_inicio date, p_fin date, p_periodo text) returns bigint`.
  - `generar_cobros(p_periodo text) returns int` — número de líneas nuevas; idempotente; al final llama `reaplicar_pagos` por contrato si existe (se crea en Tarea 4; aquí se deja el total y `saldo = total`).
- Reglas: contrato vigente en el periodo si se cruza con el mes. Arriendo base 30: días = `fin_efectivo − inicio_efectivo + 1`, donde el día 31 cuenta como 30 y si el contrato cubre hasta fin de mes el fin es 30; mes completo = canon. `fecha_limite` = día `dia_pago` del periodo. Línea de servicio por cada fila de `distribucion_servicio` con ese `contrato_id` cuya factura esté cerrada y sea del periodo. Descripción: `'Energía – Apto 201 – 300 kWh'`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `mes completo cobra el canon` (febrero y octubre → 1200000).
  - `inicio el 16 de octubre cobra 15/30` → 600000; `fin el 15 de octubre cobra 15/30` → 600000.
  - `generar dos veces no duplica` → segunda llamada devuelve 0 y el total no cambia.
  - `servicio cerrado después se agrega al cobro existente` → total = canon + 180000, una sola línea de arriendo.
  - `fecha límite usa el día de pago del contrato`.
- [ ] **Paso 2:** `npm test` → FALLA.
- [ ] **Paso 3:** Implementar `003_cobros.sql`.
- [ ] **Paso 4:** `npm test` → PASA.
- [ ] **Paso 5:** Commit `feat: generación de cobros mensuales`.

### Tarea 4: Pagos en efectivo y recibos de caja

**Archivos:** Crear `supabase/migrations/004_pagos.sql` (redefine `generar_cobros` con `create or replace` para que llame a `reaplicar_pagos` de cada contrato tocado). Prueba `test/004_pagos.test.js`.

**Interfaces:**
- Consume: `cobros`, `contratos`, `es_admin()`.
- Produce:
  - `consecutivos(nombre text pk, ultimo bigint)` con fila `'recibo'`. Número tomado con `update ... returning` (no `sequence`, para no dejar huecos).
  - `pagos(id, numero bigint unique, contrato_id, fecha date, valor bigint check > 0, recibido_por uuid, clave uuid unique, estado check in ('vigente','anulado'), motivo_anulacion text null, detalle jsonb)`.
  - `aplicacion_pagos(pago_id, cobro_id, valor bigint)`.
  - `reaplicar_pagos(p_contrato uuid) returns void` — borra y recalcula: pagos vigentes por `(fecha, numero)` sobre cobros por `periodo`; actualiza `saldo` y `estado` de cobros.
  - `saldo_a_favor(p_contrato uuid) returns bigint`.
  - `registrar_pago(p_contrato uuid, p_valor bigint, p_fecha date, p_clave uuid) returns pagos` — solo admin; misma `clave` devuelve el recibo existente; `recibido_por = auth.uid()`; guarda en `detalle` los conceptos cubiertos y el saldo restante al momento de emitirlo.
  - `anular_recibo` se define en la Tarea 5, porque depende de las entregas.

- [ ] **Paso 1: Pruebas que fallan:**
  - `recibos consecutivos` → tres pagos → números 1, 2, 3.
  - `misma clave no duplica` → dos llamadas con la misma `clave` → un pago, mismo número.
  - `pago parcial` → cobro 1200000, pago 500000 → saldo 700000, estado `parcial`.
  - `paga primero lo más antiguo` → cobros septiembre y octubre de 1200000; pago 1500000 → septiembre pagado, octubre saldo 900000.
  - `sobrante queda a favor y se aplica al siguiente cobro` → pago 1500000 con cobro 1200000 → `saldo_a_favor` 300000; generar noviembre → saldo noviembre 900000.
  - `no admin no puede registrar pagos` → como inquilino lanza error.
- [ ] **Paso 2:** `npm test` → FALLA.
- [ ] **Paso 3:** Implementar `004_pagos.sql` (incluye `create or replace generar_cobros` que llama `reaplicar_pagos`).
- [ ] **Paso 4:** `npm test` → PASA.
- [ ] **Paso 5:** Commit `feat: pagos en efectivo con recibo consecutivo`.

### Tarea 5: Anulación y entregas al propietario

**Archivos:** Crear `supabase/migrations/005_entregas.sql`; Prueba `test/005_entregas.test.js`

**Interfaces:**
- Consume: `pagos`, `reaplicar_pagos`, `mi_propietario()`.
- Produce:
  - `entregas(id, propietario_id, fecha date, valor bigint, estado check in ('pendiente_confirmar','confirmada','rechazada'), comentario text null, registrada_por uuid)`.
  - `entrega_pagos(entrega_id, pago_id)`; un pago solo puede estar en una entrega no rechazada.
  - `registrar_entrega(p_propietario uuid, p_fecha date, p_pagos uuid[]) returns entregas` — valor = suma de los pagos; error si algún pago es de otro propietario, está anulado o ya está en otra entrega no rechazada.
  - `responder_entrega(p_entrega uuid, p_confirmar boolean, p_comentario text) returns void` — solo el propietario de la entrega; comentario obligatorio al rechazar; solo desde `pendiente_confirmar`.
  - `anular_recibo(p_pago uuid, p_motivo text) returns void` — solo admin; motivo obligatorio; tras anular llama `reaplicar_pagos`. Errores: en entrega confirmada → `'No se puede anular: el recibo ya fue entregado y confirmado por el propietario'`; en entrega pendiente → `'El recibo está en una entrega pendiente de confirmar por el propietario'`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `anular recalcula saldos de los pagos posteriores` → pagos 1 (500000) y 2 (700000) contra cobro 1200000; anular 1 → saldo 500000; número 1 sigue existiendo como anulado.
  - `anular exige motivo`.
  - `entrega suma los recibos` → recibos 500000 + 700000 → valor 1200000.
  - `un recibo no entra en dos entregas`.
  - `no se mezclan propietarios` → recibo de otro propietario → error.
  - `rechazar devuelve los recibos a caja` → tras rechazo, los mismos recibos entran en una entrega nueva.
  - `no se anula un recibo de entrega confirmada`.
  - `otro propietario no puede confirmar`.
- [ ] **Paso 2:** `npm test` → FALLA.
- [ ] **Paso 3:** Implementar `005_entregas.sql`.
- [ ] **Paso 4:** `npm test` → PASA.
- [ ] **Paso 5:** Commit `feat: anulación de recibos y entregas al propietario`.

### Tarea 6: Seguridad por rol (RLS)

**Archivos:** Crear `supabase/migrations/006_rls.sql`; Prueba `test/006_rls.test.js`

**Interfaces:**
- Consume: todas las tablas; `es_admin()`, `mi_propietario()`, `mi_inquilino()`.
- Produce: RLS activado en todas las tablas públicas. Admin: todo menos DELETE en `pagos`, `aplicacion_pagos`, `entregas`. Inquilino: SELECT de sus `contratos` y de `cobros`, `lineas_cobro`, `pagos` de esos contratos; `facturas_servicio`, `distribucion_servicio`, `lecturas` solo de las unidades y periodos en que tuvo contrato. Propietario: SELECT de todo lo que cuelga de sus propiedades, y de sus `entregas`. Escrituras de dinero solo por funciones `security definer`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `inquilino solo ve su cobro` (dos inquilinos, cada uno ve 1 fila).
  - `inquilino que cambió de unidad ve sus dos contratos y no los cobros del nuevo inquilino de su unidad anterior`.
  - `propietario no ve propiedades ajenas`.
  - `inquilino no puede insertar pagos directamente`.
  - `nadie puede borrar pagos` (ni admin).
- [ ] **Paso 2:** `npm test` → FALLA.
- [ ] **Paso 3:** Implementar `006_rls.sql`.
- [ ] **Paso 4:** `npm test` → PASA (incluye todas las pruebas anteriores).
- [ ] **Paso 5:** Commit `feat: permisos por rol con RLS`.

### Tarea 7: Reportes

**Archivos:** Crear `supabase/migrations/007_reportes.sql`; Prueba `test/007_reportes.test.js`

**Interfaces:**
- Produce vistas (con `security_invoker = true` para respetar RLS):
  - `v_recaudo_mensual(periodo, propiedad_id, tipo_unidad, cobrado_arriendo, cobrado_servicios, recaudado)`.
  - `v_cartera(contrato_id, inquilino, unidad, periodo, saldo, dias_mora)` — solo cobros con saldo > 0 y `fecha_limite < current_date` (Bogotá).
  - `v_caja_admin(propietario_id, pago_id, numero, fecha, valor)` — pagos vigentes sin entrega no rechazada.
  - `v_diferencia_servicios(propiedad_id, periodo, servicio, diferencia)`.
  - `v_ocupacion(propiedad_id, total, ocupadas)`.

- [ ] **Paso 1: Pruebas que fallan:** una por vista con datos del ejemplo de la spec (ej. `v_diferencia_servicios` devuelve 90000; `v_caja_admin` deja de mostrar un recibo al entrar en entrega pendiente y lo vuelve a mostrar al rechazarse; `v_cartera` solo muestra cobros vencidos).
- [ ] **Paso 2:** `npm test` → FALLA.
- [ ] **Paso 3:** Implementar `007_reportes.sql` y `008_almacenamiento.sql` (bucket privado `soportes`; admin escribe; lectura según RLS de la factura). `008` se envuelve en `do $$ ... if exists schema storage` para que PGlite lo omita.
- [ ] **Paso 4:** `npm test` → PASA.
- [ ] **Paso 5:** Commit `feat: reportes`.

### Tarea 8: Base del frontend (formato, WhatsApp, sesión y rutas por rol)

**Archivos:** Crear `index.html`, `styles.css`, `config.js`, `app.js`, `lib/supabaseClient.js`, `lib/auth.js`, `lib/formato.js`, `lib/whatsapp.js`, `vistas/login.js`; Prueba `test/formato.test.js`, `test/whatsapp.test.js`

**Interfaces:**
- Produce:
  - `formatoPesos(n: number): string` → `formatoPesos(1250000) === '$ 1.250.000'` (salida exacta de `Intl` es-CO; la prueba fija la cadena que produzca Node 20 y el navegador debe coincidir).
  - `formatoFecha(iso: string): string` → `'2026-10-04'` → `'04/10/2026'`.
  - `nombrePeriodo(periodo: string): string` → `'2026-10'` → `'octubre de 2026'`.
  - `telefonoWhatsApp(tel: string): string|null` → `'300 123 4567'`, `'300-123-4567'`, `'+57 3001234567'`, `'573001234567'` → `'573001234567'`; inválido → `null`.
  - `enlaceWhatsApp(tel: string, mensaje: string): string|null`.
  - `mensajeCobro(cobro, lineas)`, `mensajeRecibo(pago)`, `mensajeMora(cobro)`: strings en español con valores formateados.
  - `app.js`: tras iniciar sesión lee `perfiles.rol` y monta `vistas/admin/inicio.js`, `vistas/inquilino.js` o `vistas/propietario.js`.

- [ ] **Paso 1:** Pruebas de `formato` y `whatsapp` con los casos anteriores → FALLA.
- [ ] **Paso 2:** Implementar `lib/formato.js`, `lib/whatsapp.js` → `npm test` PASA.
- [ ] **Paso 3:** Implementar `index.html`, `styles.css` (diseño responsivo pensado para celular), `config.js`, cliente, sesión (`signInWithPassword`, recuperación de contraseña) y enrutador.
- [ ] **Paso 4:** Verificar: `npx serve .` y abrir; la página de inicio de sesión carga sin errores de consola (sin Supabase aún, muestra "No se pudo conectar" en español).
- [ ] **Paso 5:** Commit `feat: base del frontend`.

### Tarea 9: Pantallas del administrador — propiedades, unidades, personas y contratos

**Archivos:** Crear `services/propiedades.js`, `services/personas.js`, `services/contratos.js`, `vistas/admin/inicio.js`, `vistas/admin/propiedades.js`, `vistas/admin/personas.js`, `vistas/admin/contratos.js`

**Interfaces:**
- Produce servicios con funciones `listar*`, `crear*`, `actualizar*` sobre las tablas de la Tarea 1; `terminarContrato(id, fechaFin)`; `crearAccesoUsuario({correo, rol, propietario_id|inquilino_id})` mediante una Edge Function `crear-usuario` (solo admin, usa la service key en el servidor) — crear `supabase/functions/crear-usuario/index.ts`.
- Pantallas: lista de propiedades con sus unidades agrupadas por tipo y canon; formulario de unidad con selector de los tres tipos; inquilinos y propietarios; crear/terminar contrato.

- [ ] **Paso 1:** Implementar servicios y vistas.
- [ ] **Paso 2:** Verificar contra Supabase de pruebas (Tarea 13 crea el proyecto; si aún no existe, ejecutar esta verificación al final de la Tarea 13): crear propiedad con un apartamento, un apartaestudio y un local con cánones distintos; crear contrato; la unidad aparece ocupada.
- [ ] **Paso 3:** Commit `feat: administración de propiedades y contratos`.

### Tarea 10: Pantallas del administrador — servicios, facturas y lecturas

**Archivos:** Crear `services/servicios.js`, `vistas/admin/servicios.js`

**Interfaces:**
- Consume: tablas y funciones de la Tarea 2 (`calcular_servicio`, `alertas_servicio`, `cerrar_servicio`).
- Pantallas: configurar servicios de una propiedad (individual o compartido con subcontadores); por periodo, subir factura (valor, consumo principal, vencimiento, foto/PDF al bucket `soportes`), ingresar lecturas con la lectura anterior a la vista, casilla "cambio de contador", vista previa del cálculo con alertas y botón "Cerrar servicio".

- [ ] **Paso 1:** Implementar.
- [ ] **Paso 2:** Verificar con el ejemplo de la spec: la vista previa muestra 180.000 / 330.000 y diferencia 90.000.
- [ ] **Paso 3:** Commit `feat: carga de servicios y lecturas`.

### Tarea 11: Cobros, pagos y recibos

**Archivos:** Crear `services/cobros.js`, `services/pagos.js`, `vistas/admin/cobros.js`, `vistas/admin/pagos.js`, `vistas/recibo.js`

**Interfaces:**
- Consume: `generar_cobros`, `registrar_pago`, `anular_recibo`, `lib/whatsapp.js`.
- `registrarPago` genera la `clave` con `crypto.randomUUID()` al abrir el formulario y la reutiliza en reintentos; el botón se deshabilita mientras espera.
- `vistas/recibo.js`: recibo de caja imprimible (número, fecha, inquilino, unidad, valor, conceptos, saldo, recibido por; sello "ANULADO" con motivo si aplica) y botón "Enviar por WhatsApp".

- [ ] **Paso 1:** Implementar.
- [ ] **Paso 2:** Verificar: generar octubre, registrar pago parcial, ver recibo N.º 1, enviar por WhatsApp (enlace abre con el mensaje), anular con motivo.
- [ ] **Paso 3:** Commit `feat: cobros, pagos y recibos de caja`.

### Tarea 12: Entregas, vistas de propietario e inquilino, y reportes

**Archivos:** Crear `services/entregas.js`, `services/reportes.js`, `vistas/admin/caja.js`, `vistas/admin/reportes.js`, `vistas/propietario.js`, `vistas/inquilino.js`

**Interfaces:**
- Consume: `registrar_entrega`, `responder_entrega`, vistas de la Tarea 7.
- Admin: caja por propietario con casillas para elegir recibos y total en vivo; reportes de recaudo, cartera y servicios pendientes de cierre.
- Propietario: ocupación, recaudo del mes, cartera, diferencias de servicios, efectivo en caja del administrador, entregas pendientes con botones Confirmar / Rechazar (comentario obligatorio).
- Inquilino: estado de cuenta por contrato, detalle de servicios con lecturas y foto de la factura, recibos.

- [ ] **Paso 1:** Implementar.
- [ ] **Paso 2:** Verificar con tres usuarios (admin, inquilino, propietario) que cada uno ve solo lo suyo y que la entrega confirmada coincide en las dos cuentas.
- [ ] **Paso 3:** Commit `feat: entregas y vistas por rol`.

### Tarea 13: Montaje y prueba de un mes completo

**Requiere acción del usuario:** crear el repositorio vacío en GitHub y aprobar el costo del proyecto Supabase.

- [ ] **Paso 1:** Con el conector de Supabase: listar organizaciones, obtener la cotización del proyecto nuevo, mostrarla al usuario y **esperar aprobación** antes de crearlo (región más cercana a Colombia disponible, ej. `sa-east-1` o `us-east-1`).
- [ ] **Paso 2:** Aplicar migraciones 001–008 con `apply_migration`; desplegar `crear-usuario`; correr `get_advisors` (seguridad) y corregir hallazgos.
- [ ] **Paso 3:** Poner URL y clave pública en `config.js`; crear el usuario administrador.
- [ ] **Paso 4:** Prueba de un mes completo con datos de ejemplo claramente ficticios: 1 propiedad (apartamento, apartaestudio, local), energía compartida con subcontadores, agua individual, 2 contratos, cobros, pago total, pago parcial, anulación, entrega y confirmación. Luego borrar los datos de ejemplo.
- [ ] **Paso 5:** Entregar los archivos para subir al repositorio nuevo y activar GitHub Pages (rama `main`, raíz). Verificar la URL publicada.
- [ ] **Paso 6:** Commit `chore: configuración de producción`.
