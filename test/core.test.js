/**
 * Unit tests for pi-secret-mask core logic.
 *
 * Run: node test/core.test.js
 */

// ---------------------------------------------------------------
// Inline the SecretStore implementation (importing .ts is tricky)
// ---------------------------------------------------------------
const MAX_SCAN_SIZE = 1_048_576;

const DEFAULT_PATTERNS = [
  { regex: /sk-[a-zA-Z0-9-]{20,}/g },
  { regex: /(?:ghp|gho|ghs|ghu)_[a-zA-Z0-9]{36,}/g },
  { regex: /github_pat_[a-zA-Z0-9_]{82}/g },
  { regex: /(?:AKIA|ASIA)[A-Z0-9]{16}/g },
  { regex: /sk_lab_[a-zA-Z0-9-]{24,}/g },
  { regex: /sk_demo_[a-zA-Z0-9-]{24,}/g },
  { regex: /xox[baprs]-[a-zA-Z0-9-]{10,}/g },
  { regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
  { regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE KEY[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE KEY-----/g },
  { regex: /-----BEGIN [A-Z ]*KEY-----[\s\S]*?-----END [A-Z ]*KEY-----/g },
  { regex: /AIza[a-zA-Z0-9_-]{35,}/g },
  { regex: /glpat-[a-zA-Z0-9_-]{20,}/g },
  { regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g },
];

class SecretStore {
  constructor() {
    this.realToPlaceholder = new Map();
    this.placeholderToReal = new Map();
    this.patterns = [...DEFAULT_PATTERNS];
  }

  setPatterns(p) { this.patterns = p; }
  getPatterns() { return this.patterns; }

  register(real) {
    const existing = this.realToPlaceholder.get(real);
    if (existing) return existing;
    const placeholder = this.generatePlaceholder(real);
    this.realToPlaceholder.set(real, placeholder);
    this.placeholderToReal.set(placeholder, real);
    return placeholder;
  }

  resolve(placeholder) {
    return this.placeholderToReal.get(placeholder);
  }

  mask(text) {
    if (!text || text.length > MAX_SCAN_SIZE) return text;
    const matches = new Map();
    const seen = new Set();
    for (const { regex } of this.patterns) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const real = m[0];
        if (this.placeholderToReal.has(real)) continue;
        if (!seen.has(real) && real.length >= 8) {
          seen.add(real);
          matches.set(real, this.register(real));
        }
      }
    }
    if (matches.size === 0) return text;
    const sorted = [...matches.entries()].sort((a, b) => b[0].length - a[0].length);
    let result = text;
    for (const [real, placeholder] of sorted) {
      result = result.replaceAll(real, placeholder);
    }
    return result;
  }

  unmask(text) {
    if (!text || this.placeholderToReal.size === 0) return text;
    let result = text;
    const sorted = [...this.placeholderToReal.entries()]
      .sort((a, b) => b[0].length - a[0].length);
    for (const [placeholder, real] of sorted) {
      result = result.replaceAll(placeholder, real);
    }
    return result;
  }

  generatePlaceholder(real) {
    let splitAt = 0;
    for (let i = 0; i < real.length; i++) {
      const ch = real[i];
      if (ch === '-' || ch === '_' || ch === '.' || ch === '/') {
        if (real.length - i - 1 >= 6) splitAt = i + 1;
      }
    }
    if (splitAt === 0 && real.length > 8) splitAt = 4;

    const prefix = real.slice(0, splitAt);
    const body = real.slice(splitAt);

    const randomizedBody = body.split('').map((ch) => {
      if (ch >= 'a' && ch <= 'z')
        return String.fromCharCode(97 + Math.floor(Math.random() * 26));
      if (ch >= 'A' && ch <= 'Z')
        return String.fromCharCode(65 + Math.floor(Math.random() * 26));
      if (ch >= '0' && ch <= '9')
        return String.fromCharCode(48 + Math.floor(Math.random() * 10));
      return ch;
    }).join('');

    const result = prefix + randomizedBody;
    if (result === real && randomizedBody.length > 0) {
      const idx = Math.floor(Math.random() * randomizedBody.length);
      const ch = result[splitAt + idx];
      let replacement;
      if (ch >= 'a' && ch <= 'z')
        replacement = ch === 'a' ? 'b' : 'a';
      else if (ch >= 'A' && ch <= 'Z')
        replacement = ch === 'A' ? 'B' : 'A';
      else
        replacement = ch === '0' ? '1' : '0';
      return result.slice(0, splitAt + idx) + replacement + result.slice(splitAt + idx + 1);
    }
    return result;
  }

  getStats() {
    return { patternCount: this.patterns.length, mappingCount: this.realToPlaceholder.size };
  }
}

