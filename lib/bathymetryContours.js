import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_REASONABLE_ELEVATION = 9000;
const MIN_REASONABLE_ELEVATION = -12000;

function readUInt32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngRgb(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 33) throw new Error("PNG incompleto.");
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("Arquivo não é PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 12 <= bytes.length) {
    const length = readUInt32BE(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error("Chunk PNG inválido.");

    if (type === "IHDR") {
      width = readUInt32BE(bytes, dataStart);
      height = readUInt32BE(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(bytes.slice(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || !idat.length) throw new Error("PNG sem dados de imagem.");
  if (bitDepth !== 8) throw new Error(`PNG com bit depth ${bitDepth} não suportado.`);
  if (![2, 6].includes(colorType)) throw new Error(`PNG color type ${colorType} não suportado.`);
  if (interlace !== 0) throw new Error("PNG interlaçado não suportado.");

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const compressedLength = idat.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let cursor = 0;
  for (const chunk of idat) {
    compressed.set(chunk, cursor);
    cursor += chunk.length;
  }

  const raw = inflateSync(compressed);
  const expected = height * (rowBytes + 1);
  if (raw.length < expected) throw new Error("PNG descompactado incompleto.");

  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let rawOffset = 0;
  let outOffset = 0;
  let previous = new Uint8Array(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const row = new Uint8Array(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[rawOffset++];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = (value + left) & 255;
      else if (filter === 2) decoded = (value + up) & 255;
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) decoded = (value + paethPredictor(left, up, upLeft)) & 255;
      else throw new Error(`Filtro PNG ${filter} não suportado.`);
      row[x] = decoded;
    }
    pixels.set(row, outOffset);
    outOffset += rowBytes;
    previous = row;
  }

  return { width, height, colorType, bytesPerPixel, pixels };
}

export function terrariumDepthGrid(input) {
  const image = decodePngRgb(input);
  const depths = new Float32Array(image.width * image.height);
  const { pixels, bytesPerPixel } = image;
  let sourceOffset = 0;
  for (let i = 0; i < depths.length; i += 1) {
    const r = pixels[sourceOffset];
    const g = pixels[sourceOffset + 1];
    const b = pixels[sourceOffset + 2];
    sourceOffset += bytesPerPixel;
    const elevation = r * 256 + g + b / 256 - 32768;
    depths[i] = elevation >= MIN_REASONABLE_ELEVATION && elevation <= MAX_REASONABLE_ELEVATION
      ? Math.max(0, -elevation)
      : Number.NaN;
  }
  return { width: image.width, height: image.height, depths };
}

function interpolate(level, aValue, bValue, ax, ay, bx, by) {
  const delta = bValue - aValue;
  const t = Math.abs(delta) < 1e-7 ? 0.5 : Math.max(0, Math.min(1, (level - aValue) / delta));
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function segmentPairs(caseIndex, centerHigh) {
  switch (caseIndex) {
    case 0: case 15: return [];
    case 1: return [[3, 0]];
    case 2: return [[0, 1]];
    case 3: return [[3, 1]];
    case 4: return [[1, 2]];
    case 5: return centerHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
    case 6: return [[0, 2]];
    case 7: return [[3, 2]];
    case 8: return [[2, 3]];
    case 9: return [[0, 2]];
    case 10: return centerHigh ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
    case 11: return [[1, 2]];
    case 12: return [[1, 3]];
    case 13: return [[0, 1]];
    case 14: return [[0, 3]];
    default: return [];
  }
}

function keyForPoint(point) {
  return `${Math.round(point[0] * 10000)},${Math.round(point[1] * 10000)}`;
}

function stitchSegments(segments) {
  if (!segments.length) return [];
  const adjacency = new Map();
  segments.forEach((segment, index) => {
    for (const point of segment) {
      const key = keyForPoint(point);
      const list = adjacency.get(key) || [];
      list.push(index);
      adjacency.set(key, list);
    }
  });

  const visited = new Uint8Array(segments.length);
  const lines = [];

  function trace(startIndex, startKey) {
    const first = segments[startIndex];
    const firstKey = keyForPoint(first[0]);
    const oriented = firstKey === startKey ? [first[0], first[1]] : [first[1], first[0]];
    const line = [oriented[0], oriented[1]];
    visited[startIndex] = 1;
    let currentKey = keyForPoint(oriented[1]);

    for (let guard = 0; guard < segments.length + 2; guard += 1) {
      const candidates = adjacency.get(currentKey) || [];
      const nextIndex = candidates.find((index) => !visited[index]);
      if (nextIndex == null) break;
      const next = segments[nextIndex];
      const aKey = keyForPoint(next[0]);
      const nextPoint = aKey === currentKey ? next[1] : next[0];
      line.push(nextPoint);
      visited[nextIndex] = 1;
      currentKey = keyForPoint(nextPoint);
      if (currentKey === startKey) break;
    }
    return line;
  }

  segments.forEach((segment, index) => {
    if (visited[index]) return;
    const aKey = keyForPoint(segment[0]);
    const bKey = keyForPoint(segment[1]);
    if ((adjacency.get(aKey)?.length || 0) !== 2) lines.push(trace(index, aKey));
    else if ((adjacency.get(bKey)?.length || 0) !== 2) lines.push(trace(index, bKey));
  });

  segments.forEach((segment, index) => {
    if (visited[index]) return;
    lines.push(trace(index, keyForPoint(segment[0])));
  });

  return lines.filter((line) => line.length >= 2);
}

function pointLineDistanceSquared(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    const px = point[0] - start[0];
    const py = point[1] - start[1];
    return px * px + py * py;
  }
  let t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const px = point[0] - (start[0] + t * dx);
  const py = point[1] - (start[1] + t * dy);
  return px * px + py * py;
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = pointLineDistanceSquared(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex > 0 && maxDistance > sqTolerance) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function pixelLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

function tilePixelToLonLat(z, tileX, tileY, px, py, width, height) {
  const n = 2 ** z;
  const worldX = (tileX + px / Math.max(1, width - 1)) / n;
  const worldY = (tileY + py / Math.max(1, height - 1)) / n;
  const lon = worldX * 360 - 180;
  const mercatorY = Math.PI * (1 - 2 * worldY);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY));
  return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
}

export function contourFeaturesFromDepthGrid({ width, height, depths }, options) {
  const { z, x, y, levels, step = 1 } = options;
  const features = [];
  const cellStep = Math.max(1, Math.floor(step));

  for (const level of levels) {
    const segments = [];
    for (let row = 0; row < height - cellStep; row += cellStep) {
      for (let col = 0; col < width - cellStep; col += cellStep) {
        const i00 = row * width + col;
        const i10 = row * width + (col + cellStep);
        const i11 = (row + cellStep) * width + (col + cellStep);
        const i01 = (row + cellStep) * width + col;
        const v0 = depths[i00];
        const v1 = depths[i10];
        const v2 = depths[i11];
        const v3 = depths[i01];
        if (![v0, v1, v2, v3].every(Number.isFinite)) continue;

        const caseIndex = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
        if (caseIndex === 0 || caseIndex === 15) continue;

        const edgePoint = (edge) => {
          if (edge === 0) return interpolate(level, v0, v1, col, row, col + cellStep, row);
          if (edge === 1) return interpolate(level, v1, v2, col + cellStep, row, col + cellStep, row + cellStep);
          if (edge === 2) return interpolate(level, v2, v3, col + cellStep, row + cellStep, col, row + cellStep);
          return interpolate(level, v3, v0, col, row + cellStep, col, row);
        };

        const centerHigh = (v0 + v1 + v2 + v3) / 4 >= level;
        for (const [edgeA, edgeB] of segmentPairs(caseIndex, centerHigh)) {
          segments.push([edgePoint(edgeA), edgePoint(edgeB)]);
        }
      }
    }

    const paths = stitchSegments(segments);
    for (const path of paths) {
      const simplified = simplifyLine(path, z >= 10 ? 0.18 : 0.28);
      if (simplified.length < 2 || pixelLength(simplified) < 2.2) continue;
      const coordinates = simplified.map(([px, py]) => tilePixelToLonLat(z, x, y, px, py, width, height));
      features.push({
        type: "Feature",
        properties: {
          depth: level,
          major: level % 50 === 0 || level === 200,
          label: `${level} m`,
        },
        geometry: { type: "LineString", coordinates },
      });
    }
  }

  return features;
}

export function generateBathymetryContours(input, options) {
  const grid = terrariumDepthGrid(input);
  return contourFeaturesFromDepthGrid(grid, options);
}

export function tileBoundsLonLat(z, x, y) {
  const n = 2 ** z;
  const lonWest = x / n * 360 - 180;
  const lonEast = (x + 1) / n * 360 - 180;
  const latNorth = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const latSouth = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  return [lonWest, latSouth, lonEast, latNorth];
}

export function intersectsSouthBrazilShelf(bounds) {
  const [west, south, east, north] = bounds;
  const coverage = [-58.5, -35.5, -36.0, -19.0];
  return !(east < coverage[0] || west > coverage[2] || north < coverage[1] || south > coverage[3]);
}
