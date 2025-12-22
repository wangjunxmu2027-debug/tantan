import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// 火山引擎 ASR 配置
const VOLC_ACCESS_KEY = Deno.env.get("VOLC_ACCESS_KEY") || "";
const VOLC_SECRET_KEY = Deno.env.get("VOLC_SECRET_KEY") || "";
const VOLC_ASR_APP_ID = Deno.env.get("VOLC_TTS_APP_ID") || ""; // 复用 TTS 的 APP ID

// 火山引擎一句话识别 API
// 文档: https://www.volcengine.com/docs/6561/80818

interface ASRResponse {
  reqid: string;
  code: number;
  message: string;
  result?: {
    text: string;
    utterances?: Array<{
      text: string;
      start_time: number;
      end_time: number;
    }>;
  };
}

// V4 签名
async function signVolcengineRequest(
  method: string,
  host: string,
  path: string,
  query: URLSearchParams,
  headers: Headers,
  body: string | ArrayBuffer,
  service: string,
  region: string,
  accessKey: string,
  secretKey: string
): Promise<Headers> {
  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);

  headers.set("X-Date", amzDate);
  headers.set("Host", host);

  // Task 1: Create Canonical Request
  const canonicalUri = path;
  const canonicalQueryString = [...query.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const signedHeadersList = Array.from(headers.keys())
    .map(k => k.toLowerCase())
    .filter(k => k === "host" || k === "content-type" || k.startsWith("x-"))
    .sort();

  const canonicalHeaders = signedHeadersList
    .map(k => `${k}:${headers.get(k)?.trim()}\n`)
    .join("");

  const signedHeaders = signedHeadersList.join(";");

  // Hash payload
  const bodyData = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body);
  const hashedPayload = await crypto.subtle.digest("SHA-256", bodyData);
  const hexHashedPayload = Array.from(new Uint8Array(hashedPayload))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hexHashedPayload,
  ].join("\n");

  const hashedCanonicalRequest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRequest)
  );
  const hexHashedCanonicalRequest = Array.from(new Uint8Array(hashedCanonicalRequest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Task 2: Create String to Sign
  const algorithm = "HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hexHashedCanonicalRequest,
  ].join("\n");

  // Task 3: Calculate Signature
  const kSecret = new TextEncoder().encode(secretKey);
  const kDate = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", kSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(dateStamp)
  );
  const kRegion = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", kDate, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(region)
  );
  const kService = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", kRegion, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(service)
  );
  const kSigning = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", kService, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode("request")
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", kSigning, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(stringToSign)
  );
  const hexSignature = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Task 4: Add signing information to the request
  const authorizationHeader =
    `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${hexSignature}`;
  headers.set("Authorization", authorizationHeader);

  return headers;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 获取音频数据 (base64 或 binary)
    const contentType = req.headers.get("content-type") || "";
    
    let audioData: ArrayBuffer;
    let audioFormat = "wav";
    
    if (contentType.includes("application/json")) {
      // Base64 编码的音频
      const { audio, format = "wav" } = await req.json();
      if (!audio) {
        return errorResponse("缺少音频数据", 400);
      }
      // 解码 base64
      const binaryString = atob(audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioData = bytes.buffer;
      audioFormat = format;
    } else {
      // Binary 音频数据
      audioData = await req.arrayBuffer();
    }

    if (!VOLC_ACCESS_KEY || !VOLC_SECRET_KEY) {
      console.warn("火山引擎密钥未配置，无法使用 ASR");
      return errorResponse("ASR 服务未配置", 500);
    }

    // 火山引擎一句话识别 API
    const host = "openspeech.bytedanceapi.com";
    const path = "/api/v1/asr";
    const region = "cn-beijing";
    const service = "speech_asr";
    const method = "POST";

    const query = new URLSearchParams({
      appid: VOLC_ASR_APP_ID,
      language: "zh-CN",
      format: audioFormat,
      max_end_silence: "800",
      show_utterances: "true",
    });

    const headers = new Headers({
      "Content-Type": "audio/" + audioFormat,
      "X-Content-Type": "audio/" + audioFormat,
    });

    const signedHeaders = await signVolcengineRequest(
      method,
      host,
      path,
      query,
      headers,
      audioData,
      service,
      region,
      VOLC_ACCESS_KEY,
      VOLC_SECRET_KEY
    );

    console.log(`ASR 请求: ${host}${path}?${query.toString()}, 音频大小: ${audioData.byteLength} bytes`);

    const response = await fetch(`https://${host}${path}?${query.toString()}`, {
      method: method,
      headers: signedHeaders,
      body: audioData,
    });

    const responseText = await response.text();
    console.log("ASR 响应:", responseText);

    if (!response.ok) {
      console.error("火山引擎 ASR 失败:", response.status, responseText);
      return errorResponse(`ASR 失败: ${responseText}`, response.status);
    }

    const result: ASRResponse = JSON.parse(responseText);
    
    if (result.code !== 0) {
      console.error("ASR 识别失败:", result.message);
      return errorResponse(`ASR 识别失败: ${result.message}`, 400);
    }

    return jsonResponse({
      success: true,
      text: result.result?.text || "",
      utterances: result.result?.utterances || [],
    });

  } catch (err) {
    console.error("ASR 失败:", err);
    return errorResponse(`ASR 失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

