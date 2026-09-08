// Unit test Fase 5 — struktur EBML muxer WebM dan seluruh fungsi murni ekspor.
//
// Muxer diuji dengan MEMBACA KEMBALI byte yang ditulis (parser EBML kecil di
// bawah), bukan dengan membandingkan hash: yang harus dijamin adalah strukturnya
// benar — TimestampScale, Duration, dimensi, jumlah SimpleBlock dan offset Cues
// yang benar-benar menunjuk awal cluster.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_MUXER_CODECS, WebMMuxer, concatBytes, sizeBytes, uintBytes, webmCodecId,
} from '../src/export/webm-muxer.js';
import {
  DETERMINISTIC_CODECS, UNAVAILABLE_FORMATS, bitrateFor, codecById, encoderConfig,
  h264CodecString, probeDeterministicCodecs, vp9CodecString,
} from '../src/export/encoder.js';
import {
  buildFileName, estimateBufferBytes, exportSize, formatBytes, resolveRange, sanitizeSegment,
} from '../src/export/export-service.js';
import {collectShots, csvCell, shotListCsv, shotListJson, storyboardFrames} from '../src/export/shot-list.js';
import {frameTimecode} from '../src/export/burn-in.js';

// ---------------------------------------------------------------------------
// Parser EBML minimal khusus test.
// ---------------------------------------------------------------------------
function readId(bytes, offset) {
  const first = bytes[offset];
  const length = first & 0x80 ? 1 : first & 0x40 ? 2 : first & 0x20 ? 3 : 4;
  let id = 0;
  for (let i = 0; i < length; i += 1) id = id * 256 + bytes[offset + i];
  return {id, length};
}
function readSize(bytes, offset) {
  const first = bytes[offset];
  let length = 0;
  for (let i = 0; i < 8; i += 1) {
    if (first & (0x80 >> i)) {length = i + 1; break;}
  }
  assert.ok(length > 0, 'panjang data size EBML tidak sah');
  let value = first & (0xff >> length);
  for (let i = 1; i < length; i += 1) value = value * 256 + bytes[offset + i];
  return {size: value, length};
}
/** Daftar elemen anak langsung pada rentang byte tertentu. */
function parseElements(bytes, start = 0, end = bytes.length) {
  const out = [];
  let offset = start;
  while (offset < end) {
    const id = readId(bytes, offset);
    const size = readSize(bytes, offset + id.length);
    const dataStart = offset + id.length + size.length;
    out.push({id: id.id, start: offset, dataStart, size: size.size, end: dataStart + size.size});
    offset = dataStart + size.size;
  }
  return out;
}
const findChild = (list, id) => list.find(el => el.id === id);
const childrenOf = (bytes, el) => parseElements(bytes, el.dataStart, el.end);
function readUint(bytes, el) {
  let value = 0;
  for (let i = el.dataStart; i < el.end; i += 1) value = value * 256 + bytes[i];
  return value;
}
function readFloat(bytes, el) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + el.dataStart, el.end - el.dataStart);
  return view.byteLength === 8 ? view.getFloat64(0) : view.getFloat32(0);
}
const readString = (bytes, el) => new TextDecoder().decode(bytes.subarray(el.dataStart, el.end));

const ID = {
  EBML: 0x1A45DFA3, Segment: 0x18538067, Info: 0x1549A966, Tracks: 0x1654AE6B,
  Cluster: 0x1F43B675, Cues: 0x1C53BB6B, TimestampScale: 0x2AD7B1, Duration: 0x4489,
  TrackEntry: 0xAE, CodecID: 0x86, CodecPrivate: 0x63A2, DefaultDuration: 0x23E383,
  Video: 0xE0, PixelWidth: 0xB0, PixelHeight: 0xBA, ClusterTime: 0xE7, SimpleBlock: 0xA3,
  CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7, CueTrack: 0xF7, CueClusterPosition: 0xF1,
  DocType: 0x4282,
};

