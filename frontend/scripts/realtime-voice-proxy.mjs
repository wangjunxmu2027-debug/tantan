import { WebSocket, WebSocketServer } from "ws";
import { gzipSync, gunzipSync } from "node:zlib";

const PORT = Number(process.env.REALTIME_PROXY_PORT || 3101);
const HOST = process.env.REALTIME_PROXY_HOST || "127.0.0.1";
const VOLC_APP_ID = process.env.VOLC_REALTIME_APP_ID;
const VOLC_ACCESS_TOKEN = process.env.VOLC_REALTIME_ACCESS_TOKEN;
const VOLC_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const VOLC_RESOURCE_ID = "volc.speech.dialog";
const VOLC_APP_KEY = "PlgvMymc7f3tQnJ6";

if (!VOLC_APP_ID || !VOLC_ACCESS_TOKEN) {
  throw new Error("Set VOLC_REALTIME_APP_ID and VOLC_REALTIME_ACCESS_TOKEN before starting the realtime proxy.");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function int32(value) {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value, false);
  return result;
}

function join(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function buildVolcEventFrame(event, sessionId, payload, isJson, messageType = "full") {
  const session = sessionId ? encoder.encode(sessionId) : new Uint8Array();
  const body = gzipSync(isJson ? encoder.encode(JSON.stringify(payload)) : payload);
  const header = new Uint8Array([0x11, messageType === "audio" ? 0x24 : 0x14, isJson ? 0x11 : 0x01, 0x00]);
  const sessionFields = sessionId ? join(int32(session.length), session) : new Uint8Array();
  return join(header, int32(event), sessionFields, int32(body.length), body);
}

function parseVolcFrame(data) {
  const bytes = new Uint8Array(data);
  if (bytes.length < 12) return { kind: "unknown" };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messageType = bytes[1] >> 4;
  const flags = bytes[1] & 0x0f;
  const serialization = bytes[2] >> 4;
  let offset = (bytes[0] & 0x0f) * 4;
  let event;

  if (flags === 0x04) {
    event = view.getUint32(offset, false);
    offset += 4;
    const sessionLength = view.getUint32(offset, false);
    offset += 4 + sessionLength;
  }

  if (messageType === 0x0f) {
    const code = view.getUint32(offset, false);
    offset += 4;
    const payloadSize = view.getUint32(offset, false);
    return { kind: "error", code, payload: decoder.decode(bytes.subarray(offset + 4, offset + 4 + payloadSize)) };
  }

  const payloadSize = view.getUint32(offset, false);
  let payload = bytes.subarray(offset + 4, offset + 4 + payloadSize);
  if ((bytes[2] & 0x0f) === 1) payload = gunzipSync(payload);
  if (serialization === 1) {
    try {
      return { kind: "event", event, payload: JSON.parse(decoder.decode(payload)) };
    } catch {
      return { kind: "event", event, payload: {} };
    }
  }
  return { kind: "audio", event, payload };
}

function formatQuestions(questions = {}) {
  const sections = [
    ["第一部分", questions.part1],
    ["第二部分", questions.part2],
    ["第三部分", questions.part3],
  ];
  return sections
    .filter(([, items]) => Array.isArray(items) && items.length > 0)
    .map(([title, items]) => `${title}：\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`)
    .join("\n\n");
}

function sessionConfig(context = {}) {
  const questions = formatQuestions(context.questions);
  const interviewee = context.interviewerName ? `被访者称呼：${context.interviewerName}` : "被访者称呼：请礼貌询问后确认";
  const company = context.companyName ? `公司：${context.companyName}` : "公司：未提供";
  const theme = context.theme ? `调研主题：${context.theme}` : "调研主题：公司调研";
  const purpose = context.purpose ? `访谈目的：${context.purpose}` : "访谈目的：了解受访者的真实经验和需求";
  const systemRole = [
    "你是探探，一位友好、专业的企业调研访谈员。只用中文进行自然的口语化访谈。",
    "访谈上下文：",
    interviewee,
    company,
    theme,
    purpose,
    questions ? `问题清单（必须按顺序覆盖，不得编造或遗漏子问题）：\n${questions}` : "问题清单：请先确认访谈信息后再提问。",
    "每次只问一个问题；认真理解回答后可适度追问；然后继续下一个问题。",
  ].join("\n\n");

  return {
    asr: {
      audio_info: { format: "pcm", sample_rate: 16000, channel: 1 },
      extra: { end_smooth_window_ms: 900, enable_asr_twopass: true },
    },
    dialog: {
      bot_name: "探探",
      system_role: systemRole,
      speaking_style: "口语化、耐心、简洁。",
      // Agent 先开场时客户端尚未开始上行音频；keep_alive 防止服务端把该等待误判为音频空闲超时。
      extra: { input_mod: "keep_alive", model: "1.2.1.1", enable_loudness_norm: true },
    },
    tts: {
      speaker: "zh_male_yunzhou_jupiter_bigtts",
      audio_config: { format: "pcm_s16le", sample_rate: 24000, channel: 1 },
      extra: {},
    },
  };
}

function firstQuestion(context = {}) {
  const questions = context.questions || {};
  const question = [questions.part1, questions.part2, questions.part3]
    .find((section) => Array.isArray(section) && section.length > 0)?.[0];
  const name = context.interviewerName || "您";
  return question
    ? `${name}您好，我是探探。感谢您参与本次访谈。我们先从第一个问题开始：${question}`
    : `${name}您好，我是探探。感谢您参与本次访谈，我们现在开始吧。`;
}

const server = new WebSocketServer({ host: HOST, port: PORT });
server.on("connection", (client) => {
  let upstream;
  let sessionId;
  let context = {};
  let sessionStarted = false;
  let greetingSent = false;

  const sendClient = (message) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  };

  client.on("message", (raw, isBinary) => {
    if (isBinary || !raw) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === "start") {
      if (upstream) return;
      sessionId = message.sessionId;
      context = message.context || {};
      upstream = new WebSocket(VOLC_URL, {
        headers: {
          "X-Api-App-ID": VOLC_APP_ID,
          "X-Api-Access-Key": VOLC_ACCESS_TOKEN,
          "X-Api-Resource-Id": VOLC_RESOURCE_ID,
          "X-Api-App-Key": VOLC_APP_KEY,
          "X-Api-Connect-Id": crypto.randomUUID(),
        },
      });
      upstream.binaryType = "arraybuffer";
      upstream.on("open", () => {
        upstream.send(buildVolcEventFrame(1, null, {}, true));
      });
      upstream.on("message", (data) => {
        const frame = parseVolcFrame(data);
        const sendStartSession = () => {
          if (sessionStarted) return;
          sessionStarted = true;
          upstream.send(buildVolcEventFrame(100, sessionId, sessionConfig(context), true));
        };
        const sendGreeting = () => {
          if (greetingSent || upstream?.readyState !== WebSocket.OPEN) return;
          greetingSent = true;
          const content = firstQuestion(context);
          sendClient({ type: "agent", content });
          upstream.send(buildVolcEventFrame(300, sessionId, { content }, true));
        };
        if (frame.kind === "audio" && frame.event === 352) {
          sendClient({ type: "audio", data: Buffer.from(frame.payload).toString("base64") });
        } else if (frame.kind === "event") {
          sendClient({ type: "event", event: frame.event, payload: frame.payload });
          if (frame.event === 50) sendStartSession();
          if (frame.event === 150) sendGreeting();
        } else if (frame.kind === "error") {
          sendClient({ type: "error", message: frame.payload || `火山错误 ${frame.code}` });
        }
      });
      upstream.on("error", () => sendClient({ type: "error", message: "实时语音服务连接失败" }));
      upstream.on("close", () => sendClient({ type: "closed" }));
      return;
    }

    if (message.type === "audio" && upstream?.readyState === WebSocket.OPEN) {
      upstream.send(buildVolcEventFrame(200, sessionId, Buffer.from(message.data, "base64"), false, "audio"));
    }

    if (message.type === "finish" && upstream?.readyState === WebSocket.OPEN) {
      upstream.send(buildVolcEventFrame(102, sessionId, {}, true));
      upstream.send(buildVolcEventFrame(2, null, {}, true));
      upstream.close();
    }
  });

  client.on("close", () => upstream?.close());
});

console.log(`Realtime voice proxy listening on ws://${HOST}:${PORT}`);
