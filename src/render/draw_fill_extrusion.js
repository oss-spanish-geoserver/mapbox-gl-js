// @flow

import DepthMode from '../gl/depth_mode';
import StencilMode from '../gl/stencil_mode';
import {
    fillExtrusionUniformValues,
    fillExtrusionPatternUniformValues,
} from './program/fill_extrusion_program';
import {prepareOffscreenFramebuffer, drawOffscreenTexture} from './offscreen';

import type Painter from './painter';
import type SourceCache from '../source/source_cache';
import type FillExtrusionStyleLayer from '../style/style_layer/fill_extrusion_style_layer';
import type FillExtrusionBucket from '../data/bucket/fill_extrusion_bucket';
import type {OverscaledTileID} from '../source/tile_id';

export default draw;

function draw(painter: Painter, source: SourceCache, layer: FillExtrusionStyleLayer, coords: Array<OverscaledTileID>) {
    if (layer.paint.get('fill-extrusion-opacity') === 0) {
        return;
    }

    if (painter.renderPass === 'offscreen') {
        prepareOffscreenFramebuffer(painter, layer);

        const depthMode = new DepthMode(painter.context.gl.LEQUAL, DepthMode.ReadWrite, [0, 1]),
            stencilMode = StencilMode.disabled,
            colorMode = painter.colorModeForRenderPass();

        drawExtrusionTiles(painter, source, layer, coords, depthMode, stencilMode, colorMode);

    } else if (painter.renderPass === 'translucent') {
        drawOffscreenTexture(painter, layer, layer.paint.get('fill-extrusion-opacity'));
    }
}

function drawExtrusionTiles(painter, source, layer, coords, depthMode, stencilMode, colorMode) {
    const context = painter.context;
    const gl = context.gl;

    const image = layer.paint.get('fill-extrusion-pattern');
    if (image) {
        if (painter.isPatternMissing(image)) return;

        context.activeTexture.set(gl.TEXTURE0);
        painter.imageManager.bind(context);
    }

    for (const coord of coords) {
        const tile = source.getTile(coord);
        const bucket: ?FillExtrusionBucket = (tile.getBucket(layer): any);
        if (!bucket) continue;

        const programConfiguration = bucket.programConfigurations.get(layer.id);
        const program = painter.useProgram(image ? 'fillExtrusionPattern' : 'fillExtrusion', programConfiguration);

        const matrix = painter.translatePosMatrix(
            coord.posMatrix,
            tile,
            layer.paint.get('fill-extrusion-translate'),
            layer.paint.get('fill-extrusion-translate-anchor'));

        const uniformValues = image ?
            fillExtrusionPatternUniformValues(matrix, painter, coord, image, tile) :
            fillExtrusionUniformValues(matrix, painter);

        program.draw(context, gl.TRIANGLES, depthMode, stencilMode, colorMode,
            uniformValues, layer.id, bucket.layoutVertexBuffer, bucket.indexBuffer,
            bucket.segments, layer.paint, painter.transform.zoom,
            programConfiguration);
    }
}
