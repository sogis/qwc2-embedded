import axios from 'axios';
import React from 'react';
import {createRoot} from 'react-dom/client';
import StandardApp from 'qwc2-lts/components/StandardApp';
import Identify from 'qwc2-lts/plugins/Identify';
import MapPlugin from 'qwc2-lts/plugins/Map';
import locale from 'qwc2-lts/static/translations/de-CH.json';
import ConfigUtils from 'qwc2-lts/utils/ConfigUtils';
import {LayerRole} from 'qwc2-lts/actions/layers';
import LayerUtils from 'qwc2-lts/utils/LayerUtils';
import './icons/build/qwc2-icons.css';
import './viewer.css';

const mapKeys = ['bl', 'l', 'c', 's'];
const incoming = new URLSearchParams(location.search);
const initial = new URLSearchParams();
for (const key of mapKeys) {
    if (incoming.has(key)) initial.set(key, incoming.get(key));
}
const background = initial.get('bl')?.replace(/^ch\.so\.agi\./, '');
initial.set('bl', background || 'hintergrundkarte_sw');
if (!initial.get('c')) initial.set('c', '2616500,1237000');
if (!initial.get('s')) initial.set('s', '378000');
history.replaceState(history.state, '', '?' + initial);

const fullMap = document.getElementById('full-map');
function updateFullMap() {
    const current = new URLSearchParams(location.search);
    const target = new URL('https://geo.so.ch/map/');
    for (const key of mapKeys) {
        const value = current.get(key) ?? initial.get(key);
        if (value) target.searchParams.set(key, value);
    }
    fullMap.href = target.href;
}
updateFullMap();
fullMap.addEventListener('click', updateFullMap);

axios.interceptors.response.use(undefined, error => {
    if (['config.json', 'themes.json'].includes(error.config?.url)) {
        document.getElementById('loading').textContent = 'Die Kartenkonfiguration von SO!GIS konnte nicht geladen werden.';
    }
    return Promise.reject(error);
});

// The public SO!GIS weblayers endpoint maps URL names to QGIS layer definitions.
function themeLayerRestorer(missingLayers, theme, callback) {
    const service = ConfigUtils.getConfigProp('dataproductServiceUrl');
    axios.get(service + 'weblayers', {params: {filter: missingLayers.join(',')}}).then(({data}) => {
        const layerNames = Object.fromEntries(Object.entries(data).map(([name, sublayers]) =>
            [name, LayerUtils.getSublayerNames({sublayers})]));
        callback(Object.values(data).flat().filter(layer => Object.keys(layer).length), layerNames);
    }, () => callback([], null));
}

function externalLayerRestorer(externalLayers, themes, callback) {
    for (const [resource, layers] of Object.entries(externalLayers)) {
        if (!resource.startsWith('wms:')) continue;
        const endpoint = resource.slice('wms:'.length);
        const service = URL.parse(endpoint);
        if (!service || !['http:', 'https:'].includes(service.protocol) || service.username || service.password || endpoint.includes('&')) continue;
        for (const layer of layers) {
            callback(layer.id, {
                ...layer,
                type: 'wms',
                url: endpoint,
                role: LayerRole.USERLAYER,
                version: '1.3.0',
                params: {LAYERS: layer.name},
                queryable: false
            });
        }
    }
}

createRoot(document.getElementById('container')).render(<StandardApp appConfig={{
    defaultLocaleData: locale,
    pluginsDef: {plugins: {MapPlugin: MapPlugin({}), IdentifyPlugin: Identify}, cfg: {}},
    themeLayerRestorer,
    externalLayerRestorer
}} />);
