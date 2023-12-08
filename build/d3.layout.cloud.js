(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g=(g.d3||(g.d3 = {}));g=(g.layout||(g.layout = {}));g.cloud = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// Word cloud layout by Jason Davies, https://www.jasondavies.com/wordcloud/
// Algorithm due to Jonathan Feinberg, https://s3.amazonaws.com/static.mrfeinberg.com/bv_ch03.pdf

const dispatch = require("d3-dispatch").dispatch;

const RADIANS = Math.PI / 180;

const SPIRALS = {
  archimedean: archimedeanSpiral,
  rectangular: rectangularSpiral,
};

const canvasWidth = (1 << 11) >> 5;
const canvasHeight = 1 << 11;

module.exports = function () {
  var size = [256, 256],
    text = cloudText,
    font = cloudFont,
    fontSize = cloudFontSize,
    fontStyle = cloudFontNormal,
    fontWeight = cloudFontNormal,
    rotate = cloudRotate,
    padding = cloudPadding,
    spiral = archimedeanSpiral,
    words = [],
    timeInterval = Infinity,
    event = dispatch("word", "end"),
    timer = null,
    random = Math.random,
    cloud = {},
    canvas = cloudCanvas,
    notPlaced = wordNotPlaced;

  cloud.canvas = function (_) {
    return arguments.length ? ((canvas = functor(_)), cloud) : canvas;
  };

  cloud.start = function () {
    var contextAndRatio = getContext(canvas());
    var board = zeroArray((size[0] >> 5) * size[1]);
    var bounds = null;
    const tagCount = words.length;
    var tagIndex = -1;
    const tags = [];
    var tagData = words
      .map(function (word, index) {
        word.text = text.call(this, word, index);
        word.font = font.call(this, word, index);
        word.style = fontStyle.call(this, word, index);
        word.weight = fontWeight.call(this, word, index);
        word.rotate = rotate.call(this, word, index);
        word.size = ~~fontSize.call(this, word, index);
        word.padding = padding.call(this, word, index);
        return word;
      })
      .sort(function (a, b) {
        return b.size - a.size;
      });

    if (timer) clearInterval(timer);
    timer = setInterval(step, 0);
    step();

    return cloud;

    function step() {
      const start = Date.now();
      while (
        Date.now() - start < timeInterval &&
        ++tagIndex < tagCount &&
        timer
      ) {
        var tag = tagData[tagIndex];
        tag.x = size[0] / 2;
        tag.y = size[1] / 2;
        cloudSprite(contextAndRatio, tag, tagData, tagIndex);

        if (!tag.hasText) continue;
        for (var index = 0; index < 10; index++) {
          if (place(board, tag, bounds)) break;

          if (notPlaced(tag)) break;
        }

        tags.push(tag);
        event.call("word", cloud, tag);
        if (bounds) cloudBounds(bounds, tag);
        else
          bounds = [
            { x: tag.x + tag.x0, y: tag.y + tag.y0 },
            { x: tag.x + tag.x1, y: tag.y + tag.y1 },
          ];
        // Temporary hack
        tag.x -= size[0] >> 1;
        tag.y -= size[1] >> 1;
      }
      if (tagIndex >= tagCount) {
        cloud.stop();
        event.call("end", cloud, tags, bounds);
      }
    }
  };

  cloud.stop = function () {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    for (const d of words) {
      delete d.sprite;
    }
    return cloud;
  };

  function getContext(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = canvas.height = 1;
    const ratio = Math.sqrt(context.getImageData(0, 0, 1, 1).data.length >> 2);
    canvas.width = (canvasWidth << 5) / ratio;
    canvas.height = canvasHeight / ratio;

    context.fillStyle = context.strokeStyle = "red";

    return { context, ratio };
  }

  function place(board, word, bounds) {
    const startX = word.x;
    const startY = word.y;
    const maxDelta = Math.sqrt(size[0] * size[0] + size[1] * size[1]);
    const spiralFunction = spiral(size);

    var dxdy;
    var dx;
    var dy;

    const dt = random() < 0.5 ? 1 : -1;
    var t = -dt;

    while ((dxdy = spiralFunction((t += dt)))) {
      dx = ~~dxdy[0];
      dy = ~~dxdy[1];

      // Placement is outside the area of the wordcloud.
      if (Math.min(Math.abs(dx), Math.abs(dy)) >= maxDelta) break;

      word.x = startX + dx;
      word.y = startY + dy;

      if (
        word.x + word.x0 < 0 ||
        word.y + word.y0 < 0 ||
        word.x + word.x1 > size[0] ||
        word.y + word.y1 > size[1]
      )
        continue;
      // TODO only check for collisions within current bounds.
      if (!bounds || collideRects(word, bounds)) {
        if (!cloudCollide(word, board, size[0])) {
          const sprite = word.sprite,
            wordWidth = word.width >> 5,
            cloudWidth = size[0] >> 5,
            lx = word.x - (wordWidth << 4),
            sx = lx & 0x7f,
            msx = 32 - sx,
            h = word.y1 - word.y0;
          var x = (word.y + word.y0) * cloudWidth + (lx >> 5);
          var last;
          for (var j = 0; j < h; j++) {
            last = 0;
            for (var i = 0; i <= wordWidth; i++) {
              board[x + i] |=
                (last << msx) |
                (i < wordWidth ? (last = sprite[j * wordWidth + i]) >>> sx : 0);
            }
            x += cloudWidth;
          }
          return true;
        }
      }
    }
    return false;
  }

  cloud.timeInterval = function (_) {
    return arguments.length
      ? ((timeInterval = _ == null ? Infinity : _), cloud)
      : timeInterval;
  };

  cloud.words = function (_) {
    return arguments.length ? ((words = _), cloud) : words;
  };

  cloud.size = function (_) {
    return arguments.length ? ((size = [+_[0], +_[1]]), cloud) : size;
  };

  cloud.font = function (_) {
    return arguments.length ? ((font = functor(_)), cloud) : font;
  };

  cloud.fontStyle = function (_) {
    return arguments.length ? ((fontStyle = functor(_)), cloud) : fontStyle;
  };

  cloud.fontWeight = function (_) {
    return arguments.length ? ((fontWeight = functor(_)), cloud) : fontWeight;
  };

  cloud.rotate = function (_) {
    return arguments.length ? ((rotate = functor(_)), cloud) : rotate;
  };

  cloud.text = function (_) {
    return arguments.length ? ((text = functor(_)), cloud) : text;
  };

  cloud.spiral = function (_) {
    return arguments.length ? ((spiral = SPIRALS[_] || _), cloud) : spiral;
  };

  cloud.fontSize = function (_) {
    return arguments.length ? ((fontSize = functor(_)), cloud) : fontSize;
  };

  cloud.padding = function (_) {
    return arguments.length ? ((padding = functor(_)), cloud) : padding;
  };

  cloud.random = function (_) {
    return arguments.length ? ((random = _), cloud) : random;
  };

  cloud.on = function () {
    var value = event.on.apply(event, arguments);
    return value === event ? cloud : value;
  };

  cloud.wordNotPlaced = function (word) {
    return arguments.length ? ((notPlaced = functor(word)), cloud) : notPlaced;
  };

  return cloud;
};

function cloudText(d) {
  return d.text;
}

function cloudFont() {
  return "serif";
}

function cloudFontNormal() {
  return "normal";
}

function cloudFontSize(d) {
  return Math.sqrt(d.value);
}

function cloudRotate() {
  return (~~(random() * 6) - 3) * 30;
}

function cloudPadding() {
  return 1;
}

function wordNotPlaced() {
  return false;
}

// Fetches a monochrome sprite bitmap for the specified text.
// Load in batches for speed.
function cloudSprite(contextAndRatio, tag, wordArray, wordIndex) {
  if (tag.sprite) return;
  var context = contextAndRatio.context,
    ratio = contextAndRatio.ratio;

  context.clearRect(0, 0, (canvasWidth << 5) / ratio, canvasHeight / ratio);
  var xOffset = 0,
    yOffset = 0,
    maxWordHeight = 0,
    wordCount = wordArray.length;
  --wordIndex;
  while (++wordIndex < wordCount) {
    tag = wordArray[wordIndex];
    context.save();
    context.font =
      tag.style +
      " " +
      tag.weight +
      " " +
      ~~((tag.size + 1) / ratio) +
      "px " +
      tag.font;
    const metrics = context.measureText(tag.text);
    const anchor = -Math.floor(metrics.width / 2);
    let textWidth = (metrics.width + 1) * ratio;
    let wordHeight = tag.size << 1;
    if (tag.rotate) {
      var sr = Math.sin(tag.rotate * RADIANS),
        cr = Math.cos(tag.rotate * RADIANS),
        wcr = textWidth * cr,
        wsr = textWidth * sr,
        hcr = wordHeight * cr,
        hsr = wordHeight * sr;
      textWidth =
        ((Math.max(Math.abs(wcr + hsr), Math.abs(wcr - hsr)) + 0x1f) >> 5) << 5;
      wordHeight = ~~Math.max(Math.abs(wsr + hcr), Math.abs(wsr - hcr));
    } else {
      textWidth = ((textWidth + 0x1f) >> 5) << 5;
    }
    if (wordHeight > maxWordHeight) maxWordHeight = wordHeight;
    if (xOffset + textWidth >= canvasWidth << 5) {
      xOffset = 0;
      yOffset += maxWordHeight;
      maxWordHeight = 0;
    }
    if (yOffset + wordHeight >= canvasHeight) break;
    context.translate(
      (xOffset + (textWidth >> 1)) / ratio,
      (yOffset + (wordHeight >> 1)) / ratio
    );
    if (tag.rotate) context.rotate(tag.rotate * RADIANS);
    context.fillText(tag.text, anchor, 0);
    if (tag.padding)
      (context.lineWidth = 2 * tag.padding),
        context.strokeText(tag.text, anchor, 0);
    context.restore();
    tag.width = textWidth;
    tag.height = wordHeight;
    tag.xoff = xOffset;
    tag.yoff = yOffset;
    tag.x1 = textWidth >> 1;
    tag.y1 = wordHeight >> 1;
    tag.x0 = -tag.x1;
    tag.y0 = -tag.y1;
    tag.hasText = true;
    xOffset += textWidth;
  }
  var pixels = context.getImageData(
      0,
      0,
      (canvasWidth << 5) / ratio,
      canvasHeight / ratio
    ).data,
    sprite = [];
  while (--wordIndex >= 0) {
    tag = wordArray[wordIndex];
    if (!tag.hasText) continue;
    var w = tag.width,
      w32 = w >> 5,
      h = tag.y1 - tag.y0;
    // Zero the buffer
    for (var i = 0; i < h * w32; i++) sprite[i] = 0;
    xOffset = tag.xoff;
    if (xOffset == null) return;
    yOffset = tag.yoff;
    var seen = 0,
      seenRow = -1;
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var k = w32 * j + (i >> 5),
          m = pixels[((yOffset + j) * (canvasWidth << 5) + (xOffset + i)) << 2]
            ? 1 << (31 - (i % 32))
            : 0;
        sprite[k] |= m;
        seen |= m;
      }
      if (seen) seenRow = j;
      else {
        tag.y0++;
        h--;
        j--;
        yOffset++;
      }
    }
    tag.y1 = tag.y0 + seenRow;
    tag.sprite = sprite.slice(0, (tag.y1 - tag.y0) * w32);
  }
}

