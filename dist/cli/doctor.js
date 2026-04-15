#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var isNothing_1, isObject_1, toArray_1, repeat_1, isNegativeZero_1, extend_1, common, exception, snippet, TYPE_CONSTRUCTOR_OPTIONS, YAML_NODE_KINDS, type, schema, str, seq, map, failsafe, _null, bool, int, YAML_FLOAT_PATTERN, SCIENTIFIC_WITHOUT_DOT, float, json, core, YAML_DATE_REGEXP, YAML_TIMESTAMP_REGEXP, timestamp, merge, BASE64_MAP, binary, _hasOwnProperty$3, _toString$2, omap, _toString$1, pairs, _hasOwnProperty$2, set, _default, _hasOwnProperty$1, CONTEXT_FLOW_IN, CONTEXT_FLOW_OUT, CONTEXT_BLOCK_IN, CONTEXT_BLOCK_OUT, CHOMPING_CLIP, CHOMPING_STRIP, CHOMPING_KEEP, PATTERN_NON_PRINTABLE, PATTERN_NON_ASCII_LINE_BREAKS, PATTERN_FLOW_INDICATORS, PATTERN_TAG_HANDLE, PATTERN_TAG_URI, simpleEscapeCheck, simpleEscapeMap, i, directiveHandlers, loadAll_1, load_1, loader, _toString, _hasOwnProperty, CHAR_BOM, CHAR_TAB, CHAR_LINE_FEED, CHAR_CARRIAGE_RETURN, CHAR_SPACE, CHAR_EXCLAMATION, CHAR_DOUBLE_QUOTE, CHAR_SHARP, CHAR_PERCENT, CHAR_AMPERSAND, CHAR_SINGLE_QUOTE, CHAR_ASTERISK, CHAR_COMMA, CHAR_MINUS, CHAR_COLON, CHAR_EQUALS, CHAR_GREATER_THAN, CHAR_QUESTION, CHAR_COMMERCIAL_AT, CHAR_LEFT_SQUARE_BRACKET, CHAR_RIGHT_SQUARE_BRACKET, CHAR_GRAVE_ACCENT, CHAR_LEFT_CURLY_BRACKET, CHAR_VERTICAL_LINE, CHAR_RIGHT_CURLY_BRACKET, ESCAPE_SEQUENCES, DEPRECATED_BOOLEANS_SYNTAX, DEPRECATED_BASE60_SYNTAX, QUOTING_TYPE_SINGLE, QUOTING_TYPE_DOUBLE, STYLE_PLAIN, STYLE_SINGLE, STYLE_LITERAL, STYLE_FOLDED, STYLE_DOUBLE, dump_1, dumper, load, loadAll, dump, safeLoad, safeLoadAll, safeDump;
var init_js_yaml = __esm({
  "node_modules/js-yaml/dist/js-yaml.mjs"() {
    isNothing_1 = isNothing;
    isObject_1 = isObject;
    toArray_1 = toArray;
    repeat_1 = repeat;
    isNegativeZero_1 = isNegativeZero;
    extend_1 = extend;
    common = {
      isNothing: isNothing_1,
      isObject: isObject_1,
      toArray: toArray_1,
      repeat: repeat_1,
      isNegativeZero: isNegativeZero_1,
      extend: extend_1
    };
    YAMLException$1.prototype = Object.create(Error.prototype);
    YAMLException$1.prototype.constructor = YAMLException$1;
    YAMLException$1.prototype.toString = function toString(compact) {
      return this.name + ": " + formatError(this, compact);
    };
    exception = YAMLException$1;
    snippet = makeSnippet;
    TYPE_CONSTRUCTOR_OPTIONS = [
      "kind",
      "multi",
      "resolve",
      "construct",
      "instanceOf",
      "predicate",
      "represent",
      "representName",
      "defaultStyle",
      "styleAliases"
    ];
    YAML_NODE_KINDS = [
      "scalar",
      "sequence",
      "mapping"
    ];
    type = Type$1;
    Schema$1.prototype.extend = function extend2(definition) {
      var implicit = [];
      var explicit = [];
      if (definition instanceof type) {
        explicit.push(definition);
      } else if (Array.isArray(definition)) {
        explicit = explicit.concat(definition);
      } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
        if (definition.implicit) implicit = implicit.concat(definition.implicit);
        if (definition.explicit) explicit = explicit.concat(definition.explicit);
      } else {
        throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
      }
      implicit.forEach(function(type$1) {
        if (!(type$1 instanceof type)) {
          throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
        if (type$1.loadKind && type$1.loadKind !== "scalar") {
          throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
        }
        if (type$1.multi) {
          throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
        }
      });
      explicit.forEach(function(type$1) {
        if (!(type$1 instanceof type)) {
          throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
        }
      });
      var result = Object.create(Schema$1.prototype);
      result.implicit = (this.implicit || []).concat(implicit);
      result.explicit = (this.explicit || []).concat(explicit);
      result.compiledImplicit = compileList(result, "implicit");
      result.compiledExplicit = compileList(result, "explicit");
      result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
      return result;
    };
    schema = Schema$1;
    str = new type("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function(data) {
        return data !== null ? data : "";
      }
    });
    seq = new type("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function(data) {
        return data !== null ? data : [];
      }
    });
    map = new type("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function(data) {
        return data !== null ? data : {};
      }
    });
    failsafe = new schema({
      explicit: [
        str,
        seq,
        map
      ]
    });
    _null = new type("tag:yaml.org,2002:null", {
      kind: "scalar",
      resolve: resolveYamlNull,
      construct: constructYamlNull,
      predicate: isNull,
      represent: {
        canonical: function() {
          return "~";
        },
        lowercase: function() {
          return "null";
        },
        uppercase: function() {
          return "NULL";
        },
        camelcase: function() {
          return "Null";
        },
        empty: function() {
          return "";
        }
      },
      defaultStyle: "lowercase"
    });
    bool = new type("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: resolveYamlBoolean,
      construct: constructYamlBoolean,
      predicate: isBoolean,
      represent: {
        lowercase: function(object) {
          return object ? "true" : "false";
        },
        uppercase: function(object) {
          return object ? "TRUE" : "FALSE";
        },
        camelcase: function(object) {
          return object ? "True" : "False";
        }
      },
      defaultStyle: "lowercase"
    });
    int = new type("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: resolveYamlInteger,
      construct: constructYamlInteger,
      predicate: isInteger,
      represent: {
        binary: function(obj) {
          return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
        },
        octal: function(obj) {
          return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
        },
        decimal: function(obj) {
          return obj.toString(10);
        },
        /* eslint-disable max-len */
        hexadecimal: function(obj) {
          return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
        }
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"]
      }
    });
    YAML_FLOAT_PATTERN = new RegExp(
      // 2.5e4, 2.5 and integers
      "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
    );
    SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
    float = new type("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: resolveYamlFloat,
      construct: constructYamlFloat,
      predicate: isFloat,
      represent: representYamlFloat,
      defaultStyle: "lowercase"
    });
    json = failsafe.extend({
      implicit: [
        _null,
        bool,
        int,
        float
      ]
    });
    core = json;
    YAML_DATE_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
    );
    YAML_TIMESTAMP_REGEXP = new RegExp(
      "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
    );
    timestamp = new type("tag:yaml.org,2002:timestamp", {
      kind: "scalar",
      resolve: resolveYamlTimestamp,
      construct: constructYamlTimestamp,
      instanceOf: Date,
      represent: representYamlTimestamp
    });
    merge = new type("tag:yaml.org,2002:merge", {
      kind: "scalar",
      resolve: resolveYamlMerge
    });
    BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
    binary = new type("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: resolveYamlBinary,
      construct: constructYamlBinary,
      predicate: isBinary,
      represent: representYamlBinary
    });
    _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
    _toString$2 = Object.prototype.toString;
    omap = new type("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: resolveYamlOmap,
      construct: constructYamlOmap
    });
    _toString$1 = Object.prototype.toString;
    pairs = new type("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: resolveYamlPairs,
      construct: constructYamlPairs
    });
    _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
    set = new type("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: resolveYamlSet,
      construct: constructYamlSet
    });
    _default = core.extend({
      implicit: [
        timestamp,
        merge
      ],
      explicit: [
        binary,
        omap,
        pairs,
        set
      ]
    });
    _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
    CONTEXT_FLOW_IN = 1;
    CONTEXT_FLOW_OUT = 2;
    CONTEXT_BLOCK_IN = 3;
    CONTEXT_BLOCK_OUT = 4;
    CHOMPING_CLIP = 1;
    CHOMPING_STRIP = 2;
    CHOMPING_KEEP = 3;
    PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
    PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
    PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
    PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
    simpleEscapeCheck = new Array(256);
    simpleEscapeMap = new Array(256);
    for (i = 0; i < 256; i++) {
      simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
      simpleEscapeMap[i] = simpleEscapeSequence(i);
    }
    directiveHandlers = {
      YAML: function handleYamlDirective(state, name, args) {
        var match, major, minor;
        if (state.version !== null) {
          throwError(state, "duplication of %YAML directive");
        }
        if (args.length !== 1) {
          throwError(state, "YAML directive accepts exactly one argument");
        }
        match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
        if (match === null) {
          throwError(state, "ill-formed argument of the YAML directive");
        }
        major = parseInt(match[1], 10);
        minor = parseInt(match[2], 10);
        if (major !== 1) {
          throwError(state, "unacceptable YAML version of the document");
        }
        state.version = args[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
          throwWarning(state, "unsupported YAML version of the document");
        }
      },
      TAG: function handleTagDirective(state, name, args) {
        var handle, prefix;
        if (args.length !== 2) {
          throwError(state, "TAG directive accepts exactly two arguments");
        }
        handle = args[0];
        prefix = args[1];
        if (!PATTERN_TAG_HANDLE.test(handle)) {
          throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
        }
        if (_hasOwnProperty$1.call(state.tagMap, handle)) {
          throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
          throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
        }
        try {
          prefix = decodeURIComponent(prefix);
        } catch (err) {
          throwError(state, "tag prefix is malformed: " + prefix);
        }
        state.tagMap[handle] = prefix;
      }
    };
    loadAll_1 = loadAll$1;
    load_1 = load$1;
    loader = {
      loadAll: loadAll_1,
      load: load_1
    };
    _toString = Object.prototype.toString;
    _hasOwnProperty = Object.prototype.hasOwnProperty;
    CHAR_BOM = 65279;
    CHAR_TAB = 9;
    CHAR_LINE_FEED = 10;
    CHAR_CARRIAGE_RETURN = 13;
    CHAR_SPACE = 32;
    CHAR_EXCLAMATION = 33;
    CHAR_DOUBLE_QUOTE = 34;
    CHAR_SHARP = 35;
    CHAR_PERCENT = 37;
    CHAR_AMPERSAND = 38;
    CHAR_SINGLE_QUOTE = 39;
    CHAR_ASTERISK = 42;
    CHAR_COMMA = 44;
    CHAR_MINUS = 45;
    CHAR_COLON = 58;
    CHAR_EQUALS = 61;
    CHAR_GREATER_THAN = 62;
    CHAR_QUESTION = 63;
    CHAR_COMMERCIAL_AT = 64;
    CHAR_LEFT_SQUARE_BRACKET = 91;
    CHAR_RIGHT_SQUARE_BRACKET = 93;
    CHAR_GRAVE_ACCENT = 96;
    CHAR_LEFT_CURLY_BRACKET = 123;
    CHAR_VERTICAL_LINE = 124;
    CHAR_RIGHT_CURLY_BRACKET = 125;
    ESCAPE_SEQUENCES = {};
    ESCAPE_SEQUENCES[0] = "\\0";
    ESCAPE_SEQUENCES[7] = "\\a";
    ESCAPE_SEQUENCES[8] = "\\b";
    ESCAPE_SEQUENCES[9] = "\\t";
    ESCAPE_SEQUENCES[10] = "\\n";
    ESCAPE_SEQUENCES[11] = "\\v";
    ESCAPE_SEQUENCES[12] = "\\f";
    ESCAPE_SEQUENCES[13] = "\\r";
    ESCAPE_SEQUENCES[27] = "\\e";
    ESCAPE_SEQUENCES[34] = '\\"';
    ESCAPE_SEQUENCES[92] = "\\\\";
    ESCAPE_SEQUENCES[133] = "\\N";
    ESCAPE_SEQUENCES[160] = "\\_";
    ESCAPE_SEQUENCES[8232] = "\\L";
    ESCAPE_SEQUENCES[8233] = "\\P";
    DEPRECATED_BOOLEANS_SYNTAX = [
      "y",
      "Y",
      "yes",
      "Yes",
      "YES",
      "on",
      "On",
      "ON",
      "n",
      "N",
      "no",
      "No",
      "NO",
      "off",
      "Off",
      "OFF"
    ];
    DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
    QUOTING_TYPE_SINGLE = 1;
    QUOTING_TYPE_DOUBLE = 2;
    STYLE_PLAIN = 1;
    STYLE_SINGLE = 2;
    STYLE_LITERAL = 3;
    STYLE_FOLDED = 4;
    STYLE_DOUBLE = 5;
    dump_1 = dump$1;
    dumper = {
      dump: dump_1
    };
    load = loader.load;
    loadAll = loader.loadAll;
    dump = dumper.dump;
    safeLoad = renamed("safeLoad", "load");
    safeLoadAll = renamed("safeLoadAll", "loadAll");
    safeDump = renamed("safeDump", "dump");
  }
});

