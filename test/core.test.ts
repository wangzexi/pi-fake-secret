/**
 * Unit tests for pi-fake-secret.
 *
 * Run: npm test
 */

import extension, { DEFAULT_PATTERNS, MAX_SCAN_SIZE, SecretStore } from "../index.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL ${msg}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
  }
}

function createStore(): SecretStore {
  const store = new SecretStore();
  store.setPatterns(DEFAULT_PATTERNS);
  return store;
}

function textBlock(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

const openAiKey = (body = "AbCdEfGhIjKlMnOp1234567890") => ["sk", "proj", body].join("-");
const anthropicKey = (body = "AbCdEfGhIjKlMnOp1234567890abcdefgh") => ["sk", "ant", "api03", body].join("-");
const githubToken = (body = "AbCdEfGhIjKlMnOp1234567890AbCdEfGhIjKlMnOp1234") => ["ghp", body].join("_");
const githubPat = () => "github_pat_" + "A".repeat(82);
const awsKey = () => "AKIA" + "IOSFODNN7EXAMPLE";
const stripeKey = (mode: "live" | "test", body = "AbCdEfGhIjKlMnOp12345678901234") => ["sk", mode, body].join("_");
const slackToken = () => ["xoxb", "1234567890", "abcdef"].join("-");
const googleKey = () => "AI" + "za" + "a".repeat(35);
const gitlabToken = () => "gl" + "pat-" + "a".repeat(20);

class MockPi {
  handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();
  commands = new Map<string, any>();
  notifications: string[] = [];
  ctx = {
    hasUI: true,
    ui: {
      notify: (message: string) => {
        this.notifications.push(message);
      },
    },
  };

  on(name: string, handler: (event: any, ctx: any) => Promise<any> | any): void {
    this.handlers.set(name, handler);
  }

  registerCommand(name: string, options: any): void {
    this.commands.set(name, options);
  }

  async emit(name: string, event: any): Promise<any> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`missing handler: ${name}`);
    return handler(event, this.ctx);
  }
}

console.log("\nRegistration & mapping");
{
  const s = createStore();
  const real = openAiKey();
  const p1 = s.register(real);
  const p2 = s.register(real);
  assertEqual(p1, p2, "same real maps to same fake");
  assertEqual(s.resolve(p1), real, "fake resolves to real");
  assertEqual(s.resolve("missing"), undefined, "unknown fake does not resolve");
}

console.log("\nFake format");
{
  const s = createStore();
  const cases = [
    openAiKey(),
    anthropicKey(),
    githubToken(),
    githubPat(),
    awsKey(),
    stripeKey("live"),
    stripeKey("test"),
    slackToken(),
    googleKey(),
    gitlabToken(),
  ];

  for (const original of cases) {
    const fake = s.register(original);
    assertEqual(fake.length, original.length, `same length for ${original.slice(0, 12)}`);
    assert(fake !== original, `fake differs for ${original.slice(0, 12)}`);
    for (let i = 0; i < original.length; i++) {
      const ch = original[i];
      if (!/[a-zA-Z0-9]/.test(ch)) {
        assertEqual(fake[i], ch, `separator preserved at ${i}`);
      }
    }
  }
}

console.log("\nMask and unmask");
{
  const s = createStore();
  const openai = openAiKey();
  const anthropic = anthropicKey();
  const github = githubToken();
  const stripe = stripeKey("live");
  const aws = awsKey();
  const input = [
    `OPENAI_API_KEY=${openai}`,
    `ANTHROPIC_API_KEY=${anthropic}`,
    `GITHUB_TOKEN=${github}`,
    `STRIPE_KEY=${stripe}`,
    `AWS_KEY=${aws}`,
  ].join("\n");
  const masked = s.mask(input);
  assert(!masked.includes(openai), "OpenAI key masked");
  assert(!masked.includes(anthropic), "Anthropic key masked");
  assert(!masked.includes(github), "GitHub token masked");
  assert(!masked.includes(stripe), "Stripe key masked");
  assert(!masked.includes(aws), "AWS key masked");
  assertEqual(s.getStats().mappingCount, 5, "five secrets registered");
  assertEqual(s.unmask(masked), input, "round trip restores exact input");
}