// Use mask-based collision detection.
function cloudCollide(tag, board, sizeWidth) {
  sizeWidth >>= 5;
  const sprite = tag.sprite,
    w = tag.width >> 5,
    lx = tag.x - (w << 4),
    sx = lx & 0x7f,
    msx = 32 - sx,
    h = tag.y1 - tag.y0;
  var x = (tag.y + tag.y0) * sizeWidth + (lx >> 5);
  var last;
  for (var j = 0; j < h; j++) {
    last = 0;
    for (var i = 0; i <= w; i++) {
      if (
        ((last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0)) &
        board[x + i]
      )
        return true;
    }
    x += sizeWidth;
  }
  return false;
}

function cloudBounds(bounds, d) {
  var b0 = bounds[0],
    b1 = bounds[1];
  if (d.x + d.x0 < b0.x) b0.x = d.x + d.x0;
  if (d.y + d.y0 < b0.y) b0.y = d.y + d.y0;
  if (d.x + d.x1 > b1.x) b1.x = d.x + d.x1;
  if (d.y + d.y1 > b1.y) b1.y = d.y + d.y1;
}

function collideRects(a, b) {
  return (
    a.x + a.x1 > b[0].x &&
    a.x + a.x0 < b[1].x &&
    a.y + a.y1 > b[0].y &&
    a.y + a.y0 < b[1].y
  );
}

