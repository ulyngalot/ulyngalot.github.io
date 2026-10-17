/* ══════════════════════════════════════════════════════════════════════════
   PDF Editor — part 2: reading the real text out of a PDF.
   ──────────────────────────────────────────────────────────────────────────
   A PDF has no notion of a paragraph, a word or even a string of text. Each
   page is a program: a stream of operators that set a font, move a cursor
   and paint glyphs. Editing text for real therefore means reading that
   program, finding the glyph-painting instructions, and rewriting them in
   place — which is what this file exists to do.

   The alternative, and what most browser "PDF editors" actually do, is to
   cover the old text with a white box and paint new text on top. That leaves
   the original glyphs in the file (still selectable, still extractable by
   anything that reads the content stream) and destroys whatever the box
   happens to overlap. Nothing here does that.

   What comes out is a list of runs. A run is one text-showing operator —
   Tj, TJ, ' or " — together with the graphics state in force when it
   executes: font, size, colour, spacing, and the matrices that place it on
   the page. Because a single operator always paints in a single font at a
   single size, a run is the largest unit whose formatting is guaranteed
   uniform, which is what makes "keep the original formatting" achievable
   rather than approximate.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Encoding tables, generated from the Adobe data in @pdf-lib/standard-fonts.
      Only the codes whose value differs from their Unicode code point are
      listed; everything else in WinAnsi is Latin-1 and maps to itself. ── */

