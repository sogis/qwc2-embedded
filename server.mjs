import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {pipeline} from 'node:stream/promises';

const prefix = '/api/embed/v2/';
const geo = 'https://geo.so.ch';
const dataproductPath = 'api/dataproduct/v1/';
const documentPath = 'api/v1/document/';
const mapPath = 'ows/somap';
const identifyPath = 'api/v1/featureinfo/somap';
const backgrounds = new Set(['hintergrundkarte_sw', 'hintergrundkarte_farbig', 'hintergrundkarte_ortho']);
const tiles = /^api\/wmts\/1\.0\.0\/ch\.so\.agi\.hintergrundkarte_(?:sw|farbig|ortho)\/default\/2056\/\d+\/\d+\/\d+\.png$/;
const mapQuery = new Set('service request version layers styles format transparent width height bbox crs srs dpi format_options map_resolution opacities tiled __t'.split(' '));
const identifyQuery = new Set([...mapQuery, ...'query_layers info_format i j x y feature_count radius fi_line_tolerance fi_point_tolerance fi_polygon_tolerance with_geometry with_maptip with_htmlcontent with_displayname id filter'.split(' ')]);
const staticFiles = {
    'index.html': ['index.html', 'text/html; charset=utf-8'],
    'viewer.js': ['dist/viewer.js', 'text/javascript'],
    'viewer.css': ['dist/viewer.css', 'text/css']
};

function configForEmbed(config) {
    const identify = config.plugins.desktop.find(plugin => plugin.name === 'Identify');
    const plugins = [{name: 'Map'}, {
        ...identify,
        cfg: {
            ...identify.cfg,
            clearResultsOnClose: true,
            geometry: {initialHeight: 220, initialWidth: 320, initialX: 0, initialY: 0}
        }
    }];
    for (const key of Object.keys(config)) {
        if (key.endsWith('Service') || key.endsWith('ServiceUrl')) delete config[key];
    }
    return {
        ...config,
        plugins: {desktop: plugins, mobile: plugins},
        assetsPath: prefix + 'assets',
        translationsPath: prefix + 'translations',
        dataproductServiceUrl: prefix + dataproductPath,
        documentServiceUrl: geo + '/' + documentPath,
        username: null,
        user_infos: {},
        allowFractionalZoom: true
    };
}

function themesForEmbed({themes}) {
    const theme = themes.items.find(item => item.id === themes.defaultTheme);
    if (theme.url !== '/' + mapPath || theme.featureInfoUrl !== '/' + identifyPath) {
        throw new Error('Unexpected SO!GIS theme service URLs');
    }
    theme.url = prefix + mapPath;
    theme.featureInfoUrl = prefix + identifyPath;
    delete theme.editConfigUrl;
    theme.bbox.bounds = [2420000, 1030000, 2900000, 1350000];
    themes.items = [theme];
    themes.subdirs = [];
    themes.backgroundLayers = themes.backgroundLayers.filter(layer => backgrounds.has(layer.name));
    for (const layer of themes.backgroundLayers) {
        const expectedPath = `api/wmts/1.0.0/ch.so.agi.${layer.name}/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png`;
        if (layer.url !== geo + '/' + expectedPath || layer.tileMatrixSet !== '2056') {
            throw new Error('Unexpected SO!GIS WMTS URL or tile matrix set');
        }
        layer.url = prefix + expectedPath;
    }
    if (themes.backgroundLayers.length !== backgrounds.size) throw new Error('Missing SO!GIS background layers');
    return {themes};
}

function serviceQuery(route, parameters) {
    if (tiles.test(route)) return parameters.size ? null : '';
    if (route === dataproductPath + 'weblayers') {
        return parameters.size === 1 && parameters.get('filter') ? '?' + parameters : null;
    }
    const allowed = route === mapPath ? mapQuery : identifyQuery;
    const request = route === mapPath ? 'getmap' : 'getfeatureinfo';
    const seen = new Set();
    for (const [key, value] of parameters) {
        const name = key.toLowerCase();
        if (!allowed.has(name) || seen.has(name)) return null;
        if (name === 'request' && value.toLowerCase() !== request) return null;
        if (name === 'id' && value !== 'default') return null;
        if (name === 'filter' && value) return null;
        seen.add(name);
    }
    return seen.has('request') ? '?' + parameters : null;
}

async function upstream(path) {
    return fetch(geo + '/' + path, {redirect: 'error', signal: AbortSignal.timeout(20_000)});
}

createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith(prefix)) return res.writeHead(404).end();
        if (req.method !== 'GET') return res.writeHead(405, {Allow: 'GET'}).end();
        const route = url.pathname.slice(prefix.length);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (Object.hasOwn(staticFiles, route)) {
            const [file, contentType] = staticFiles[route];
            res.setHeader('Content-Type', contentType);
            return await pipeline(createReadStream(new URL(file, import.meta.url)), res);
        }
        if (route === 'config.json' || route === 'themes.json') {
            const source = await upstream('map/' + route);
            if (!source.ok) throw new Error(`SO!GIS returned HTTP ${source.status} for ${route}`);
            const data = await source.json();
            const config = route === 'config.json' ? configForEmbed(data) : themesForEmbed(data);
            return res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(config));
        }
        if (route !== mapPath && route !== identifyPath && route !== dataproductPath + 'weblayers' && !tiles.test(route)) {
            return res.writeHead(404).end();
        }
        const query = serviceQuery(route, url.searchParams);
        if (query === null) return res.writeHead(400).end();
        const source = await upstream(route + query);
        res.writeHead(source.status, {'Content-Type': source.headers.get('content-type') || 'application/octet-stream'});
        await pipeline(source.body, res);
    } catch (error) {
        if (res.destroyed) return;
        console.error(error);
        if (res.headersSent) return res.destroy();
        res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'}).end('SO!GIS ist vorübergehend nicht verfügbar.');
    }
}).listen(Number(process.env.PORT ?? 8080));