console.log("\nKnown fakes are stable");
{
  const s = createStore();
  const real = openAiKey("ORIGINAL-VALUE-1234567890");
  const masked = s.mask(`key=${real}`);
  const fake = masked.match(/sk-proj-[a-zA-Z0-9-]+/)?.[0];
  assert(!!fake, "fake extracted");
  assertEqual(s.getStats().mappingCount, 1, "one mapping after first mask");
  const remasked = s.mask(`key=${fake}`);
  assertEqual(s.getStats().mappingCount, 1, "known fake was not re-registered");
  assertEqual(s.unmask(remasked), `key=${real}`, "known fake still restores");
}

console.log("\nFake generation is deterministic");
{
  const real = openAiKey("CACHE-STABLE-1234567890");
  const first = createStore().register(real);
  const second = createStore().register(real);
  assertEqual(first, second, "same real maps to same fake across stores");
}

console.log("\nLarge text scan");
{
  const s = createStore();
  const secret = openAiKey("LARGE-TEXT-SECRET-1234567890");
  const large = "x".repeat(MAX_SCAN_SIZE + 100) + secret;
  const masked = s.mask(large);
  assert(!masked.includes(secret), "secret after 1 MB is masked");
  assertEqual(s.unmask(masked), large, "large text round trip restores");
}

console.log("\nExtension hooks");
{
  const pi = new MockPi();
  extension(pi as any);

  assert(pi.handlers.has("input"), "input hook registered");
  assert(pi.handlers.has("tool_call"), "tool_call hook registered");
  assert(pi.handlers.has("tool_result"), "tool_result hook registered");
  assert(pi.handlers.has("context"), "context hook registered");
  assert(pi.handlers.has("message_update"), "message_update hook registered");
  assert(pi.handlers.has("message_end"), "message_end hook registered");
  assert(pi.commands.has("secret-mask"), "secret-mask command registered");

  const real = openAiKey("HOOK-SECRET-112233445566");
  const inputResult = await pi.emit("input", { text: `please use ${real}` });
  assertEqual(inputResult.action, "transform", "input is transformed");
  assert(!inputResult.text.includes(real), "model input does not contain real secret");
  const fake = inputResult.text.match(/sk-proj-[a-zA-Z0-9-]+/)?.[0];
  assert(!!fake, "fake visible to model");

  const bash = { toolName: "bash", input: { command: `echo ${fake}` } };
  await pi.emit("tool_call", bash);
  assertEqual(bash.input.command, `echo ${real}`, "bash command restores real secret");

  const write = { toolName: "write", input: { content: `TOKEN=${fake}` } };
  await pi.emit("tool_call", write);
  assertEqual(write.input.content, `TOKEN=${real}`, "write content restores real secret");

  const readResult = await pi.emit("tool_result", {
    toolName: "read",
    content: textBlock(`TOKEN=${real}`),
  });
  assert(!readResult.content[0].text.includes(real), "read result masks real secret");
  assert(readResult.content[0].text.includes(fake), "read result reuses existing fake");

  const contextResult = await pi.emit("context", {
    messages: [{ role: "user", content: `read this: ${real}` }],
  });
  assert(!contextResult.messages[0].content.includes(real), "context masks real secret");

  const assistantUpdate = {
    message: {
      role: "assistant",
      content: textBlock(`I found ${fake}`),
    },
  };
  await pi.emit("message_update", assistantUpdate);
  assertEqual(
    assistantUpdate.message.content[0].text,
    `I found ${real}`,
    "streaming assistant output restores real secret for the user",
  );

  const assistantEnd = {
    message: {
      role: "assistant",
      content: textBlock(`Final answer: ${fake}`),
    },
  };
  await pi.emit("message_end", assistantEnd);
  assertEqual(
    assistantEnd.message.content[0].text,
    `Final answer: ${real}`,
    "final assistant output restores real secret for the user",
  );

  const nextContext = await pi.emit("context", {
    messages: [assistantEnd.message],
  });
  assert(!nextContext.messages[0].content[0].text.includes(real), "persisted visible answer is masked again for model context");
  assert(nextContext.messages[0].content[0].text.includes(fake), "model context sees fake after transparent user output");
}

console.log("\nNo dirty tracking after clean input");
{
  const pi = new MockPi();
  extension(pi as any);
  await pi.emit("input", { text: "hello, no secret here" });
  const result = await pi.emit("tool_result", {
    toolName: "bash",
    content: textBlock("plain output"),
  });
  assertEqual(result.content, undefined, "clean tool result is not transformed");
  assertEqual(pi.notifications.length, 0, "extension stays silent for user transparency");
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
