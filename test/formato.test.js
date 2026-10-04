import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatoPesos, formatoFecha, nombrePeriodo, periodoActual, periodoSiguiente } from '../lib/formato.js';

test('formatoPesos', () => {
  assert.equal(formatoPesos(1250000), '$1.250.000');
  assert.equal(formatoPesos(0), '$0');
  assert.equal(formatoPesos(950), '$950');
  assert.equal(formatoPesos(-300000), '-$300.000');
  assert.equal(formatoPesos('85300'), '$85.300');
  assert.equal(formatoPesos(null), '$0');
});

test('formatoFecha', () => {
  assert.equal(formatoFecha('2026-10-04'), '04/10/2026');
  assert.equal(formatoFecha('2026-10-04T15:30:00Z'), '04/10/2026');
  assert.equal(formatoFecha(null), '');
});

test('nombrePeriodo', () => {
  assert.equal(nombrePeriodo('2026-10'), 'octubre de 2026');
  assert.equal(nombrePeriodo('2027-01'), 'enero de 2027');
});

test('periodoActual usa la hora de Bogotá', () => {
  // 1 de noviembre 03:00 UTC = 31 de octubre 22:00 en Bogotá
  assert.equal(periodoActual(new Date('2026-11-01T03:00:00Z')), '2026-10');
});

test('periodoSiguiente', () => {
  assert.equal(periodoSiguiente('2026-12'), '2027-01');
  assert.equal(periodoSiguiente('2026-12', -1), '2026-11');
  assert.equal(periodoSiguiente('2026-01', -1), '2025-12');
});
