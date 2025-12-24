"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ChatWindow from "@/components/ChatWindow";
import Header from "@/components/Header";
import WelcomeScreen from "@/components/WelcomeScreen";
import { interviewApi, type Message } from "@/lib/api";

// 懒加载语音通话全屏组件
const VoiceCallScreen = lazy(() => import("@/components/VoiceCallScreen"));

export default function InterviewPage() {
  const params = useParams();
  const linkCode = params.code as string;

  // 从 sessionStorage 获取链接信息
  const [linkInfo, setLinkInfo] = useState<{
    company_name: string;
    interviewer_name: string | null;
    voice: string;
    purpose: string | null;
  } | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<string>("welcome");
  const [isStarted, setIsStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  // 音色由售前设置，用户不可更改
  const presetVoice = linkInfo?.voice || "xinwen";

  // 加载链接信息
  useEffect(() => {
    const storedLink = sessionStorage.getItem("interview_link");
    if (storedLink) {
      try {
        const parsed = JSON.parse(storedLink);
        if (parsed.code === linkCode) {
          setLinkInfo({
            company_name: parsed.company_name,
            interviewer_name: parsed.interviewer_name,
            voice: parsed.voice || 'xinwen',
            purpose: parsed.purpose,
          });
        }
      } catch (e) {
        console.error("解析链接信息失败:", e);
      }
    }
  }, [linkCode]);

  // 开始访谈
  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await interviewApi.createSession({
        preset_company: linkInfo?.company_name,
        preset_name: linkInfo?.interviewer_name || undefined,
        link_code: linkCode,
      });
      
      setSessionId(response.session_id);
      setMessages([
        {
          role: "assistant",
          content: response.welcome_message,
        },
      ]);
      setStage(response.stage);
      setIsStarted(true);
    } catch (err) {
      console.error("创建会话失败:", err);
      setError("创建会话失败，请检查后端服务是否启动");
    } finally {
      setIsLoading(false);
    }
  };

  // 发送消息
  const handleSendMessage = async (content: string) => {
    if (!sessionId || isLoading) return;

    const userMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await interviewApi.sendMessage(sessionId, content);

      const assistantMessage: Message = {
        role: "assistant",
        content: response.reply,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStage(response.stage);
    } catch (err) {
      console.error("发送消息失败:", err);
      setError("发送消息失败，请重试");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AnimatePresence mode="wait">
        {!isStarted ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen"
          >
            <WelcomeScreen 
              onStart={handleStart} 
              isLoading={isLoading}
              presetCompany={linkInfo?.company_name}
              presetName={linkInfo?.interviewer_name || undefined}
            />
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen flex flex-col"
          >
            <Header isOnline={isStarted} />
            <main className="flex-1 flex flex-col">
              <ChatWindow
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                stage={stage}
                sessionId={sessionId || undefined}
                onVoiceCallOpen={() => setShowVoiceCall(true)}
                isVoiceCallActive={showVoiceCall}
                presetVoice={presetVoice}
              />
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 全屏语音通话界面 */}
      {sessionId && (
        <Suspense fallback={null}>
          <VoiceCallScreen
            isOpen={showVoiceCall}
            onClose={() => setShowVoiceCall(false)}
            sessionId={sessionId}
            onSendMessage={handleSendMessage}
            latestAIMessage={messages.filter(m => m.role === "assistant").slice(-1)[0]?.content}
            isLoading={isLoading}
            voice={presetVoice}
          />
        </Suspense>
      )}
    </div>
  );
}