/** Muxer berisi `frames` frame pada fps tertentu; keyframe setiap `keyEvery` frame. */
function muxFrames({frames = 300, fps = 30, width = 1280, height = 720, codec = 'vp09.00.31.08', keyEvery = 30, description} = {}) {
  const muxer = new WebMMuxer({width, height, codec, fps});
  for (let f = 0; f < frames; f += 1) {
    const meta = f === 0 && description ? {decoderConfig: {description}} : undefined;
    muxer.addChunk({
      timestamp: Math.round(f * 1e6 / fps),
      type: f % keyEvery === 0 ? 'key' : 'delta',
      data: new Uint8Array([f & 0xff, 0x11, 0x22]),
    }, meta);
  }
  return muxer;
}

test('EBML: uintBytes dan sizeBytes menulis panjang minimal yang sah', () => {
  assert.deepEqual([...uintBytes(0)], [0x00]);
  assert.deepEqual([...uintBytes(255)], [0xff]);
  assert.deepEqual([...uintBytes(256)], [0x01, 0x00]);
  assert.deepEqual([...uintBytes(1000000)], [0x0f, 0x42, 0x40]);
  // 0 sampai 126 muat dalam satu byte; 127 adalah penanda "ukuran tidak diketahui".
  assert.deepEqual([...sizeBytes(0)], [0x80]);
  assert.deepEqual([...sizeBytes(126)], [0xfe]);
  assert.equal(sizeBytes(127).length, 2);
  assert.equal(sizeBytes(1 << 20).length, 3);
  assert.throws(() => sizeBytes(2 ** 56), RangeError);
  assert.deepEqual([...concatBytes([Uint8Array.of(1, 2), Uint8Array.of(3)])], [1, 2, 3]);
});

test('CodecID Matroska dipetakan dari codec string WebCodecs', () => {
  assert.equal(webmCodecId('vp09.00.31.08'), 'V_VP9');
  assert.equal(webmCodecId('vp8'), 'V_VP8');
  assert.equal(webmCodecId('av01.0.04M.08'), 'V_AV1');
  assert.equal(webmCodecId('avc1.640028'), 'V_MPEG4/ISO/AVC');
  assert.equal(webmCodecId('bogus.1'), null);
  assert.throws(() => new WebMMuxer({width: 64, height: 64, codec: 'bogus.1', fps: 30}), /tidak dapat dibungkus/);
  assert.deepEqual(SUPPORTED_MUXER_CODECS, ['vp9', 'vp8', 'av1', 'h264']);
});

test('muxer menolak dimensi dan fps tidak sah, serta berkas tanpa frame', () => {
  assert.throws(() => new WebMMuxer({width: 0, height: 720, codec: 'vp8', fps: 30}), RangeError);
  assert.throws(() => new WebMMuxer({width: 1280, height: 720, codec: 'vp8', fps: 0}), RangeError);
  const empty = new WebMMuxer({width: 1280, height: 720, codec: 'vp8', fps: 30});
  assert.throws(() => empty.finalizeBytes(), /Tidak ada frame/);
});

test('10 detik × 30 fps menghasilkan 300 frame, durasi 10.000 ms dan header WebM yang sah', () => {
  const muxer = muxFrames({frames: 300, fps: 30});
  assert.equal(muxer.chunkCount, 300);
  const bytes = muxer.finalizeBytes();
  const top = parseElements(bytes);
  assert.equal(top.length, 2);
  assert.equal(top[0].id, ID.EBML);
  assert.equal(top[1].id, ID.Segment);
  assert.equal(readString(bytes, findChild(childrenOf(bytes, top[0]), ID.DocType)), 'webm');

  const segment = childrenOf(bytes, top[1]);
  const info = childrenOf(bytes, findChild(segment, ID.Info));
  assert.equal(readUint(bytes, findChild(info, ID.TimestampScale)), 1000000, 'TimestampScale wajib 1 ms');
  // Frame terakhir 9 966 667 µs + 33 333 µs = 10 000 000 µs = 10,000 detik.
  assert.ok(Math.abs(readFloat(bytes, findChild(info, ID.Duration)) - 10000) < 0.001);
});