// src/constants.ts
var BM25_K1, BM25_B, RRF_K, RRF_VECTOR_WEIGHT, NOISE_SIMILARITY_THRESHOLD, VECTOR_SEARCH_MULTIPLIER, BM25_SEARCH_MULTIPLIER, RERANK_CANDIDATE_MULTIPLIER, BM25_QUERY_LIMIT, DEFAULT_EMBEDDING_DIM, DEFAULT_MIN_SCORE, MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, MAX_TEXT_LEN, DEDUP_SIMILARITY, MEMORY_TTL_MS, INITIAL_RELIABILITY, RELIABILITY_BOOST_CONFIRM, RELIABILITY_PENALTY_CORRECT, RELIABILITY_THRESHOLD_HIGH, RELIABILITY_THRESHOLD_MEDIUM, FORGET_GRACE_DAYS, DRIFT_THRESHOLD_DAYS, DRIFT_REVERIFY_DAYS, EVOLUTION_SUCCESS, EVOLUTION_FAILURE, RECENCY_GRACE_DAYS, RECENCY_DECAY_RATE, RECENCY_FACTOR_FLOOR, CONSISTENCY_MAX, CORRECTION_PENALTY_MULTIPLIER, DECAY_RATE_HIGH_RELIABILITY, DECAY_RATE_MEDIUM_RELIABILITY, DECAY_RATE_LOW_RELIABILITY, COLD_START_GRACE_DAYS, COLD_START_DECAY_MULTIPLIER, CONFLICT_SIMILARITY_THRESHOLD, ENTITY_DEDUP_THRESHOLD, ENTITY_DEDUP_SESSION_WINDOW, TIER_PERMANENT_MIN_SCORE, TIER_STABLE_MIN_SCORE, TIER_DECAY_MIN_SCORE, RECENCY_HALF_LIFE_MS, WEIGHT_BASE, WEIGHT_USEFULNESS, WEIGHT_RECENCY, ACCESS_BONUS_MAX;
var init_constants = __esm({
  "src/constants.ts"() {
    "use strict";
    BM25_K1 = parseFloat(process.env.HAWK_BM25_K1 || "1.5");
    BM25_B = parseFloat(process.env.HAWK_BM25_B || "0.75");
    RRF_K = parseFloat(process.env.HAWK_RRF_K || "60");
    RRF_VECTOR_WEIGHT = parseFloat(process.env.HAWK_RRF_VECTOR_WEIGHT || "0.7");
    NOISE_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_NOISE_THRESHOLD || "0.82");
    VECTOR_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_VECTOR_SEARCH_MULTIPLIER || "4", 10);
    BM25_SEARCH_MULTIPLIER = parseInt(process.env.HAWK_BM25_SEARCH_MULTIPLIER || "4", 10);
    RERANK_CANDIDATE_MULTIPLIER = parseInt(process.env.HAWK_RERANK_CANDIDATE_MULTIPLIER || "3", 10);
    BM25_QUERY_LIMIT = parseInt(process.env.HAWK_BM25_QUERY_LIMIT || "1000", 10);
    DEFAULT_EMBEDDING_DIM = parseInt(process.env.HAWK_EMBEDDING_DIM || "384", 10);
    DEFAULT_MIN_SCORE = parseFloat(process.env.HAWK_MIN_SCORE || "0.6");
    MAX_CHUNK_SIZE = parseInt(process.env.HAWK_MAX_CHUNK_SIZE || "2000", 10);
    MIN_CHUNK_SIZE = parseInt(process.env.HAWK_MIN_CHUNK_SIZE || "20", 10);
    MAX_TEXT_LEN = parseInt(process.env.HAWK_MAX_TEXT_LEN || "5000", 10);
    DEDUP_SIMILARITY = parseFloat(process.env.HAWK_DEDUP_SIMILARITY || "0.95");
    MEMORY_TTL_MS = parseInt(process.env.HAWK_MEMORY_TTL_MS || String(30 * 24 * 60 * 60 * 1e3), 10);
    INITIAL_RELIABILITY = parseFloat(process.env.HAWK_INITIAL_RELIABILITY || "0.5");
    RELIABILITY_BOOST_CONFIRM = parseFloat(process.env.HAWK_RELIABILITY_BOOST_CONFIRM || "0.1");
    RELIABILITY_PENALTY_CORRECT = parseFloat(process.env.HAWK_RELIABILITY_PENALTY_CORRECT || "0.3");
    RELIABILITY_THRESHOLD_HIGH = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_HIGH || "0.7");
    RELIABILITY_THRESHOLD_MEDIUM = parseFloat(process.env.HAWK_RELIABILITY_THRESHOLD_MEDIUM || "0.4");
    FORGET_GRACE_DAYS = parseInt(process.env.HAWK_FORGET_GRACE_DAYS || "30", 10);
    DRIFT_THRESHOLD_DAYS = parseInt(process.env.HAWK_DRIFT_THRESHOLD_DAYS || "7", 10);
    DRIFT_REVERIFY_DAYS = parseInt(process.env.HAWK_DRIFT_REVERIFY_DAYS || "14", 10);
    EVOLUTION_SUCCESS = parseFloat(process.env.HAWK_EVOLUTION_SUCCESS || "0.95");
    EVOLUTION_FAILURE = parseFloat(process.env.HAWK_EVOLUTION_FAILURE || "0.25");
    RECENCY_GRACE_DAYS = parseInt(process.env.HAWK_RECENCY_GRACE_DAYS || "30", 10);
    RECENCY_DECAY_RATE = parseFloat(process.env.HAWK_RECENCY_DECAY_RATE || "0.95");
    RECENCY_FACTOR_FLOOR = parseFloat(process.env.HAWK_RECENCY_FACTOR_FLOOR || "0.3");
    CONSISTENCY_MAX = parseFloat(process.env.HAWK_CONSISTENCY_MAX || "1.5");
    CORRECTION_PENALTY_MULTIPLIER = parseFloat(process.env.HAWK_CORRECTION_PENALTY_MULTIPLIER || "0.7");
    DECAY_RATE_HIGH_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_HIGH || "0.2");
    DECAY_RATE_MEDIUM_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_MEDIUM || "0.8");
    DECAY_RATE_LOW_RELIABILITY = parseFloat(process.env.HAWK_DECAY_RATE_LOW || "1.5");
    COLD_START_GRACE_DAYS = parseInt(process.env.HAWK_COLD_START_GRACE_DAYS || "7", 10);
    COLD_START_DECAY_MULTIPLIER = parseFloat(process.env.HAWK_COLD_START_DECAY_MULTIPLIER || "0.5");
    CONFLICT_SIMILARITY_THRESHOLD = parseFloat(process.env.HAWK_CONFLICT_THRESHOLD || "0.6");
    ENTITY_DEDUP_THRESHOLD = parseFloat(process.env.HAWK_ENTITY_DEDUP_THRESHOLD || "0.75");
    ENTITY_DEDUP_SESSION_WINDOW = parseInt(process.env.HAWK_ENTITY_DEDUP_SESSION_WINDOW || "10", 10);
    TIER_PERMANENT_MIN_SCORE = parseFloat(process.env.HAWK_TIER_PERMANENT_MIN_SCORE || "0.85");
    TIER_STABLE_MIN_SCORE = parseFloat(process.env.HAWK_TIER_STABLE_MIN_SCORE || "0.6");
    TIER_DECAY_MIN_SCORE = parseFloat(process.env.HAWK_TIER_DECAY_MIN_SCORE || "0.3");
    RECENCY_HALF_LIFE_MS = parseFloat(process.env.HAWK_RECENCY_HALF_LIFE_MS || String(30 * 24 * 60 * 60 * 1e3));
    WEIGHT_BASE = parseFloat(process.env.HAWK_WEIGHT_BASE || "0.4");
    WEIGHT_USEFULNESS = parseFloat(process.env.HAWK_WEIGHT_USEFULNESS || "0.3");
    WEIGHT_RECENCY = parseFloat(process.env.HAWK_WEIGHT_RECENCY || "0.2");
    ACCESS_BONUS_MAX = parseFloat(process.env.HAWK_ACCESS_BONUS_MAX || "0.1");
  }
});

