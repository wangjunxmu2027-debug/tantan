"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, X, Volume2 } from "lucide-react";

// API 地址
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

interface VoiceCallScreenProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onSendMessage: (content: string) => void;
  latestAIMessage?: string;
  isLoading: boolean;
  voice?: string;
}

type CallStatus = "idle" | "listening" | "processing" | "speaking";

export default function VoiceCallScreen({
  isOpen,
  onClose,
  sessionId,
  onSendMessage,
  latestAIMessage,
  isLoading,
  voice = "xinwen",
}: VoiceCallScreenProps) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  
  // 音频播放相关
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // 录音相关
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  
  // 音量检测相关
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  
  // 用于追踪已播放的消息，避免重复播放
  const playedMessagesRef = useRef<Set<string>>(new Set());
  const lastMessageRef = useRef<string | null>(null);

  // 清理函数
  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    isRecordingRef.current = false;
  }, []);

  // 使用浏览器 Web Speech API 作为备选
  const useBrowserASR = useCallback(() => {
    if (typeof window === "undefined") return;
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("浏览器不支持语音识别");
      setTranscript("浏览器不支持语音识别");
      setTimeout(() => {
        if (!isMuted && isOpen) startRecording();
      }, 2000);
      return;
    }

    console.log("回退到浏览器语音识别");
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          setTranscript(event.results[i][0].transcript);
        }
      }
      if (finalTranscript) {
        console.log("浏览器 ASR 识别结果:", finalTranscript);
        setTranscript(finalTranscript);
        setStatus("processing");
        onSendMessage(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("浏览器语音识别错误:", event.error);
      if (event.error !== "no-speech" && !isMuted && isOpen) {
        setTimeout(() => startRecording(), 1000);
      } else if (event.error === "no-speech") {
        setTranscript("未检测到语音");
        setTimeout(() => {
          if (!isMuted && isOpen) startRecording();
        }, 1000);
      }
    };

    recognition.onend = () => {
      // 如果没有识别到结果，重新开始录音
      if (status === "listening" && !isMuted && isOpen) {
        setTimeout(() => startRecording(), 500);
      }
    };

    setStatus("listening");
    setTranscript("请说话...");
    recognition.start();
  }, [onSendMessage, isMuted, isOpen, status]);

  // 发送音频到火山引擎 ASR（带回退）
  const sendToASR = async (audioBlob: Blob) => {
    try {
      setStatus("processing");
      setTranscript("识别中...");

      // 转换为 base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      console.log("发送 ASR 请求, 音频大小:", audioBlob.size);

      const response = await fetch(`${API_URL}/asr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: base64,
          format: "webm",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("火山引擎 ASR 失败，回退到浏览器:", errorData);
        // 回退到浏览器 ASR
        useBrowserASR();
        return;
      }

      const result = await response.json();
      console.log("ASR 结果:", result);
      const recognizedText = result.text?.trim();

      if (recognizedText) {
        setTranscript(recognizedText);
        setStatus("processing");
        // 发送消息到对话流
        onSendMessage(recognizedText);
        // 等待 AI 回复后会触发 TTS 播放
      } else {
        setTranscript("未检测到语音，请再说一次");
        // 重新开始录音
        setTimeout(() => {
          if (!isMuted && isOpen) {
            setStatus("listening");
            startRecording();
          }
        }, 1500);
      }
    } catch (error) {
      console.error("ASR 请求失败，回退到浏览器:", error);
      // 回退到浏览器 ASR
      useBrowserASR();
    }
  };

  // 开始录音
  const startRecording = useCallback(async () => {
    if (isMuted || isRecordingRef.current) return;

    try {
      // 获取麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;

      // 创建音频分析器检测音量
      if (!micAudioContextRef.current) {
        micAudioContextRef.current = new AudioContext();
      }
      const source = micAudioContextRef.current.createMediaStreamSource(stream);
      const analyser = micAudioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          // 只处理有效录音（至少有一定大小）
          if (audioBlob.size > 1000) {
            sendToASR(audioBlob);
          } else {
            // 太短，重新开始录音
            if (!isMuted) {
              setTimeout(() => startRecording(), 500);
            }
          }
        }
        isRecordingRef.current = false;
      };

      // 开始录音
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      setStatus("listening");
      setTranscript("");

      // 监测音量并检测静音
      let silenceStart = 0;
      const SILENCE_THRESHOLD = 10; // 音量阈值
      const SILENCE_DURATION = 1500; // 静音持续时间（毫秒）

      const checkAudioLevel = () => {
        if (!micAnalyserRef.current || !isRecordingRef.current) return;

        const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // 更新可视化音量
        setAudioLevel(Math.min(average / 100, 1));

        // 检测静音
        if (average < SILENCE_THRESHOLD) {
          if (silenceStart === 0) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            // 检测到静音，停止录音
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
              }
            }
            return;
          }
        } else {
          silenceStart = 0;
        }

        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();

    } catch (error) {
      console.error("无法访问麦克风:", error);
      setTranscript("无法访问麦克风");
      setStatus("idle");
    }
  }, [isMuted, onSendMessage]);

  // 停止录音
  const stopRecording = useCallback(() => {
    cleanup();
    setStatus("idle");
    setAudioLevel(0);
  }, [cleanup]);

  // 监听 AI 回复并播放语音（只播放新消息）
  useEffect(() => {
    if (!isOpen) return;
    
    // 只有当消息变化时才播放
    if (latestAIMessage && latestAIMessage !== lastMessageRef.current && !isLoading) {
      // 检查是否已播放过（避免进入时重复播放）
      const messageKey = latestAIMessage.slice(0, 50); // 用前50个字符作为key
      if (!playedMessagesRef.current.has(messageKey)) {
        playedMessagesRef.current.add(messageKey);
        lastMessageRef.current = latestAIMessage;
        playTTS(latestAIMessage);
      }
    }
  }, [latestAIMessage, isLoading, isOpen]);

  // 播放 TTS
  const playTTS = async (text: string) => {
    setStatus("speaking");
    
    try {
      const cleanedText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/\n{2,}/g, '。')
        .replace(/\n/g, '，')
        .trim();

      const response = await fetch(`${API_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanedText, voice }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        // fallback - 无法播放，直接开始录音
        setStatus("listening");
        startRecording();
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // 创建音频分析器用于声纹动效
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      // 检查是否已经连接过
      try {
        const source = audioContextRef.current.createMediaElementSource(audio);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContextRef.current.destination);
        analyserRef.current = analyser;
      } catch (e) {
        // 如果已经连接过，忽略错误
        console.log("音频源已连接");
      }

      // 开始分析音频
      const dataArray = new Uint8Array(128);
      const updateLevel = () => {
        if (analyserRef.current && status === "speaking") {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(average / 255);
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };

      audio.onplay = () => {
        updateLevel();
      };

      audio.onended = () => {
        setAudioLevel(0);
        URL.revokeObjectURL(audioUrl);
        setStatus("listening");
        // 开始下一轮录音
        startRecording();
      };

      await audio.play();
    } catch (error) {
      console.error("TTS 播放失败:", error);
      setStatus("listening");
      startRecording();
    }
  };

  // 切换静音
  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      startRecording();
    } else {
      setIsMuted(true);
      stopRecording();
    }
  };

  // 关闭通话
  const handleClose = () => {
    stopRecording();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    cleanup();
    onClose();
  };

  // 打开时初始化
  useEffect(() => {
    if (isOpen) {
      // 记录当前消息为已播放，避免进入时重复播放
      if (latestAIMessage) {
        const messageKey = latestAIMessage.slice(0, 50);
        playedMessagesRef.current.add(messageKey);
        lastMessageRef.current = latestAIMessage;
      }
      
      // 延迟开始录音，让用户准备好
      if (!isMuted) {
        const timer = setTimeout(() => {
          setStatus("listening");
          startRecording();
        }, 800);
        return () => clearTimeout(timer);
      }
    } else {
      // 关闭时清理
      stopRecording();
      setStatus("idle");
      setTranscript("");
    }
  }, [isOpen]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (micAudioContextRef.current) {
        micAudioContextRef.current.close();
      }
    };
  }, [cleanup]);

  // 获取状态文本
  const getStatusText = () => {
    switch (status) {
      case "listening":
        return transcript || "你可以开始说话";
      case "processing":
        return transcript || "探探正在思考...";
      case "speaking":
        return "探探正在回答...";
      default:
        return "点击麦克风开始";
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        background: "linear-gradient(135deg, #fce4ec 0%, #e8eaf6 50%, #e0f7fa 100%)",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 pt-12">
        <div className="w-10" />
        <div className="text-gray-600 font-medium">语音访谈</div>
        <button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center text-gray-500"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* 中间区域 - 声纹动效 */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* 声纹圆环 */}
        <div className="relative">
          {/* 外层波纹 */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(135deg, rgba(233, 213, 255, 0.4) 0%, rgba(196, 181, 253, 0.3) 100%)",
              }}
              animate={{
                scale: status === "speaking" || status === "listening" 
                  ? [1, 1.2 + audioLevel * 0.5 + i * 0.15, 1] 
                  : 1,
                opacity: status === "speaking" || status === "listening"
                  ? [0.6, 0.2, 0.6]
                  : 0.3,
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* 主圆形 */}
          <motion.div
            className="relative w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ce93d8 100%)",
            }}
            animate={{
              scale: (status === "speaking" || status === "listening") ? 1 + audioLevel * 0.1 : 1,
            }}
            transition={{ duration: 0.1 }}
          >
            {/* 探探头像 */}
            <img
              src="/tantan-avatar.png"
              alt="探探"
              className="w-full h-full object-cover"
              style={{ opacity: 0.9 }}
            />

            {/* 声纹叠加效果 */}
            {(status === "speaking" || status === "listening") && (
              <motion.div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle, rgba(147, 51, 234, ${audioLevel * 0.3}) 0%, transparent 70%)`,
                }}
              />
            )}
          </motion.div>
        </div>

        {/* 状态指示点 */}
        <div className="flex gap-2 mt-12">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-gray-400"
              animate={{
                scale: status === "listening" || status === "speaking" || status === "processing"
                  ? [1, 1.3, 1]
                  : 1,
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>

        {/* 状态文本 */}
        <motion.p
          className="mt-6 text-gray-600 text-lg text-center px-8 max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {getStatusText()}
        </motion.p>
      </div>

      {/* 底部控制栏 */}
      <div className="pb-12 pt-6">
        <div className="flex justify-center items-center gap-6">
          {/* 麦克风按钮 */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleMute}
            className={`
              w-16 h-16 rounded-full flex items-center justify-center shadow-lg
              ${isMuted 
                ? "bg-gray-200 text-gray-500" 
                : status === "listening" 
                  ? "bg-green-100 text-green-600" 
                  : "bg-white text-gray-700"
              }
            `}
          >
            {isMuted ? (
              <MicOff className="w-7 h-7" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </motion.button>

          {/* 声音指示 */}
          <motion.div
            className={`
              w-16 h-16 rounded-full flex items-center justify-center shadow-lg
              ${status === "speaking" ? "bg-purple-100 text-purple-600" : "bg-white text-gray-400"}
            `}
            animate={{
              scale: status === "speaking" ? [1, 1.1, 1] : 1,
            }}
            transition={{ duration: 0.5, repeat: status === "speaking" ? Infinity : 0 }}
          >
            <Volume2 className="w-7 h-7" />
          </motion.div>

          {/* 结束按钮 */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleClose}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-red-100 text-red-500 shadow-lg"
          >
            <X className="w-7 h-7" />
          </motion.button>
        </div>

        <p className="text-center text-gray-400 text-sm mt-4">
          内容由 AI 生成 · 火山引擎语音识别
        </p>
      </div>
    </motion.div>
  );
}