const ENC_WINANSI = "140:338 156:339 138:352 154:353 159:376 142:381 158:382 131:402 136:710 152:732 150:8211 151:8212 145:8216 146:8217 130:8218 147:8220 148:8221 132:8222 134:8224 135:8225 149:8226 133:8230 137:8240 139:8249 155:8250 128:8364 153:8482";
const ENC_SYMBOL = "32:160 216:172 109:181 180:215 184:247 166:402 65:913 66:914 71:915 68:916 69:917 90:918 72:919 81:920 73:921 75:922 76:923 77:924 78:925 88:926 79:927 80:928 82:929 83:931 84:932 85:933 70:934 67:935 89:936 87:937 97:945 98:946 103:947 100:948 101:949 122:950 104:951 113:952 105:953 107:954 108:955 109:956 110:957 120:958 111:959 112:960 114:961 86:962 115:963 116:964 117:965 102:966 99:967 121:968 119:969 74:977 161:978 106:981 118:982 183:8226 188:8230 162:8242 178:8243 164:8260 160:8364 193:8465 195:8472 194:8476 87:8486 192:8501 172:8592 173:8593 174:8594 175:8595 171:8596 191:8629 220:8656 221:8657 222:8658 223:8659 219:8660 34:8704 182:8706 36:8707 198:8709 68:8710 209:8711 206:8712 207:8713 39:8715 213:8719 229:8721 45:8722 164:8725 42:8727 214:8730 181:8733 165:8734 208:8736 217:8743 218:8744 199:8745 200:8746 242:8747 92:8756 126:8764 64:8773 187:8776 185:8800 186:8801 163:8804 179:8805 204:8834 201:8835 203:8836 205:8838 202:8839 197:8853 196:8855 94:8869 215:8901 243:8992 245:8993 225:9001 241:9002 224:9674 170:9824 167:9827 169:9829 168:9830 211:63193 210:63194 212:63195 96:63717 189:63718 190:63719 226:63720 227:63721 228:63722 230:63723 231:63724 232:63725 233:63726 234:63727 235:63728 236:63729 237:63730 238:63731 239:63732 244:63733 246:63734 247:63735 248:63736 249:63737 250:63738 251:63739 252:63740 253:63741 254:63742";
const ENC_ZAPF = "32:160 213:8594 214:8596 215:8597 172:9312 173:9313 174:9314 175:9315 176:9316 177:9317 178:9318 179:9319 180:9320 181:9321 110:9632 115:9650 116:9660 117:9670 108:9679 119:9687 72:9733 37:9742 42:9755 43:9758 171:9824 168:9827 170:9829 169:9830 33:9985 34:9986 35:9987 36:9988 38:9990 39:9991 40:9992 41:9993 44:9996 45:9997 46:9998 47:9999 48:10000 49:10001 50:10002 51:10003 52:10004 53:10005 54:10006 55:10007 56:10008 57:10009 58:10010 59:10011 60:10012 61:10013 62:10014 63:10015 64:10016 65:10017 66:10018 67:10019 68:10020 69:10021 70:10022 71:10023 73:10025 74:10026 75:10027 76:10028 77:10029 78:10030 79:10031 80:10032 81:10033 82:10034 83:10035 84:10036 85:10037 86:10038 87:10039 88:10040 89:10041 90:10042 91:10043 92:10044 93:10045 94:10046 95:10047 96:10048 97:10049 98:10050 99:10051 100:10052 101:10053 102:10054 103:10055 104:10056 105:10057 106:10058 107:10059 109:10061 111:10063 112:10064 113:10065 114:10066 118:10070 120:10072 121:10073 122:10074 123:10075 124:10076 125:10077 126:10078 161:10081 162:10082 163:10083 164:10084 165:10085 166:10086 167:10087 182:10102 183:10103 184:10104 185:10105 186:10106 187:10107 188:10108 189:10109 190:10110 191:10111 192:10112 193:10113 194:10114 195:10115 196:10116 197:10117 198:10118 199:10119 200:10120 201:10121 202:10122 203:10123 204:10124 205:10125 206:10126 207:10127 208:10128 209:10129 210:10130 211:10131 212:10132 216:10136 217:10137 218:10138 219:10139 220:10140 221:10141 222:10142 223:10143 224:10144 225:10145 226:10146 227:10147 228:10148 229:10149 230:10150 231:10151 232:10152 233:10153 234:10154 235:10155 236:10156 237:10157 238:10158 239:10159 241:10161 242:10162 243:10163 244:10164 245:10165 246:10166 247:10167 248:10168 249:10169 250:10170 251:10171 252:10172 253:10173 254:10174 128:63703 129:63704 130:63705 131:63706 132:63707 133:63708 134:63709 135:63710 136:63711 137:63712 138:63713 139:63714 140:63715 141:63716";
const GLYPH_NAMES = "A:65 AE:198 Aacute:193 Acircumflex:194 Adieresis:196 Agrave:192 Alpha:913 Aring:197 Atilde:195 B:66 Beta:914 C:67 Ccedilla:199 Chi:935 D:68 Delta:916 E:69 Eacute:201 Ecircumflex:202 Edieresis:203 Egrave:200 Epsilon:917 Eta:919 Eth:208 Euro:8364 F:70 G:71 Gamma:915 H:72 I:73 Iacute:205 Icircumflex:206 Idieresis:207 Ifraktur:8465 Igrave:204 Iota:921 J:74 K:75 Kappa:922 L:76 Lambda:923 M:77 Mu:924 N:78 Ntilde:209 Nu:925 O:79 OE:338 Oacute:211 Ocircumflex:212 Odieresis:214 Ograve:210 Omega:937 Omicron:927 Oslash:216 Otilde:213 P:80 Phi:934 Pi:928 Psi:936 Q:81 R:82 Rfraktur:8476 Rho:929 S:83 Scaron:352 Sigma:931 T:84 Tau:932 Theta:920 Thorn:222 U:85 Uacute:218 Ucircumflex:219 Udieresis:220 Ugrave:217 Upsilon:933 Upsilon1:978 V:86 W:87 X:88 Xi:926 Y:89 Yacute:221 Z:90 Zcaron:381 Zeta:918 a:97 a1:9985 a10:10017 a100:10078 a101:10081 a102:10082 a103:10083 a104:10084 a105:10000 a106:10085 a107:10086 a108:10087 a109:9824 a11:9755 a110:9829 a111:9830 a112:9827 a117:9993 a118:9992 a119:9991 a12:9758 a120:9312 a121:9313 a122:9314 a123:9315 a124:9316 a125:9317 a126:9318 a127:9319 a128:9320 a129:9321 a13:9996 a130:10102 a131:10103 a132:10104 a133:10105 a134:10106 a135:10107 a136:10108 a137:10109 a138:10110 a139:10111 a14:9997 a140:10112 a141:10113 a142:10114 a143:10115 a144:10116 a145:10117 a146:10118 a147:10119 a148:10120 a149:10121 a15:9998 a150:10122 a151:10123 a152:10124 a153:10125 a154:10126 a155:10127 a156:10128 a157:10129 a158:10130 a159:10131 a16:9999 a160:10132 a161:8594 a162:10147 a163:8596 a164:8597 a165:10137 a166:10139 a167:10140 a168:10141 a169:10142 a17:10001 a170:10143 a171:10144 a172:10145 a173:10146 a174:10148 a175:10149 a176:10150 a177:10151 a178:10152 a179:10153 a18:10002 a180:10155 a181:10157 a182:10159 a183:10162 a184:10163 a185:10165 a186:10168 a187:10170 a188:10171 a189:10172 a19:10003 a190:10173 a191:10174 a192:10138 a193:10154 a194:10166 a195:10169 a196:10136 a197:10164 a198:10167 a199:10156 a2:9986 a20:10004 a200:10158 a201:10161 a202:9987 a203:10064 a204:10066 a205:63709 a206:63711 a21:10005 a22:10006 a23:10007 a24:10008 a25:10009 a26:10010 a27:10011 a28:10012 a29:10018 a3:9988 a30:10019 a31:10020 a32:10021 a33:10022 a34:10023 a35:9733 a36:10025 a37:10026 a38:10027 a39:10028 a4:9742 a40:10029 a41:10030 a42:10031 a43:10032 a44:10033 a45:10034 a46:10035 a47:10036 a48:10037 a49:10038 a5:9990 a50:10039 a51:10040 a52:10041 a53:10042 a54:10043 a55:10044 a56:10045 a57:10046 a58:10047 a59:10048 a6:10013 a60:10049 a61:10050 a62:10051 a63:10052 a64:10053 a65:10054 a66:10055 a67:10056 a68:10057 a69:10058 a7:10014 a70:10059 a71:9679 a72:10061 a73:9632 a74:10063 a75:10065 a76:9650 a77:9660 a78:9670 a79:10070 a8:10015 a81:9687 a82:10072 a83:10073 a84:10074 a85:63710 a86:63712 a87:63713 a88:63714 a89:63703 a9:10016 a90:63704 a91:63707 a92:63708 a93:63705 a94:63706 a95:63715 a96:63716 a97:10075 a98:10076 a99:10077 aacute:225 acircumflex:226 acute:180 adieresis:228 ae:230 agrave:224 aleph:8501 alpha:945 ampersand:38 angle:8736 angleleft:9001 angleright:9002 approxequal:8776 aring:229 arrowboth:8596 arrowdblboth:8660 arrowdbldown:8659 arrowdblleft:8656 arrowdblright:8658 arrowdblup:8657 arrowdown:8595 arrowhorizex:63719 arrowleft:8592 arrowright:8594 arrowup:8593 arrowvertex:63718 asciicircum:94 asciitilde:126 asterisk:42 asteriskmath:8727 at:64 atilde:227 b:98 backslash:92 bar:124 beta:946 braceex:63732 braceleft:123 braceleftbt:63731 braceleftmid:63730 bracelefttp:63729 braceright:125 bracerightbt:63742 bracerightmid:63741 bracerighttp:63740 bracketleft:91 bracketleftbt:63728 bracketleftex:63727 bracketlefttp:63726 bracketright:93 bracketrightbt:63739 bracketrightex:63738 bracketrighttp:63737 brokenbar:166 bullet:8226 c:99 carriagereturn:8629 ccedilla:231 cedilla:184 cent:162 chi:967 circlemultiply:8855 circleplus:8853 circumflex:710 club:9827 colon:58 comma:44 congruent:8773 copyright:169 copyrightsans:63721 copyrightserif:63193 currency:164 d:100 dagger:8224 daggerdbl:8225 degree:176 delta:948 diamond:9830 dieresis:168 divide:247 dollar:36 dotmath:8901 e:101 eacute:233 ecircumflex:234 edieresis:235 egrave:232 eight:56 element:8712 ellipsis:8230 emdash:8212 emptyset:8709 endash:8211 epsilon:949 equal:61 equivalence:8801 eta:951 eth:240 exclam:33 exclamdown:161 existential:8707 f:102 five:53 florin:402 four:52 fraction:8260 g:103 gamma:947 germandbls:223 gradient:8711 grave:96 greater:62 greaterequal:8805 guillemotleft:171 guillemotright:187 guilsinglleft:8249 guilsinglright:8250 h:104 heart:9829 hyphen:45 i:105 iacute:237 icircumflex:238 idieresis:239 igrave:236 infinity:8734 integral:8747 integralbt:8993 integralex:63733 integraltp:8992 intersection:8745 iota:953 j:106 k:107 kappa:954 l:108 lambda:955 less:60 lessequal:8804 logicaland:8743 logicalnot:172 logicalor:8744 lozenge:9674 m:109 macron:175 minus:8722 minute:8242 mu:181 multiply:215 n:110 nine:57 notelement:8713 notequal:8800 notsubset:8836 ntilde:241 nu:957 numbersign:35 o:111 oacute:243 ocircumflex:244 odieresis:246 oe:339 ograve:242 omega:969 omega1:982 omicron:959 one:49 onehalf:189 onequarter:188 onesuperior:185 ordfeminine:170 ordmasculine:186 oslash:248 otilde:245 p:112 paragraph:182 parenleft:40 parenleftbt:63725 parenleftex:63724 parenlefttp:63723 parenright:41 parenrightbt:63736 parenrightex:63735 parenrighttp:63734 partialdiff:8706 percent:37 period:46 periodcentered:183 perpendicular:8869 perthousand:8240 phi:966 phi1:981 pi:960 plus:43 plusminus:177 product:8719 propersubset:8834 propersuperset:8835 proportional:8733 psi:968 q:113 question:63 questiondown:191 quotedbl:34 quotedblbase:8222 quotedblleft:8220 quotedblright:8221 quoteleft:8216 quoteright:8217 quotesinglbase:8218 quotesingle:39 r:114 radical:8730 radicalex:63717 reflexsubset:8838 reflexsuperset:8839 registered:174 registersans:63720 registerserif:63194 rho:961 s:115 scaron:353 second:8243 section:167 semicolon:59 seven:55 sigma:963 sigma1:962 similar:8764 six:54 slash:47 space:32 spade:9824 sterling:163 suchthat:8715 summation:8721 t:116 tau:964 therefore:8756 theta:952 theta1:977 thorn:254 three:51 threequarters:190 threesuperior:179 tilde:732 trademark:8482 trademarksans:63722 trademarkserif:63195 two:50 twosuperior:178 u:117 uacute:250 ucircumflex:251 udieresis:252 ugrave:249 underscore:95 union:8746 universal:8704 upsilon:965 v:118 w:119 weierstrass:8472 x:120 xi:958 y:121 yacute:253 ydieresis:255 yen:165 z:122 zcaron:382 zero:48 zeta:950";

