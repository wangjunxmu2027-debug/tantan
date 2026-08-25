import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("interview-create initializes all session dependencies before use", async () => {
  const source = await readFile(
    new URL("supabase/functions/interview-create/index.ts", root),
    "utf8",
  );

  assert.match(source, /const supabase = createClient\(supabaseUrl, supabaseKey\);/);
  assert.match(source, /let welcomeMessage = WELCOME_MESSAGE;/);
  assert.doesNotMatch(source, /questions = await fetchQuestionsForCompany\(preset_company, supabase\);\s*\n\s*let questions/);
});

test("question lookup accepts the Supabase client it uses", async () => {
  const source = await readFile(
    new URL("supabase/functions/_shared/feishu.ts", root),
    "utf8",
  );

  assert.match(source, /companyName: string \| null,\s*\n\s*supabase: any/);
  assert.match(source, /const \{ data, error \} = await supabase/);
  assert.match(source, /const feishuResultWithCompany = await queryQuestionsFromFeishu\(theme, companyName\);/);
});

test("rtc-token serializes the official binary token envelope instead of a JSON demo token", async () => {
  const source = await readFile(
    new URL("supabase/functions/rtc-token/index.ts", root),
    "utf8",
  );

  assert.match(source, /const TOKEN_VERSION = "001"/);
  assert.match(source, /putUint32\(value: number\)/);
  assert.match(source, /dataView\.setUint32\([^,]+, value, true\)/);
  assert.match(source, /return `\$\{TOKEN_VERSION\}\$\{appId\}\$\{toBase64\(content\)\}`/);
  assert.doesNotMatch(source, /btoa\(JSON\.stringify\(tokenData\)\)/);
});

