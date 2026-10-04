import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoEnlaceAuth } from '../lib/enlaces.js';

test('tipoEnlaceAuth reconoce invitación, recuperación y enlaces vencidos', () => {
  assert.equal(tipoEnlaceAuth('#access_token=abc&expires_in=3600&type=invite', ''), 'invite');
  assert.equal(tipoEnlaceAuth('#access_token=abc&type=recovery', ''), 'recovery');
  assert.equal(tipoEnlaceAuth('', '?code=xyz&type=recovery'), 'recovery');
  assert.equal(tipoEnlaceAuth('#error=access_denied&error_code=otp_expired&error_description=x', ''), 'vencido');
  assert.equal(tipoEnlaceAuth('#/inicio', ''), null);
  assert.equal(tipoEnlaceAuth('', ''), null);
});
