import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const localeDir = path.join(root, "src", "contexts", "locales");
const languages = ["en", "th", "es", "ja", "hi"];
const placeholderRe = /\{([A-Za-z0-9_]+)\}/g;

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function readLocale(lang) {
  const file = path.join(localeDir, `${lang}.ts`);
  const text = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let objectLiteral = null;

  const unwrap = (node) => {
    let current = node;
    while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression?.(current))) {
      current = current.expression;
    }
    return current;
  };

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      const initializer = decl.initializer ? unwrap(decl.initializer) : null;
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === lang &&
        initializer &&
        ts.isObjectLiteralExpression(initializer)
      ) {
        objectLiteral = initializer;
      }
    }
  });

  if (!objectLiteral) throw new Error(`Could not find locale object for ${lang}`);

  const entries = new Map();
  const duplicates = [];
  const nonStringValues = [];
  const emptyStrings = [];

  for (const prop of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    let key = null;
    if (ts.isIdentifier(prop.name)) key = prop.name.text;
    if (ts.isStringLiteral(prop.name) || ts.isNumericLiteral(prop.name)) key = prop.name.text;
    if (!key) continue;

    const line = lineOf(sourceFile, prop);
    let value = null;
    if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
      value = prop.initializer.text;
      if (value === "") emptyStrings.push({ key, line });
    } else {
      nonStringValues.push({ key, line, type: ts.SyntaxKind[prop.initializer.kind] });
    }

    if (entries.has(key)) duplicates.push({ key, firstLine: entries.get(key).line, line });
    entries.set(key, { key, value, line });
  }

  return {
    file: path.relative(root, file).replaceAll(path.sep, "/"),
    entries,
    duplicates,
    nonStringValues,
    emptyStrings,
  };
}

function placeholders(value) {
  if (typeof value !== "string") return [];
  return [...new Set([...value.matchAll(placeholderRe)].map((match) => match[1]))].sort();
}

function findValuePatterns(locale, patterns) {
  const findings = [];
  for (const entry of locale.entries.values()) {
    if (typeof entry.value !== "string") continue;
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      if (pattern.re.test(entry.value)) {
        findings.push({ key: entry.key, line: entry.line, value: entry.value, pattern: pattern.name });
      }
    }
  }
  return findings;
}

function countFindings(findingsByLanguage) {
  return Object.values(findingsByLanguage).reduce((total, findings) => total + findings.length, 0);
}

const locales = Object.fromEntries(languages.map((lang) => [lang, readLocale(lang)]));
const enKeys = new Set(locales.en.entries.keys());
const integrity = {};

for (const lang of languages) {
  const loc = locales[lang];
  const keys = new Set(loc.entries.keys());
  const missing = [...enKeys].filter((key) => !keys.has(key)).sort();
  const extra = [...keys].filter((key) => !enKeys.has(key)).sort();
  const placeholderMismatches = [];

  for (const key of enKeys) {
    const source = locales.en.entries.get(key);
    const target = loc.entries.get(key);
    if (!target) continue;
    const sourcePlaceholders = placeholders(source.value);
    const targetPlaceholders = placeholders(target.value);
    if (sourcePlaceholders.join("|") !== targetPlaceholders.join("|")) {
      placeholderMismatches.push({
        key,
        line: target.line,
        source: sourcePlaceholders,
        target: targetPlaceholders,
        sourceValue: source.value,
        targetValue: target.value,
      });
    }
  }

  integrity[lang] = {
    file: loc.file,
    keyCount: loc.entries.size,
    missingCount: missing.length,
    extraCount: extra.length,
    duplicateCount: loc.duplicates.length,
    nonStringCount: loc.nonStringValues.length,
    emptyCount: loc.emptyStrings.length,
    placeholderMismatchCount: placeholderMismatches.length,
    missing,
    extra,
    duplicates: loc.duplicates,
    nonStringValues: loc.nonStringValues,
    emptyStrings: loc.emptyStrings,
    placeholderMismatches,
  };
}

const badArtifacts = Object.fromEntries(languages.map((lang) => [
  lang,
  findValuePatterns(locales[lang], [
    { name: "undefined", re: /\bundefined\b/i },
    { name: "null", re: /\bnull\b/i },
    { name: "[object Object]", re: /\[object Object\]/i },
    { name: "NaN", re: /\bNaN\b/ },
    { name: "replacement character", re: /\uFFFD/ },
    { name: "QR โค้ดs", re: /QR\s*โค้ดs\b/i },
  ]),
]));

