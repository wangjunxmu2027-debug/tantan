"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Copy, Check, ExternalLink, Lock, Plus, Trash2, 
  Download, Users, BarChart3, Clock, Link2, Building2,
  RefreshCw, X, Upload, FileText, AlertCircle
} from "lucide-react";
import BatchFormCreator from "@/components/BatchFormCreator";
import BatchCSVUploader from "@/components/BatchCSVUploader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";

interface Company {
  name: string;
  questionCount: number;
  part1Count: number;
  part2Count: number;
  part3Count: number;
}

interface InterviewLink {
  id: string;
  company_name: string;
  interviewer_name: string | null;
  purpose?: string | null;
  link_code: string;
  expires_at: string | null;
  max_uses: number;
  use_count: number;
  created_at: string;
  visitCount: number;
  completedCount: number;
  completionRate: number;
  isExpired: boolean;
  isMaxUsed: boolean;
}

interface CSVRow {
  company_name: string;
  interviewer_name?: string;
  purpose?: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"companies" | "links" | "upload">("companies");
  const [uploadMode, setUploadMode] = useState<"form" | "csv">("form"); // 批量上传模式
  
  // 主题相关状态
  const [themes, setThemes] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  
  // 公司相关状态（保留用于其他功能）
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  
  // 链接相关状态
  const [links, setLinks] = useState<InterviewLink[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  
  // 创建链接弹窗
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    theme: "",
    company_name: "",
    interviewer_name: "",
    purpose: "",
    expires_hours: 0,
    max_uses: 0,
  });

  // CSV 上传相关状态
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [uploadSuccess, setUploadSuccess] = useState<string>("");
  const [writeToFeishu, setWriteToFeishu] = useState(true);
  const [generatedLinks, setGeneratedLinks] = useState<Array<{
    company_name: string;
    interviewer_name?: string;
    purpose?: string;
    link_url: string;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 验证登录
  const handleLogin = async () => {
    setLoading(true);
    try {
      // 尝试获取公司列表来验证密码
      const response = await fetch(`${API_URL}/admin-companies`, {
        headers: { "x-admin-password": password },
      });
      
      if (response.ok) {
        setIsAuthenticated(true);
        localStorage.setItem("admin_password", password);
        fetchThemes();
        fetchCompanies();
        fetchLinks();
      } else {
        alert("密码错误");
      }
    } catch (error) {
      console.error("登录失败:", error);
      alert("登录失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  // 获取调研主题列表
  const fetchThemes = async () => {
    setLoading(true);
    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      const response = await fetch(`${API_URL}/admin-themes`, {
        headers: { "x-admin-password": savedPassword },
      });
      const data = await response.json();
      if (data.themes && Array.isArray(data.themes)) {
        setThemes(data.themes);
      }
    } catch (error) {
      console.error("获取主题列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 检查本地存储的密码
  useEffect(() => {
    const savedPassword = localStorage.getItem("admin_password");
    if (savedPassword) {
      setPassword(savedPassword);
      // 自动验证
      fetch(`${API_URL}/admin-companies`, {
        headers: { "x-admin-password": savedPassword },
      }).then(res => {
        if (res.ok) {
          setIsAuthenticated(true);
          fetchThemes();
          fetchCompanies();
          fetchLinks();
        }
      });
    }
  }, []);

  // 获取公司列表
  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      const response = await fetch(`${API_URL}/admin-companies`, {
        headers: { "x-admin-password": savedPassword },
      });
      const data = await response.json();
      setCompanies(data.companies || []);
    } catch (error) {
      console.error("获取公司列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 获取链接列表
  const fetchLinks = async () => {
    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      const response = await fetch(`${API_URL}/admin-links`, {
        headers: { "x-admin-password": savedPassword },
      });
      const data = await response.json();
      setLinks(data.links || []);
    } catch (error) {
      console.error("获取链接列表失败:", error);
    }
  };

  // 生成访谈链接
  const generateLink = (linkCode: string) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/i/${linkCode}`;
  };

  // 复制链接
  const copyLink = (linkCode: string) => {
    const link = generateLink(linkCode);
    navigator.clipboard.writeText(link);
    setCopiedLink(linkCode);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // 创建单个链接
  const createLink = async () => {
    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      const response = await fetch(`${API_URL}/admin-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": savedPassword,
        },
        body: JSON.stringify(createForm),
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        setCreateForm({ theme: "", company_name: "", interviewer_name: "", purpose: "", expires_hours: 0, max_uses: 0 });
        fetchLinks();
      }
    } catch (error) {
      console.error("创建链接失败:", error);
    }
  };

  // 批量创建链接
  const batchCreateLinks = async () => {
    if (selectedCompanies.size === 0) {
      alert("请先选择公司");
      return;
    }

    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      const response = await fetch(`${API_URL}/admin-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": savedPassword,
        },
        body: JSON.stringify({
          batch: true,
          companies: Array.from(selectedCompanies),
          expires_hours: createForm.expires_hours || 0,
          max_uses: createForm.max_uses || 0,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`成功创建 ${data.count} 个链接`);
        setSelectedCompanies(new Set());
        fetchLinks();
        setActiveTab("links");
      }
    } catch (error) {
      console.error("批量创建失败:", error);
    }
  };

  // 删除链接
  const deleteLink = async (id: string) => {
    if (!confirm("确定要删除这个链接吗？")) return;

    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      await fetch(`${API_URL}/admin-links?id=${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": savedPassword },
      });
      fetchLinks();
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  // 导出为 CSV
  const exportToCSV = () => {
    const headers = ["公司名称", "访谈者", "访谈目的", "链接", "访问次数", "完成次数", "完成率", "创建时间", "过期时间"];
    const rows = links.map(link => [
      link.company_name,
      link.interviewer_name || "",
      link.purpose || "",
      generateLink(link.link_code),
      link.visitCount,
      link.completedCount,
      `${link.completionRate}%`,
      new Date(link.created_at).toLocaleString("zh-CN"),
      link.expires_at ? new Date(link.expires_at).toLocaleString("zh-CN") : "永久有效",
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `访谈链接_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  // 解析 CSV 文件
  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error("CSV 文件至少需要包含标题行和一行数据");
    }

    // 解析标题行
    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
    
    // 查找列索引
    const companyIndex = headers.findIndex(h => 
      h.includes("公司") || h.toLowerCase().includes("company")
    );
    const interviewerIndex = headers.findIndex(h => 
      h.includes("访谈者") || h.includes("姓名") || h.toLowerCase().includes("interviewer") || h.toLowerCase().includes("name")
    );
    const purposeIndex = headers.findIndex(h => 
      h.includes("目的") || h.includes("purpose")
    );

    if (companyIndex === -1) {
      throw new Error('CSV 文件必须包含"公司名称"或"company"列');
    }

    // 解析数据行
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const companyName = values[companyIndex]?.trim();
      
      if (companyName) {
        rows.push({
          company_name: companyName,
          interviewer_name: interviewerIndex >= 0 ? values[interviewerIndex]?.trim() : undefined,
          purpose: purposeIndex >= 0 ? values[purposeIndex]?.trim() : undefined,
        });
      }
    }

    return rows;
  };

  // 解析 CSV 行（处理引号内的逗号）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.replace(/^["']|["']$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.replace(/^["']|["']$/g, ""));
    return result;
  };

  // 处理文件上传
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setUploadSuccess("");
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        setCsvData(rows);
        setUploadSuccess(`成功解析 ${rows.length} 条记录`);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "解析文件失败");
        setCsvData([]);
      }
    };
    reader.onerror = () => {
      setUploadError("读取文件失败");
    };
    reader.readAsText(file, "utf-8");
  };

  // 批量生成链接（从 CSV）
  const generateLinksFromCSV = async () => {
    if (csvData.length === 0) {
      setUploadError("没有可用的数据");
      return;
    }

    setLoading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const savedPassword = localStorage.getItem("admin_password") || password;
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://tantan.vercel.app";
      
      const response = await fetch(`${API_URL}/batch-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": savedPassword,
        },
        body: JSON.stringify({
          items: csvData,
          expires_hours: createForm.expires_hours || 0,
          max_uses: createForm.max_uses || 0,
          write_to_feishu: writeToFeishu,
          base_url: baseUrl,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setGeneratedLinks(data.links || []);
        setUploadSuccess(`成功生成 ${data.count} 个链接${data.feishu_write ? "，已同步到飞书" : ""}`);
        fetchLinks();
      } else {
        setUploadError(data.error || "生成链接失败");
      }
    } catch (error) {
      console.error("生成链接失败:", error);
      setUploadError("网络请求失败");
    } finally {
      setLoading(false);
    }
  };

  // 下载生成的链接
  const downloadGeneratedLinks = () => {
    const headers = ["公司名称", "访谈者", "访谈目的", "访谈链接"];
    const rows = generatedLinks.map(link => [
      link.company_name,
      link.interviewer_name || "",
      link.purpose || "",
      link.link_url,
    ]);

    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `生成的访谈链接_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  // 复制所有生成的链接
  const copyAllLinks = () => {
    const text = generatedLinks.map(link => 
      `${link.company_name}\t${link.interviewer_name || ""}\t${link.purpose || ""}\t${link.link_url}`
    ).join("\n");
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  };

  // 登录页面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full mx-4"
        >
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">管理员登录</h1>
          <p className="text-gray-500 text-center mb-6">请输入管理员密码访问后台</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="请输入管理员密码"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {loading ? "验证中..." : "登录"}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-purple-600" />
            <h1 className="text-xl font-bold">探探访谈管理</h1>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("admin_password");
              setIsAuthenticated(false);
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            退出登录
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 标签页 */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab("companies")}
            className={`px-6 py-3 rounded-xl font-medium transition-colors ${
              activeTab === "companies" 
                ? "bg-purple-600 text-white" 
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Users className="w-5 h-5 inline mr-2" />
            调研主题
          </button>
          <button
            onClick={() => setActiveTab("links")}
            className={`px-6 py-3 rounded-xl font-medium transition-colors ${
              activeTab === "links" 
                ? "bg-purple-600 text-white" 
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Link2 className="w-5 h-5 inline mr-2" />
            链接管理
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-3 rounded-xl font-medium transition-colors ${
              activeTab === "upload" 
                ? "bg-purple-600 text-white" 
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Upload className="w-5 h-5 inline mr-2" />
            批量上传
          </button>
        </div>

        {/* 调研主题列表标签页 */}
        {activeTab === "companies" && (
          <div>
            {/* 操作栏 */}
            <div className="bg-white rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={fetchThemes}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
                <span className="text-gray-500">
                  共 {themes.length} 个调研主题
                </span>
              </div>
            </div>

            {/* 调研主题列表 */}
            {loading ? (
              <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : themes.length > 0 ? (
              <div className="grid gap-3">
                {themes.map((theme) => (
                  <motion.div
                    key={theme}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Users className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{theme}</h3>
                        <p className="text-sm text-gray-500">点击创建该主题的访谈链接</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCreateForm({ ...createForm, theme: theme, company_name: "", interviewer_name: "", purpose: "" });
                        setShowCreateModal(true);
                      }}
                      className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    >
                      创建链接
                    </button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                暂无调研主题，请检查飞书多维表格配置
              </div>
            )}
          </div>
        )}

        {/* 链接管理标签页 */}
        {activeTab === "links" && (
          <div>
            {/* 操作栏 */}
            <div className="bg-white rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={fetchLinks}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
                <span className="text-gray-500">
                  共 {links.length} 个链接
                </span>
              </div>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <Download className="w-4 h-4" />
                导出 CSV
              </button>
            </div>

            {/* 链接列表 */}
            <div className="space-y-3">
              {links.map((link) => (
                <motion.div
                  key={link.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl p-4 ${
                    link.isExpired || link.isMaxUsed ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{link.company_name}</h3>
                        {link.interviewer_name && (
                          <span className="text-sm text-gray-500">· {link.interviewer_name}</span>
                        )}
                        {link.purpose && (
                          <span className="text-sm text-blue-500">· {link.purpose}</span>
                        )}
                        {link.isExpired && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">已过期</span>
                        )}
                        {link.isMaxUsed && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">已用完</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 font-mono mb-2">
                        {generateLink(link.link_code)}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          访问 {link.visitCount} 次
                        </span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-4 h-4" />
                          完成 {link.completedCount} 次 ({link.completionRate}%)
                        </span>
                        {link.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {new Date(link.expires_at).toLocaleString("zh-CN")} 过期
                          </span>
                        )}
                        {link.max_uses > 0 && (
                          <span>使用限制: {link.use_count}/{link.max_uses}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyLink(link.link_code)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                        title="复制链接"
                      >
                        {copiedLink === link.link_code ? (
                          <Check className="w-5 h-5 text-green-500" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                      <a
                        href={generateLink(link.link_code)}
                        target="_blank"
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                        title="打开链接"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                      <button
                        onClick={() => deleteLink(link.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        title="删除"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {links.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  暂无链接，请先在"公司列表"或"批量上传"中创建
                </div>
              )}
            </div>
          </div>
        )}

        {/* 批量上传标签页 */}
        {activeTab === "upload" && (
          <div>
            {/* 模式切换 */}
            <div className="bg-white rounded-xl p-4 mb-6">
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setUploadMode("form")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                    uploadMode === "form"
                      ? "bg-purple-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  表单模式
                  <span className="text-xs px-2 py-0.5 bg-white/20 rounded">推荐</span>
                </button>
                <button
                  onClick={() => setUploadMode("csv")}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                    uploadMode === "csv"
                      ? "bg-purple-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Upload className="w-5 h-5" />
                  CSV 上传
                </button>
              </div>
              <p className="text-center text-sm text-gray-500 mt-3">
                {uploadMode === "form" 
                  ? "适合 1-10 条链接，所见即所得，新手友好" 
                  : "适合 10+ 条链接，支持 Excel、CSV、TXT 格式"}
              </p>
            </div>

            {/* 表单模式 */}
            {uploadMode === "form" && <BatchFormCreator />}

            {/* CSV上传模式 */}
            {uploadMode === "csv" && <BatchCSVUploader />}
          </div>
        )}
      </main>

      {/* 创建链接弹窗 */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">创建访谈链接</h2>
                <button onClick={() => setShowCreateModal(false)}>
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">调研主题</label>
                  <input
                    type="text"
                    value={createForm.theme}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司名称 <span className="text-gray-400">(选填)</span></label>
                  <input
                    type="text"
                    value={createForm.company_name}
                    onChange={(e) => setCreateForm({ ...createForm, company_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="输入公司名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">访谈者姓名（可选）</label>
                  <input
                    type="text"
                    value={createForm.interviewer_name}
                    onChange={(e) => setCreateForm({ ...createForm, interviewer_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="例如：王总"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">访谈目的（可选）</label>
                  <input
                    type="text"
                    value={createForm.purpose}
                    onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="例如：了解业务痛点"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">有效期（小时，0为永久）</label>
                  <input
                    type="number"
                    value={createForm.expires_hours}
                    onChange={(e) => setCreateForm({ ...createForm, expires_hours: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="0"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最大使用次数（0为无限）</label>
                  <input
                    type="number"
                    value={createForm.max_uses}
                    onChange={(e) => setCreateForm({ ...createForm, max_uses: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={createLink}
                  disabled={!createForm.theme || loading}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