function parsePairs(spec) {
  const map = new Map();
  if (!spec) return map;
  for (const pair of spec.split(' ')) {
    const at = pair.lastIndexOf(':');
    map.set(pair.slice(0, at), Number(pair.slice(at + 1)));
  }
  return map;
}

const GLYPH_TO_UNICODE = parsePairs(GLYPH_NAMES);

function buildBaseEncoding(spec, identityLatin) {
  const table = new Array(256).fill(-1);
  if (identityLatin) for (let code = 32; code < 256; code++) table[code] = code;
  for (const [codeStr, unicode] of parsePairs(spec)) table[Number(codeStr)] = unicode;
  return table;
}

const BASE_ENCODINGS = {
  WinAnsiEncoding: buildBaseEncoding(ENC_WINANSI, true),
  MacRomanEncoding: null,   // resolved per font; see resolveBaseEncoding
  StandardEncoding: null,
  Symbol: buildBaseEncoding(ENC_SYMBOL, false),
  ZapfDingbats: buildBaseEncoding(ENC_ZAPF, false)
};

/* StandardEncoding agrees with WinAnsi across printable ASCII apart from two
   codes, and diverges above 127 in ways this build does not carry a table
   for. MacRomanEncoding shares ASCII and diverges entirely above 127. Codes
   left at -1 are reported as unmappable rather than guessed at. */
function resolveBaseEncoding(name) {
  if (name === 'WinAnsiEncoding') return BASE_ENCODINGS.WinAnsiEncoding;
  if (name === 'Symbol') return BASE_ENCODINGS.Symbol;
  if (name === 'ZapfDingbats') return BASE_ENCODINGS.ZapfDingbats;

  const table = new Array(256).fill(-1);
  for (let code = 32; code <= 126; code++) table[code] = code;
  if (name === 'StandardEncoding') {
    table[0x27] = 0x2019;   // quoteright
    table[0x60] = 0x2018;   // quoteleft
  }
  return table;
}

/* ══ Lexer ════════════════════════════════════════════════════════════════
   Turns a decoded content stream into tokens, each carrying the byte range
   it occupies so an operator can later be rewritten exactly in place.
   ════════════════════════════════════════════════════════════════════════ */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function isRegular(byte) {
  return !WHITESPACE.has(byte) && !DELIMITERS.has(byte);
}