test('Tracks membawa CodecID, dimensi dan DefaultDuration; CodecPrivate hanya bila ada', () => {
  const plain = muxFrames({frames: 30, fps: 24, width: 1920, height: 1080, codec: 'vp09.00.41.08'});
  let bytes = plain.finalizeBytes();
  let segment = childrenOf(bytes, parseElements(bytes)[1]);
  let entry = childrenOf(bytes, findChild(childrenOf(bytes, findChild(segment, ID.Tracks)), ID.TrackEntry));
  assert.equal(readString(bytes, findChild(entry, ID.CodecID)), 'V_VP9');
  assert.equal(readUint(bytes, findChild(entry, ID.DefaultDuration)), Math.round(1e9 / 24));
  const video = childrenOf(bytes, findChild(entry, ID.Video));
  assert.equal(readUint(bytes, findChild(video, ID.PixelWidth)), 1920);
  assert.equal(readUint(bytes, findChild(video, ID.PixelHeight)), 1080);
  assert.equal(findChild(entry, ID.CodecPrivate), undefined, 'VP9 tidak memberi decoderConfig.description');

  // H.264: `avcC` dari metadata encoder wajib ditulis sebagai CodecPrivate,
  // kalau tidak berkas tidak dapat di-decode sama sekali.
  const avcC = Uint8Array.from([1, 100, 0, 40, 255, 225, 0, 5]);
  const h264 = muxFrames({frames: 10, fps: 30, codec: 'avc1.640028', description: avcC});
  bytes = h264.finalizeBytes();
  segment = childrenOf(bytes, parseElements(bytes)[1]);
  entry = childrenOf(bytes, findChild(childrenOf(bytes, findChild(segment, ID.Tracks)), ID.TrackEntry));
  assert.equal(readString(bytes, findChild(entry, ID.CodecID)), 'V_MPEG4/ISO/AVC');
  assert.deepEqual([...bytes.subarray(findChild(entry, ID.CodecPrivate).dataStart, findChild(entry, ID.CodecPrivate).end)], [...avcC]);
});

test('cluster dibuka pada setiap keyframe dan seluruh SimpleBlock tercatat sekali', () => {
  const muxer = muxFrames({frames: 300, fps: 30, keyEvery: 30});
  const bytes = muxer.finalizeBytes();
  const segment = childrenOf(bytes, parseElements(bytes)[1]);
  const clusters = segment.filter(el => el.id === ID.Cluster);
  assert.equal(clusters.length, 10, '300 frame dengan keyframe tiap 30 frame = 10 cluster');
  let blocks = 0;
  let keys = 0;
  clusters.forEach((cluster, index) => {
    const children = childrenOf(bytes, cluster);
    assert.equal(readUint(bytes, findChild(children, ID.ClusterTime)), Math.round(index * 1000));
    for (const block of children.filter(el => el.id === ID.SimpleBlock)) {
      blocks += 1;
      assert.equal(bytes[block.dataStart], 0x81, 'nomor track pada SimpleBlock harus 1');
      const relative = new DataView(bytes.buffer, bytes.byteOffset + block.dataStart + 1, 2).getInt16(0);
      assert.ok(relative >= 0 && relative < 1000);
      if (bytes[block.dataStart + 3] & 0x80) keys += 1;
    }
  });
  assert.equal(blocks, 300, 'jumlah SimpleBlock harus sama dengan jumlah frame');
  assert.equal(keys, 10);
});

test('Cues menunjuk offset yang benar-benar merupakan awal cluster', () => {
  const muxer = muxFrames({frames: 120, fps: 24, keyEvery: 24});
  const bytes = muxer.finalizeBytes();
  const segmentEl = parseElements(bytes)[1];
  const segment = childrenOf(bytes, segmentEl);
  const clusters = segment.filter(el => el.id === ID.Cluster);
  const cues = childrenOf(bytes, findChild(segment, ID.Cues)).filter(el => el.id === ID.CuePoint);
  assert.equal(cues.length, clusters.length);
  cues.forEach((cue, index) => {
    const children = childrenOf(bytes, cue);
    assert.equal(readUint(bytes, findChild(children, ID.CueTime)), Math.round(index * 1000));
    const positions = childrenOf(bytes, findChild(children, ID.CueTrackPositions));
    assert.equal(readUint(bytes, findChild(positions, ID.CueTrack)), 1);
    const offset = readUint(bytes, findChild(positions, ID.CueClusterPosition));
    // Offset relatif terhadap awal DATA Segment; harus mendarat tepat pada ID Cluster.
    assert.equal(segmentEl.dataStart + offset, clusters[index].start,
      `CueClusterPosition #${index} tidak menunjuk awal cluster`);
  });
});