function archimedeanSpiral(size) {
  var e = size[0] / size[1];
  return function (t) {
    return [e * (t *= 0.1) * Math.cos(t), t * Math.sin(t)];
  };
}

function rectangularSpiral(size) {
  var dy = 4,
    dx = (dy * size[0]) / size[1],
    x = 0,
    y = 0;
  return function (t) {
    var sign = t < 0 ? -1 : 1;
    // See triangular numbers: T_n = n * (n + 1) / 2.
    switch ((Math.sqrt(1 + 4 * sign * t) - sign) & 3) {
      case 0:
        x += dx;
        break;
      case 1:
        y += dy;
        break;
      case 2:
        x -= dx;
        break;
      default:
        y -= dy;
        break;
    }
    return [x, y];
  };
}

// TODO reuse arrays?
function zeroArray(n) {
  var a = [],
    i = -1;
  while (++i < n) a[i] = 0;
  return a;
}

function cloudCanvas() {
  return document.createElement("canvas");
}

function functor(d) {
  return typeof d === "function"
    ? d
    : function () {
        return d;
      };
}


},{"d3-dispatch":2}],2:[function(require,module,exports){
// https://d3js.org/d3-dispatch/ v1.0.6 Copyright 2019 Mike Bostock
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
typeof define === 'function' && define.amd ? define(['exports'], factory) :
(global = global || self, factory(global.d3 = global.d3 || {}));
}(this, function (exports) { 'use strict';

var noop = {value: function() {}};

function dispatch() {
  for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
    if (!(t = arguments[i] + "") || (t in _) || /[\s.]/.test(t)) throw new Error("illegal type: " + t);
    _[t] = [];
  }
  return new Dispatch(_);
}

function Dispatch(_) {
  this._ = _;
}

function parseTypenames(typenames, types) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
    if (t && !types.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    return {type: t, name: name};
  });
}

