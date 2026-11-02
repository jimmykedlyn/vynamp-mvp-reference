// Teste unitário da preservação de metadados na exportação (#13).
// Execute: node tests/restore-metadata-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const M = require(path.resolve(__dirname, '..', 'restore-metadata.js'));
const Reader = require(path.resolve(__dirname, '..', 'media-metadata.js'));

let passed = 0;
const queue = [];
function test(name, fn) {
	queue.push({ name, fn });
}

// WAV float32 mínimo, como o exportado pelo Restore.
function wav(samples = [0.25, -0.5, 0.75]) {
	const data = new Float32Array(samples);
	const out = new Uint8Array(44 + data.byteLength);
	const v = new DataView(out.buffer);
	const ascii = (p, s) => { for (let i = 0; i < s.length; i++) out[p + i] = s.charCodeAt(i); };
	ascii(0, 'RIFF'); v.setUint32(4, 36 + data.byteLength, true); ascii(8, 'WAVE');
	ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 1, true);
	v.setUint32(24, 48000, true); v.setUint32(28, 192000, true); v.setUint16(32, 4, true); v.setUint16(34, 32, true);
	ascii(36, 'data'); v.setUint32(40, data.byteLength, true);
	out.set(new Uint8Array(data.buffer), 44);
	return out;
}

function chunks(buffer) {
	const b = new Uint8Array(buffer), v = new DataView(b.buffer);
	const list = [];
	for (let p = 12; p + 8 <= b.length;) {
		const id = String.fromCharCode(...b.subarray(p, p + 4)), len = v.getUint32(p + 4, true);
		list.push({ id, len, at: p, body: b.subarray(p + 8, p + 8 + len) });
		p += 8 + len + (len % 2);
	}
	return list;
}

// ID3v2.3 com TIT2/TPE1 em Latin-1 + um APIC fictício (deve sobreviver intacto).
function id3v23() {
	const frame = (id, body) => {
		const h = new Uint8Array(10);
		for (let i = 0; i < 4; i++) h[i] = id.charCodeAt(i);
		new DataView(h.buffer).setUint32(4, body.length);
		return [...h, ...body];
	};
	const text = s => [0, ...Buffer.from(s, 'latin1')];
	const body = [...frame('TIT2', text('Canção')), ...frame('TPE1', text('Artista X')), ...frame('APIC', [0, ...Buffer.from('image/png\0'), 3, 0, 1, 2, 3, 4])];
	const n = body.length;
	return new Uint8Array([73, 68, 51, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127, ...body]);
}

function blobFile(bytes, name) {
	const blob = new Blob([bytes]);
	return { name, size: blob.size, slice: (a, b) => blob.slice(a, b) };
}

test('embed grava LIST/INFO legível pelo leitor de tags do Vynamp', () => {
	const meta = M.merge(null, { title: 'Faixa 1', artist: 'Banda', album: 'LP', genre: 'Rock', trackNumber: 7 });
	const out = M.embed(wav(), meta);
	const parsed = Reader.parse(new Uint8Array(out));
	assert.deepEqual(parsed, { title: 'Faixa 1', artist: 'Banda', album: 'LP', genre: 'Rock', trackNumber: 7 });
});

test('embed mantém fmt e data byte a byte e corrige o tamanho RIFF', () => {
	const src = wav([0.1, 0.2, -0.3, 0.4]);
	const out = new Uint8Array(M.embed(src, M.merge(null, { title: 'X' })));
	assert.equal(new DataView(out.buffer).getUint32(4, true), out.length - 8);
	const list = chunks(out);
	assert.deepEqual(list.slice(0, 2).map(c => c.id), ['fmt ', 'data']);
	assert.deepEqual([...list[1].body], [...src.subarray(44)]);
	assert.deepEqual([...list[0].body], [...src.subarray(20, 36)]);
	const end = list[list.length - 1];
	assert.equal(end.at + 8 + end.len + (end.len % 2), out.length, 'chunks cobrem o arquivo inteiro');
});

test('embed sem metadados devolve o WAV inalterado', () => {
	const src = wav();
	const out = new Uint8Array(M.embed(src, M.merge(null, {})));
	assert.deepEqual([...out], [...src]);
	assert.equal(M.describe(M.merge(null, {})), 'Sem metadados na origem');
});

test('embed rejeita entrada que não é WAV', () => {
	assert.throws(() => M.embed(new Uint8Array(20), M.merge(null, { title: 'x' })), /WAV/);
});

test('ID3v2.3 de MP3 é preservado intacto no chunk id3 (inclui capa)', () => {
	const tag = id3v23();
	const mp3 = new Uint8Array([...tag, 0xff, 0xfb, 0x90, 0x00]);
	const meta = M.merge(M.extract(mp3), Reader.parse(mp3));
	assert.equal(meta.fields.title, 'Canção');
	const out = M.embed(wav(), meta);
	const id3 = chunks(out).find(c => c.id === 'id3 ');
	assert(id3, 'deve haver chunk id3');
	assert.deepEqual([...id3.body], [...tag]);
	assert.equal(Reader.parse(new Uint8Array(out)).title, 'Canção');
	assert.equal(M.describe(meta), 'Metadados preservados (INFO + ID3 original)');
});