test('cluster dipecah bila jarak timestamp melewati batas int16 SimpleBlock', () => {
  const muxer = new WebMMuxer({width: 320, height: 240, codec: 'vp8', fps: 1});
  // Satu keyframe di awal lalu delta selama 120 detik: tanpa pemecahan, offset
  // relatif akan melewati 32 767 ms dan blok menjadi rusak diam-diam.
  for (let f = 0; f < 120; f += 1) {
    muxer.addChunk({timestamp: f * 1_000_000, type: f === 0 ? 'key' : 'delta', data: Uint8Array.of(f)});
  }
  const bytes = muxer.finalizeBytes();
  const clusters = childrenOf(bytes, parseElements(bytes)[1]).filter(el => el.id === ID.Cluster);
  assert.ok(clusters.length > 1, 'cluster panjang harus dipecah');
  for (const cluster of clusters) {
    for (const block of childrenOf(bytes, cluster).filter(el => el.id === ID.SimpleBlock)) {
      const relative = new DataView(bytes.buffer, bytes.byteOffset + block.dataStart + 1, 2).getInt16(0);
      assert.ok(relative >= 0 && relative <= 32767, 'offset SimpleBlock tetap dalam jangkauan int16');
    }
  }
});

test('discard membuang buffer dan menutup muxer', () => {
  const muxer = muxFrames({frames: 5, fps: 25});
  assert.equal(muxer.payloadBytes, 15);
  muxer.discard();
  assert.equal(muxer.chunkCount, 0);
  assert.throws(() => muxer.addChunk({timestamp: 0, type: 'key', data: Uint8Array.of(1)}), /sudah difinalisasi/);
});

// ---------------------------------------------------------------------------
// Pemilihan codec
// ---------------------------------------------------------------------------
test('codec string H.264 dan VP9 dipilih dari resolusi, bukan di-hardcode', () => {
  // Spike §2: avc1.42E01E (Baseline L3.0) gagal di 720p30 — level harus ikut resolusi.
  assert.equal(h264CodecString(1280, 720), 'avc1.640028');
  assert.equal(h264CodecString(1920, 1080), 'avc1.640028');
  assert.equal(h264CodecString(3840, 2160), 'avc1.640033');
  assert.equal(vp9CodecString(1280, 720), 'vp09.00.31.08');
  assert.equal(vp9CodecString(1920, 1080), 'vp09.00.41.08');
  assert.equal(bitrateFor(1280, 720, 30), 3317760);
  assert.equal(codecById('vp9').container, 'webm');
  assert.equal(codecById('tidak-ada'), null);
  // MP4 harus muncul sebagai "belum tersedia" dengan alasan, bukan hilang diam-diam.
  assert.equal(UNAVAILABLE_FORMATS.length, 1);
  assert.match(UNAVAILABLE_FORMATS[0].label, /belum tersedia/i);
  assert.match(UNAVAILABLE_FORMATS[0].reason, /mp4-muxer/);
});

test('konfigurasi encoder tidak pernah meminta hardware acceleration', () => {
  const config = encoderConfig({codecString: 'vp09.00.31.08', width: 1280, height: 720, fps: 30});
  // Spike §2: `prefer-hardware` ditolak seluruh codec di mesin referensi.
  assert.equal('hardwareAcceleration' in config, false);
  assert.equal(config.latencyMode, 'quality');
  assert.equal(config.framerate, 30);
});

