"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ChatWindow from "@/components/ChatWindow";
import Header from "@/components/Header";
import WelcomeScreen from "@/components/WelcomeScreen";
import InterviewReport from "@/components/InterviewReport";
import InterviewSummaryCard from "@/components/InterviewSummaryCard";
import { interviewApi, type Message } from "@/lib/api";
import { FileText, X } from "lucide-react";

// 懒加载语音通话全屏组件
const VoiceCallScreen = lazy(() => import("@/components/VoiceCallScreen"));

export default function InterviewPage() {
  const params = useParams();
  const linkCode = params.code as string;

  // 从 sessionStorage 获取链接信息
  const [linkInfo, setLinkInfo] = useState<{
    theme: string;
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
  const [showReport, setShowReport] = useState(false);
  const [showSummaryCard, setShowSummaryCard] = useState(false);
  const [interruptedMessage, setInterruptedMessage] = useState<string>(""); // 被打断的消息
  const [lastUserMessage, setLastUserMessage] = useState<string>(""); // 记录最后一条用户消息
  
  // 用于取消请求的 AbortController
  const abortControllerRef = useRef<AbortController | null>(null);
  
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
            theme: parsed.theme || '公司调研',
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

  // 访谈完成时自动显示总结卡片
  useEffect(() => {
    if (stage === "completed" && !showSummaryCard && !showReport) {
      // 延迟显示，让用户先看到完成提示
      const timer = setTimeout(() => {
        setShowSummaryCard(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [stage, showSummaryCard, showReport]);

  // 开始访谈
  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await interviewApi.createSession({
        theme: linkInfo?.theme || '公司调研',
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

    // 创建新的 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setLastUserMessage(content); // 记录用户消息，用于打断时退回
    setInterruptedMessage(""); // 清除之前的打断消息
    setIsLoading(true);
    setError(null);

    try {
      const response = await interviewApi.sendMessage(sessionId, content, abortController.signal);

      // 检查是否已被打断
      if (abortController.signal.aborted) {
        return;
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: response.reply,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStage(response.stage);
    } catch (err: any) {
      // 如果是用户主动取消，不显示错误
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        console.log("请求已被用户取消");
        return;
      }
      
      console.error("发送消息失败:", err);
      setError("发送消息失败，请重试");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      // 只有在没有被打断的情况下才设置 loading 为 false
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
      abortControllerRef.current = null;
    }
  };

  // 打断思考
  const handleInterrupt = () => {
    // 取消正在进行的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 停止加载状态
    setIsLoading(false);
    
    // 从消息列表中移除最后一条用户消息（尚未收到回复的那条）
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      // 确保最后一条是用户消息
      if (lastMsg && lastMsg.role === "user") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    
    // 将最后一条用户消息退回到输入框
    if (lastUserMessage) {
      setInterruptedMessage(lastUserMessage);
      setLastUserMessage("");
    }
    
    // 短暂提示
    setError("已取消，消息已退回输入框");
    setTimeout(() => setError(null), 2000);
  };

  // 访谈完成
  const isCompleted = stage === "completed";

  // 显示报告页面
  if (showReport && sessionId && linkInfo) {
    return (
      <InterviewReport
        sessionId={sessionId}
        companyName={linkInfo.company_name}
        interviewerName={linkInfo.interviewer_name || undefined}
        messages={messages}
        onClose={() => setShowReport(false)}
      />
    );
  }

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
                onInterrupt={handleInterrupt}
                interruptedMessage={interruptedMessage}
              />
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 访谈完成 - 总结卡片弹窗 */}
      <AnimatePresence>
        {showSummaryCard && linkInfo && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSummaryCard(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            
            {/* 卡片容器 */}
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto"
            >
              <div className="pointer-events-auto relative my-8">
                {/* 关闭按钮 */}
                <button
                  onClick={() => setShowSummaryCard(false)}
                  className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 z-10"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
                
                <InterviewSummaryCard
                  companyName={linkInfo.company_name}
                  interviewerName={linkInfo.interviewer_name || undefined}
                  messages={messages}
                  onClose={() => {
                    setShowSummaryCard(false);
                    setShowReport(true);
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 访谈完成但已关闭卡片 - 显示查看报告按钮 */}
      <AnimatePresence>
        {isCompleted && !showSummaryCard && !showReport && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40"
          >
            <div className="flex gap-3">
              <button
                onClick={() => setShowSummaryCard(true)}
                className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl shadow-lg transition-all border"
              >
                <span>📊</span>
                <span className="font-medium">查看总结卡片</span>
              </button>
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-lg transition-all"
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium">详细分析报告</span>
              </button>
            </div>
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
