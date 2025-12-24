"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Building2, User, Target, Clock, Link2, Copy, Check, QrCode, ChevronDown, ChevronUp, Mic, Plus } from "lucide-react";
import axios from "axios";
import QRCodeModal from "./QRCodeModal";

interface CreateLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface GeneratedLink {
  link_code: string;
  link_url: string;
  company_name: string;
  interviewer_name?: string;
  purpose?: string;
}

interface Company {
  id: string;
  name: string;
}

// 音色选项 - 与 ChatWindow 保持一致
const VOICE_OPTIONS = [
  { id: "xinwen", name: "新闻男声", description: "专业正式", icon: "📺" },
  { id: "jilupian", name: "纪录片男声", description: "沉稳大气", icon: "🎬" },
  { id: "chunhou", name: "醇厚男声", description: "成熟稳重", icon: "🎙️" },
  { id: "nansheng", name: "阳光男声", description: "活力阳光", icon: "👨" },
  { id: "nvsheng", name: "温柔女声", description: "亲切温柔", icon: "👩" },
  { id: "qingxin", name: "清新女声", description: "清新自然", icon: "🌸" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";
const ADMIN_PASSWORD = "tantan2024";

export default function CreateLinkModal({ isOpen, onClose, onSuccess }: CreateLinkModalProps) {
  const [step, setStep] = useState<"form" | "success">("form");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  
  // 公司列表
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [isCustomCompany, setIsCustomCompany] = useState(false);
  
  // 表单数据
  const [companyName, setCompanyName] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expiresHours, setExpiresHours] = useState(168); // 默认7天
  const [syncToFeishu, setSyncToFeishu] = useState(true); // 默认选中
  const [selectedVoice, setSelectedVoice] = useState("xinwen"); // 默认音色
  
  // 生成的链接
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null);

  // 加载公司列表
  useEffect(() => {
    if (isOpen) {
      loadCompanies();
    }
  }, [isOpen]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const response = await axios.get(`${API_URL}/admin-companies`, {
        headers: {
          "x-admin-password": ADMIN_PASSWORD,
        },
      });
      if (response.data.companies) {
        setCompanies(response.data.companies.map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        })));
      }
    } catch (err) {
      console.error("加载公司列表失败:", err);
      // 即使失败也允许手动输入
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://tantan.airdemo.cn";
      
      const response = await axios.post(`${API_URL}/admin-links`, {
        company_name: companyName,
        interviewer_name: interviewerName || null,
        purpose: purpose || null,
        expires_hours: expiresHours,
        max_uses: 0,
        voice: selectedVoice,
        sync_to_feishu: syncToFeishu, // 直接传递给后端
        base_url: baseUrl,
      }, {
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": ADMIN_PASSWORD,
        },
      });

      const linkData = response.data.link;
      // 优先使用后端返回的完整 URL
      const linkUrl = response.data.link_url || `${baseUrl}/i/${linkData.link_code}`;
      
      setGeneratedLink({
        link_code: linkData.link_code,
        link_url: linkUrl,
        company_name: companyName,
        interviewer_name: interviewerName,
        purpose: purpose,
      });
      
      // 如果需要同步到飞书
      // 飞书同步已在后端处理
      if (response.data.feishu_synced) {
        console.log("已同步到飞书多维表格");
      } else if (syncToFeishu) {
        console.warn("飞书同步未完成，请检查后端配置");
      }
      
      setStep("success");
      onSuccess?.();
    } catch (err) {
      console.error("生成链接失败:", err);
      setError("生成链接失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (generatedLink) {
      await navigator.clipboard.writeText(generatedLink.link_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setStep("form");
    setCompanyName("");
    setInterviewerName("");
    setPurpose("");
    setExpiresHours(168);
    setSyncToFeishu(true);
    setSelectedVoice("xinwen");
    setGeneratedLink(null);
    setError("");
    setCopied(false);
    setIsCustomCompany(false);
    setShowCompanyDropdown(false);
    onClose();
  };

  const handleContinue = () => {
    setStep("form");
    setCompanyName("");
    setInterviewerName("");
    setPurpose("");
    setGeneratedLink(null);
    setCopied(false);
    setIsCustomCompany(false);
  };

  const selectCompany = (name: string) => {
    setCompanyName(name);
    setShowCompanyDropdown(false);
    setIsCustomCompany(false);
  };

  const switchToCustom = () => {
    setIsCustomCompany(true);
    setShowCompanyDropdown(false);
    setCompanyName("");
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* 弹窗容器 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg pointer-events-auto"
            >
              <div className="bg-gray-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-gray-900 z-10">
                <h2 className="text-xl font-bold text-white">
                  {step === "form" ? "创建专属访谈链接" : "链接已生成！"}
                </h2>
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/60" />
                </button>
              </div>
              
              {step === "form" ? (
                /* 表单步骤 */
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  {/* 公司名称 - 下拉选择或自定义 */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      公司名称 <span className="text-red-400">*</span>
                    </label>
                    
                    {!isCustomCompany ? (
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 z-10" />
                        <button
                          type="button"
                          onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                          className="w-full pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl text-left text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                        >
                          {companyName || (
                            <span className="text-white/40">
                              {loadingCompanies ? "加载中..." : "选择公司"}
                            </span>
                          )}
                        </button>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        
                        {/* 下拉菜单 */}
                        <AnimatePresence>
                          {showCompanyDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-white/20 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto"
                            >
                              {companies.length > 0 ? (
                                companies.map((company) => (
                                  <button
                                    key={company.id}
                                    type="button"
                                    onClick={() => selectCompany(company.name)}
                                    className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors first:rounded-t-xl last:rounded-b-xl"
                                  >
                                    {company.name}
                                  </button>
                                ))
                              ) : (
                                <div className="px-4 py-3 text-white/50 text-sm">
                                  暂无公司数据
                                </div>
                              )}
                              
                              {/* 添加其他公司选项 */}
                              <button
                                type="button"
                                onClick={switchToCustom}
                                className="w-full px-4 py-3 text-left text-purple-400 hover:bg-white/10 transition-colors border-t border-white/10 flex items-center gap-2"
                              >
                                <Plus className="w-4 h-4" />
                                输入其他公司
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                          <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="输入公司名称"
                            className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                            required
                            autoFocus
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomCompany(false);
                            setCompanyName("");
                          }}
                          className="text-sm text-purple-400 hover:text-purple-300"
                        >
                          ← 返回选择已有公司
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* 访谈者姓名 */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      访谈者姓名 <span className="text-white/40">(选填)</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="text"
                        value={interviewerName}
                        onChange={(e) => setInterviewerName(e.target.value)}
                        placeholder="例如：张三"
                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                      />
                    </div>
                  </div>
                  
                  {/* 访谈目的 */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      访谈目的 <span className="text-white/40">(选填)</span>
                    </label>
                    <div className="relative">
                      <Target className="absolute left-3 top-3 w-5 h-5 text-white/40" />
                      <textarea
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        placeholder="例如：了解CRM系统需求"
                        rows={2}
                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none"
                      />
                    </div>
                  </div>
                  
                  {/* 高级选项 */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors text-sm font-medium"
                    >
                      {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      高级选项
                    </button>
                    
                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 space-y-4 overflow-hidden"
                        >
                          {/* 访谈音色 */}
                          <div>
                            <label className="block text-sm font-medium text-white/80 mb-2">
                              <Mic className="inline w-4 h-4 mr-1" />
                              访谈音色
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {VOICE_OPTIONS.map((voice) => (
                                <button
                                  key={voice.id}
                                  type="button"
                                  onClick={() => setSelectedVoice(voice.id)}
                                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                    selectedVoice === voice.id
                                      ? "bg-purple-600 text-white"
                                      : "bg-white/10 text-white/70 hover:bg-white/20"
                                  }`}
                                >
                                  <span>{voice.icon}</span>
                                  <span>{voice.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          {/* 链接有效期 */}
                          <div>
                            <label className="block text-sm font-medium text-white/80 mb-2">
                              <Clock className="inline w-4 h-4 mr-1" />
                              链接有效期
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { label: "24小时", value: 24 },
                                { label: "7天", value: 168 },
                                { label: "永久", value: 0 },
                              ].map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setExpiresHours(option.value)}
                                  className={`py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                                    expiresHours === option.value
                                      ? "bg-purple-600 text-white"
                                      : "bg-white/10 text-white/70 hover:bg-white/20"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          {/* 同步飞书 */}
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              id="syncFeishu"
                              checked={syncToFeishu}
                              onChange={(e) => setSyncToFeishu(e.target.checked)}
                              className="w-4 h-4 rounded border-white/20 bg-white/10 text-purple-600 focus:ring-purple-500"
                            />
                            <label htmlFor="syncFeishu" className="text-sm text-white/80">
                              同步到飞书多维表格
                            </label>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* 错误提示 */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-center"
                    >
                      {error}
                    </motion.div>
                  )}
                  
                  {/* 提交按钮 */}
                  <button
                    type="submit"
                    disabled={isLoading || !companyName.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-5 h-5" />
                        <span>生成访谈链接</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* 成功步骤 */
                <div className="p-6 space-y-6">
                  {/* 成功图标 */}
                  <div className="flex justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center"
                    >
                      <Check className="w-8 h-8 text-green-400" />
                    </motion.div>
                  </div>
                  
                  {/* 链接信息 */}
                  <div className="text-center space-y-2">
                    <p className="text-white/60 text-sm">专属访谈链接已创建</p>
                    <p className="text-white font-medium">{generatedLink?.company_name}</p>
                    {generatedLink?.interviewer_name && (
                      <p className="text-white/60 text-sm">访谈者：{generatedLink.interviewer_name}</p>
                    )}
                  </div>
                  
                  {/* 链接展示 */}
                  <div className="relative">
                    <div className="flex items-center gap-2 p-4 bg-white/10 border border-white/20 rounded-xl">
                      <Link2 className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      <span className="text-white text-sm break-all flex-1">
                        {generatedLink?.link_url}
                      </span>
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleCopy}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                        copied
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : "bg-purple-600 hover:bg-purple-500 text-white"
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>复制链接</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowQRCode(true)}
                      className="flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>二维码</span>
                    </button>
                  </div>
                  
                  {/* 底部操作 */}
                  <div className="flex gap-3 pt-4 border-t border-white/10">
                    <button
                      onClick={handleContinue}
                      className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                    >
                      继续创建
                    </button>
                    <button
                      onClick={() => window.location.href = "/admin"}
                      className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                    >
                      查看历史
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>

      {/* 二维码弹窗 */}
      {generatedLink && (
        <QRCodeModal
          isOpen={showQRCode}
          onClose={() => setShowQRCode(false)}
          url={generatedLink.link_url}
          title="扫码开始访谈"
          subtitle={`${generatedLink.company_name}${generatedLink.interviewer_name ? ` - ${generatedLink.interviewer_name}` : ""}`}
        />
      )}
    </>
  );
}