// src/config/env.ts
function printDeprecationWarnings() {
  if (deprecationWarningsPrinted) return;
  deprecationWarningsPrinted = true;
  for (const { var: v, message } of DEPRECATED_VARS) {
    if (process.env[v] !== void 0) {
      console.warn(`[hawk-bridge] DEPRECATED: ${v} is deprecated. ${message}`);
    }
  }
}
function toCamel(s) {
  const parts = s.split("_").map((p) => p.toLowerCase());
  if (parts.length === 1) return parts[0];
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
function applyValue(obj, key, value) {
  if (value === "true" || value === "false") {
    obj[key] = value === "true";
  } else if (/^\d+$/.test(value)) {
    obj[key] = parseInt(value, 10);
  } else if (/^\d+\.\d+$/.test(value)) {
    obj[key] = parseFloat(value);
  } else {
    obj[key] = value;
  }
}
function parseUnifiedEnvVars() {
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(process.env)) {
    if (!rawKey.startsWith("HAWK__")) continue;
    const parts = rawKey.slice(6).split("__");
    if (parts.length < 2 || parts[0] === "") continue;
    const topLevel = parts[0].toLowerCase();
    const current = result[topLevel] ?? {};
    result[topLevel] = current;
    const nestedKey = toCamel(parts.slice(1).join("_"));
    applyValue(current, nestedKey, rawValue);
  }
  const keys = Object.keys(result);
  if (keys.length > 0) {
  }
  return stripUndefined(result);
}
function stripUndefined(obj) {
  if (obj === void 0) return void 0;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== void 0) result[k] = stripUndefined(v);
    }
    return result;
  }
  return obj;
}
function parseDeprecatedEnvVars() {
  printDeprecationWarnings();
  const config = {};
  if (process.env.OLLAMA_BASE_URL) {
    config.embedding = {
      ...config.embedding || {},
      provider: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
      dimensions: parseInt(process.env.HAWK_EMBEDDING_DIM || "768", 10)
    };
  }
  if (process.env.HAWK_EMBED_PROVIDER && !process.env.OLLAMA_BASE_URL) {
    config.embedding = { ...config.embedding || {}, provider: process.env.HAWK_EMBED_PROVIDER };
  }
  if (process.env.HAWK_EMBED_API_KEY) {
    config.embedding = { ...config.embedding || {}, apiKey: process.env.HAWK_EMBED_API_KEY };
  }
  if (process.env.HAWK_EMBED_MODEL) {
    config.embedding = { ...config.embedding || {}, model: process.env.HAWK_EMBED_MODEL };
  }
  if (process.env.HAWK_EMBEDDING_DIM) {
    config.embedding = { ...config.embedding || {}, dimensions: parseInt(process.env.HAWK_EMBEDDING_DIM, 10) };
  }
  if (process.env.HAWK_PROXY) {
    config.embedding = { ...config.embedding || {}, proxy: process.env.HAWK_PROXY };
  }
  if (process.env.HAWK_LLM_PROVIDER) {
    config.llm = { ...config.llm || {}, provider: process.env.HAWK_LLM_PROVIDER };
  }
  if (process.env.HAWK_LLM_MODEL) {
    config.llm = { ...config.llm || {}, model: process.env.HAWK_LLM_MODEL };
  }
  if (process.env.HAWK_LLM_API_KEY) {
    config.llm = { ...config.llm || {}, apiKey: process.env.HAWK_LLM_API_KEY };
  }
  if (process.env.HAWK_MIN_SCORE) {
    config.recall = { ...config.recall || {}, minScore: parseFloat(process.env.HAWK_MIN_SCORE) };
  }
  if (process.env.HAWK_RERANK) {
    config.recall = { ...config.recall || {}, rerankEnabled: process.env.HAWK_RERANK === "true" };
  }
  if (process.env.HAWK_RERANK_MODEL) {
    config.recall = { ...config.recall || {}, rerankModel: process.env.HAWK_RERANK_MODEL };
  }
  if (process.env.HAWK_CAPTURE_ENABLED !== void 0) {
    config.capture = { ...config.capture || {}, enabled: process.env.HAWK_CAPTURE_ENABLED !== "false" };
  }
  if (process.env.HAWK_PYTHON_HTTP_MODE !== void 0) {
    config.python = { ...config.python || {}, httpMode: process.env.HAWK_PYTHON_HTTP_MODE === "true" };
  }
  if (process.env.HAWK_API_BASE) {
    config.python = { ...config.python || {}, httpBase: process.env.HAWK_API_BASE };
  }
  return config;
}
function getEnvOverrides() {
  const unified = parseUnifiedEnvVars();
  const deprecated = parseDeprecatedEnvVars();
  const unifiedEmbed = unified?.embedding;
  if (unifiedEmbed) {
    if (unifiedEmbed.baseUrl && !unifiedEmbed.baseURL) {
      unifiedEmbed.baseURL = unifiedEmbed.baseUrl;
      delete unifiedEmbed.baseUrl;
    }
    if (unifiedEmbed.baseURL && !unifiedEmbed.provider) {
      const url = unifiedEmbed.baseURL;
      if (url.includes("localhost") || url.includes("127.0.0.1")) {
        unifiedEmbed.provider = "ollama";
      }
    }
  }
  return deepMerge(deprecated, unified);
}
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (baseVal !== void 0 && overrideVal !== void 0 && typeof baseVal === "object" && typeof overrideVal === "object" && !Array.isArray(baseVal) && !Array.isArray(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== void 0) {
      result[key] = overrideVal;
    }
  }
  return result;
}
var DEPRECATED_VARS, deprecationWarningsPrinted;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    DEPRECATED_VARS = [
      { var: "OLLAMA_BASE_URL", message: "Use HAWK__EMBEDDING__BASE_URL instead" },
      { var: "OLLAMA_EMBED_MODEL", message: "Use HAWK__EMBEDDING__MODEL instead" },
      { var: "OLLAMA_EMBED_PATH", message: "Use HAWK__EMBEDDING__BASE_URL instead" },
      { var: "HAWK_EMBED_PROVIDER", message: "Use HAWK__EMBEDDING__PROVIDER instead" },
      { var: "HAWK_EMBED_API_KEY", message: "Use HAWK__EMBEDDING__API_KEY instead" },
      { var: "HAWK_EMBED_MODEL", message: "Use HAWK__EMBEDDING__MODEL instead" },
      { var: "HAWK_EMBEDDING_DIM", message: "Use HAWK__EMBEDDING__DIMENSIONS instead" },
      { var: "HAWK_PROXY", message: "Use HAWK__EMBEDDING__PROXY instead" },
      { var: "HAWK_BM25_QUERY_LIMIT", message: "Use HAWK__STORAGE__BM25_QUERY_LIMIT instead" },
      { var: "HAWK_MIN_SCORE", message: "Use HAWK__RECALL__MIN_SCORE instead" },
      { var: "HAWK_RERANK", message: "Use HAWK__RECALL__RERANK_ENABLED instead" },
      { var: "HAWK_RERANK_MODEL", message: "Use HAWK__RECALL__RERANK_MODEL instead" },
      { var: "HAWK_LOG_LEVEL", message: "Use HAWK__LOGGING__LEVEL instead (or use HAWK__LOGGING__LEVEL directly \u2014 handled by logger, not config)" },
      { var: "HAWK_PYTHON_HTTP_MODE", message: "Use HAWK__PYTHON__HTTP_MODE instead" },
      { var: "HAWK_API_BASE", message: "Use HAWK__PYTHON__HTTP_BASE instead" }
    ];
    deprecationWarningsPrinted = false;
  }
});