const thaiGlossary = findValuePatterns(locales.th, [
  { name: "พรอมพ์", re: /พรอมพ์/ },
  { name: "อัพโหลด", re: /อัพโหลด/ },
  { name: "อัพเกรด", re: /อัพเกรด/ },
  { name: "แพ็คเกจ", re: /แพ็คเกจ/ },
  { name: "โปรเจค", re: /โปรเจค/ },
  { name: "พรอมป์Pay", re: /พรอมป์Pay/ },
]);

const spanishPromptMisuse = [];
for (const entry of locales.es.entries.values()) {
  if (typeof entry.value !== "string") continue;
  const keyWithoutPromptPay = entry.key.replace(/promptpay/gi, "");
  const valueWithoutPromptPay = entry.value.replace(/PromptPay/g, "");
  const promptContext = /prompt/i.test(keyWithoutPromptPay) || /\bPrompt\b/.test(valueWithoutPromptPay);
  const hasMisuse = /\brápid[oa]s?\b|\b(aviso|mensaje|solicitar)\b/i.test(entry.value);
  if (promptContext && hasMisuse) {
    spanishPromptMisuse.push({ key: entry.key, line: entry.line, value: entry.value });
  }
}

const japaneseResidue = findValuePatterns(locales.ja, [
  { name: "NAME", re: /\bNAME\b/ },
  { name: "STATUS", re: /\bSTATUS\b/ },
  { name: "CREDITS", re: /\bCREDITS\b/ },
  { name: "RUNS", re: /\bRUNS\b/ },
  { name: "SUCCESS", re: /\bSUCCESS\b/ },
  { name: "AVG TIME", re: /\bAVG TIME\b/ },
  { name: "UPDATED", re: /\bUPDATED\b/ },
  { name: "LATEST", re: /\bLATEST\b/ },
  { name: "株式", re: /株式/ },
  { name: "在庫", re: /在庫/ },
  { name: "世代", re: /世代/ },
  { name: "フローラン", re: /フローラン/ },
  { name: "グラブディール", re: /グラブディール/ },
  { name: "THEIR", re: /THEIR/ },
]);

const hindiGlossary = findValuePatterns(locales.hi, [
  { name: "तत्पर", re: /तत्पर/ },
  { name: "संकेत", re: /संकेत/ },
  { name: "क्यू आर", re: /क्यू\s*आर/ },
  { name: "QR संहिता", re: /QR\s*संहिता/ },
  { name: "लबालब", re: /लबालब/ },
  { name: "प्रॉम्प्टपे", re: /प्रॉम्प्टपे/ },
  { name: "स्टॉक संपत्ति", re: /स्टॉक\s*(संपत्ति|परिसंपत्ति)/ },
]);

const keyCounts = languages.map((lang) => integrity[lang].keyCount);
const equalKeyCount = new Set(keyCounts).size === 1;
const integrityFailures = languages.flatMap((lang) => {
  const entry = integrity[lang];
  return [
    entry.missingCount,
    entry.extraCount,
    entry.duplicateCount,
    entry.nonStringCount,
    entry.emptyCount,
    entry.placeholderMismatchCount,
  ].some(Boolean)
    ? [lang]
    : [];
});

const totals = {
  badArtifacts: countFindings(badArtifacts),
  thaiGlossary: thaiGlossary.length,
  spanishPromptMisuse: spanishPromptMisuse.length,
  japaneseResidue: japaneseResidue.length,
  hindiGlossary: hindiGlossary.length,
};

const passed =
  equalKeyCount &&
  integrityFailures.length === 0 &&
  totals.badArtifacts === 0 &&
  totals.thaiGlossary === 0 &&
  totals.spanishPromptMisuse === 0 &&
  totals.japaneseResidue === 0 &&
  totals.hindiGlossary === 0;

console.log("i18n audit summary");
for (const lang of languages) {
  const entry = integrity[lang];
  console.log(
    `${lang}: keys=${entry.keyCount} missing=${entry.missingCount} extra=${entry.extraCount} duplicate=${entry.duplicateCount} nonString=${entry.nonStringCount} empty=${entry.emptyCount} placeholderMismatch=${entry.placeholderMismatchCount} badArtifacts=${badArtifacts[lang].length}`,
  );
}
console.log(`equalKeyCount=${equalKeyCount}`);
console.log(`thaiGlossary=${totals.thaiGlossary}`);
console.log(`spanishPromptMisuse=${totals.spanishPromptMisuse}`);
console.log(`japaneseResidue=${totals.japaneseResidue}`);
console.log(`hindiGlossary=${totals.hindiGlossary}`);

if (!passed) {
  console.error("\ni18n audit failed");
  console.error(JSON.stringify({ integrity, badArtifacts, thaiGlossary, spanishPromptMisuse, japaneseResidue, hindiGlossary }, null, 2));
  process.exit(1);
}

console.log("i18n audit passed");
