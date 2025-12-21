"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChatWindow from "@/components/ChatWindow";
import Header from "@/components/Header";
import WelcomeScreen from "@/components/WelcomeScreen";
import { interviewApi, type Message } from "@/lib/api";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<string>("welcome");
  const [isStarted, setIsStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 开始访谈
  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await interviewApi.createSession();
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

    // 添加用户消息
    const userMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await interviewApi.sendMessage(sessionId, content);

      // 添加助手回复
      const assistantMessage: Message = {
        role: "assistant",
        content: response.reply,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStage(response.stage);
    } catch (err) {
      console.error("发送消息失败:", err);
      setError("发送消息失败，请重试");
      // 移除失败的用户消息
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
            <WelcomeScreen onStart={handleStart} isLoading={isLoading} />
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
    </div>
  );
}

