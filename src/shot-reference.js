const round = (value, digits = 1) => Number(value.toFixed(digits));

/**
 * Nama ukuran shot berdasarkan tinggi subjek yang benar-benar mengisi frame.
 * `coverage` adalah fraksi tinggi frame (1 = setinggi frame penuh), bukan jarak
 * mentah, sehingga hasil tetap berguna saat focal length berubah.
 */
export function classifyShotSize(coverage) {
  if (!Number.isFinite(coverage)) return {label: 'Framing belum terbaca', prompt: 'framing yang mengikuti komposisi kamera'};
  if (coverage >= 1.45) return {label: 'Extreme close-up', prompt: 'extreme close-up yang hanya menampilkan detail wajah'};
  if (coverage >= .82) return {label: 'Close-up', prompt: 'close-up yang memenuhi frame dengan wajah dan bahu'};
  if (coverage >= .56) return {label: 'Medium close-up', prompt: 'medium close-up dari dada ke atas'};
  if (coverage >= .36) return {label: 'Medium shot', prompt: 'medium shot kira-kira dari pinggang ke atas'};
  if (coverage >= .24) return {label: 'Medium long shot', prompt: 'medium long shot kira-kira dari lutut ke atas'};
  if (coverage >= .14) return {label: 'Full shot', prompt: 'full shot yang memperlihatkan tubuh subjek secara utuh'};
  if (coverage >= .07) return {label: 'Long shot', prompt: 'long shot yang menempatkan subjek di dalam lingkungannya'};
  return {label: 'Extreme long shot', prompt: 'extreme long shot dengan lingkungan mendominasi frame'};
}

/** Elevasi positif berarti kamera melihat ke atas; negatif berarti melihat ke bawah. */
export function classifyCameraAngle(elevation) {
  if (elevation >= 30) return {label: 'Low angle kuat', prompt: 'sudut rendah yang kuat, kamera jelas melihat ke atas'};
  if (elevation >= 10) return {label: 'Low angle', prompt: 'sudut rendah, kamera melihat sedikit ke atas'};
  if (elevation <= -30) return {label: 'High angle kuat', prompt: 'sudut tinggi yang kuat, kamera jelas melihat ke bawah'};
  if (elevation <= -10) return {label: 'High angle', prompt: 'sudut tinggi, kamera melihat sedikit ke bawah'};
  return {label: 'Eye level', prompt: 'sudut sejajar mata'};
}

/** 0° berarti kamera berada di depan arah hadap karakter. */
export function classifyFacing(relativeAngle) {
  const angle = Math.abs((((relativeAngle + 180) % 360) + 360) % 360 - 180);
  if (angle <= 25) return {label: 'Depan', prompt: 'tampak depan'};
  if (angle <= 70) return {label: 'Tiga-perempat depan', prompt: 'tampak tiga-perempat depan'};
  if (angle <= 110) return {label: 'Profil', prompt: 'tampak profil'};
  if (angle <= 155) return {label: 'Tiga-perempat belakang', prompt: 'tampak tiga-perempat belakang'};
  return {label: 'Belakang', prompt: 'tampak belakang'};
}

/**
 * Mengubah hasil ukur kamera menjadi referensi sinematografi dan satu paragraf
 * yang dapat ditempel ke Prompt Seedance. Parameter output seperti durasi, fps,
 * resolusi dan aspect ratio sengaja tidak dimasukkan ke paragraf Prompt.
 */
export function describeShotReference({subjectName, coverage, distance, cameraHeight, focal, elevation, relativeFacing}) {
  const shot = classifyShotSize(coverage);
  const angle = classifyCameraAngle(elevation);
  const facing = classifyFacing(relativeFacing);
  const measuredDistance = round(distance);
  const measuredHeight = round(cameraHeight);
  const measuredElevation = round(Math.abs(elevation));
  const measuredFocal = Math.round(focal);
  const direction = elevation < -3 ? 'menunduk' : elevation > 3 ? 'mendongak' : 'mendatar';
  const prompt = `Kamera menggunakan ${shot.prompt} pada ${subjectName}, dari ${angle.prompt} dengan ${facing.prompt}. Kamera berjarak sekitar ${measuredDistance} m dari subjek pada ketinggian ${measuredHeight} m, menggunakan lensa ${measuredFocal} mm; sumbu kamera ${direction} sekitar ${measuredElevation}° dan mempertahankan ${subjectName} sebagai subjek utama di bidang gambar.`;
  return {
    subjectName,
    shotSize: shot.label,
    cameraAngle: angle.label,
    facing: facing.label,
    distance: measuredDistance,
    cameraHeight: measuredHeight,
    focal: measuredFocal,
    elevation: round(elevation),
    prompt,
  };
}
