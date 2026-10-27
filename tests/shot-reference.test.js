import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyShotSize, classifyCameraAngle, classifyFacing, describeShotReference} from '../src/shot-reference.js';

test('ukuran shot mengikuti porsi tinggi subjek di frame', () => {
  assert.equal(classifyShotSize(.9).label, 'Close-up');
  assert.equal(classifyShotSize(.42).label, 'Medium shot');
  assert.equal(classifyShotSize(.18).label, 'Full shot');
  assert.equal(classifyShotSize(.04).label, 'Extreme long shot');
});

test('angle kamera dan arah hadap memakai istilah sinematografi yang stabil', () => {
  assert.equal(classifyCameraAngle(-18).label, 'High angle');
  assert.equal(classifyCameraAngle(2).label, 'Eye level');
  assert.equal(classifyCameraAngle(35).label, 'Low angle kuat');
  assert.equal(classifyFacing(52).label, 'Tiga-perempat depan');
  assert.equal(classifyFacing(179).label, 'Belakang');
});

test('deskripsi shot siap prompt memuat subjek dan ukuran terukur tanpa parameter output', () => {
  const result = describeShotReference({
    subjectName: 'Alex', coverage: .42, distance: 4.26, cameraHeight: 2.18,
    focal: 35, elevation: -12.4, relativeFacing: 48,
  });
  assert.equal(result.distance, 4.3);
  assert.equal(result.shotSize, 'Medium shot');
  assert.match(result.prompt, /medium shot kira-kira dari pinggang ke atas pada Alex/);
  assert.match(result.prompt, /sudut tinggi/);
  assert.match(result.prompt, /tiga-perempat depan/);
  assert.match(result.prompt, /4\.3 m/);
  assert.doesNotMatch(result.prompt, /fps|16:9|durasi|resolusi/i);
});