Dispatch.prototype = dispatch.prototype = {
  constructor: Dispatch,
  on: function(typename, callback) {
    var _ = this._,
        T = parseTypenames(typename + "", _),
        t,
        i = -1,
        n = T.length;

    // If no callback was specified, return the callback of the given type and name.
    if (arguments.length < 2) {
      while (++i < n) if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name))) return t;
      return;
    }

    // If a type was specified, set the callback for the given type and name.
    // Otherwise, if a null callback was specified, remove callbacks of the given name.
    if (callback != null && typeof callback !== "function") throw new Error("invalid callback: " + callback);
    while (++i < n) {
      if (t = (typename = T[i]).type) _[t] = set(_[t], typename.name, callback);
      else if (callback == null) for (t in _) _[t] = set(_[t], typename.name, null);
    }

    return this;
  },
  copy: function() {
    var copy = {}, _ = this._;
    for (var t in _) copy[t] = _[t].slice();
    return new Dispatch(copy);
  },
  call: function(type, that) {
    if ((n = arguments.length - 2) > 0) for (var args = new Array(n), i = 0, n, t; i < n; ++i) args[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  },
  apply: function(type, that, args) {
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (var t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  }
};

function get(type, name) {
  for (var i = 0, n = type.length, c; i < n; ++i) {
    if ((c = type[i]).name === name) {
      return c.value;
    }
  }
}

function set(type, name, callback) {
  for (var i = 0, n = type.length; i < n; ++i) {
    if (type[i].name === name) {
      type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
      break;
    }
  }
  if (callback != null) type.push({name: name, value: callback});
  return type;
}

exports.dispatch = dispatch;

Object.defineProperty(exports, '__esModule', { value: true });

}));

},{}]},{},[1])(1)
});