test('probe codec memakai isConfigSupported dan tidak melempar untuk browser tanpa WebCodecs', async () => {
  assert.deepEqual(await probeDeterministicCodecs({width: 1280, height: 720, fps: 30, scope: {}}), []);
  const asked = [];
  const scope = {
    VideoEncoder: class {
      static async isConfigSupported(config) {
        asked.push(config.codec);
        if (config.codec.startsWith('vp09')) return {supported: false};
        if (config.codec === 'vp8') return {supported: true};
        throw new Error('meledak');
      }
    },
  };
  const rows = await probeDeterministicCodecs({width: 1280, height: 720, fps: 30, scope});
  assert.equal(rows.length, DETERMINISTIC_CODECS.length);
  assert.equal(asked[0], 'vp09.00.31.08');
  assert.equal(rows.find(r => r.id === 'vp9').supported, false);
  assert.equal(rows.find(r => r.id === 'vp8').supported, true);
  assert.equal(rows.find(r => r.id === 'av1').supported, false, 'error probe tidak boleh dianggap didukung');
  assert.match(rows.find(r => r.id === 'av1').reason, /meledak/);
});

// ---------------------------------------------------------------------------
// Penamaan berkas, rentang dan ukuran (EX-01)
// ---------------------------------------------------------------------------
test('nama berkas EX-01 memakai proyek_scene_shot dan disanitasi', () => {
  assert.equal(sanitizeSegment('  Proyek Ünïk!! '), 'Proyek-Unik');
  assert.equal(sanitizeSegment('../../etc/passwd'), 'etc-passwd');
  assert.equal(sanitizeSegment('   '), 'tanpa-nama');
  assert.equal(sanitizeSegment('x'.repeat(80)).length, 40);
  assert.equal(buildFileName({project: 'Rumah Kaca', scene: 'Scene 01', shot: 'Shot 02'}),
    'Rumah-Kaca_Scene-01_Shot-02.webm');
  // F5-05: jalur real-time selalu ditandai pada nama berkas.
  assert.equal(buildFileName({project: 'A', scene: 'B', shot: 'C', extension: 'mp4', realtime: true}), 'A_B_C_realtime.mp4');
  assert.equal(buildFileName({project: '', scene: '', shot: '', suffix: 'tengah-f15', extension: 'png'}),
    'proyek_scene_shot_tengah-f15.png');
});

test('resolusi ekspor mengikuti aspect ratio shot dan selalu genap', () => {
  assert.deepEqual(exportSize('16:9', '720p'), {width: 1280, height: 720});
  assert.deepEqual(exportSize('16:9', '1080p'), {width: 1920, height: 1080});
  assert.deepEqual(exportSize('9:16', '1080p'), {width: 1080, height: 1920});
  assert.deepEqual(exportSize('1:1', '720p'), {width: 720, height: 720});
  for (const ratio of ['16:9', '9:16', '2.39:1', '4:3', '1:1']) {
    for (const preset of ['720p', '1080p']) {
      const size = exportSize(ratio, preset);
      // H.264 menolak dimensi ganjil (spike §9).
      assert.equal(size.width % 2, 0);
      assert.equal(size.height % 2, 0);
    }
  }
});

test('rentang frame: seluruh shot, rentang parsial, clamp dan penolakan yang jelas', () => {
  const all = resolveRange({duration: 10, fps: 30});
  assert.deepEqual([all.startFrame, all.endFrame, all.frameCount, all.totalFrames], [0, 299, 300, 300]);
  assert.equal(all.clamped, false);

  const frames = resolveRange({duration: 10, fps: 30, range: {mode: 'frames', start: 30, end: 59}});
  assert.equal(frames.frameCount, 30);
  const seconds = resolveRange({duration: 10, fps: 30, range: {mode: 'seconds', start: 0, end: 10}});
  assert.equal(seconds.frameCount, 300, '0–10 detik pada 30 fps tepat 300 frame');
  assert.equal(resolveRange({duration: 10, fps: 30, range: {mode: 'seconds', start: 2, end: 4}}).frameCount, 60);

  const clamped = resolveRange({duration: 10, fps: 30, range: {mode: 'frames', start: -5, end: 900}});
  assert.equal(clamped.frameCount, 300);
  assert.equal(clamped.clamped, true);
  assert.match(clamped.notice, /frame 0.*frame 299/s);

  assert.throws(() => resolveRange({duration: 10, fps: 30, range: {mode: 'frames', start: 10, end: 9}}), /kosong/);
  assert.throws(() => resolveRange({duration: 10, fps: 30, range: {mode: 'frames', start: 400, end: 500}}), /melewati akhir shot/);
  assert.throws(() => resolveRange({duration: 0, fps: 30}), /Durasi shot/);
  assert.throws(() => resolveRange({duration: 10, fps: 0}), /fps/);
  assert.throws(() => resolveRange({duration: 10, fps: 30, range: {mode: 'frames', start: NaN, end: 5}}), /bukan angka/);
});

