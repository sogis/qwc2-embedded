import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';

const embed = new URL('/api/embed/v2/index.html', process.env.EMBED_ORIGIN ?? 'http://localhost:8080');

test('Die Embed-Seite zeichnet Live-WMTS und dynamische SO!GIS-Ebenen', async t => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({viewport: {width: 600, height: 390}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const unexpected = [];
    page.on('request', request => {
        if (new URL(request.url()).origin !== embed.origin) unexpected.push(request.url());
    });
    const orthophoto = page.waitForResponse(response => response.ok() && response.url().includes('/ch.so.agi.hintergrundkarte_ortho/'));
    const mapImage = page.waitForResponse(response => response.ok() && response.url().includes('/ows/somap?'));
    const weblayers = page.waitForResponse(response => response.ok() && response.url().includes('/weblayers?'));
    const url = new URL(embed);
    url.search = new URLSearchParams({bl: 'ch.so.agi.hintergrundkarte_ortho', l: 'ch.so.agi.av.grundstuecke', c: '2607739,1228426', s: '2000'});
    await page.goto(url.href);
    const [tile, map, layers] = await Promise.all([orthophoto, mapImage, weblayers]);
    for (const response of [tile, map]) {
        const image = await response.body();
        const signature = image.subarray(0, 8).toString('hex');
        assert.ok(signature === '89504e470d0a1a0a' || signature.startsWith('ffd8ff'), signature);
    }
    assert.equal(new URL(map.url()).searchParams.get('LAYERS'), 'ch.so.agi.av.grundstuecke');
    assert.ok((await layers.json())['ch.so.agi.av.grundstuecke'].length);
    await page.waitForFunction(() => {
        const canvas = document.querySelector('.ol-layer canvas');
        return canvas?.getContext('2d').getImageData(300, 195, 1, 1).data[3] === 255;
    });
    assert.equal(new URL(page.url()).pathname, embed.pathname);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
});

test('Der Embed-Prefix gewährt nur Zugriff auf freigegebene Lese-Endpunkte', async () => {
    const cases = [
        ['../v1/index.html', 404],
        ['%2e%2e/%2e%2e/map/config.json', 404],
        ['api/v1/landreg/', 404],
        ['https://example.org/', 404],
        ['ows/somap?REQUEST=GetMap&MAP=other', 400],
        ['ows/somap?REQUEST=GetCapabilities', 400],
        ['ows/somap?REQUEST=GetMap&request=GetMap', 400],
        ['api/v1/featureinfo/somap?request=GetFeatureInfo&filter=other', 400],
        ['config.json', 405, 'POST']
    ];
    for (const [path, status, method] of cases) {
        const response = await fetch(new URL('/api/embed/v2/' + path, embed), {method, redirect: 'manual'});
        assert.equal(response.status, status, path);
    }
});