// ---------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

// 1. Registration and 1:1 mapping
console.log('\n📦 Registration & 1:1 mapping');
{
  const s = new SecretStore();
  const p1 = s.register('sk-proj-AbCdEfGhIjKlMnOp1234567890');
  const p2 = s.register('sk-proj-AbCdEfGhIjKlMnOp1234567890');
  assertEqual(p1, p2, 'same real → same placeholder');
  assertEqual(s.resolve(p1), 'sk-proj-AbCdEfGhIjKlMnOp1234567890', 'resolve returns original');
  assertEqual(s.resolve('nonexistent'), undefined, 'unknown placeholder → undefined');
}

// 2. Placeholder format: prefix preserved, same length
console.log('\n📦 Placeholder format');
{
  const s = new SecretStore();
  const cases = [
    'sk-proj-AbCdEfGhIjKlMnOp1234567890',
    'ghp_AbCdEfGhIjKlMnOp1234567890AbCdEfGhIjKlMnOp1234',
    'sk_lab_AbCdEfGhIjKlMnOp12345678901234',
    'AKIAIOSFODNN7EXAMPLE',
    'sk-ant-api03-AbCdEfGhIjKlMnOp1234567890abcdefgh',
  ];
  for (const original of cases) {
    const p = s.register(original);
    assert(p.startsWith(original.slice(0, 3)), `prefix preserved: ${original} → ${p}`);
    assertEqual(p.length, original.length, `same length: ${original} (${original.length}) → ${p} (${p.length})`);
    assert(p !== original, `different from original: ${original}`);
    // Characters at non-alphanumeric positions should be identical
    for (let i = 0; i < original.length; i++) {
      const oc = original[i];
      if (!/[a-zA-Z0-9]/.test(oc)) {
        assertEqual(p[i], oc, `separator '${oc}' preserved at pos ${i}: ${original} → ${p}`);
      }
    }
  }
}

// 3. mask() basic
console.log('\n📦 mask() basic');
{
  const s = new SecretStore();
  const input = 'my key is sk-proj-AbCdEfGhIjKlMnOp1234567890';
  const masked = s.mask(input);
  assert(masked !== input, 'text changed');
  assert(!masked.includes('sk-proj-AbCdEfGhIjKlMnOp1234567890'), 'original secret removed');
  assert(masked.includes('sk-proj-'), 'prefix kept');
  assertEqual(s.getStats().mappingCount, 1, 'one secret registered');
}

// 4. mask() multiple secrets
console.log('\n📦 mask() multiple secrets');
{
  const s = new SecretStore();
  const input = 'OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOp1234567890\nGITHUB_TOKEN=ghp_AbCdEfGhIjKlMnOp1234567890AbCdEfGhIjKlMnOp1234';
  const masked = s.mask(input);
  assert(!masked.includes('sk-proj-AbCdEfGhIjKlMnOp1234567890'), 'openai key masked');
  assert(!masked.includes('ghp_AbCdEfGhIjKlMnOp1234567890AbCdEfGhIjKlMnOp1234'), 'github token masked');
  assert(masked.includes('OPENAI_API_KEY='), 'env var name kept');
  assert(masked.includes('GITHUB_TOKEN='), 'env var name kept');
}

// 5. Full round-trip: mask → unmask
console.log('\n📦 Full round-trip: mask → unmask');
{
  const s = new SecretStore();
  const input = 'OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOp1234567890';
  const masked = s.mask(input);
  const unmasked = s.unmask(masked);
  assertEqual(unmasked, input, 'round-trip preserves original');
}

// 6. unmask in bash command
console.log('\n📦 unmask() bash commands');
{
  const s = new SecretStore();
  const input = 'use key sk-proj-AbCdEfGhIjKlMnOp1234567890';
  const masked = s.mask(input);

  // Simulate model writing a bash command using the placeholder
  const placeholder = masked.match(/sk-proj-[a-zA-Z0-9]+/)[0];
  const bashCmd = `echo ${placeholder} > /tmp/key.txt`;

  const unmasked = s.unmask(bashCmd);
  assertEqual(unmasked, 'echo sk-proj-AbCdEfGhIjKlMnOp1234567890 > /tmp/key.txt',
    'bash command restored to real value');
}

