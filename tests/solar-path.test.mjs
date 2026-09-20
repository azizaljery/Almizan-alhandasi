import test from 'node:test';
import assert from 'node:assert/strict';
import { monthName, solarPreview } from '../dist/solar-path.mjs';

test('solar preview gives a finite daytime position and wall shadow', () => {
  const preview = solarPreview({ latitude: 24.71, month: 6, hour: 12, wallHeight: 3.2 });
  assert.equal(preview.visible, true);
  assert.ok(preview.altitude > 80 && preview.altitude <= 90);
  assert.ok(preview.azimuth >= 0 && preview.azimuth < 360);
  assert.ok(preview.shadowLength >= 0);
  assert.equal(monthName(6), 'يونيو');
});

test('solar preview reports the sun below the horizon instead of inventing a shadow', () => {
  const preview = solarPreview({ latitude: 24.71, month: 1, hour: 2 });
  assert.equal(preview.visible, false);
  assert.equal(preview.shadowLength, null);
  assert.throws(() => solarPreview({ latitude: 91 }), /خط عرض/);
});