// src/config.ts
var config_exports = {};
__export(config_exports, {
  getConfig: () => getConfig,
  getConfiguredProvider: () => getConfiguredProvider,
  getDefaultModelId: () => getDefaultModelId,
  hasEmbeddingProvider: () => hasEmbeddingProvider,
  printConfigHistory: () => printConfigHistory
});
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
function loadOpenClawConfig() {
  if (cachedOpenClawConfig) return cachedOpenClawConfig;
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf-8");
    cachedOpenClawConfig = JSON.parse(raw);
    return cachedOpenClawConfig;
  } catch {
    return null;
  }
}
function loadAgentModels() {
  if (cachedAgentModels !== null) return cachedAgentModels;
  try {
    cachedAgentModels = JSON.parse(fs.readFileSync(OPENCLAW_AGENT_MODELS, "utf-8"));
    return cachedAgentModels;
  } catch {
    cachedAgentModels = null;
    return null;
  }
}
function getAgentModelKey(provider) {
  const agents = loadAgentModels();
  if (!agents) return null;
  const providers = agents.providers;
  if (!providers) return null;
  const p = providers[provider];
  if (!p) return null;
  return {
    apiKey: p.apiKey ?? "",
    baseUrl: p.baseUrl ?? ""
  };
}
function getConfiguredProvider(providerName = "minimax") {
  const config = loadOpenClawConfig();
  if (!config?.models?.providers) return null;
  return config.models.providers[providerName] || null;
}
function getDefaultModelId() {
  const cfg = loadOpenClawConfig();
  const openclawPrimary = cfg?.agents?.defaults?.model?.primary;
  if (openclawPrimary && typeof openclawPrimary === "string") {
    return openclawPrimary;
  }
  if (!cfg?.models?.providers) return "MiniMax-M2.7";
  const prov = cfg.models.providers["minimax"];
  if (!prov?.models?.length) return "MiniMax-M2.7";
  return prov.models[0].id;
}
function resolveEnvVars(raw) {
  return raw.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? "";
  });
}
function loadYamlConfig() {
  const yamlPath = path.join(HAWK_CONFIG_DIR, "config.yaml");
  if (fs.existsSync(yamlPath)) {
    try {
      const raw = fs.readFileSync(yamlPath, "utf-8");
      const resolved = resolveEnvVars(raw);
      return load(resolved);
    } catch (e) {
      console.warn("[hawk-bridge] Failed to load config.yaml:", e);
    }
  }
  return {};
}
async function getConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      let config = { ...DEFAULT_CONFIG };
      const yamlConfig = loadYamlConfig();
      if (Object.keys(yamlConfig).length > 0) {
        config = deepMerge(DEFAULT_CONFIG, yamlConfig);
      }
      const envOverrides = getEnvOverrides();
      if (Object.keys(envOverrides).length > 0) {
        config = deepMerge(config, envOverrides);
      }
      const hasEmbedding = config.embedding?.provider || config.embedding?.apiKey || config.embedding?.baseURL;
      if (!hasEmbedding) {
        if (process.env.OLLAMA_BASE_URL) {
          config.embedding.provider = "ollama";
          config.embedding.baseURL = process.env.OLLAMA_BASE_URL;
          config.embedding.model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
          config.embedding.dimensions = parseInt(process.env.HAWK_EMBEDDING_DIM || "768", 10);
        } else {
          const openclawkKey = getAgentModelKey("minimax");
          if (openclawkKey?.apiKey) {
            config.embedding.provider = "minimax";
            config.embedding.apiKey = openclawkKey.apiKey;
            config.embedding.baseURL = openclawkKey.baseUrl || "https://api.minimaxi.com/v1";
            config.embedding.model = "text-embedding-v2";
            config.embedding.dimensions = 1024;
          } else if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) {
            config.embedding.provider = "qianwen";
            config.embedding.apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
            config.embedding.baseURL = "https://dashscope.aliyuncs.com/api/v1";
            config.embedding.model = "text-embedding-v1";
            config.embedding.dimensions = 1024;
          } else if (process.env.JINA_API_KEY) {
            config.embedding.provider = "jina";
            config.embedding.apiKey = process.env.JINA_API_KEY;
            config.embedding.baseURL = "";
            config.embedding.model = "jina-embeddings-v5-small";
            config.embedding.dimensions = 1024;
          } else if (process.env.OPENAI_API_KEY) {
            config.embedding.provider = "openai";
            config.embedding.apiKey = process.env.OPENAI_API_KEY;
            config.embedding.baseURL = "";
            config.embedding.model = "text-embedding-3-small";
            config.embedding.dimensions = 1536;
          } else if (process.env.COHERE_API_KEY) {
            config.embedding.provider = "cohere";
            config.embedding.apiKey = process.env.COHERE_API_KEY;
            config.embedding.baseURL = "";
            config.embedding.model = "embed-english-v3.0";
            config.embedding.dimensions = 1024;
          }
        }
      }
      if (!config.llm.model || !config.llm.apiKey) {
        const openclawkKey = getAgentModelKey("minimax");
        if (openclawkKey?.apiKey) {
          config.llm = config.llm || {};
          config.llm.model = config.llm.model || getDefaultModelId();
          config.llm.apiKey = openclawkKey.apiKey;
          config.llm.baseURL = config.llm.baseURL || openclawkKey.baseUrl || "";
          config.llm.provider = config.llm.provider || "minimax";
        }
      }
      await recordConfigHistory(config);
      return config;
    })();
  }
  return configPromise;
}
function hasEmbeddingProvider() {
  return !!(process.env.OLLAMA_BASE_URL || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.JINA_API_KEY || process.env.OPENAI_API_KEY || process.env.COHERE_API_KEY || (process.env.HAWK_EMBED_API_KEY || process.env.HAWK_EMBED_PROVIDER));
}
async function recordConfigHistory(config) {
  try {
    const historyPath = path.join(HAWK_CONFIG_DIR, "config-history.jsonl");
    const relevantKeys = [
      "OLLAMA_BASE_URL",
      "OLLAMA_EMBED_MODEL",
      "HAWK__EMBEDDING__PROVIDER",
      "HAWK__EMBEDDING__MODEL",
      "HAWK__EMBEDDING__DIMENSIONS",
      "HAWK__EMBEDDING__BASE_URL",
      "HAWK__EMBEDDING__API_KEY",
      "HAWK__LLM__PROVIDER",
      "HAWK__LLM__MODEL",
      "HAWK__LLM__API_KEY",
      "HAWK__LOGGING__LEVEL",
      "HAWK_CONFIG_VERSION"
    ];
    const envSnapshot = {};
    for (const key of relevantKeys) {
      const val = process.env[key];
      if (val !== void 0) envSnapshot[key] = val;
    }
    envSnapshot["__resolved_provider"] = config.embedding.provider;
    envSnapshot["__resolved_dim"] = String(config.embedding.dimensions);
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      version: HAWK_CONFIG_VERSION,
      env: envSnapshot,
      hash: crypto.createHash("md5").update(JSON.stringify(envSnapshot)).digest("hex")
    };
    let entries = [];
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, "utf-8");
      entries = raw.trim().split("\n").filter(Boolean).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter((e) => e !== null);
    }
    entries.push(entry);
    if (entries.length > 100) entries = entries.slice(-100);
    const dir = path.dirname(historyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(historyPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  } catch {
  }
}
function printConfigHistory(limit = 20) {
  const historyPath = path.join(HAWK_CONFIG_DIR, "config-history.jsonl");
  if (!fs.existsSync(historyPath)) {
    console.log("No config history found.");
    return;
  }
  try {
    const raw = fs.readFileSync(historyPath, "utf-8");
    const entries = raw.trim().split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((e) => e !== null);
    const recent = entries.slice(-limit);
    console.log("\n\u{1F985} hawk config-history (last " + recent.length + " entries)\n" + "\u2500".repeat(60));
    for (const e of recent.reverse()) {
      const date = new Date(e.timestamp).toLocaleString("zh-CN");
      const provider = e.env["__resolved_provider"] || "-";
      const dim = e.env["__resolved_dim"] || "-";
      const hash = e.hash.slice(0, 8);
      console.log(`${date}  v${e.version}  provider=${provider}  dim=${dim}  hash=${hash}`);
    }
    console.log("\u2500".repeat(60) + "\n");
  } catch (err) {
    console.error("Failed to read config history:", err.message);
  }
}
var OPENCLAW_CONFIG_PATH, OPENCLAW_AGENT_MODELS, HAWK_CONFIG_DIR, cachedOpenClawConfig, cachedAgentModels, DEFAULT_CONFIG, configPromise, HAWK_CONFIG_VERSION;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    init_js_yaml();
    init_constants();
    init_env();
    OPENCLAW_CONFIG_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");
    OPENCLAW_AGENT_MODELS = path.join(os.homedir(), ".openclaw", "agents", "main", "agent", "models.json");
    HAWK_CONFIG_DIR = path.join(os.homedir(), ".hawk");
    cachedOpenClawConfig = null;
    cachedAgentModels = null;
    DEFAULT_CONFIG = {
      embedding: {
        provider: "qianwen",
        apiKey: "",
        model: "text-embedding-v1",
        baseURL: "https://dashscope.aliyuncs.com/api/v1",
        dimensions: 1024,
        proxy: ""
      },
      llm: {
        provider: "groq",
        apiKey: "",
        model: "llama-3.3-70b-versatile",
        baseURL: ""
      },
      recall: {
        topK: 5,
        minScore: DEFAULT_MIN_SCORE,
        injectEmoji: "\u{1F985}"
      },
      logging: {
        level: "info"
      },
      audit: {
        enabled: true
      },
      capture: {
        enabled: true,
        maxChunks: 3,
        importanceThreshold: 0.5,
        ttlMs: 30 * 24 * 60 * 60 * 1e3,
        maxChunkSize: 2e3,
        minChunkSize: 20,
        dedupSimilarity: 0.95
      },
      python: {
        pythonPath: "python3",
        hawkDir: "~/.openclaw/hawk",
        httpMode: false,
        httpBase: "http://127.0.0.1:18360"
      }
    };
    configPromise = null;
    HAWK_CONFIG_VERSION = process.env.HAWK_CONFIG_VERSION || "1";
  }
});