// 7. No false positives on clean text
console.log('\n📦 No false positives');
{
  const s = new SecretStore();
  const inputs = [
    'hello world',
    'a = 1 + 2',
    'export FOO=bar',
    'just a regular string without secrets',
    'prefix-sk-but-too-short',
  ];
  for (const input of inputs) {
    const masked = s.mask(input);
    assertEqual(masked, input, `clean text unchanged: ${input.slice(0, 40)}`);
  }
}

// 8. Multiple occurrences of the same secret
console.log('\n📦 Multiple occurrences of the same secret');
{
  const s = new SecretStore();
  const input = 'key=sk-proj-AbCdEfGhIjKlMnOp1234567890 and again key=sk-proj-AbCdEfGhIjKlMnOp1234567890';
  const masked = s.mask(input);
  const count = (masked.match(/sk-proj-/g) || []).length;
  assertEqual(count, 2, 'both occurrences replaced');
  assertEqual(s.getStats().mappingCount, 1, 'only one mapping registered');
}

// 9. Large text truncation
console.log('\n📦 Large text (beyond MAX_SCAN_SIZE)');
{
  const s = new SecretStore();
  const secret = 'sk-proj-AbCdEfGhIjKlMnOp1234567890';
  const large = 'x'.repeat(MAX_SCAN_SIZE + 100) + ' ' + secret;
  const masked = s.mask(large);
  assert(masked.includes(secret), 'secret NOT masked in oversized text');
}

// 10. env file scenario
console.log('\n📦 .env file simulation');
{
  const s = new SecretStore();
  const envFile = [
    '# Test env',
    'OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOp1234567890',
    'ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGhIjKlMnOp1234567890abcdefgh',
    'GITHUB_TOKEN=ghp_AbCdEfGhIjKlMnOp1234567890AbCdEfGhIjKlMnOp1234',
    'STRIPE_KEY=sk_lab_AbCdEfGhIjKlMnOp12345678901234',
    'AWS_KEY=AKIAIOSFODNN7EXAMPLE',
  ].join('\n');

  const masked = s.mask(envFile);
  // All variable names preserved
  assert(masked.includes('OPENAI_API_KEY='), 'OPENAI_API_KEY= preserved');
  assert(masked.includes('ANTHROPIC_API_KEY='), 'ANTHROPIC_API_KEY= preserved');
  assert(masked.includes('GITHUB_TOKEN='), 'GITHUB_TOKEN= preserved');
  assert(masked.includes('STRIPE_KEY='), 'STRIPE_KEY= preserved');
  assert(masked.includes('AWS_KEY='), 'AWS_KEY= preserved');
  // Comments preserved
  assert(masked.includes('# Test env'), 'comment preserved');
  // Values replaced
  assert(!masked.includes('sk-proj-AbCdEfGhIjKlMnOp1234567890'), 'openai value masked');
  // 5 secrets registered
  assertEqual(s.getStats().mappingCount, 5, '5 secrets registered');

  // Round-trip
  const unmasked = s.unmask(masked);
  assertEqual(unmasked, envFile, 'full env file round-trips correctly');
}

// 11. Don't re-register known placeholders
console.log('\n📦 No re-registration of known placeholders');
{
  const s = new SecretStore();
  const orig = 'sk-proj-ORIGINAL-VALUE-1234567890';
  // First: register and mask
  const masked = s.mask(`key=${orig}`);
  assert(!masked.includes(orig), 'original removed after first mask');
  assertEqual(s.getStats().mappingCount, 1, 'one secret registered');

  // Extract the placeholder from masked output
  const placeholder = masked.match(/sk-proj-[a-zA-Z0-9-]+/)[0];

  // Second: mask again with the placeholder in the text (simulating
  // a tool_result containing the placeholder)
  const reMasked = s.mask(`found key: ${placeholder}`);
  // The placeholder should NOT be re-registered — it's already a known placeholder
  assertEqual(s.getStats().mappingCount, 1, 'no new registration for existing placeholder');
  assert(reMasked.includes(placeholder), 'placeholder preserved (not re-masked)');

  // Third: unmask should still work
  const unmasked = s.unmask(reMasked);
  assertEqual(unmasked, `found key: ${orig}`, 'round-trip still works after re-mask guard');
}

// 12. AWS key placeholder format
console.log('\n📦 AWS key format');
{
  const s = new SecretStore();
  const p = s.register('AKIAIOSFODNN7EXAMPLE');
  assert(p.startsWith('AKIA'), 'AKIA prefix kept');
  assertEqual(p.length, 20, 'same length as AKIA... key');
  assert(p !== 'AKIAIOSFODNN7EXAMPLE', 'different value');
}

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
