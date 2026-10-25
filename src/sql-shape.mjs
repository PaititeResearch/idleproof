// Table names referenced by SQL statements in source text. Prose such as "computed from
// item_count", "update the total" or a UI string "Select a file from your computer" is not a
// query: a table needs the shape of a statement. Uppercase keywords count anywhere; in any case,
// a statement must sit inside a one-line string literal and have its full SQL shape.
const NAME = String.raw`["\`]?([A-Za-z_][\w.]*)`;
const UPPERCASE = [
  new RegExp(String.raw`\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?` + NAME, 'g'),
  new RegExp(String.raw`\bSELECT\b[^;]{0,200}?\bFROM\s+` + NAME, 'g'),
  new RegExp(String.raw`\b(?:INSERT\s+INTO|DELETE\s+FROM)\s+` + NAME, 'g'),
  new RegExp(String.raw`\bUPDATE\s+` + NAME + String.raw`["\`]?\s+SET\b`, 'g'),
  new RegExp(String.raw`\bJOIN\s+` + NAME + String.raw`["\`]?(?:\s+(?:AS\s+)?[A-Za-z_]\w*)?\s+(?:ON|USING)\b`, 'g')
];
// A column list: identifiers, `*`, calls such as count(*), optional aliases, comma separated.
const COLUMN = String.raw`(?:\*|[\w.]+(?:\([^)]{0,40}\))?)(?:\s+as\s+\w+)?`;
const LITERAL = [
  new RegExp(String.raw`\b(?:create|alter|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?` + NAME, 'gi'),
  new RegExp(String.raw`\bselect\s+(?:distinct\s+)?${COLUMN}(?:\s*,\s*${COLUMN})*\s+from\s+` + NAME, 'gi'),
  new RegExp(String.raw`\binsert\s+into\s+` + NAME + String.raw`["\`]?\s*(?:\(|values\b|select\b|default\b)`, 'gi'),
  new RegExp(String.raw`\bdelete\s+from\s+` + NAME + String.raw`["\`]?\s*(?:where\b|returning\b|;|$)`, 'gi'),
  new RegExp(String.raw`\bupdate\s+` + NAME + String.raw`["\`]?\s+set\s+[\w."\`]+\s*=`, 'gi'),
  new RegExp(String.raw`\bjoin\s+` + NAME + String.raw`["\`]?(?:\s+(?:as\s+)?[A-Za-z_]\w*)?\s+(?:on|using)\b`, 'gi')
];
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\n]){0,400})\1/g;
const NOT_A_TABLE = new Set(['the', 'a', 'an', 'your', 'my', 'our', 'their', 'this', 'that', 'these', 'those', 'its', 'his', 'her', 'any', 'each', 'every', 'all', 'some']);

export function sqlStatementTables(source = '') {
  const text = String(source);
  const tables = [];
  for (const pattern of UPPERCASE) for (const match of text.matchAll(pattern)) tables.push(match[1]);
  for (const literal of text.matchAll(STRING_LITERAL)) {
    for (const pattern of LITERAL) for (const match of literal[2].matchAll(pattern)) tables.push(match[1]);
  }
  return [...new Set(tables.filter((name) => !NOT_A_TABLE.has(name.toLowerCase())))];
}
