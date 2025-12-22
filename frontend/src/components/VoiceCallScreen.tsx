"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, X, Volume2 } from "lucide-react";

// TTS API 地址
const TTS_API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

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
  
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 初始化语音识别
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "zh-CN";

        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          let interimTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            setTranscript(finalTranscript);
            // 发送消息
            onSendMessage(finalTranscript);
            setStatus("processing");
          } else {
            setTranscript(interimTranscript);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("语音识别错误:", event.error);
          if (event.error !== "no-speech") {
            setStatus("idle");
          }
        };

        recognition.onend = () => {
          if (status === "listening" && !isMuted) {
            // 自动重启
            try {
              recognition.start();
            } catch (e) {
              console.error("重启语音识别失败:", e);
            }
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [onSendMessage, status, isMuted]);

  // 监听 AI 回复并播放语音
  useEffect(() => {
    if (latestAIMessage && status === "processing" && !isLoading) {
      playTTS(latestAIMessage);
    }
  }, [latestAIMessage, isLoading]);

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

      const response = await fetch(`${TTS_API_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanedText, voice }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        // fallback
        setStatus("listening");
        startListening();
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
      const source = audioContextRef.current.createMediaElementSource(audio);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
      analyserRef.current = analyser;

      // 开始分析音频
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
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
        startListening();
      };

      await audio.play();
    } catch (error) {
      console.error("TTS 播放失败:", error);
      setStatus("listening");
      startListening();
    }
  };

  // 开始监听
  const startListening = useCallback(() => {
    if (recognitionRef.current && !isMuted) {
      try {
        recognitionRef.current.start();
        setStatus("listening");
        setTranscript("");
      } catch (e) {
        console.error("启动语音识别失败:", e);
      }
    }
  }, [isMuted]);

  // 停止监听
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setStatus("idle");
  }, []);

  // 切换静音
  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      startListening();
    } else {
      setIsMuted(true);
      stopListening();
    }
  };

  // 关闭通话
  const handleClose = () => {
    stopListening();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    onClose();
  };

  // 打开时自动开始监听
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        startListening();
      }, 500);
    } else {
      stopListening();
    }
  }, [isOpen, startListening, stopListening]);

  // 获取状态文本
  const getStatusText = () => {
    switch (status) {
      case "listening":
        return transcript || "你可以开始说话";
      case "processing":
        return "探探正在思考...";
      case "speaking":
        return "探探正在回答...";
      default:
        return "点击麦克风开始";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col"
          style={{
            background: "linear-gradient(135deg, #fce4ec 0%, #e8eaf6 50%, #e0f7fa 100%)",
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
                  scale: status === "speaking" ? 1 + audioLevel * 0.1 : 1,
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
                {status === "speaking" && (
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
              内容由 AI 生成
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

