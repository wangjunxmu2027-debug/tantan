"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Phone, StopCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import { type Message } from "@/lib/api";

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  stage: string;
  sessionId?: string;
  onVoiceCallOpen?: () => void;
  onInterrupt?: () => void;
  interruptedMessage?: string;
}

export default function ChatWindow({
  messages,
  onSendMessage,
  isLoading,
  stage,
  sessionId,
  onVoiceCallOpen,
  onInterrupt,
  interruptedMessage,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string>(""); // 待发送的消息
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 当收到被打断的消息时，将其退回到输入框
  useEffect(() => {
    if (interruptedMessage) {
      setInputValue(interruptedMessage);
      inputRef.current?.focus();
    }
  }, [interruptedMessage]);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 当加载完成后，如果有待发送的消息，自动发送
  useEffect(() => {
    if (!isLoading && pendingMessage) {
      onSendMessage(pendingMessage);
      setPendingMessage("");
    }
  }, [isLoading, pendingMessage, onSendMessage]);

  // 发送消息
  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    if (isLoading) {
      // 如果正在加载，将消息存入待发送队列
      setPendingMessage(inputValue.trim());
      setInputValue("");
    } else {
      onSendMessage(inputValue.trim());
      setInputValue("");
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 打断思考
  const handleInterrupt = () => {
    if (onInterrupt) {
      onInterrupt();
    }
  };

  // 判断是否完成
  const isCompleted = stage === "completed";

  return (
    <div className="flex-1 flex flex-col w-full">
      {/* 消息列表区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <MessageBubble
                role={message.role}
                content={message.content}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* 加载状态 - 带打断按钮 */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-4"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center">
              <img 
                src="/tantan-avatar.png" 
                alt="探探" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">探探正在思考...</span>
              </div>
              {/* 打断按钮 - 低调设计 */}
              <button
                onClick={handleInterrupt}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="取消当前回复，编辑消息"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* 待发送消息提示 */}
        {pendingMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end px-4"
          >
            <div className="bg-purple-100 text-purple-700 rounded-xl px-4 py-2 text-sm flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>待发送: {pendingMessage.slice(0, 20)}{pendingMessage.length > 20 ? '...' : ''}</span>
            </div>
          </motion.div>
        )}

        {/* 完成提示 */}
        {isCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm">
              <span>✓</span>
              <span>访谈已完成</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t bg-white p-3 md:p-4 w-full safe-area-bottom">
        <div className="max-w-5xl mx-auto px-2 md:px-8">
          <div className="flex items-center gap-2 md:gap-3">
            {/* 唯一的语音入口：火山端到端实时语音访谈 */}
            {sessionId && !isCompleted && onVoiceCallOpen && (
              <button
                onClick={onVoiceCallOpen}
                className={`
                  w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center
                  transition-all duration-300 flex-shrink-0
                  bg-gradient-to-r from-green-400 to-emerald-500 text-white
                  hover:from-green-500 hover:to-emerald-600 shadow-md
                `}
                title="开启语音通话"
              >
                <Phone className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            )}

            {/* 文字输入框 - 思考时也可输入 */}
            <div className="flex-1 relative flex items-center">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isCompleted 
                    ? "访谈已结束" 
                    : isLoading 
                      ? "可继续输入，待回复后自动发送..." 
                      : "输入您的回答..."
                }
                disabled={isCompleted}
                rows={1}
                className={`
                  w-full px-3 py-2 md:px-4 md:py-3 pr-10 md:pr-12
                  bg-gray-50 rounded-xl md:rounded-2xl
                  border border-gray-200
                  focus:border-indigo-300 focus:bg-white
                  input-focus-ring
                  resize-none
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-gray-800 placeholder-gray-400
                  text-sm md:text-base
                `}
                style={{
                  minHeight: "44px",
                  maxHeight: "100px",
                }}
              />

              {/* 发送按钮 */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isCompleted}
                className={`
                  absolute right-2 md:right-3 top-1/2 -translate-y-1/2
                  w-7 h-7 md:w-8 md:h-8 rounded-full
                  flex items-center justify-center
                  transition-all duration-200
                  ${
                    inputValue.trim()
                      ? isLoading
                        ? "bg-purple-400 text-white hover:bg-purple-500"
                        : "gradient-bg text-white hover:opacity-90"
                      : "bg-gray-200 text-gray-400"
                  }
                  disabled:cursor-not-allowed
                `}
                title={isLoading ? "点击后将在回复后发送" : "发送"}
              >
                <Send className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            </div>
          </div>

          {/* 提示文字 - 移动端隐藏 */}
          <p className="hidden md:block text-xs text-gray-400 mt-2 text-center">
            按 Enter 发送，Shift + Enter 换行 | 点击电话按钮进入实时语音访谈
          </p>

        </div>
      </div>
    </div>
  );
}