test("realtime voice uses a local credential proxy instead of browser speech APIs", async () => {
  const [screen, proxy, packageJson] = await Promise.all([
    readFile(new URL("frontend/src/components/VoiceCallScreen.tsx", root), "utf8"),
    readFile(new URL("frontend/scripts/realtime-voice-proxy.mjs", root), "utf8"),
    readFile(new URL("frontend/package.json", root), "utf8"),
  ]);

  assert.match(screen, /new WebSocket\(resolveRealtimeProxyUrl\(\)\)/);
  assert.doesNotMatch(screen, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(proxy, /openspeech\.bytedance\.com\/api\/v3\/realtime\/dialogue/);
  assert.match(proxy, /X-Api-Access-Key/);
  assert.match(proxy, /buildVolcEventFrame/);
  assert.match(proxy, /gzipSync/);
  assert.match(proxy, /messageType === "audio" \? 0x24 : 0x14/);
  assert.match(proxy, /frame\.event === 50/);
  assert.match(proxy, /sendStartSession\(\)/);
  assert.match(proxy, /sessionId \? join\(int32\(session\.length\), session\) : new Uint8Array\(\)/);
  assert.match(packageJson, /"realtime-proxy"/);
});

test("closing realtime voice only sends FinishSession after the WebSocket opens", async () => {
  const screen = await readFile(
    new URL("frontend/src/components/VoiceCallScreen.tsx", root),
    "utf8",
  );

  assert.match(screen, /socket\?\.readyState === WebSocket\.OPEN/);
  assert.match(screen, /socket\.send\(JSON\.stringify\(\{ type: "finish" \}\)\)/);
});

test("a verified interview link opens the interview and waits for the user to start", async () => {
  const [redirectPage, interviewPage, createFunction, proxy] = await Promise.all([
    readFile(new URL("frontend/src/app/i/[code]/page.tsx", root), "utf8"),
    readFile(new URL("frontend/src/app/interview/[code]/page.tsx", root), "utf8"),
    readFile(new URL("supabase/functions/interview-create/index.ts", root), "utf8"),
    readFile(new URL("frontend/scripts/realtime-voice-proxy.mjs", root), "utf8"),
  ]);

  assert.match(redirectPage, /router\.replace\(`\/interview\/\$\{code\}`\)/);
  assert.doesNotMatch(redirectPage, /setTimeout\(/);
  assert.match(interviewPage, /startRequestedRef\.current/);
  assert.doesNotMatch(interviewPage, /void handleStart\(\);/);
  assert.match(interviewPage, /onStart=\{handleStart\}/);
  assert.match(interviewPage, /questions: response\.questions/);
  assert.match(interviewPage, /companyName: response\.context\.company_name/);
  assert.match(interviewPage, /interviewerName: response\.context\.interviewer_name/);
  assert.match(createFunction, /questions,/);
  assert.match(proxy, /访谈上下文/);
  assert.match(proxy, /context\.questions/);
});

test("voice interview opens automatically, exposes an expandable transcript, and lets the agent speak first", async () => {
  const [screen, interviewPage, proxy] = await Promise.all([
    readFile(new URL("frontend/src/components/VoiceCallScreen.tsx", root), "utf8"),
    readFile(new URL("frontend/src/app/interview/[code]/page.tsx", root), "utf8"),
    readFile(new URL("frontend/scripts/realtime-voice-proxy.mjs", root), "utf8"),
  ]);

  assert.match(interviewPage, /setShowVoiceCall\(true\)/);
  assert.match(screen, /展开逐字稿/);
  assert.match(screen, /transcriptEntries/);
  assert.match(screen, /message\.event === 451/);
  assert.match(screen, /message\.event === 550/);
  assert.match(proxy, /buildVolcEventFrame\(300, sessionId/);
  assert.match(proxy, /firstQuestion/);
});

test("realtime dialogue keeps the session alive while the agent opens the interview", async () => {
  const proxy = await readFile(
    new URL("frontend/scripts/realtime-voice-proxy.mjs", root),
    "utf8",
  );

  assert.match(proxy, /input_mod: "keep_alive"/);
});

test("realtime dialogue uses the configured male interview voice", async () => {
  const proxy = await readFile(
    new URL("frontend/scripts/realtime-voice-proxy.mjs", root),
    "utf8",
  );

  assert.match(proxy, /speaker: "zh_male_yunzhou_jupiter_bigtts"/);
});

test("dedicated voice interview creation does not block on a duplicate LLM greeting", async () => {
  const createFunction = await readFile(
    new URL("supabase/functions/interview-create/index.ts", root),
    "utf8",
  );

  assert.doesNotMatch(createFunction, /await callLLM\(prompt\)/);
  assert.doesNotMatch(createFunction, /getInterviewStartPrompt/);
});

test("text interview has no browser speech entry points and only opens realtime voice", async () => {
  const [chatWindow, messageBubble] = await Promise.all([
    readFile(new URL("frontend/src/components/ChatWindow.tsx", root), "utf8"),
    readFile(new URL("frontend/src/components/MessageBubble.tsx", root), "utf8"),
  ]);

  assert.doesNotMatch(chatWindow, /import VoiceInput/);
  assert.doesNotMatch(chatWindow, /RTCVoiceChat/);
  assert.doesNotMatch(chatWindow, /speechSynthesis|SpeechRecognition|webkitSpeechRecognition/);
  assert.match(chatWindow, /onVoiceCallOpen/);
  assert.doesNotMatch(messageBubble, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.doesNotMatch(messageBubble, /\/tts/);
});

test("closing the voice panel pauses the existing realtime session instead of starting over", async () => {
  const screen = await readFile(
    new URL("frontend/src/components/VoiceCallScreen.tsx", root),
    "utf8",
  );

  assert.match(screen, /const pauseVoiceCall = useCallback/);
  assert.match(screen, /const resumeVoiceCall = useCallback/);
  assert.match(screen, /socket\?\.readyState === WebSocket\.OPEN \|\| socket\?\.readyState === WebSocket\.CONNECTING/);
  assert.match(screen, /onClick=\{\(\) => \{ pauseVoiceCall\(\); onClose\(\); \}\}/);
  assert.doesNotMatch(screen, /onClick=\{\(\) => \{ stopRealtime\(\); onClose\(\); \}\}/);
});

test("realtime transcript is visible immediately and accepts partial and final speech payloads", async () => {
  const screen = await readFile(
    new URL("frontend/src/components/VoiceCallScreen.tsx", root),
    "utf8",
  );

  assert.match(screen, /useState\(true\)/);
  assert.match(screen, /function extractRealtimeText/);
  assert.match(screen, /payload\?\.results/);
  assert.match(screen, /payload\?\.result/);
  assert.match(screen, /candidate\?\.text/);
  assert.match(screen, /upsertTranscript\("user", recognized\.text, !recognized\.isFinal\)/);
  assert.match(screen, /upsertTranscript\("agent", agentText/);
});

test("realtime voice uses the active preview host and names both interview participants", async () => {
  const screen = await readFile(
    new URL("frontend/src/components/VoiceCallScreen.tsx", root),
    "utf8",
  );

  assert.match(screen, /function resolveRealtimeProxyUrl/);
  assert.match(screen, /window\.location\.hostname/);
  assert.match(screen, /function getInterviewTitle/);
  assert.match(screen, /探探与\$\{intervieweeName\}的访谈/);
  assert.match(screen, /getInterviewTitle\(interviewContext\?\.interviewerName\)/);
});

test("the Vercel build uses an ESLint config compatible with the Next.js major version", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("frontend/package.json", root), "utf8"),
  );

  assert.match(packageJson.dependencies.next, /^\^?16\./);
  assert.match(packageJson.devDependencies["eslint-config-next"], /^\^?16\./);
  assert.match(packageJson.devDependencies.eslint, /^\^?9\./);
});

test("the Vercel dependency lockfile only references public package registries", async () => {
  const lockfile = await readFile(new URL("frontend/package-lock.json", root), "utf8");

  assert.doesNotMatch(lockfile, /bnpm\.byted\.org/);
  assert.doesNotMatch(lockfile, /registry\.npm\.taobao\.org/);
});

test("the production realtime proxy only listens on the local interface by default", async () => {
  const proxy = await readFile(
    new URL("frontend/scripts/realtime-voice-proxy.mjs", root),
    "utf8",
  );

  assert.match(proxy, /const HOST = process\.env\.REALTIME_PROXY_HOST \|\| "127\.0\.0\.1";/);
  assert.match(proxy, /new WebSocketServer\(\{ host: HOST, port: PORT \}\)/);
});