test('sem ID3 na origem, sintetiza ID3v2.4 UTF-8 legível pelo leitor', () => {
	const meta = M.merge(null, { title: 'Ação — 日本', artist: 'Ñandú', trackNumber: '3/12' });
	const id3 = chunks(M.embed(wav(), meta)).find(c => c.id === 'id3 ');
	const parsed = Reader.parse(id3.body);
	assert.equal(parsed.title, 'Ação — 日本');
	assert.equal(parsed.artist, 'Ñandú');
	assert.equal(parsed.trackNumber, 3);
});

test('INFO acentuado relido sem mojibake (Latin-1 quando cabe, UTF-8 fora dele)', () => {
	const out = M.embed(wav(), M.merge(null, { title: 'Pérola', album: 'Coração' }));
	const meta = M.merge(M.extract(out), Reader.parse(new Uint8Array(out)));
	assert.equal(meta.fields.title, 'Pérola');
	assert.equal(meta.fields.album, 'Coração');
	assert.equal(Reader.parse(new Uint8Array(out)).title, 'Pérola', 'biblioteca do Vynamp lê Latin-1');
	const wide = M.embed(wav(), M.merge(null, { title: '日本 — Ação' }));
	assert.equal(M.extract(wide).fields.title, '日本 — Ação', 'fora do Latin-1 grava UTF-8');
});

test('WAV de origem: INFO desconhecido, id3 e XMP são carregados e regravados sem duplicar', () => {
	const first = M.embed(wav(), { ...M.merge(null, { title: 'A' }), info: { ICOP: '© 1978', IENG: 'Fulano' }, xmp: '<x:xmpmeta/>' });
	const meta = M.extract(first);
	assert.equal(meta.info.ICOP, '© 1978');
	assert.equal(meta.xmp, '<x:xmpmeta/>');
	assert(meta.id3, 'id3 sintetizado também vira origem');
	const again = chunks(M.embed(first, M.merge(meta, {})));
	assert.equal(again.filter(c => c.id === 'LIST').length, 1);
	assert.equal(again.filter(c => c.id === 'id3 ').length, 1);
	assert.equal(again.filter(c => c.id === '_PMX').length, 1);
	const info = M.extract(M.embed(first, M.merge(meta, {}))).info;
	assert.equal(info.IENG, 'Fulano');
	assert.equal(info.ISFT, M.SOFTWARE);
});

test('INFO Latin-1 legado (não UTF-8) é lido sem caractere de substituição', () => {
	const src = wav();
	const body = new Uint8Array([...Buffer.from('INFO'), ...Buffer.from('INAM'), 5, 0, 0, 0, ...Buffer.from('Caf\xe9\0', 'latin1'), 0]);
	const list = new Uint8Array([...Buffer.from('LIST'), body.length, 0, 0, 0, ...body]);
	const file = new Uint8Array([...src, ...list]);
	new DataView(file.buffer).setUint32(4, file.length - 8, true);
	assert.equal(M.extract(file).fields.title, 'Café');
});

test('normalizeFields limpa controles, descarta vazios e faixa inválida', () => {
	assert.deepEqual(M.normalizeFields({ title: '  a\x01b  ', artist: '', album: null, trackNumber: 0, genre: 'x'.repeat(2000) }), { title: 'a b', genre: 'x'.repeat(1024) });
	assert.deepEqual(M.normalizeFields(null), {});
});

test('tags truncadas não lançam erro', () => {
	const tag = id3v23().slice(0, 15);
	assert.equal(M.extract(tag).id3, null);
	assert.deepEqual(M.extract(new Uint8Array(3)).fields, {});
});

test('prepare lê ID3 de um File de MP3 e combina com o leitor', async () => {
	globalThis.VynampMediaMetadata = Reader;
	const file = blobFile(new Uint8Array([...id3v23(), 0xff, 0xfb, 0, 0]), 'a.mp3');
	const meta = await M.prepare(file);
	assert.equal(meta.fields.title, 'Canção');
	assert.equal(meta.fields.artist, 'Artista X');
	assert(meta.id3);
});

test('prepare acha metadados de WAV depois do bloco de áudio', async () => {
	globalThis.VynampMediaMetadata = Reader;
	const big = wav(new Array(40000).fill(0.1));
	const tagged = new Uint8Array(M.embed(big, M.merge(null, { title: 'Depois do áudio', artist: 'Ç' })));
	const meta = await M.prepare(blobFile(tagged, 'b.wav'));
	assert.equal(meta.fields.title, 'Depois do áudio');
	assert.equal(meta.fields.artist, 'Ç');
});

test('prepare sem File devolve metadados vazios', async () => {
	assert.equal(M.hasContent(await M.prepare(null)), false);
});

test('módulo expõe __factory não-enumerável', () => {
	assert.equal(typeof M.__factory, 'function');
	assert(!Object.keys(M).includes('__factory'));
});

(async () => {
	for (const { name, fn } of queue) {
		try {
			await fn();
			passed++;
			console.log(' ✓ ' + name);
		} catch (e) {
			console.error(' ✗ ' + name);
			console.error('   ' + e.message);
			process.exitCode = 1;
		}
	}
	console.log(`\n${passed} testes passaram.`);
	if (process.exitCode) process.exit(1);
})();
