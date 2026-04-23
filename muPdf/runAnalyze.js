"use strict";

var mupdf = require("mupdf");

var pathInput = scriptArgs[0];

function quadNormalize(quad) {
    if (!quad) {
        return null;
    }

    if (typeof quad.length === "number" && quad.length >= 8) {
        return [quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7]];
    }

    if (quad.ul || quad.ur || quad.ll || quad.lr) {
        return [quad.ul.x, quad.ul.y, quad.ur.x, quad.ur.y, quad.ll.x, quad.ll.y, quad.lr.x, quad.lr.y];
    }

    return null;
}

function quadToBbox(quad) {
    if (!quad || quad.length < 8) {
        return null;
    }

    var xs = [quad[0], quad[2], quad[4], quad[6]];
    var ys = [quad[1], quad[3], quad[5], quad[7]];

    var xMin = xs[0];
    var xMax = xs[0];
    var yMin = ys[0];
    var yMax = ys[0];

    for (var a = 1; a < 4; a++) {
        if (xs[a] < xMin) xMin = xs[a];
        if (xs[a] > xMax) xMax = xs[a];
        if (ys[a] < yMin) yMin = ys[a];
        if (ys[a] > yMax) yMax = ys[a];
    }

    return {
        x: xMin,
        y: yMin,
        w: xMax - xMin,
        h: yMax - yMin
    };
}

var document = mupdf.Document.openDocument(pathInput);

for (var pageIndex = 0; pageIndex < document.countPages(); pageIndex++) {
    var page = document.loadPage(pageIndex);
    var structuredText = page.toStructuredText();

    var block = -1;
    var line = -1;
    var lineBBox = null;
    var wmode = 0;
    var direction = null;
    var seq = -1;
    var characterList = [];

    structuredText.walk({
        beginTextBlock: function (bbox) {
            block += 1;
            line = -1;
        },

        beginLine: function (bbox, wmodeValue, directionValue) {
            line += 1;
            lineBBox = bbox;
            wmode = wmodeValue;
            direction = directionValue;
        },

        onChar: function (text, origin, font, fontSize, quadValue, color, flags) {
            seq += 1;

            var quad = quadNormalize(quadValue);
            var bbox = quadToBbox(quad);

            characterList.push({
                block: block,
                line: line,
                lineBBox: lineBBox,
                wmode: wmode,
                direction: direction,
                seq: seq,
                quad: quad,
                bbox: bbox,
                text: text,
                x: origin.x,
                y: origin.y,
                font: font,
                fontSize: fontSize,
                color: color,
                flags: flags
            });
        }
    });

    print(JSON.stringify({
        characterList: characterList,
        characterListCount: characterList.length,
        page: pageIndex + 1
    }));
}
