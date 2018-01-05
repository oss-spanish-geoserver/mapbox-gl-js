// @flow

const {patternUniforms} = require('./pattern');
const {
    Uniform1i,
    Uniform1f,
    Uniform2fv,
    Uniform3fv,
    UniformMatrix4fv,
    Uniforms
} = require('../uniform_binding');

const glMatrix = require('@mapbox/gl-matrix');
const mat3 = glMatrix.mat3;
const mat4 = glMatrix.mat4;
const vec3 = glMatrix.vec3;
const pattern = require('../pattern');
const util = require('../../util/util');

import type Context from '../../gl/context';
import type Painter from '../painter';
import type {OverscaledTileID} from '../../source/tile_id';
import type {CrossFaded} from '../../style/cross_faded';
import type {UniformValues} from '../uniform_binding';

function fillExtrusionUniforms (context: Context): Uniforms {
    return new Uniforms({
        'u_matrix': new UniformMatrix4fv(context),
        'u_lightpos': new Uniform3fv(context),
        'u_lightintensity': new Uniform1f(context),
        'u_lightcolor': new Uniform3fv(context)
    });
}

function fillExtrusionPatternUniforms (context: Context): Uniforms {
    return fillExtrusionUniforms(context)
        .concatenate(patternUniforms(context))
        .concatenate(new Uniforms({
            'u_height_factor': new Uniform1f(context)
    }));
}

function extrusionTextureUniforms(context: Context): Uniforms {
    return new Uniforms({
        'u_opacity': new Uniform1f(context),
        'u_image': new Uniform1i(context),
        'u_matrix': new UniformMatrix4fv(context),
        'u_world': new Uniform2fv(context)
    });
}

// TODO this might make more sense inlined into draw_* fns — tbd
function fillExtrusionUniformValues(matrix: Float32Array, painter: Painter): UniformValues {
    const light = painter.style.light;
    const _lp = light.properties.get('position');
    const lightPos = [_lp.x, _lp.y, _lp.z];
    const lightMat = mat3.create();
    if (light.properties.get('anchor') === 'viewport') {
        mat3.fromRotation(lightMat, -painter.transform.angle);
    }
    vec3.transformMat3(lightPos, lightPos, lightMat);

    const lightColor = light.properties.get('color');

    return {
        u_matrix: matrix,
        u_lightpos: lightPos,
        u_lightintensity: light.properties.get('intensity'),
        u_lightcolor: [lightColor.r, lightColor.g, lightColor.b]
    };
}

function fillExtrusionPatternUniformValues(matrix: Float32Array, painter: Painter, coord: OverscaledTileID, image: CrossFaded<string>, tile: {tileID: OverscaledTileID, tileSize: number}): UniformValues {
    return util.extend(fillExtrusionUniformValues(matrix, painter),
        pattern.prepare(image, painter),
        pattern.setTile(tile, painter),
        {
            u_height_factor: -Math.pow(2, coord.overscaledZ) / tile.tileSize / 8
        });
}

module.exports = {
    fillExtrusionUniforms,
    fillExtrusionPatternUniforms,
    extrusionTextureUniforms,
    fillExtrusionUniformValues,
    fillExtrusionPatternUniformValues
};