test('perkiraan ukuran dan format byte', () => {
  assert.equal(estimateBufferBytes({width: 1280, height: 720, fps: 30, frameCount: 300}), 4147200);
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

// ---------------------------------------------------------------------------
// Shot list, storyboard dan burn-in (EX-03)
// ---------------------------------------------------------------------------
const demoDoc = {
  id: 'p1', title: 'Rumah, Kaca', scenes: [
    {
      id: 's2', name: 'Scene 02', order: 1, actors: [{id: 'a1'}],
      shots: [{id: 'sh3', name: 'Shot 03', order: 0, duration: 4, fps: 25, aspectRatio: '9:16', notes: 'catatan, koma', camera: {focal: 35}}],
    },
    {
      id: 's1', name: 'Scene 01', order: 0, actors: [{id: 'a1'}, {id: 'a2'}],
      shots: [
        {id: 'sh2', name: 'Shot 02', order: 1, duration: 6, fps: 30, aspectRatio: '16:9', notes: '', camera: null},
        {id: 'sh1', name: 'Shot 01', order: 0, duration: 10, fps: 30, aspectRatio: '16:9', notes: 'buka pintu', camera: {focal: 50}},
      ],
    },
  ],
};

test('shot list mengurutkan scene lalu shot dan menandai shot tanpa kamera', () => {
  const rows = collectShots(demoDoc);
  assert.deepEqual(rows.map(r => r.shotName), ['Shot 01', 'Shot 02', 'Shot 03']);
  assert.deepEqual(rows.map(r => r.sceneName), ['Scene 01', 'Scene 01', 'Scene 02']);
  assert.equal(rows[0].frames, 300);
  assert.equal(rows[0].focalMm, 50);
  assert.equal(rows[1].hasCamera, false);
  assert.equal(rows[2].frames, 100);
  assert.equal(rows[2].actors, 1);
});

test('shot list CSV meng-escape koma dan JSON memuat seluruh shot', () => {
  const rows = collectShots(demoDoc);
  const csv = shotListCsv(rows);
  assert.ok(csv.startsWith('﻿'), 'BOM UTF-8 supaya Excel membaca dengan benar');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /"buka pintu"|buka pintu/);
  assert.match(lines[3], /"catatan, koma"/);
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(true), 'ya');
  assert.equal(csvCell(null), '');
  const json = JSON.parse(shotListJson(demoDoc, rows));
  assert.equal(json.shotCount, 3);
  assert.equal(json.project, 'Rumah, Kaca');
});

test('storyboard mengambil frame awal, tengah dan akhir yang benar-benar ada', () => {
  assert.deepEqual(storyboardFrames({duration: 10, fps: 30}).map(f => f.frame), [0, 149, 299]);
  assert.deepEqual(storyboardFrames({duration: 1, fps: 24}).map(f => f.frame), [0, 11, 23]);
  // Frame akhir tidak boleh sama dengan `duration × fps` (di luar rentang render).
  assert.equal(storyboardFrames({duration: 10, fps: 30}).at(-1).time, 299 / 30);
});

test('timecode burn-in memakai MM:SS:FF pada fps shot', () => {
  assert.equal(frameTimecode(0, 30), '00:00:00');
  assert.equal(frameTimecode(299, 30), '00:09:29');
  assert.equal(frameTimecode(24, 24), '00:01:00');
});
