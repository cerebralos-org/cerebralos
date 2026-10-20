// src/import-antigravity-proto.js — スキーマ無し protobuf の文字列・整数抽出（ヒューリスティック）
// Antigravity の conversations/<id>.db の steps.step_payload は protobuf だが .proto が手元に無いので、
// wire format を機械的に辿って「パス付きの UTF-8 文字列」と「パス付きの整数」を取り出すだけにする。

const STRICT = new TextDecoder('utf-8', { fatal: true });

function readVarint(buf, i) {
  let result = 0;
  let mul = 1;
  for (let n = 0; n < 10; n++) {
    if (i >= buf.length) throw new RangeError('truncated varint');
    const b = buf[i++];
    result += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [result, i];
    mul *= 128;
  }
  throw new RangeError('varint too long');
}

// 制御文字（\n \r \t 以外）を含まない厳密 UTF-8 なら「人間向けテキスト」とみなす。
function asText(seg) {
  let s;
  try {
    s = STRICT.decode(seg);
  } catch {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) return null;
  return s;
}

function walk(buf, path, depth, out) {
  let i = 0;
  while (i < buf.length) {
    let key;
    [key, i] = readVarint(buf, i);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (field === 0 || field > 2000) throw new RangeError('bad field');
    const p = `${path}/${field}`;
    if (wire === 0) {
      let v;
      [v, i] = readVarint(buf, i);
      out.ints.push({ path: p, n: v });
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 5) {
      i += 4;
    } else if (wire === 2) {
      let len;
      [len, i] = readVarint(buf, i);
      if (i + len > buf.length) throw new RangeError('bad length');
      const seg = buf.subarray(i, i + len);
      i += len;
      if (len === 0) continue;
      // 0x0a（field 1 の length-delimited タグ）で始まる塊は「ネストしたメッセージ」の可能性が高い
      // （\n を許す UTF-8 テキストとも衝突するので、先にネストとして完全に読めるか試す）。
      // それ以外は、制御文字を含まない厳密 UTF-8 ならテキスト、そうでなければネストを試す。
      if (seg[0] !== 0x0a) {
        const text = asText(seg);
        if (text !== null) {
          out.strings.push({ path: p, s: text });
          continue;
        }
      }
      if (depth < 10) {
        const sub = { strings: [], ints: [] };
        try {
          walk(seg, p, depth + 1, sub);
          if (sub.strings.length || sub.ints.length) {
            out.strings.push(...sub.strings);
            out.ints.push(...sub.ints);
            continue;
          }
        } catch {
          // ネストではなかった → 下でテキストとして最終判定
        }
      }
      const fallback = asText(seg);
      if (fallback !== null) {
        out.strings.push({ path: p, s: fallback });
      } else {
        try {
          out.strings.push({ path: p, s: STRICT.decode(seg) });
        } catch {
          // バイナリは捨てる
        }
      }
    } else {
      throw new RangeError('bad wire type');
    }
  }
  if (i !== buf.length) throw new RangeError('overrun');
}

// → { strings: [{path, s}], ints: [{path, n}] }。壊れた payload は空を返す（例外を投げない）。
export function parseProto(buf) {
  const out = { strings: [], ints: [] };
  if (!buf || !buf.length) return out;
  try {
    walk(Buffer.isBuffer(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : buf, '', 0, out);
  } catch {
    // 部分的に取れた分だけ返す
  }
  return out;
}
