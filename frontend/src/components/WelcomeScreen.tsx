"use client";

import { motion } from "framer-motion";
import { MessageSquare, Sparkles, Target, Shield, Play } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";

// 动态导入 Threads 组件，禁用 SSR
const Threads = dynamic(() => import("./Threads"), { ssr: false });

interface WelcomeScreenProps {
  onStart: () => void;
  isLoading: boolean;
}

// 功能卡片数据
const features = [
  { icon: MessageSquare, text: "精准记录业务痛点", delay: 2.5 },
  { icon: Sparkles, text: "智能分析功能需求", delay: 2.7 },
  { icon: Target, text: "定制解决方案", delay: 2.9 },
  { icon: Shield, text: "数据严格保密", delay: 3.1 },
];

export default function WelcomeScreen({ onStart, isLoading }: WelcomeScreenProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Threads 背景 */}
      <Threads
        color={[1, 1, 1]}
        amplitude={1.2}
        distance={0.3}
        enableMouseInteraction={true}
      />

      {/* 渐变遮罩 - 增强可读性 */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 z-[1]" />

      {/* 左上角 Logo */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="absolute top-6 left-6 z-20"
      >
        <Image
          src="/logo.png"
          alt="Logo"
          width={48}
          height={48}
          className="rounded-lg"
        />
      </motion.div>

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
        <div className="w-full max-w-6xl flex items-center justify-center gap-8 mb-12 px-4">
          
          {/* 采访者 - 从左侧入场 */}
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
            className="flex flex-col items-center mr-8"
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
                  我们开始吧！✨
                </p>
              </div>
              {/* 气泡箭头 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-white/90" />
            </motion.div>
            
            {/* 采访者头像 */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="relative w-36 h-36 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-white/30 shadow-2xl"
            >
              <Image
                src="/user-avatar.png"
                alt="采访者"
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
              您
            </motion.p>
          </motion.div>

          {/* 中间 CTA 区域 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 2.8 }}
            className="w-full max-w-md flex flex-col items-center"
          >
            {/* 功能卡片网格 */}
            <div className="grid grid-cols-2 gap-3 mb-6 w-full">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: feature.delay }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 hover:bg-white/15 transition-all cursor-default"
                >
                  <feature.icon className="w-6 h-6 text-purple-300 mb-2" />
                  <p className="text-white/90 text-sm font-medium">{feature.text}</p>
                </motion.div>
              ))}
            </div>

            {/* 时间提示 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.3 }}
              className="text-center text-purple-200/80 text-sm mb-6"
            >
              ⏱️ 预计访谈时间：约15分钟（10余个问题）
            </motion.div>

            {/* 开始按钮 */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 3.5 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onStart}
              disabled={isLoading}
              className="w-full relative group"
            >
              <div className="relative flex items-center justify-center gap-3 px-8 py-4 bg-white rounded-xl text-gray-900 font-semibold text-lg shadow-xl hover:shadow-2xl hover:bg-gray-50 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                    <span>正在连接...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>开始访谈</span>
                  </>
                )}
              </div>
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.7 }}
              className="text-center text-white/50 text-xs mt-4"
            >
              点击开始，探探将与您进行一对一访谈
            </motion.p>
          </motion.div>

          {/* 探探 - 从右侧入场 */}
          <motion.div
            initial={{ opacity: 0, x: 200 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ 
              duration: 0.8, 
              delay: 0.3,
              type: "spring",
              stiffness: 100,
              damping: 15
            }}
            className="flex flex-col items-center ml-8"
          >
            {/* 气泡 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="relative mb-4 max-w-[280px]"
            >
              <div className="bg-gradient-to-br from-purple-500/90 to-indigo-600/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl">
                <motion.p 
                  className="text-white text-sm leading-relaxed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0, duration: 0.5 }}
                >
                  我是<span className="font-bold">"探探"</span>，您的专属访谈助手。
                  我将通过一系列问题了解您的业务需求，并为您梳理适配的解决方案方向。
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
              className="relative w-36 h-36 md:w-48 md:h-48 rounded-full overflow-hidden border-4 border-purple-400/50 shadow-2xl shadow-purple-500/30"
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
    </div>
  );
}