function lexContentStream(bytes) {
  const tokens = [];
  const length = bytes.length;
  let i = 0;

  while (i < length) {
    const byte = bytes[i];

    if (WHITESPACE.has(byte)) { i++; continue; }

    if (byte === 0x25) {                                   // % comment
      while (i < length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }

    const start = i;

    if (byte === 0x28) {                                   // ( literal string )
      i++;
      let depth = 1;
      const out = [];
      while (i < length && depth > 0) {
        const c = bytes[i];
        if (c === 0x5c) {                                  // backslash escape
          i++;
          const e = bytes[i];
          if (e === 0x6e) { out.push(0x0a); i++; }
          else if (e === 0x72) { out.push(0x0d); i++; }
          else if (e === 0x74) { out.push(0x09); i++; }
          else if (e === 0x62) { out.push(0x08); i++; }
          else if (e === 0x66) { out.push(0x0c); i++; }
          else if (e >= 0x30 && e <= 0x37) {               // \ddd octal
            let value = 0;
            let digits = 0;
            while (digits < 3 && bytes[i] >= 0x30 && bytes[i] <= 0x37) {
              value = value * 8 + (bytes[i] - 0x30);
              i++; digits++;
            }
            out.push(value & 0xff);
          } else if (e === 0x0a) { i++; }                  // line continuation
          else if (e === 0x0d) { i++; if (bytes[i] === 0x0a) i++; }
          else { out.push(e); i++; }
        } else if (c === 0x28) { depth++; out.push(c); i++; }
        else if (c === 0x29) { depth--; if (depth > 0) out.push(c); i++; }
        else { out.push(c); i++; }
      }
      tokens.push({ type: 'str', value: Uint8Array.from(out), start, end: i });
      continue;
    }

    if (byte === 0x3c && bytes[i + 1] === 0x3c) {          // << dict
      tokens.push({ type: 'dict-open', start, end: i + 2 });
      i += 2;
      continue;
    }
    if (byte === 0x3e && bytes[i + 1] === 0x3e) {
      tokens.push({ type: 'dict-close', start, end: i + 2 });
      i += 2;
      continue;
    }

    if (byte === 0x3c) {                                   // < hex string >
      i++;
      const digits = [];
      while (i < length && bytes[i] !== 0x3e) {
        const c = bytes[i];
        if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)) {
          digits.push(String.fromCharCode(c));
        }
        i++;
      }
      i++;                                                 // closing >
      if (digits.length % 2) digits.push('0');
      const out = new Uint8Array(digits.length / 2);
      for (let k = 0; k < out.length; k++) out[k] = parseInt(digits[2 * k] + digits[2 * k + 1], 16);
      tokens.push({ type: 'str', value: out, hex: true, start, end: i });
      continue;
    }

    if (byte === 0x5b) { tokens.push({ type: 'arr-open', start, end: ++i }); continue; }
    if (byte === 0x5d) { tokens.push({ type: 'arr-close', start, end: ++i }); continue; }
    if (byte === 0x7b) { tokens.push({ type: 'brace-open', start, end: ++i }); continue; }
    if (byte === 0x7d) { tokens.push({ type: 'brace-close', start, end: ++i }); continue; }

    if (byte === 0x2f) {                                   // /Name
      i++;
      let name = '';
      while (i < length && isRegular(bytes[i])) {
        if (bytes[i] === 0x23 && i + 2 < length) {         // #xx escape
          name += String.fromCharCode(parseInt(String.fromCharCode(bytes[i + 1], bytes[i + 2]), 16));
          i += 3;
        } else {
          name += String.fromCharCode(bytes[i]);
          i++;
        }
      }
      tokens.push({ type: 'name', value: name, start, end: i });
      continue;
    }

    // Number or operator
    let raw = '';
    while (i < length && isRegular(bytes[i])) { raw += String.fromCharCode(bytes[i]); i++; }
    if (raw === '') { i++; continue; }                     // unexpected delimiter

    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(raw)) {
      tokens.push({ type: 'num', value: parseFloat(raw), start, end: i });
    } else {
      tokens.push({ type: 'op', value: raw, start, end: i });
      if (raw === 'BI') {                                  // inline image: skip to EI
        while (i < length - 1) {
          if (bytes[i] === 0x45 && bytes[i + 1] === 0x49 &&
              (i + 2 >= length || !isRegular(bytes[i + 2])) && WHITESPACE.has(bytes[i - 1])) {
            i += 2;
            break;
          }
          i++;
        }
        tokens[tokens.length - 1].end = i;
      }
    }
  }

  return tokens;
}

/* ══ Matrices ═════════════════════════════════════════════════════════════
   PDF matrices are [a b c d e f], i.e. | a b 0 ; c d 0 ; e f 1 |.
   ════════════════════════════════════════════════════════════════════════ */

const IDENTITY = [1, 0, 0, 1, 0, 0];

function matMul(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5]
  ];
}

function matApply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Vertical scale the matrix applies, used to turn a font size into points. */
function matScaleY(m) {
  return Math.hypot(m[1], m[3]) || 1;
}
function matScaleX(m) {
  return Math.hypot(m[0], m[2]) || 1;
}

/* ══ Fonts ════════════════════════════════════════════════════════════════ */

/** Parses a /ToUnicode CMap into code -> string. Handles bfchar and bfrange. */
function parseToUnicodeCMap(text) {
  const map = new Map();

  const hexToString = (hex) => {
    let out = '';
    for (let i = 0; i + 3 < hex.length + 1; i += 4) {
      const unit = parseInt(hex.slice(i, i + 4), 16);
      if (!Number.isNaN(unit)) out += String.fromCharCode(unit);
    }
    return out;
  };

  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of charBlocks) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
    let m;
    while ((m = re.exec(block))) map.set(parseInt(m[1], 16), hexToString(m[2]));
  }

  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of rangeBlocks) {
    // <lo> <hi> <dst>
    const simple = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g;
    let m;
    while ((m = simple.exec(block))) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const dst = m[3];
      if (hi - lo > 65535) continue;
      for (let code = lo; code <= hi; code++) {
        const base = parseInt(dst.slice(-4), 16) + (code - lo);
        map.set(code, hexToString(dst.slice(0, -4)) + String.fromCharCode(base));
      }
    }
    // <lo> <hi> [ <d1> <d2> ... ]
    const listed = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g;
    while ((m = listed.exec(block))) {
      const lo = parseInt(m[1], 16);
      const items = m[3].match(/<([0-9A-Fa-f]*)>/g) || [];
      items.forEach((item, index) => map.set(lo + index, hexToString(item.slice(1, -1))));
    }
  }

  return map;
}

function safeDecodeStream(context, streamOrRef, PDFLib) {
  try {
    const stream = context.lookup(streamOrRef);
    if (!stream) return null;
    const bytes = PDFLib.decodePDFRawStream(stream).decode();
    return bytes;
  } catch (err) {
    return null;
  }
}

function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Reads everything about one font resource that is needed to decode the text
 * it has already painted, to re-encode replacement text, and to measure both.
 */
