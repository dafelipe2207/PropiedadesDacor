# Administrador de Propiedades — Colombia

**Fecha:** 4 de octubre de 2026
**Estado:** Diseño aprobado, pendiente de revisión escrita

## 1. Objetivo

Aplicación web, totalmente en español, para administrar propiedades en Colombia. El administrador registra los pagos en efectivo de los inquilinos, carga los servicios públicos (individuales o compartidos por subcontador), genera el cobro mensual de cada unidad y lleva el control del efectivo entregado a cada propietario.

Es un proyecto nuevo e independiente: no comparte código en producción, base de datos ni datos con la aplicación de Australia (ManagementAptos). Se toma solo como referencia técnica.

### Criterios de éxito

- El administrador puede, en un mes normal, cargar facturas y lecturas, generar los cobros, registrar los pagos y entregar el efectivo sin usar hojas de cálculo aparte.
- Inquilino, administrador y propietario ven exactamente el mismo saldo para una misma unidad.
- Cada peso en efectivo es rastreable: recibido (recibo de caja) → en caja del administrador → entregado → confirmado por el propietario.

## 2. Convenciones

- Idioma: todo en español (interfaz, mensajes, correos, WhatsApp, errores).
- Moneda: pesos colombianos sin decimales, formato `$1.250.000`.
- Fechas: `dd/mm/aaaa`; zona horaria `America/Bogota`.
- Periodo de cobro: mes calendario (`2026-10` = octubre de 2026).

## 3. Usuarios y permisos

| Rol | Puede ver | Puede hacer |
|---|---|---|
| Administrador | Todo | Crear y editar todo, registrar pagos y entregas, anular recibos |
| Inquilino | Solo su contrato activo e históricos: cobros, saldo, facturas de servicios con sus lecturas, recibos | Consultar y descargar recibos |
| Propietario | Solo sus propiedades: ocupación, cobros, recaudo, cartera en mora, diferencia de áreas comunes, entregas | Confirmar o rechazar (con comentario) las entregas de efectivo |

Los permisos se aplican en la base de datos con Row Level Security (RLS), no solo en la interfaz.

## 4. Modelo de datos

### Propiedades y unidades

- **propietarios**: nombre, cédula/NIT, teléfono (WhatsApp), correo, usuario de acceso.
- **propiedades**: nombre, dirección, ciudad, propietario.
- **unidades**: propiedad, tipo (`apartamento` | `apartaestudio` | `local`), identificador (ej. "Apto 201", "Local 1"), canon mensual vigente, estado (`disponible` | `ocupada` | `inactiva`).

### Inquilinos y contratos

- **inquilinos**: nombre, cédula, teléfono (WhatsApp), correo, usuario de acceso.
- **contratos**: unidad, inquilino, fecha de inicio, fecha de fin (opcional), canon pactado, día de pago, estado (`activo` | `terminado`). Una unidad tiene como máximo un contrato activo.

El canon del contrato se copia al crearlo; cambiar el canon de la unidad no altera contratos activos.

### Servicios

- **servicios**: propiedad, tipo (`agua` | `energia` | `gas` | `internet` | `otro`), empresa (ej. EPM), número de cuenta/contrato, modalidad (`individual` | `compartido`), unidad de medida (`kWh` | `m³` | ninguna).
  - Si es `individual`: unidad a la que pertenece.
  - Si es `compartido`: lista de unidades conectadas, cada una con su subcontador.
- **subcontadores**: servicio, unidad, identificador, lectura inicial.
- **facturas_servicio**: servicio, periodo, valor total, consumo del medidor principal (solo compartidos), fecha de vencimiento, archivo (foto/PDF).
- **lecturas**: subcontador, periodo, lectura, foto opcional.

### Cobros, pagos y efectivo

- **cobros**: contrato, periodo, líneas de cobro, total, saldo, estado (`pendiente` | `parcial` | `pagado`).
- **lineas_cobro**: cobro, concepto (`arriendo` | `servicio`), referencia a la factura de servicio, descripción, valor.
- **pagos (recibos de caja)**: número consecutivo, contrato, fecha, valor, recibido por, estado (`vigente` | `anulado`), motivo de anulación.
- **aplicacion_pagos**: qué parte de cada pago se aplica a cada cobro.
- **entregas**: propietario, fecha, valor, recibos incluidos, estado (`pendiente_confirmar` | `confirmada` | `rechazada`), comentario del propietario.

## 5. Servicios públicos: reglas de cálculo

### Individual
La factura de la unidad se carga completa al inquilino del contrato activo, en el periodo de la factura.

### Compartido por subcontador
Cada periodo el administrador registra la factura general (valor total y consumo del medidor principal) y la lectura de cada subcontador.

1. Consumo de la unidad = lectura actual − lectura del periodo anterior.
2. Tarifa efectiva = valor total de la factura ÷ consumo del medidor principal. Así quedan incluidos estrato, subsidio o contribución y cargo fijo, sin tener que desglosarlos.
3. Cobro de la unidad = consumo de la unidad × tarifa efectiva, redondeado al peso.
4. Diferencia = valor total − suma de cobros a unidades. Corresponde a áreas comunes, pérdidas y unidades desocupadas; la asume el propietario y aparece en su reporte. No se cobra a ningún inquilino.

