"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Captions, Mic, MicOff, PanelRightClose, X } from "lucide-react";

function resolveRealtimeProxyUrl() {
  if (process.env.NEXT_PUBLIC_REALTIME_PROXY_URL) return process.env.NEXT_PUBLIC_REALTIME_PROXY_URL;
  if (typeof window === "undefined") return "ws://127.0.0.1:3101";

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3101`;
}

function getInterviewTitle(intervieweeName?: string | null) {
  return intervieweeName ? `探探与${intervieweeName}的访谈` : "探探的访谈";
}

interface VoiceCallScreenProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onSendMessage: (content: string) => void;
  latestAIMessage?: string;
  isLoading: boolean;
  voice?: string;
  interviewContext?: {
    theme?: string;
    companyName?: string | null;
    interviewerName?: string | null;
    purpose?: string | null;
    questions?: {
      part1?: string[];
      part2?: string[];
      part3?: string[];
    };
  } | null;
}

type CallStatus = "idle" | "connecting" | "listening" | "speaking" | "error";
type TranscriptEntry = { speaker: "agent" | "user"; content: string; isPartial?: boolean };
type RealtimeText = { text: string; isFinal: boolean };

function extractRealtimeText(payload: any): RealtimeText | null {
  const candidates = [
    payload?.results?.at(-1),
    payload?.result,
    payload?.data?.results?.at(-1),
    payload?.data?.result,
    payload,
  ];

  for (const candidate of candidates) {
    const text = candidate?.text || candidate?.content || candidate?.utterance || candidate?.transcript;
    if (typeof text === "string" && text.trim()) {
      return {
        text,
        isFinal: candidate?.is_final ?? candidate?.isFinal ?? candidate?.final ?? candidate?.definite ?? true,
      };
    }
  }

  return null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function downsampleToPcm16(input: Float32Array, inputRate: number, outputRate = 16000) {
  const ratio = inputRate / outputRate;
  const output = new Int16Array(Math.floor(input.length / ratio));

  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += input[sample];
    const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    output[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }

  return new Uint8Array(output.buffer);
}

export default function VoiceCallScreen({
  isOpen,
  onClose,
  sessionId,
  onSendMessage,
  interviewContext,
}: VoiceCallScreenProps) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const queuedAudioTimeRef = useRef(0);
  const isListeningRef = useRef(false);
  const isMutedRef = useRef(false);
  const onSendMessageRef = useRef(onSendMessage);
  const interviewContextRef = useRef(interviewContext);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const startCaptureRef = useRef<() => void>(() => undefined);
  const shouldCaptureAfterGreetingRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    onSendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  useEffect(() => {
    interviewContextRef.current = interviewContext;
  }, [interviewContext]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcriptEntries]);

  const upsertTranscript = useCallback((speaker: TranscriptEntry["speaker"], content: string, isPartial = false) => {
    if (!content.trim()) return;
    setTranscriptEntries((entries) => {
      const last = entries.at(-1);
      if (isPartial && last?.speaker === speaker && last.isPartial) {
        return [...entries.slice(0, -1), { speaker, content, isPartial: true }];
      }
      if (!isPartial && last?.speaker === speaker && last.content === content) return entries;
      return [...entries, { speaker, content, isPartial }];
    });
  }, []);

  const stopCapture = useCallback(() => {
    isListeningRef.current = false;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void inputContextRef.current?.close();
    inputContextRef.current = null;
    setAudioLevel(0);
  }, []);

  const playPcm = useCallback((base64: string) => {
    const bytes = base64ToBytes(base64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const context = outputContextRef.current || new AudioContext({ sampleRate: 24000 });
    outputContextRef.current = context;
    void context.resume();
    const audioBuffer = context.createBuffer(1, samples.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / 0x8000;

    const source = context.createBufferSource();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(context.destination);
    const startAt = Math.max(context.currentTime, queuedAudioTimeRef.current);
    source.start(startAt);
    queuedAudioTimeRef.current = startAt + audioBuffer.duration;
    setStatus("speaking");

    source.onended = () => {
      if (context.currentTime >= queuedAudioTimeRef.current - 0.03) {
        setAudioLevel(0);
        if (!isMuted) setStatus("listening");
        if (shouldCaptureAfterGreetingRef.current) {
          shouldCaptureAfterGreetingRef.current = false;
          startCaptureRef.current();
        }
      }
    };
  }, []);

  const startCapture = useCallback(async () => {
    if (isListeningRef.current || isMutedRef.current) return;
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const context = new AudioContext();
      inputContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(2048, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;
      isListeningRef.current = true;

      processor.onaudioprocess = (event) => {
        if (!isListeningRef.current || socket.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm = downsampleToPcm16(input, context.sampleRate);
        let total = 0;
        for (const sample of input) total += sample * sample;
        setAudioLevel(Math.min(1, Math.sqrt(total / input.length) * 5));
        socket.send(JSON.stringify({ type: "audio", data: bytesToBase64(pcm) }));
      };
      source.connect(processor);
      processor.connect(context.destination);
      setStatus("listening");
    } catch {
      setError("无法访问麦克风，请在浏览器中允许麦克风权限。");
      setStatus("error");
    }
  }, []);

  startCaptureRef.current = () => { void startCapture(); };

  const stopRealtime = useCallback(() => {
    stopCapture();
    const socket = wsRef.current;
    wsRef.current = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "finish" }));
    }
    socket?.close();
    queuedAudioTimeRef.current = 0;
  }, [stopCapture]);

  const pauseVoiceCall = useCallback(() => {
    stopCapture();
    void outputContextRef.current?.suspend();
    setStatus("idle");
  }, [stopCapture]);

  const startRealtime = useCallback(() => {
    setError(null);
    setStatus("connecting");
    setTranscriptEntries([]);
    const socket = new WebSocket(resolveRealtimeProxyUrl());
    wsRef.current = socket;
    socket.onopen = () => {
      if (wsRef.current !== socket) return;
      socket.send(JSON.stringify({ type: "start", sessionId, context: interviewContextRef.current }));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "audio") playPcm(message.data);
      if (message.type === "agent" && message.content) upsertTranscript("agent", message.content);
      if (message.type === "error") {
        setError(message.message);
        setStatus("error");
      }
      if (message.type === "event") {
        if (message.event === 150) shouldCaptureAfterGreetingRef.current = true;
        if (message.event === 451) {
          const recognized = extractRealtimeText(message.payload);
          if (recognized) {
            setTranscript(recognized.text);
            upsertTranscript("user", recognized.text, !recognized.isFinal);
          }
        }
        if (message.event === 550) {
          const agentText = extractRealtimeText(message.payload)?.text;
          if (agentText) upsertTranscript("agent", agentText);
        }
      }
    };
    socket.onerror = () => {
      setError("无法连接本地实时语音代理，请确认代理已启动。");
      setStatus("error");
    };
  }, [playPcm, sessionId, upsertTranscript]);

  const resumeVoiceCall = useCallback(() => {
    const socket = wsRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    void outputContextRef.current?.resume();
    if (!isMutedRef.current) void startCapture();
  }, [startCapture]);

  useEffect(() => {
    if (!isOpen) {
      pauseVoiceCall();
      return;
    }

    const socket = wsRef.current;
    const hasActiveSession = socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING;
    if (hasActiveSession) {
      resumeVoiceCall();
      return;
    }

    startRealtime();
  }, [isOpen, pauseVoiceCall, resumeVoiceCall, startRealtime]);

  useEffect(() => () => {
    stopRealtime();
    inputContextRef.current?.close();
    outputContextRef.current?.close();
  }, [stopRealtime]);

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      startCapture();
    } else {
      setIsMuted(true);
      stopCapture();
      setStatus("idle");
    }
  };

  const statusText = error || (status === "connecting" ? "正在连接实时语音模型..." : status === "speaking" ? "探探正在提问..." : transcript || "正在等待探探开场...");
  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[9999] flex overflow-hidden" style={{ background: "linear-gradient(135deg, #fce4ec 0%, #e8eaf6 50%, #e0f7fa 100%)" }}>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between p-4 pt-12">
          <button type="button" onClick={() => setIsTranscriptOpen((open) => !open)} className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-sm text-gray-600 shadow-sm backdrop-blur hover:bg-white" aria-label={isTranscriptOpen ? "收起逐字稿" : "展开逐字稿"}>
            <Captions className="h-4 w-4" />
            <span className="hidden sm:inline">{isTranscriptOpen ? "收起逐字稿" : "展开逐字稿"}</span>
          </button>
          <div className="text-gray-600 font-medium">{getInterviewTitle(interviewContext?.interviewerName)}</div>
          <button onClick={() => { pauseVoiceCall(); onClose(); }} className="w-10 h-10 flex items-center justify-center text-gray-500"><X className="w-6 h-6" /></button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <motion.div className="w-52 h-52 rounded-full overflow-hidden shadow-2xl" animate={{ scale: status === "listening" || status === "speaking" ? 1 + audioLevel * 0.08 : 1 }}>
            <img src="/tantan-avatar.png" alt="探探" className="w-full h-full object-cover" />
          </motion.div>
          <p className="mt-8 text-lg text-gray-700">{statusText}</p>
          <p className="mt-2 text-sm text-gray-500">由火山端到端实时语音模型驱动</p>
        </div>
        <div className="pb-12 flex justify-center">
          <button onClick={toggleMute} className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${isMuted ? "bg-red-500 text-white" : "bg-white text-purple-600"}`}>
            {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </button>
        </div>
      </main>
      <AnimatePresence initial={false}>
        {isTranscriptOpen && (
          <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: "min(390px, 88vw)", opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32 }} className="shrink-0 overflow-hidden border-l border-white/60 bg-white/80 shadow-[-18px_0_42px_rgba(73,67,120,0.08)] backdrop-blur-xl">
            <div className="flex h-full w-[min(390px,88vw)] flex-col">
              <div className="flex items-center justify-between border-b border-gray-200/70 px-5 py-5">
                <div><h2 className="font-semibold text-gray-800">对话逐字稿</h2><p className="mt-1 text-xs text-gray-500">实时显示识别与访谈内容</p></div>
                <button type="button" onClick={() => setIsTranscriptOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="收起逐字稿"><PanelRightClose className="h-5 w-5" /></button>
              </div>
              <div ref={transcriptRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
                {transcriptEntries.length === 0 ? <p className="pt-8 text-center text-sm leading-6 text-gray-400">探探会先开场，随后这里会实时显示你们的对话。</p> : transcriptEntries.map((entry, index) => (
                  <div key={`${entry.speaker}-${index}`} className={entry.speaker === "agent" ? "pr-7" : "pl-7"}>
                    <p className="mb-1 text-xs font-medium text-gray-400">{entry.speaker === "agent" ? "探探" : "你"}{entry.isPartial ? " · 识别中" : ""}</p>
                    <p className={`rounded-2xl px-3 py-2 text-sm leading-6 ${entry.speaker === "agent" ? "bg-purple-50 text-gray-700" : "bg-white text-gray-700 shadow-sm"}`}>{entry.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