function buildFontInfo(resourceName, fontRef, context, PDFLib) {
  const { PDFName, PDFDict, PDFArray, PDFNumber } = PDFLib;
  const dict = context.lookupMaybe(fontRef, PDFDict);

  const info = {
    resourceName,
    ref: fontRef,
    dict,
    subtype: '',
    baseFont: '',
    family: '',
    isComposite: false,
    bold: false,
    italic: false,
    embedded: false,
    editable: false,
    reason: '',
    defaultWidth: 500,
    widths: new Map(),
    toUnicode: null,
    fromUnicode: null,
    encodingTable: null
  };

  if (!dict) {
    info.reason = 'the font resource could not be read';
    return info;
  }

  const num = (v) => (v instanceof PDFNumber ? v.asNumber() : (typeof v === 'number' ? v : undefined));
  const lookupName = (key) => {
    const v = context.lookup(dict.get(PDFName.of(key)));
    return v && v.asString ? v.asString().replace(/^\//, '') : '';
  };

  info.subtype = lookupName('Subtype');
  info.baseFont = lookupName('BaseFont');
  info.family = info.baseFont.replace(/^[A-Z]{6}\+/, '').replace(/[-,].*$/, '') || 'Unknown';
  info.isComposite = info.subtype === 'Type0';

  /* Descendant font carries the metrics for a composite font. */
  let metricsDict = dict;
  if (info.isComposite) {
    const descendants = context.lookupMaybe(dict.get(PDFName.of('DescendantFonts')), PDFArray);
    if (descendants && descendants.size() > 0) {
      metricsDict = context.lookupMaybe(descendants.get(0), PDFDict) || dict;
    }
  }

  /* Descriptor: style flags and the embedded font file. */
  const descriptor = context.lookupMaybe(metricsDict.get(PDFName.of('FontDescriptor')), PDFDict);
  if (descriptor) {
    const flags = num(context.lookup(descriptor.get(PDFName.of('Flags')))) || 0;
    const italicAngle = num(context.lookup(descriptor.get(PDFName.of('ItalicAngle')))) || 0;
    const weight = num(context.lookup(descriptor.get(PDFName.of('FontWeight')))) || 0;
    const stemV = num(context.lookup(descriptor.get(PDFName.of('StemV')))) || 0;
    info.flags = flags;
    info.italicAngle = italicAngle;
    info.italic = !!(flags & 64) || italicAngle < -4 || italicAngle > 4;
    info.bold = !!(flags & (1 << 18)) || weight >= 600 || stemV >= 120;
    info.serif = !!(flags & 2);
    info.monospace = !!(flags & 1);
    info.embedded = ['FontFile', 'FontFile2', 'FontFile3']
      .some((k) => descriptor.get(PDFName.of(k)) !== undefined);
    const missing = num(context.lookup(descriptor.get(PDFName.of('MissingWidth'))));
    if (missing !== undefined) info.defaultWidth = missing;
  }
  /* The name is often the only honest signal for a non-embedded font. */
  const lowerBase = info.baseFont.toLowerCase();
  if (/bold|black|heavy|semibold|demi/.test(lowerBase)) info.bold = true;
  if (/italic|oblique/.test(lowerBase)) info.italic = true;

  /* Widths. */
  if (info.isComposite) {
    const dw = num(context.lookup(metricsDict.get(PDFName.of('DW'))));
    info.defaultWidth = dw === undefined ? 1000 : dw;
    const w = context.lookupMaybe(metricsDict.get(PDFName.of('W')), PDFArray);
    if (w) {
      let i = 0;
      while (i < w.size()) {
        const first = num(context.lookup(w.get(i)));
        const second = context.lookup(w.get(i + 1));
        if (second instanceof PDFArray) {
          for (let k = 0; k < second.size(); k++) {
            info.widths.set(first + k, num(context.lookup(second.get(k))) || 0);
          }
          i += 2;
        } else {
          const last = num(second);
          const width = num(context.lookup(w.get(i + 2))) || 0;
          if (last !== undefined && last - first < 65536) {
            for (let code = first; code <= last; code++) info.widths.set(code, width);
          }
          i += 3;
        }
      }
    }
  } else {
    const firstChar = num(context.lookup(dict.get(PDFName.of('FirstChar'))));
    const widths = context.lookupMaybe(dict.get(PDFName.of('Widths')), PDFArray);
    if (widths && firstChar !== undefined) {
      for (let k = 0; k < widths.size(); k++) {
        const value = num(context.lookup(widths.get(k)));
        if (value !== undefined) info.widths.set(firstChar + k, value);
      }
    }
  }

  /* Encoding: base table plus /Differences. */
  if (!info.isComposite) {
    let baseName = /symbol/i.test(info.baseFont) ? 'Symbol'
      : /zapf|dingbat/i.test(info.baseFont) ? 'ZapfDingbats'
        : 'StandardEncoding';
    let differences = null;

    const encoding = context.lookup(dict.get(PDFName.of('Encoding')));
    if (encoding && encoding.asString) {
      baseName = encoding.asString().replace(/^\//, '');
    } else if (encoding instanceof PDFDict) {
      const be = context.lookup(encoding.get(PDFName.of('BaseEncoding')));
      if (be && be.asString) baseName = be.asString().replace(/^\//, '');
      else if (info.embedded === false) baseName = 'StandardEncoding';
      differences = context.lookupMaybe(encoding.get(PDFName.of('Differences')), PDFArray);
    }

    const table = resolveBaseEncoding(baseName).slice();
    info.baseEncodingName = baseName;

    if (differences) {
      let code = 0;
      for (let k = 0; k < differences.size(); k++) {
        const item = context.lookup(differences.get(k));
        const asNumber = num(item);
        if (asNumber !== undefined) {
          code = asNumber;
        } else if (item && item.asString) {
          const glyph = item.asString().replace(/^\//, '');
          table[code] = glyphNameToUnicode(glyph);
          code++;
        }
      }
    }
    info.encodingTable = table;
  }

  /* ToUnicode wins over the encoding table when both are present: it is the
     font's own statement of what its codes mean. */
  const toUnicodeRef = dict.get(PDFName.of('ToUnicode'));
  if (toUnicodeRef) {
    const bytes = safeDecodeStream(context, toUnicodeRef, PDFLib);
    if (bytes) {
      try {
        info.toUnicode = parseToUnicodeCMap(latin1(bytes));
      } catch (err) {
        info.toUnicode = null;
      }
    }
  }

  /* The reverse map is what makes replacement possible: it says which byte
     sequence paints a given character in THIS font. A character missing from
     it cannot be drawn by this font at all. */
  info.fromUnicode = new Map();
  if (info.toUnicode) {
    for (const [code, text] of info.toUnicode) {
      if (text && text.length === 1 && !info.fromUnicode.has(text)) info.fromUnicode.set(text, code);
    }
  }
  if (info.encodingTable) {
    for (let code = 0; code < 256; code++) {
      const unicode = info.encodingTable[code];
      if (unicode > 0) {
        const ch = String.fromCharCode(unicode);
        if (!info.fromUnicode.has(ch)) info.fromUnicode.set(ch, code);
      }
    }
  }

  info.bytesPerCode = info.isComposite ? 2 : 1;

  /* A composite font with no ToUnicode gives no way back from a character to
     a glyph id, so its text can be shown but not rewritten. */
  if (info.isComposite && !info.toUnicode) {
    info.editable = false;
    info.reason = 'this font is a composite subset with no ToUnicode map, so its glyph codes cannot be derived from text';
  } else if (info.fromUnicode.size === 0) {
    info.editable = false;
    info.reason = 'no usable character encoding was found for this font';
  } else {
    info.editable = true;
  }

  return info;
}

/* Reverse WinAnsi, for text painted with a substituted standard font. */
let WINANSI_REVERSE = null;

function winAnsiReverse() {
  if (WINANSI_REVERSE) return WINANSI_REVERSE;
  WINANSI_REVERSE = new Map();
  const table = BASE_ENCODINGS.WinAnsiEncoding;
  for (let code = 32; code < 256; code++) {
    const unicode = table[code];
    if (unicode > 0 && !WINANSI_REVERSE.has(unicode)) WINANSI_REVERSE.set(unicode, code);
  }
  return WINANSI_REVERSE;
}

/**
 * Encodes text for one of the 14 built-in fonts, which are always WinAnsi.
 * Used only when the document's own font physically cannot draw the
 * replacement — see the substitution path in part 3.
 */
function encodeWinAnsi(text) {
  const reverse = winAnsiReverse();
  const codes = [];
  const unencodable = [];
  for (const ch of text) {
    const code = reverse.get(ch.codePointAt(0));
    if (code === undefined) unencodable.push(ch);
    else codes.push(code);
  }
  return { bytes: Uint8Array.from(codes), codes, unencodable, ok: unencodable.length === 0 };
}

/** Picks the built-in font that comes closest to an original. */
function substituteFontFor(font) {
  const bold = !!(font && font.bold);
  const italic = !!(font && font.italic);
  if (font && font.monospace) {
    if (bold && italic) return 'Courier-BoldOblique';
    if (bold) return 'Courier-Bold';
    if (italic) return 'Courier-Oblique';
    return 'Courier';
  }
  if (font && font.serif) {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold) return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

function glyphNameToUnicode(glyph) {
  if (GLYPH_TO_UNICODE.has(glyph)) return GLYPH_TO_UNICODE.get(glyph);
  let m = /^uni([0-9A-Fa-f]{4})/.exec(glyph);
  if (m) return parseInt(m[1], 16);
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(glyph);
  if (m) return parseInt(m[1], 16);
  m = /^(?:g|cid|c|G)(\d+)$/.exec(glyph);
  if (m) return -1;                       // a glyph id, not a character
  if (glyph.length === 1) return glyph.charCodeAt(0);
  return -1;
}

/* ── decode / encode / measure, bound to a FontInfo ── */

function fontDecode(font, bytes) {
  let out = '';
  if (font.isComposite) {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (font.toUnicode && font.toUnicode.has(code)) out += font.toUnicode.get(code);
      else out += '�';
    }
    if (bytes.length % 2) out += '�';
  } else {
    for (let i = 0; i < bytes.length; i++) {
      const code = bytes[i];
      if (font.toUnicode && font.toUnicode.has(code)) {
        out += font.toUnicode.get(code);
      } else if (font.encodingTable && font.encodingTable[code] > 0) {
        out += String.fromCharCode(font.encodingTable[code]);
      } else {
        out += '�';
      }
    }
  }
  return out;
}

/**
 * Turns replacement text back into the byte codes this font paints with.
 * Returns the bytes plus any characters the font simply cannot draw, which
 * the caller surfaces rather than silently dropping.
 */
function fontEncode(font, text) {
  const codes = [];
  const unencodable = [];
  for (const ch of text) {
    if (ch.length > 1) { unencodable.push(ch); continue; }   // outside the BMP
    let code = font.fromUnicode.get(ch);
    if (code === undefined && ch === ' ') code = font.fromUnicode.get(' ');
    if (code === undefined) { unencodable.push(ch); continue; }
    codes.push(code);
  }

  const bytes = new Uint8Array(codes.length * font.bytesPerCode);
  codes.forEach((code, index) => {
    if (font.bytesPerCode === 2) {
      bytes[index * 2] = (code >> 8) & 0xff;
      bytes[index * 2 + 1] = code & 0xff;
    } else {
      bytes[index] = code & 0xff;
    }
  });

  return { bytes, codes, unencodable, ok: unencodable.length === 0 };
}

/** Advance width of one code, in 1/1000 of an em. */
function fontWidthOf(font, code) {
  if (font.widths.has(code)) return font.widths.get(code);
  if (!font.isComposite) {
    const std = standardWidth(font.baseFont, code);
    if (std !== null) return std;
  }
  return font.defaultWidth;
}

/** Width of a decoded string in 1/1000 em, as this font would paint it. */
function fontMeasure(font, text) {
  let total = 0;
  for (const ch of text) {
    const code = font.fromUnicode.get(ch);
    total += code === undefined ? font.defaultWidth : fontWidthOf(font, code);
  }
  return total;
}

/* ══ Walking the page program ═════════════════════════════════════════════ */

function cloneState(state) {
  return {
    ctm: state.ctm.slice(),
    font: state.font, fontRes: state.fontRes, fontSize: state.fontSize,
    charSpacing: state.charSpacing, wordSpacing: state.wordSpacing,
    hScale: state.hScale, leading: state.leading, rise: state.rise,
    renderMode: state.renderMode, fill: state.fill, fillSpaceComponents: state.fillSpaceComponents
  };
}

function colorFromOperands(operands, kind) {
  const n = operands.length;
  if (kind === 'g' || (kind === 'sc' && n === 1)) {
    const v = Math.round((operands[0] ?? 0) * 255);
    return { r: v, g: v, b: v };
  }
  if (kind === 'rg' || (kind === 'sc' && n === 3)) {
    return {
      r: Math.round((operands[0] ?? 0) * 255),
      g: Math.round((operands[1] ?? 0) * 255),
      b: Math.round((operands[2] ?? 0) * 255)
    };
  }
  if (kind === 'k' || (kind === 'sc' && n === 4)) {
    const [c, m, y, kk] = operands.map((v) => v ?? 0);
    return {
      r: Math.round(255 * (1 - Math.min(1, c + kk))),
      g: Math.round(255 * (1 - Math.min(1, m + kk))),
      b: Math.round(255 * (1 - Math.min(1, y + kk)))
    };
  }
  return null;
}

/**
 * Executes the page's content stream far enough to know, for every
 * text-showing operator, exactly what it paints and where.
 *
 * Also collects thin filled rectangles and short strokes, which is how
 * underlines and strikethroughs exist in a PDF — there is no underline
 * attribute, only a line someone drew under the text.
 */
function extractRuns(bytes, fonts) {
  const tokens = lexContentStream(bytes);
  const runs = [];
  const rules = [];

  let state = {
    ctm: IDENTITY.slice(),
    font: null, fontRes: '', fontSize: 0,
    charSpacing: 0, wordSpacing: 0, hScale: 100, leading: 0, rise: 0,
    renderMode: 0, fill: { r: 0, g: 0, b: 0 }, fillSpaceComponents: 0
  };
  const stack = [];

  let tm = IDENTITY.slice();
  let tlm = IDENTITY.slice();
  let inText = false;

  let operands = [];
  let operandStart = -1;   // byte offset of this operator's first operand
  let pendingArray = null;
  let arrayStart = -1;

  // Current path, for underline detection.
  let pathPoints = [];
  let pathRects = [];

  const flushOperands = () => { operands = []; operandStart = -1; };

  const showText = (token, items, opName, opStart) => {
    const font = state.font;
    const fontSize = state.fontSize;

    // Trm = [Tfs*Th, 0, 0, Tfs, 0, Ts] x Tm x CTM
    const param = [fontSize * (state.hScale / 100), 0, 0, fontSize, 0, state.rise];
    const trm = matMul(matMul(param, tm), state.ctm);

    let text = '';
    const pieces = [];
    let advance = 0;                                      // in text-space units

    for (const item of items) {
      if (typeof item === 'number') {
        advance -= (item / 1000) * fontSize * (state.hScale / 100);
        pieces.push({ kern: item });
        continue;
      }
      const decoded = font ? fontDecode(font, item) : '';
      text += decoded;
      pieces.push({ bytes: item, text: decoded });

      if (font) {
        for (let i = 0; i < item.length; i += font.bytesPerCode) {
          const code = font.bytesPerCode === 2 ? (item[i] << 8) | item[i + 1] : item[i];
          const w0 = fontWidthOf(font, code) / 1000;
          const isSpace = font.bytesPerCode === 1 && code === 32;
          advance += ((w0 * fontSize) + state.charSpacing + (isSpace ? state.wordSpacing : 0))
            * (state.hScale / 100);
        }
      }
    }

    const origin = matApply(trm, 0, 0);
    const end = matApply(matMul([1, 0, 0, 1, advance, 0], matMul(tm, state.ctm)), 0, 0);
    const heightScale = matScaleY(matMul(tm, state.ctm));

    runs.push({
      index: runs.length,
      op: opName,
      opStart,
      argStart: operandStart === -1 ? opStart : operandStart,
      opEnd: token.end,
      text,
      pieces,
      font,
      fontRes: state.fontRes,
      fontSize,
      sizePt: fontSize * heightScale,
      charSpacing: state.charSpacing,
      wordSpacing: state.wordSpacing,
      hScale: state.hScale,
      rise: state.rise,
      renderMode: state.renderMode,
      fill: state.fill ? { ...state.fill } : null,
      tm: tm.slice(),
      ctm: state.ctm.slice(),
      trm,
      x: origin[0],
      y: origin[1],
      x2: end[0],
      y2: end[1],
      advance,
      widthPt: Math.hypot(end[0] - origin[0], end[1] - origin[1]),
      visible: state.renderMode !== 3 && state.renderMode !== 7
    });

    // Advance the text matrix past what was just painted.
    tm = matMul([1, 0, 0, 1, advance, 0], tm);
  };

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];

    if (token.type === 'num' || token.type === 'name' || token.type === 'str') {
      if (pendingArray) {
        /* Inside [ ... ], which for TJ interleaves strings with kerning
           numbers. These belong to the array, not to the operator's own
           operand list. */
        pendingArray.push(token.type === 'num' ? token.value : token);
        continue;
      }
      if (operandStart === -1) operandStart = token.start;
      if (token.type === 'num') operands.push(token.value);
      else if (token.type === 'name') operands.push({ name: token.value });
      else operands.push(token);
      continue;
    }
    if (token.type === 'arr-open') {
      if (operandStart === -1) operandStart = token.start;
      pendingArray = []; arrayStart = token.start;
      continue;
    }
    if (token.type === 'arr-close') {
      operands.push({ array: pendingArray || [], start: arrayStart, end: token.end });
      pendingArray = null;
      continue;
    }
    if (token.type === 'dict-open' || token.type === 'dict-close' ||
        token.type === 'brace-open' || token.type === 'brace-close') {
      continue;
    }
    if (token.type !== 'op') continue;

    if (pendingArray) {                                    // operands inside [ ]
      continue;
    }

    const nums = operands.filter((o) => typeof o === 'number');

    switch (token.value) {
      case 'q': stack.push(cloneState(state)); break;
      case 'Q': if (stack.length) state = stack.pop(); break;
      case 'cm':
        if (nums.length >= 6) state.ctm = matMul(nums.slice(0, 6), state.ctm);
        break;

      case 'BT': inText = true; tm = IDENTITY.slice(); tlm = IDENTITY.slice(); break;
      case 'ET': inText = false; break;

      case 'Tf': {
        const nameOperand = operands.find((o) => o && o.name !== undefined);
        if (nameOperand) {
          state.fontRes = nameOperand.name;
          state.font = fonts.get(nameOperand.name) || null;
        }
        if (nums.length) state.fontSize = nums[nums.length - 1];
        break;
      }
      case 'Tc': if (nums.length) state.charSpacing = nums[0]; break;
      case 'Tw': if (nums.length) state.wordSpacing = nums[0]; break;
      case 'Tz': if (nums.length) state.hScale = nums[0]; break;
      case 'TL': if (nums.length) state.leading = nums[0]; break;
      case 'Ts': if (nums.length) state.rise = nums[0]; break;
      case 'Tr': if (nums.length) state.renderMode = nums[0]; break;

      case 'Td':
        if (nums.length >= 2) { tlm = matMul([1, 0, 0, 1, nums[0], nums[1]], tlm); tm = tlm.slice(); }
        break;
      case 'TD':
        if (nums.length >= 2) {
          state.leading = -nums[1];
          tlm = matMul([1, 0, 0, 1, nums[0], nums[1]], tlm);
          tm = tlm.slice();
        }
        break;
      case 'Tm':
        if (nums.length >= 6) { tlm = nums.slice(0, 6); tm = tlm.slice(); }
        break;
      case 'T*':
        tlm = matMul([1, 0, 0, 1, 0, -state.leading], tlm);
        tm = tlm.slice();
        break;

      case 'Tj': {
        const str = operands.find((o) => o && o.type === 'str');
        if (str && inText) showText(token, [str.value], 'Tj', str.start);
        break;
      }
      case 'TJ': {
        const arr = operands.find((o) => o && o.array);
        if (arr && inText) {
          const items = arr.array.map((item) => (item && item.type === 'str' ? item.value : item));
          showText(token, items, 'TJ', arr.start);
        }
        break;
      }
      case "'": {
        const str = operands.find((o) => o && o.type === 'str');
        tlm = matMul([1, 0, 0, 1, 0, -state.leading], tlm);
        tm = tlm.slice();
        if (str && inText) showText(token, [str.value], "'", str.start);
        break;
      }
      case '"': {
        const str = operands.find((o) => o && o.type === 'str');
        if (nums.length >= 2) { state.wordSpacing = nums[0]; state.charSpacing = nums[1]; }
        tlm = matMul([1, 0, 0, 1, 0, -state.leading], tlm);
        tm = tlm.slice();
        if (str && inText) showText(token, [str.value], '"', str.start);
        break;
      }

      /* Colour. Only the fill colour matters for text. */
      case 'g': state.fill = colorFromOperands(nums, 'g'); break;
      case 'rg': state.fill = colorFromOperands(nums, 'rg'); break;
      case 'k': state.fill = colorFromOperands(nums, 'k'); break;
      case 'sc': case 'scn': {
        const c = colorFromOperands(nums, 'sc');
        if (c) state.fill = c;
        break;
      }

      /* Paths, kept only so underlines can be spotted. */
      case 're':
        if (nums.length >= 4) pathRects.push(nums.slice(nums.length - 4));
        break;
      case 'm': case 'l':
        if (nums.length >= 2) pathPoints.push([nums[0], nums[1]]);
        break;
      case 'f': case 'F': case 'f*': case 'b': case 'b*': case 'B': case 'B*': case 'S': case 's': {
        for (const rect of pathRects) {
          const [rx, ry, rw, rh] = rect;
          const p1 = matApply(state.ctm, rx, ry);
          const p2 = matApply(state.ctm, rx + rw, ry + rh);
          const x1 = Math.min(p1[0], p2[0]);
          const x2 = Math.max(p1[0], p2[0]);
          const y1 = Math.min(p1[1], p2[1]);
          const y2 = Math.max(p1[1], p2[1]);
          if (Math.abs(y2 - y1) <= 3.5 && x2 - x1 > 2) {
            rules.push({ x1, x2, y: (y1 + y2) / 2, thickness: y2 - y1 });
          }
        }
        /* A stroked path counts as a rule when its whole extent is a thin
           horizontal band. Working from the bounding box rather than from a
           two-point line keeps this working for the repeated moveTo that
           several writers emit, and for polylines. */
        if (pathPoints.length >= 2 && (token.value === 'S' || token.value === 's')) {
          const points = pathPoints.map((p) => matApply(state.ctm, p[0], p[1]));
          const xs = points.map((p) => p[0]);
          const ys = points.map((p) => p[1]);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          if (maxY - minY <= 1.5 && maxX - minX > 2) {
            rules.push({ x1: minX, x2: maxX, y: (minY + maxY) / 2, thickness: 1 });
          }
        }
        pathRects = [];
        pathPoints = [];
        break;
      }
      case 'n': case 'W': case 'W*':
        pathRects = [];
        pathPoints = [];
        break;

      default:
        break;
    }

    flushOperands();
  }

  attachDecorations(runs, rules);
  return { runs, rules, tokens };
}

/**
 * Marks runs that have a line drawn under them, or through them. PDFs carry
 * no underline attribute, so this is a geometric inference and is reported to
 * the user as detected rather than certain.
 */
function attachDecorations(runs, rules) {
  for (const run of runs) {
    run.underline = false;
    run.strikeThrough = false;
    if (!run.text.trim() || !run.sizePt) continue;

    const left = Math.min(run.x, run.x2);
    const right = Math.max(run.x, run.x2);
    if (right - left < 1) continue;

    for (const rule of rules) {
      const overlap = Math.min(right, rule.x2) - Math.max(left, rule.x1);
      if (overlap < (right - left) * 0.55) continue;        // must span most of the run

      const below = run.y - rule.y;
      if (below > 0.02 * run.sizePt && below < 0.33 * run.sizePt) run.underline = true;

      const through = rule.y - run.y;
      if (through > 0.17 * run.sizePt && through < 0.42 * run.sizePt) run.strikeThrough = true;
    }
  }
}
