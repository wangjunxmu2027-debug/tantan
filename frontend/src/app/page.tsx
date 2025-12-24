"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, History, LogIn, LogOut, MessageSquare, Target, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import LoginModal from "@/components/LoginModal";
import CreateLinkModal from "@/components/CreateLinkModal";

// 动态导入 Threads 组件，禁用 SSR
const Threads = dynamic(() => import("@/components/Threads"), { ssr: false });

// 功能卡片数据
const features = [
  { icon: MessageSquare, text: "精准记录业务痛点", delay: 0.8 },
  { icon: Sparkles, text: "智能分析功能需求", delay: 0.9 },
  { icon: Target, text: "定制解决方案", delay: 1.0 },
  { icon: Shield, text: "数据严格保密", delay: 1.1 },
];

export default function Home() {
  const { isLoggedIn, logout } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 点击生成链接按钮
  const handleCreateLink = () => {
    if (!isLoggedIn) {
      setShowLoginModal(true);
    } else {
      setShowCreateModal(true);
    }
  };

  // 登录成功后自动打开创建弹窗
  const handleLoginSuccess = () => {
    setShowCreateModal(true);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Threads 背景 */}
      <Threads
        color={[1, 1, 1]}
        amplitude={1.2}
        distance={0.3}
        enableMouseInteraction={true}
      />

      {/* 渐变遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 z-[1]" />

      {/* 顶部导航栏 */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 md:p-6">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Image
            src="/logo.png"
            alt="Logo"
            width={48}
            height={48}
            className="rounded-lg"
          />
        </motion.div>

        {/* 右侧按钮 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex items-center gap-3"
        >
          {/* 查看历史 */}
          <Link
            href="/admin"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white/80 hover:text-white transition-all text-sm font-medium"
          >
            <History className="w-4 h-4" />
            <span className="hidden md:inline">查看历史</span>
          </Link>

          {/* 登录/退出 */}
          {isLoggedIn ? (
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white/80 hover:text-white transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">退出</span>
            </button>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg text-white transition-all text-sm font-medium"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden md:inline">登录</span>
            </button>
          )}
        </motion.div>
      </div>

      {/* 主内容区域 */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-8">
        
        {/* 标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 drop-shadow-lg">
            AI调研助手
          </h1>
          <p className="text-2xl md:text-3xl text-purple-300 font-medium">
            探探
          </p>
        </motion.div>

        {/* 角色对话区域 */}
        <div className="w-full max-w-6xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 mb-8 md:mb-12 px-4">
          
          {/* 售前同学 - 移动端隐藏 */}
          <motion.div
            initial={{ opacity: 0, x: -200 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ 
              duration: 0.8, 
              delay: 1.5,
              type: "spring",
              stiffness: 100,
              damping: 15
            }}
            className="hidden md:flex flex-col items-center mr-0 md:mr-8"
          >
            {/* 气泡 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 2.0 }}
              className="relative mb-4 max-w-[200px]"
            >
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl">
                <p className="text-gray-800 text-sm font-medium">
                  为客户创建专属链接 ✨
                </p>
              </div>
              {/* 气泡箭头 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white/90" />
            </motion.div>
            
            {/* 售前头像 */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="relative w-36 h-36 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-white/30 shadow-2xl"
            >
              <Image
                src="/user-avatar.png"
                alt="售前"
                fill
                className="object-cover"
              />
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.2 }}
              className="mt-3 text-white/80 text-sm font-medium"
            >
              售前同学
            </motion.p>
          </motion.div>

          {/* 中间 CTA 区域 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="w-full max-w-sm md:max-w-md flex flex-col items-center order-2 md:order-none"
          >
            {/* 功能卡片网格 */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 mb-4 md:mb-6 w-full">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: feature.delay }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="bg-white/10 backdrop-blur-md rounded-xl p-3 md:p-4 border border-white/20 hover:bg-white/15 transition-all cursor-default"
                >
                  <feature.icon className="w-5 h-5 md:w-6 md:h-6 text-purple-300 mb-1 md:mb-2" />
                  <p className="text-white/90 text-xs md:text-sm font-medium">{feature.text}</p>
                </motion.div>
              ))}
            </div>

            {/* 时间提示 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="text-center text-purple-200/80 text-xs md:text-sm mb-4 md:mb-6"
            >
              ⏱️ 预计访谈时间：约15分钟（10余个问题）
            </motion.div>

            {/* 主 CTA 按钮 */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateLink}
              className="w-full relative group"
            >
              <div className="relative flex items-center justify-center gap-2 md:gap-3 px-6 py-3 md:px-8 md:py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-white font-semibold text-base md:text-lg shadow-xl hover:shadow-2xl transition-all">
                <Sparkles className="w-5 h-5" />
                <span>生成专属调研链接</span>
              </div>
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.6 }}
              className="text-center text-white/50 text-xs mt-3 md:mt-4"
            >
              为您的客户创建定制化访谈体验
            </motion.p>

            {/* 登录提示 */}
            {!isLoggedIn && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.8 }}
                className="text-center text-purple-300/60 text-xs mt-2"
              >
                请先登录后使用
              </motion.p>
            )}
          </motion.div>

          {/* 探探 */}
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.8, 
              delay: 0.3,
              type: "spring",
              stiffness: 100,
              damping: 15
            }}
            className="flex flex-col items-center ml-0 md:ml-8 order-1 md:order-none"
          >
            {/* 气泡 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="relative mb-3 md:mb-4 max-w-[220px] md:max-w-[280px]"
            >
              <div className="bg-gradient-to-br from-purple-500/90 to-indigo-600/90 backdrop-blur-sm rounded-2xl px-3 py-2 md:px-4 md:py-3 shadow-xl">
                <motion.p 
                  className="text-white text-xs md:text-sm leading-relaxed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0, duration: 0.5 }}
                >
                  我是<span className="font-bold">"探探"</span>，您的专属访谈助手。
                  我将通过一系列问题了解客户的业务需求，并为他们梳理适配的解决方案方向。
                </motion.p>
              </div>
              {/* 气泡箭头 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-purple-500/90" />
            </motion.div>
            
            {/* 探探头像 */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              animate={{ 
                y: [0, -5, 0],
              }}
              transition={{ 
                y: { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }}
              className="relative w-24 h-24 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-purple-400/50 shadow-2xl shadow-purple-500/30"
            >
              <Image
                src="/tantan-avatar.png"
                alt="探探"
                fill
                className="object-cover"
              />
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-3 text-purple-300 text-sm font-medium"
            >
              探探
            </motion.p>
          </motion.div>
        </div>
      </div>

      {/* 底部装饰 */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent z-[1]" />

      {/* 登录弹窗 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />

      {/* 创建链接弹窗 */}
      <CreateLinkModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
