'use strict';

const util = require('../util/util');
const ajax = require('../util/ajax');
const Evented = require('../util/evented');
const loadTileJSON = require('./load_tilejson');
const normalizeURL = require('../util/mapbox').normalizeTileURL;
const TileBounds = require('./tile_bounds');
const browser = require('../util/browser');
const DEMPyramid = require('../geo/dem_pyramid').DEMPyramid;

class RasterTerrainTileSource extends Evented {

    constructor(id, options, dispatcher, eventedParent) {
        super();
        this.id = id;
        this.dispatcher = dispatcher;
        this.setEventedParent(eventedParent);

        this.type = 'raster-terrain';
        this.minzoom = 0;
        this.maxzoom = 15;
        this.roundZoom = true;
        this.scheme = 'xyz';
        this.tileSize = 512;
        this._loaded = false;
        this.options = options;
        util.extend(this, util.pick(options, ['url', 'scheme', 'tileSize']));
    }

    load() {
        this.fire('dataloading', {dataType: 'source'});
        loadTileJSON(this.options, (err, tileJSON) => {
            if (err) {
                return this.fire('error', err);
            }
            util.extend(this, tileJSON);
            this.setBounds(tileJSON.bounds);


            // `content` is included here to prevent a race condition where `Style#_updateSources` is called
            // before the TileJSON arrives. this makes sure the tiles needed are loaded once TileJSON arrives
            // ref: https://github.com/mapbox/mapbox-gl-js/pull/4347#discussion_r104418088
            this.fire('data', {dataType: 'source', sourceDataType: 'metadata'});
            this.fire('data', {dataType: 'source', sourceDataType: 'content'});

        });
    }

    onAdd(map) {
        this.load();
        this.map = map;
    }

    setBounds(bounds) {
        this.bounds = bounds;
        if (bounds) {
            this.tileBounds = new TileBounds(bounds, this.minzoom, this.maxzoom);
        }
    }

    serialize() {
        return {
            type: 'raster',
            url: this.url,
            tileSize: this.tileSize,
            tiles: this.tiles,
            bounds: this.bounds,
        };
    }

    hasTile(coord) {
        return !this.tileBounds || this.tileBounds.contains(coord, this.maxzoom);
    }

    loadTile(tile, callback) {
        const url = normalizeURL(tile.coord.url(this.tiles, null, this.scheme), this.url, this.tileSize);

        tile.request = ajax.getImage(url, imageLoaded.bind(this));

        function imageLoaded(err, img) {
            delete tile.request;

            if (tile.aborted) {
                this.state = 'unloaded';
                return callback(null);
            }

            if (err) {
                this.state = 'errored';
                return callback(err);
            }

            if (this.map._refreshExpiredTiles) tile.setExpiryData(img);

            tile.rawImageData = {data: browser.getImageData(img), width: img.width, height: img.height};

            const overscaling = tile.coord.z > this.maxzoom ? Math.pow(2, tile.coord.z - this.maxzoom) : 1;

            const params = {
                uid: tile.uid,
                coord: tile.coord,
                zoom: tile.coord.z,
                tileSize: this.tileSize * overscaling,
                type: this.type,
                source: this.id,
                overscaling: overscaling,
                rawImageData: tile.rawImageData
            };

            if (!tile.workerID || tile.state === 'expired') {
                tile.workerID = this.dispatcher.send('loadTile', params, done.bind(this));
            } else if (tile.state === 'loading') {
                // schedule tile reloading after it has been loaded
                tile.reloadCallback = callback;
            } else {
                this.dispatcher.send('reloadTile', params, done.bind(this), tile.workerID);
            }

            delete img.cacheControl;
            delete img.expires;

        }

        function done(err, data) {
            if (err) {
                this.state = 'errored';
                callback(err);
            }

            if (data) {
                tile.dem = new DEMPyramid(tile.uid, null, data.levels);
                tile.state = 'loaded';
                callback(null);
            }

        }
    }

    abortTile(tile) {
        if (tile.request) {
            tile.request.abort();
            delete tile.request;
        }
    }

    unloadTile(tile) {
        if (tile.texture) this.map.painter.saveTileTexture(tile.texture);
    }
}

module.exports = RasterTerrainTileSource;