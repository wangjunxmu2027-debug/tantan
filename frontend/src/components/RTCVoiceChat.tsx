"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react";

// 火山引擎 RTC 配置
const RTC_APP_ID = process.env.NEXT_PUBLIC_VOLC_RTC_APP_ID || "69490d3eb45a3401f7ed9787";

interface RTCVoiceChatProps {
  sessionId: string;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
  onStatusChange?: (status: "idle" | "connecting" | "connected" | "speaking") => void;
}

type CallStatus = "idle" | "connecting" | "connected" | "error";

export default function RTCVoiceChat({
  sessionId,
  onTranscript,
  onStatusChange,
}: RTCVoiceChatProps) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // RTC 引擎引用
  const engineRef = useRef<any>(null);
  const roomIdRef = useRef<string>("");

  // 更新状态并通知父组件
  const updateStatus = useCallback((newStatus: CallStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus === "connected" && isAISpeaking ? "speaking" : newStatus);
  }, [onStatusChange, isAISpeaking]);

  // 初始化 RTC 引擎
  const initRTC = useCallback(async () => {
    try {
      // 动态导入 RTC SDK（避免 SSR 问题）
      const VERTC = (await import("@volcengine/rtc")).default;
      
      // 检查是否已初始化
      if (engineRef.current) {
        return engineRef.current;
      }

      // 创建 RTC 引擎
      const engine = VERTC.createEngine(RTC_APP_ID);
      engineRef.current = engine;

      // 监听远端用户加入
      engine.on("onUserJoined", (event: any) => {
        console.log("用户加入房间:", event.userInfo?.userId);
        if (event.userInfo?.userId?.startsWith("ai_")) {
          console.log("AI 智能体已加入");
        }
      });

      // 监听远端音频流
      engine.on("onUserPublishStream", async (event: any) => {
        console.log("远端发布流:", event.userId);
        // 自动订阅远端音频
        await engine.subscribeStream(event.userId, { audio: true, video: false });
      });

      // 监听远端音频播放状态
      engine.on("onRemoteAudioPropertiesReport", (event: any) => {
        // 检测 AI 是否在说话
        const aiSpeaking = event.audioPropertiesInfos?.some(
          (info: any) => info.userId?.startsWith("ai_") && info.audioPropertiesInfo?.audioLevel > 0
        );
        setIsAISpeaking(aiSpeaking);
      });

      // 监听错误
      engine.on("onError", (event: any) => {
        console.error("RTC 错误:", event);
        setError(`RTC 错误: ${event.errorCode}`);
      });

      // 监听连接状态
      engine.on("onConnectionStateChanged", (event: any) => {
        console.log("连接状态变化:", event.state);
        if (event.state === "CONNECTED") {
          updateStatus("connected");
        } else if (event.state === "DISCONNECTED") {
          updateStatus("idle");
        }
      });

      return engine;
    } catch (err) {
      console.error("RTC 初始化失败:", err);
      throw err;
    }
  }, [updateStatus]);

  // 开始语音通话
  const startCall = useCallback(async () => {
    try {
      setError(null);
      updateStatus("connecting");

      // 1. 从后端获取 RTC Token
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1"}/rtc-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, action: "start" }),
        }
      );

      if (!response.ok) {
        throw new Error("获取 RTC Token 失败");
      }

      const { token, roomId, userId } = await response.json();
      roomIdRef.current = roomId;

      // 2. 初始化 RTC 引擎
      const engine = await initRTC();

      // 3. 请求麦克风权限并开始采集
      await engine.startAudioCapture();

      // 4. 加入房间
      await engine.joinRoom(
        token,
        roomId,
        { userId },
        {
          isAutoPublish: true,
          isAutoSubscribeAudio: true,
        }
      );

      console.log(`已加入房间: ${roomId}, 用户: ${userId}`);
      updateStatus("connected");

    } catch (err: any) {
      console.error("开始通话失败:", err);
      setError(err.message || "连接失败");
      updateStatus("error");
    }
  }, [sessionId, initRTC, updateStatus]);

  // 结束语音通话
  const endCall = useCallback(async () => {
    try {
      if (engineRef.current) {
        await engineRef.current.stopAudioCapture();
        await engineRef.current.leaveRoom();
      }

      // 通知后端结束通话
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1"}/rtc-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, action: "stop" }),
        }
      );

      updateStatus("idle");
      setIsAISpeaking(false);
      setIsMuted(false);

    } catch (err) {
      console.error("结束通话失败:", err);
    }
  }, [sessionId, updateStatus]);

  // 静音/取消静音
  const toggleMute = useCallback(async () => {
    if (!engineRef.current) return;

    try {
      if (isMuted) {
        await engineRef.current.startAudioCapture();
      } else {
        await engineRef.current.stopAudioCapture();
      }
      setIsMuted(!isMuted);
    } catch (err) {
      console.error("切换静音失败:", err);
    }
  }, [isMuted]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.stopAudioCapture();
        engineRef.current.leaveRoom();
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center">
      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 通话控制按钮 */}
      <div className="flex items-center gap-3">
        {status === "idle" ? (
          // 开始通话按钮
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startCall}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
          >
            <Phone className="w-5 h-5" />
            <span className="font-medium">开始语音访谈</span>
          </motion.button>
        ) : status === "connecting" ? (
          // 连接中
          <div className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-600 rounded-full">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span>连接中...</span>
          </div>
        ) : (
          // 通话中的控制按钮
          <div className="flex items-center gap-3">
            {/* 静音按钮 */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleMute}
              className={`
                p-4 rounded-full transition-all duration-200
                ${isMuted 
                  ? "bg-red-100 text-red-600" 
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }
              `}
              title={isMuted ? "取消静音" : "静音"}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </motion.button>

            {/* AI 说话状态 */}
            <AnimatePresence>
              {isAISpeaking && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-full"
                >
                  <Volume2 className="w-5 h-5 animate-pulse" />
                  <span className="text-sm font-medium">探探正在说话...</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 结束通话按钮 */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={endCall}
              className="p-4 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
              title="结束通话"
            >
              <PhoneOff className="w-6 h-6" />
            </motion.button>
          </div>
        )}
      </div>

      {/* 通话状态提示 */}
      {status === "connected" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-sm text-gray-500"
        >
          {isMuted ? "已静音 - 点击麦克风取消静音" : "语音通话中 - 直接说话即可"}
        </motion.p>
      )}
    </div>
  );
}

