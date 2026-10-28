const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDownloadId, isKnownDownloadFolder } = require('../services/downloadRouting.ts');

const seriesId = 'saimo|s|B|B%20Daman%20Crossfire|2011';
const episodeId = `${seriesId}|e|1|1`;

test('preserves canonical persisted IDs', () => {
    assert.equal(resolveDownloadId(seriesId, [seriesId]), seriesId);
});

test('resolves the B-Daman series route after Router decoding', () => {
    assert.equal(resolveDownloadId(decodeURIComponent(seriesId), [seriesId, seriesId]), seriesId);
});

test('resolves episode IDs for offline playback and progress', () => {
    assert.equal(resolveDownloadId(decodeURIComponent(episodeId), [episodeId]), episodeId);
});

test('handles Unicode, percent signs, hashes and encoded separators', () => {
    for (const title of ['Ação e emoção', '#blackAF', '100% certo', 'A/B | C', 'Literal %20']) {
        const id = `saimo|s|A|${encodeURIComponent(title)}|2026`;
        assert.equal(resolveDownloadId(decodeURIComponent(id), [id]), id);
    }
});

test('accepts array route params and empty collections during hydration', () => {
    assert.equal(resolveDownloadId([decodeURIComponent(seriesId)], [seriesId]), seriesId);
    assert.equal(resolveDownloadId(seriesId, []), undefined);
    assert.equal(resolveDownloadId(undefined, [seriesId]), undefined);
    assert.equal(resolveDownloadId([], [seriesId]), undefined);
});

test('does not throw on malformed persisted encodings', () => {
    assert.equal(resolveDownloadId('unknown', ['bad%id']), undefined);
    assert.equal(resolveDownloadId('bad%id', ['bad%id']), 'bad%id');
});

test('prefers exact matches and rejects ambiguous fallback matches', () => {
    assert.equal(resolveDownloadId('A B', ['A B', 'A%20B']), 'A B');
    assert.equal(resolveDownloadId('A/B', ['A%2fB', 'A%2FB']), undefined);
});

test('orphan cleanup preserves decoded B-Daman folders', () => {
    assert.equal(isKnownDownloadFolder(decodeURIComponent(seriesId), [seriesId]), true);
    assert.equal(isKnownDownloadFolder(seriesId, [seriesId]), true);
    assert.equal(isKnownDownloadFolder('unrelated', [seriesId]), false);
});

test('orphan cleanup protects ambiguous and legacy nested folders', () => {
    assert.equal(isKnownDownloadFolder('A', ['A%2fB', 'A%2FB']), true);
    assert.equal(isKnownDownloadFolder('100% certo', ['100%25%20certo']), true);
    assert.equal(isKnownDownloadFolder('bad%id', ['bad%id']), true);
});