// src/cli/doctor.ts
init_config();
import * as fs3 from "fs";
import * as path2 from "path";
import * as os2 from "os";
import { execSync } from "child_process";

// src/embeddings.ts
import http from "http";
import https from "https";
import { URL } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";

// src/logger.ts
import pino from "pino";
import fs2 from "fs";
import { join as join2, dirname as dirname2 } from "path";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, unlinkSync, readdirSync, statSync } from "fs";
import { homedir as homedir2 } from "os";
var LOG_DIR = process.env.HAWK_LOG_DIR ?? join2(homedir2(), ".hawk", "logs");
var LOG_FILE_BASE = join2(LOG_DIR, "hawk-bridge.log");
var MAX_FILE_SIZE = parseInt(process.env.HAWK_LOG_MAX_SIZE ?? String(50 * 1024 * 1024), 10);
var MAX_FILES = parseInt(process.env.HAWK_LOG_MAX_FILES ?? "14", 10);
function getTimestamp() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${h}${min}${s}`;
}
var RotatingFileStream = class {
  stream;
  size = 0;
  constructor(filePath) {
    this.ensureDir(dirname2(filePath));
    this.stream = this.openStream(filePath);
  }
  ensureDir(dir) {
    if (!existsSync2(dir)) mkdirSync2(dir, { recursive: true });
  }
  openStream(filePath) {
    const fd = existsSync2(filePath) ? void 0 : void 0;
    const s = fs2.createWriteStream(filePath, { flags: "a", highWaterMark: 64 * 1024 });
    if (existsSync2(filePath)) {
      this.size = statSync(filePath).size;
    }
    return s;
  }
  rotate() {
    this.stream.end();
    const rotatedPath = `${LOG_FILE_BASE}.${getTimestamp()}.log`;
    try {
      const dir = dirname2(LOG_FILE_BASE);
      if (existsSync2(LOG_FILE_BASE)) {
        fs2.renameSync(LOG_FILE_BASE, rotatedPath);
      }
    } catch {
    }
    this.stream = this.openStream(LOG_FILE_BASE);
    this.size = 0;
    this.cleanupOldRotations();
  }
  cleanupOldRotations() {
    try {
      const dir = dirname2(LOG_FILE_BASE);
      const base = basename(LOG_FILE_BASE);
      const files = readdirSync(dir).filter((f) => f.startsWith(base + ".") && f.endsWith(".log")).map((f) => ({
        name: f,
        path: join2(dir, f),
        mtime: statSync(join2(dir, f)).mtime.getTime()
      })).sort((a, b) => a.mtime - b.mtime);
      const excess = files.length - MAX_FILES;
      if (excess > 0) {
        for (const f of files.slice(0, excess)) {
          try {
            unlinkSync(f.path);
          } catch {
          }
        }
      }
    } catch {
    }
  }
  write(chunk, cb) {
    const len = Buffer.byteLength(chunk, "utf8");
    if (this.size + len > MAX_FILE_SIZE) {
      this.rotate();
    }
    this.size += len;
    this.stream.write(chunk, cb);
  }
  end(cb) {
    this.stream.end(cb);
  }
  // Expose for pino
  get fd() {
    return this.stream.fd ?? -1;
  }
};
function basename(p) {
  return p.split("/").pop() ?? p;
}
if (!existsSync2(LOG_DIR)) mkdirSync2(LOG_DIR, { recursive: true });
var rotatingStream = new RotatingFileStream(LOG_FILE_BASE);
var logLevel = process.env.HAWK__LOGGING__LEVEL || process.env.HAWK_LOG_LEVEL || "info";
var logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: pino.stdTimeFunctions.isoTime
}, rotatingStream);
function patchConsole() {
  if (process.env.NODE_ENV !== "production" && process.env.HAWK_STRICT_LOG !== "1") return;
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  const origLog = console.log.bind(console);
  console.error = (...args) => {
    logger.error({ ctx: "console" }, ...args.map((v) => typeof v === "string" ? v : JSON.stringify(v)));
  };
  console.warn = (...args) => {
    logger.warn({ ctx: "console" }, ...args.map((v) => typeof v === "string" ? v : JSON.stringify(v)));
  };
  console.log = (...args) => {
    logger.info({ ctx: "console" }, ...args.map((v) => typeof v === "string" ? v : JSON.stringify(v)));
  };
  console.info = (...args) => {
    logger.info({ ctx: "console" }, ...args.map((v) => typeof v === "string" ? v : JSON.stringify(v)));
  };
  console.debug = (...args) => {
    logger.debug({ ctx: "console" }, ...args.map((v) => typeof v === "string" ? v : JSON.stringify(v)));
  };
}
patchConsole();

// src/metrics.ts
import { Registry, Counter, Histogram, Gauge } from "prom-client";
var register = new Registry();
var httpRequestsTotal = new Counter({
  name: "hawk_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register]
});
var httpRequestDuration = new Histogram({
  name: "hawk_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register]
});
var embeddingLatency = new Histogram({
  name: "hawk_embedding_duration_seconds",
  help: "Embedding latency in seconds",
  labelNames: ["provider"],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register]
});
var memoryCount = new Gauge({
  name: "hawk_memory_count",
  help: "Number of memories in the store",
  registers: [register]
});
var memoryErrors = new Counter({
  name: "hawk_errors_total",
  help: "Total number of memory errors",
  labelNames: ["type"],
  registers: [register]
});

// src/utils/circuit-breaker.ts
var CircuitBreaker = class {
  constructor(threshold = 5, resetMs = 3e4, halfOpenMax = 2) {
    this.threshold = threshold;
    this.resetMs = resetMs;
    this.halfOpenMax = halfOpenMax;
  }
  failures = 0;
  lastFailure = 0;
  state = "closed";
  halfOpenCount = 0;
  async run(fn) {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = "half-open";
        this.halfOpenCount = 0;
      } else {
        throw new CircuitOpenError(`Circuit is open, retry after ${this.resetMs}ms`);
      }
    }
    if (this.state === "half-open") {
      if (this.halfOpenCount >= this.halfOpenMax) {
        throw new CircuitOpenError("Circuit half-open limit reached");
      }
      this.halfOpenCount++;
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }
  onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }
  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure
    };
  }
};
var CircuitOpenError = class extends Error {
  constructor(msg) {
    super(msg);
    this.name = "CircuitOpenError";
  }
};

// src/embeddings.ts
var FETCH_TIMEOUT_MS = 15e3;
var embedBreaker = new CircuitBreaker(5, 3e4);
async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, options.timeout ?? FETCH_TIMEOUT_MS);
      return response;
    } catch (err) {
      lastError = err;
      const isNetworkError = err?.message?.includes("timeout") || err?.message?.includes("ECONNREFUSED") || err?.message?.includes("ENOTFOUND") || err?.message?.includes("socket hang up") || err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT";
      if (isNetworkError && attempt < retries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, retries, delayMs: delay, url, error: err.message }, "fetchWithRetry: retrying after network error");
        await new Promise((res) => setTimeout(res, delay));
      } else if (attempt < retries && err?.message?.includes("status code 5")) {
        const delay = 500 * Math.pow(2, attempt - 1);
        logger.warn({ attempt, retries, delayMs: delay, url, error: err.message }, "fetchWithRetry: retrying after 5xx error");
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
var _activeProxyUrl = process.env.HAWK_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || "";
var _proxyAgent = null;
function setProxyUrl(url) {
  _activeProxyUrl = url;
  _proxyAgent = null;
}
function getProxyUrl() {
  return process.env.HAWK_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || _activeProxyUrl;
}
function getProxyAgent() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return void 0;
  if (!_proxyAgent) {
    _proxyAgent = new HttpsProxyAgent(proxyUrl);
  }
  return _proxyAgent;
}
async function fetchWithTimeout(url, init, timeoutMs) {
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === "https:";
  const agent = getProxyAgent();
  const body = init?.body || null;
  const timeout = timeoutMs ?? FETCH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const headers = {
      ...init?.headers || {}
    };
    if (body) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: init?.method || "GET",
      headers,
      ...agent ? { agent } : {}
    };
    const timer = setTimeout(() => {
      req.destroy(new Error("Fetch timeout"));
    }, timeout);
    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        clearTimeout(timer);
        const responseBody = Buffer.concat(chunks);
        const response = new Response(responseBody, {
          status: res.statusCode || 0,
          statusText: res.statusMessage || "",
          headers: new Headers(res.headers)
        });
        resolve(response);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}
var Embedder = class _Embedder {
  config;
  // TTL cache: normalized_text → { vector, timestamp }
  cache = /* @__PURE__ */ new Map();
  static CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
  // 24h
  constructor(config) {
    this.config = config;
    if (config.proxy) {
      setProxyUrl(config.proxy);
    }
  }
  normalizeForCache(text) {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
  }
  getCached(text) {
    const key = this.normalizeForCache(text);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > _Embedder.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.vector;
  }
  setCached(text, vector) {
    const key = this.normalizeForCache(text);
    this.cache.set(key, { vector, ts: Date.now() });
    if (this.cache.size > 1e4) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, Math.floor(this.cache.size * 0.3));
      for (const [k] of oldest) this.cache.delete(k);
    }
  }
  async embed(texts) {
    const uncached = [];
    const results = texts.map((t) => this.getCached(t));
    for (let i = 0; i < texts.length; i++) {
      if (results[i] === null) uncached.push(texts[i]);
    }
    if (uncached.length === 0) return results;
    const { provider } = this.config;
    const uncachedIdxMap = /* @__PURE__ */ new Map();
    texts.forEach((t, i) => {
      if (results[i] === null) uncachedIdxMap.set(t, i);
    });
    let freshVectors;
    if (provider === "qianwen") {
      freshVectors = await this.embedQianwen(uncached);
    } else if (provider === "openai-compat") {
      freshVectors = await this.embedOpenAICompat(uncached);
    } else if (provider === "ollama") {
      freshVectors = await this.embedOllama(uncached);
    } else if (provider === "jina") {
      freshVectors = await this.embedJina(uncached);
    } else if (provider === "cohere") {
      freshVectors = await this.embedCohere(uncached);
    } else {
      freshVectors = await this.embedOpenAI(uncached);
    }
    const finalResults = [...results];
    for (let i = 0; i < uncached.length; i++) {
      const originalIdx = uncachedIdxMap.get(uncached[i]);
      finalResults[originalIdx] = freshVectors[i];
      this.setCached(uncached[i], freshVectors[i]);
    }
    return finalResults;
  }
  async embedQuery(text) {
    const vectors = await this.embed([text]);
    return vectors[0];
  }
  // ---- Qianwen (阿里云 DashScope) — OpenAI-compatible, 国内首选 ----
  async embedQianwen(texts) {
    const start = Date.now();
    try {
      const apiKey = this.config.apiKey || process.env.QWEN_API_KEY || "";
      const baseURL = this.config.baseURL || "https://dashscope.aliyuncs.com/api/v1";
      const resp = await fetchWithRetry(
        `${baseURL}/services/embeddings/text-embedding/text-embedding`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: this.config.model || "text-embedding-v1",
            input: { text: texts }
          })
        }
      );
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Qianwen embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json();
      if (!data.output?.embeddings?.length) {
        throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
      }
      const result = data.output.embeddings.map((e) => e.embedding);
      embeddingLatency.observe({ provider: "qianwen" }, (Date.now() - start) / 1e3);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: "qianwen" }, (Date.now() - start) / 1e3);
      throw err;
    }
  }
  // ---- OpenAI-Compatible (generic endpoint — user provides baseURL + apiKey) ----
  async embedOpenAICompat(texts) {
    const start = Date.now();
    try {
      const baseURL = this.config.baseURL;
      const apiKey = this.config.apiKey;
      if (!baseURL || !apiKey) {
        throw new Error("openai-compat provider requires both baseURL and apiKey in config");
      }
      const resp = await fetchWithRetry(`${baseURL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model || "text-embedding-3-small",
          input: texts
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI-compatible embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json();
      if (!data.data?.length) {
        throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
      }
      const result = data.data.map((item) => item.embedding);
      embeddingLatency.observe({ provider: "openai-compat" }, (Date.now() - start) / 1e3);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: "openai-compat" }, (Date.now() - start) / 1e3);
      throw err;
    }
  }
  // ---- OpenAI ----
  // NOTE: Use raw fetch instead of OpenAI SDK to avoid dimension truncation issues
  // with OpenAI-compatible servers (e.g. Xinference returns 1024-dim but SDK truncates to 256)
  async embedOpenAI(texts) {
    const start = Date.now();
    try {
      const baseURL = this.config.baseURL;
      const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY || "";
      const model = this.config.model || "text-embedding-3-small";
      const resp = await fetchWithRetry(`${baseURL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
        },
        body: JSON.stringify({ model, input: texts })
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json();
      const result = data.data.map((item) => item.embedding);
      embeddingLatency.observe({ provider: "openai" }, (Date.now() - start) / 1e3);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: "openai" }, (Date.now() - start) / 1e3);
      throw err;
    }
  }
  // ---- Jina AI (free tier) ----
  async embedJina(texts) {
    const start = Date.now();
    try {
      const apiKey = this.config.apiKey || process.env.JINA_API_KEY || "";
      const model = this.config.model || "jina-embeddings-v5-small";
      const resp = await fetchWithRetry("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
        },
        body: JSON.stringify({ model, input: texts })
      });
      if (!resp.ok) throw new Error(`Jina error: ${resp.status}`);
      const data = await resp.json();
      const result = data.data.map((item) => item.embedding);
      embeddingLatency.observe({ provider: "jina" }, (Date.now() - start) / 1e3);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: "jina" }, (Date.now() - start) / 1e3);
      throw err;
    }
  }
  // ---- Cohere (free tier) ----
  async embedCohere(texts) {
    const start = Date.now();
    try {
      const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || "";
      const resp = await fetchWithRetry("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "embed-english-v3.0",
          texts,
          input_type: "search_document"
        })
      });
      if (!resp.ok) throw new Error(`Cohere error: ${resp.status}`);
      const data = await resp.json();
      const result = data.embeddings;
      embeddingLatency.observe({ provider: "cohere" }, (Date.now() - start) / 1e3);
      return result;
    } catch (err) {
      embeddingLatency.observe({ provider: "cohere" }, (Date.now() - start) / 1e3);
      throw err;
    }
  }
  // ---- Ollama (local free) ----
  async embedOllama(texts) {
    const start = Date.now();
    try {
      const baseURL = (this.config.baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
      const model = this.config.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
      const embedPath = process.env.OLLAMA_EMBED_PATH || "/embeddings";
      const normalizedBase = baseURL.replace(/\/$/, "");
      const url = `${normalizedBase}${embedPath}`;
      const resp = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts })
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Ollama embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json();
      if (Array.isArray(data.data)) {
        const sorted = data.data.sort((a, b) => a.index - b.index);
        const result = sorted.map((item) => item.embedding);
        embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
        return result;
      }
      if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
        embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
        return data.embeddings;
      } else if (Array.isArray(data.embeddings)) {
        embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
        return [data.embeddings];
      }
      throw new Error(`Unexpected embedding response: ${JSON.stringify(data)}`);
    } catch (err) {
      embeddingLatency.observe({ provider: "ollama" }, (Date.now() - start) / 1e3);
      throw err;
    }
  }
};

// src/cli/doctor.ts
var checks = [];
function check(name, fn) {
  try {
    const result = fn();
    checks.push({ name, ...result });
    logger.debug({ name, status: result.status }, result.message);
  } catch (e) {
    checks.push({ name, status: "fail", message: `Error: ${e.message}` });
    logger.debug({ name, status: "fail", err: e.message }, "Check failed");
  }
}
async function runDoctor() {
  const args = process.argv.slice(2);
  const testConnection = args.includes("--test-connection") || args.includes("--test-embed") || args.includes("-e");
  const configHistory = args.includes("--config-history");
  if (configHistory) {
    const { printConfigHistory: printConfigHistory2 } = await Promise.resolve().then(() => (init_config(), config_exports));
    printConfigHistory2();
    return;
  }
  console.log("\n\u{1F985} hawk-bridge \u8BCA\u65AD\u5DE5\u5177\n" + "\u2550".repeat(50) + "\n");
  check("Python", () => {
    try {
      const out = execSync("python3 --version 2>&1", { encoding: "utf-8" }).trim();
      return { status: "pass", message: out };
    } catch {
      return { status: "fail", message: "Python3 \u672A\u627E\u5230\uFF0C\u8BF7\u5B89\u88C5 Python 3.8+" };
    }
  });
  check("LanceDB", () => {
    try {
      const lancedbPath = path2.join(process.cwd(), "node_modules", "@lancedb", "lancedb", "dist", "index.js");
      if (fs3.existsSync(lancedbPath)) {
        return { status: "pass", message: "@lancedb/lancedb installed" };
      }
      const pkgJson = path2.join(process.cwd(), "node_modules", "@lancedb", "lancedb", "package.json");
      if (fs3.existsSync(pkgJson)) {
        return { status: "pass", message: "@lancedb/lancedb installed (package.json found)" };
      }
      return { status: "fail", message: "@lancedb/lancedb \u672A\u5B89\u88C5\uFF0C\u8BF7\u8FD0\u884C npm install" };
    } catch (e) {
      return { status: "fail", message: `LanceDB \u68C0\u67E5\u5931\u8D25: ${e.message}` };
    }
  });
  check("\u914D\u7F6E\u6587\u4EF6", () => {
    const yamlPath = path2.join(os2.homedir(), ".hawk", "config.yaml");
    const jsonPath = path2.join(os2.homedir(), ".hawk", "config.json");
    if (fs3.existsSync(yamlPath)) {
      return { status: "pass", message: `~/.hawk/config.yaml \u5B58\u5728` };
    } else if (fs3.existsSync(jsonPath)) {
      return { status: "fail", message: `~/.hawk/config.json \u4E0D\u518D\u652F\u6301\uFF0C\u8BF7\u8FC1\u79FB\u5230 ~/.hawk/config.yaml` };
    } else {
      return { status: "warn", message: `\u65E0\u914D\u7F6E\u6587\u4EF6\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E` };
    }
  });
  check("\u914D\u7F6E\u89E3\u6790", () => {
    try {
      const yamlPath = path2.join(os2.homedir(), ".hawk", "config.yaml");
      if (fs3.existsSync(yamlPath)) {
        return { status: "pass", message: "\u914D\u7F6E\u6587\u4EF6\u53EF\u8BFB\u53D6" };
      }
      return { status: "warn", message: "\u65E0\u914D\u7F6E\u6587\u4EF6\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E" };
    } catch {
      return { status: "fail", message: "\u914D\u7F6E\u89E3\u6790\u5931\u8D25" };
    }
  });
  check("Embedding API Key", () => {
    const keys = [
      process.env.OLLAMA_BASE_URL,
      process.env.HAWK__EMBEDDING__BASE_URL,
      process.env.QWEN_API_KEY,
      process.env.DASHSCOPE_API_KEY,
      process.env.JINA_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.COHERE_API_KEY,
      process.env.HAWK__EMBEDDING__API_KEY
    ].filter(Boolean);
    if (keys.length > 0) {
      const hasKey = keys.some((k) => !k?.startsWith("ollama") && !k?.includes("localhost"));
      return {
        status: hasKey ? "pass" : "warn",
        message: hasKey ? `API Key / URL \u5B58\u5728 (${keys.length}\u4E2A)` : "\u4EC5 OLLAMA_BASE_URL / HAWK__EMBEDDING__BASE_URL \u914D\u7F6E\uFF08\u672C\u5730\u90E8\u7F72\uFF09"
      };
    }
    return { status: "warn", message: "\u672A\u68C0\u6D4B\u5230 Embedding \u914D\u7F6E\uFF0C\u5C06\u4F7F\u7528 fallback\uFF08\u65E0\u5411\u91CF\u641C\u7D22\uFF09" };
  });
  check("hawk CLI", () => {
    const hawkCli = path2.join(os2.homedir(), ".hawk", "bin", "hawk");
    if (fs3.existsSync(hawkCli)) {
      return { status: "pass", message: "~/.hawk/bin/hawk \u5B58\u5728" };
    }
    return { status: "warn", message: "~/.hawk/bin/hawk \u4E0D\u5B58\u5728\uFF08\u53EF\u9009\uFF09" };
  });
  check("\u78C1\u76D8\u7A7A\u95F4", () => {
    try {
      const stat = fs3.statfsSync(os2.homedir());
      const freeGB = stat.bsize * stat.bavail / 1e9;
      if (freeGB < 1) return { status: "fail", message: `\u53EF\u7528\u7A7A\u95F4\u4E0D\u8DB3 ${freeGB.toFixed(1)} GB` };
      if (freeGB < 5) return { status: "warn", message: `\u53EF\u7528\u7A7A\u95F4 ${freeGB.toFixed(1)} GB\uFF08\u504F\u5C11\uFF09` };
      return { status: "pass", message: `\u53EF\u7528\u7A7A\u95F4 ${freeGB.toFixed(1)} GB` };
    } catch {
      return { status: "info", message: "\u65E0\u6CD5\u68C0\u6D4B\u78C1\u76D8\u7A7A\u95F4" };
    }
  });
  check("OpenClaw Hooks", () => {
    const pluginJson = path2.join(process.cwd(), "openclaw.plugin.json");
    if (fs3.existsSync(pluginJson)) {
      try {
        const plugin = JSON.parse(fs3.readFileSync(pluginJson, "utf-8"));
        const hookNames = (plugin.hooks || []).map((h) => h.name);
        return { status: "pass", message: `\u5DF2\u6CE8\u518C hooks: ${hookNames.join(", ")}` };
      } catch {
        return { status: "warn", message: "openclaw.plugin.json \u683C\u5F0F\u9519\u8BEF" };
      }
    }
    return { status: "info", message: "openclaw.plugin.json \u672A\u627E\u5230\uFF08\u4EC5\u5F00\u53D1\u68C0\u67E5\uFF09" };
  });
  if (testConnection) {
    console.log("\n\u6B63\u5728\u6D4B\u8BD5 Embedder \u8FDE\u901A\u6027...\n");
    try {
      const config = await getConfig();
      const embedder = new Embedder(config.embedding);
      const start = Date.now();
      const vectors = await embedder.embed(["health check probe"]);
      const latency = Date.now() - start;
      if (vectors && vectors.length > 0 && vectors[0].length > 0) {
        console.log(`\u2705 Embedder \u8FDE\u901A\u6027: \u6210\u529F (${latency}ms, ${vectors[0].length}\u7EF4\u5411\u91CF)
`);
        console.log(`   Provider: ${config.embedding.provider}`);
        console.log(`   Model: ${config.embedding.model}`);
        console.log(`   Dimensions: ${config.embedding.dimensions}
`);
        logger.info({ latency, dimensions: vectors[0].length, provider: config.embedding.provider, model: config.embedding.model }, "Embedding connectivity test passed");
      } else {
        console.log(`\u26A0\uFE0F Embedder \u8FDE\u901A\u6027: \u8FD4\u56DE\u7ED3\u679C\u5F02\u5E38
`);
        logger.warn({ vectors }, "Embedding connectivity returned unexpected result");
      }
    } catch (e) {
      console.log(`\u274C Embedder \u8FDE\u901A\u6027: \u5931\u8D25 \u2014 ${e.message}
`);
      logger.error({ err: e.message }, "Embedding connectivity test failed");
    }
  }
  console.log("\u8BCA\u65AD\u7ED3\u679C:\n");
  const pass = checks.filter((c) => c.status === "pass").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const info = checks.filter((c) => c.status === "info").length;
  for (const c of checks) {
    const icon = c.status === "pass" ? "\u2705" : c.status === "fail" ? "\u274C" : c.status === "warn" ? "\u26A0\uFE0F" : "\u2139\uFE0F";
    console.log(`${icon} ${c.name}: ${c.message}`);
  }
  console.log("\n" + "\u2500".repeat(50));
  console.log(`\u603B\u7ED3: ${pass} \u901A\u8FC7, ${fail} \u5931\u8D25, ${warn} \u8B66\u544A, ${info} \u4FE1\u606F`);
  if (fail > 0) {
    console.log("\n\u274C \u6709\u5931\u8D25\u9879\uFF0C\u8BF7\u4FEE\u590D\u540E\u518D\u4F7F\u7528\u3002\n");
    process.exit(1);
  } else if (warn > 0) {
    console.log("\n\u26A0\uFE0F \u6709\u8B66\u544A\u9879\uFF0C\u5EFA\u8BAE\u5904\u7406\u540E\u518D\u4F7F\u7528\u3002\n");
    process.exit(0);
  } else {
    console.log("\n\u2705 \u6240\u6709\u68C0\u67E5\u901A\u8FC7\uFF0Chawk-bridge \u53EF\u4EE5\u6B63\u5E38\u4F7F\u7528\uFF01\n");
  }
}
runDoctor().catch(console.error);
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