**Ejemplo:** factura de energía $600.000 por 1.000 kWh → tarifa $600/kWh. Apto 201 consumió 300 kWh → $180.000. Local 1 consumió 550 kWh → $330.000. Diferencia $90.000 (150 kWh) para el propietario.

### Validaciones
- Lectura menor que la anterior: se bloquea, salvo que el administrador marque "cambio de contador" (en ese caso el consumo es la lectura nueva menos la lectura inicial del contador nuevo).
- Suma de consumos de subcontadores mayor que el medidor principal: alerta, se puede guardar con confirmación.
- Falta la lectura de alguna unidad conectada: no se puede cerrar el cálculo de ese servicio.
- Unidad desocupada durante el periodo: su consumo se suma a la diferencia del propietario.

## 6. Ciclo mensual

1. El administrador carga las facturas de servicios del periodo y las lecturas.
2. Revisa el cálculo por servicio y lo cierra.
3. Genera los cobros del periodo: por cada contrato activo, una línea de arriendo y una línea por cada servicio cerrado que le corresponda. Los servicios que se cierren después se agregan como líneas al mismo cobro.
4. Se avisa a cada inquilino por WhatsApp con el detalle de su cobro.

Si el contrato empezó o terminó dentro del mes, el arriendo se calcula proporcional a los días (base 30).

## 7. Pagos en efectivo

- Todos los pagos son en efectivo. No hay selección de medio de pago ni soporte bancario.
- Al registrar un pago se genera un **recibo de caja** con número consecutivo único, fecha, inquilino, unidad, valor, conceptos cubiertos, saldo restante y quién recibió.
- El pago se aplica a los cobros más antiguos primero. Si sobra, queda como saldo a favor para el siguiente cobro.
- El recibo se envía al inquilino por WhatsApp (WhatsApp Business) y queda disponible en su cuenta.
- Los pagos no se borran. Un error se corrige anulando el recibo (con motivo) y registrando uno nuevo; el número anulado se conserva para que el consecutivo cuadre.

## 8. Entregas de efectivo al propietario

- **Caja del administrador:** por propietario, efectivo recibido (recibos vigentes) que aún no está incluido en una entrega.
- **Registrar entrega:** fecha, valor y recibos que cubre. El valor debe ser igual a la suma de los recibos seleccionados.
- **Confirmación:** el propietario ve la entrega como "pendiente de confirmar" y la confirma o la rechaza con comentario. Una entrega rechazada devuelve sus recibos a la caja del administrador.
- Un recibo incluido en una entrega confirmada no se puede anular.

## 9. Reportes

- **Administrador:** recaudo del mes por propiedad y por tipo de unidad; cartera en mora (cobros vencidos por antigüedad); caja pendiente por entregar; servicios pendientes de lectura o cierre.
- **Propietario:** ocupación; recaudo de arriendo y de servicios del mes; cartera en mora; diferencia de áreas comunes por servicio; efectivo pendiente en manos del administrador y entregas confirmadas.
- **Inquilino:** estado de cuenta (cobros, pagos, saldo) y detalle de servicios con sus lecturas.

Un cobro está en mora si tiene saldo después de su día de pago.

## 10. Notificaciones

Por WhatsApp Business (enlace con mensaje preescrito que abre el administrador):
- Cobro del mes generado.
- Recibo de caja.
- Recordatorio de saldo en mora.

## 11. Arquitectura técnica

- Frontend: JavaScript sin frameworks, misma estructura que la app de referencia (`app.js`, `services/`, `lib/`), publicada en GitHub Pages.
- Backend: Supabase nuevo y exclusivo para este cliente (Postgres, autenticación, almacenamiento de fotos/PDF, RLS).
- Los cálculos de servicios, la generación de cobros, el consecutivo de recibos y la aplicación de pagos se hacen en funciones de la base de datos (transaccionales), no en el navegador, para que el consecutivo y los saldos no se dupliquen ni descuadren.
- Repositorio GitHub nuevo, creado por el usuario. El proyecto de Supabase se crea con el conector, mostrando el costo antes.
- Arranca sin datos: ninguna información de la app de Australia se copia.

## 12. Errores y casos límite

- Doble clic al registrar un pago: la función de base de datos es idempotente por clave de solicitud; no se crean dos recibos.
- Generar cobros dos veces para el mismo periodo: no duplica; solo agrega lo que falte.
- Terminar un contrato con saldo: se permite; el saldo sigue visible en cartera.
- Cambio de propietario de una propiedad: las entregas pasadas quedan con el propietario anterior.

## 13. Pruebas

- Pruebas de las funciones de cálculo con casos fijos: ejemplo de la sección 5, cambio de contador, unidad desocupada, prorrateo de arriendo, pago parcial, saldo a favor, anulación.
- Pruebas de permisos (RLS): un inquilino no ve otra unidad; un propietario no ve propiedades ajenas.
- Prueba completa de un mes con datos de ejemplo antes de entregar.

## 14. Fuera de la primera versión

- Facturación electrónica DIAN.
- Pagos en línea (PSE, Nequi, Daviplata, transferencias).
- Incremento anual automático por IPC.
- Cuota de administración, multas por mora y depósitos.
- Contabilidad de gastos del administrador.
