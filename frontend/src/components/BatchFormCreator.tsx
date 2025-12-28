"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Copy, Check, Download, RefreshCw } from "lucide-react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://xvtgrzavwqesdfcifyrq.supabase.co/functions/v1";
const ADMIN_PASSWORD = "tantan2024";

interface BatchFormItem {
  id: string;
  theme: string;
  company_name: string;
  interviewer_name: string;
  purpose: string;
}

interface GeneratedLink {
  theme: string;
  company_name: string | null;
  interviewer_name: string | null;
  purpose: string | null;
  link_url: string;
}

export default function BatchFormCreator() {
  const [themes, setThemes] = useState<string[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [formItems, setFormItems] = useState<BatchFormItem[]>([
    { id: "1", theme: "", company_name: "", interviewer_name: "", purpose: "" }
  ]);
  
  // 批量设置
  const [expiresHours, setExpiresHours] = useState(168); // 7天
  const [syncToFeishu, setSyncToFeishu] = useState(true);
  
  // 生成结果
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 加载调研主题列表
  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    setLoadingThemes(true);
    try {
      const response = await axios.get(`${API_URL}/admin-themes`, {
        headers: { "x-admin-password": ADMIN_PASSWORD },
      });
      if (response.data.themes && Array.isArray(response.data.themes)) {
        setThemes(response.data.themes);
        // 如果第一个表单项的主题为空，设置默认主题
        if (formItems.length > 0 && !formItems[0].theme && response.data.themes.length > 0) {
          updateFormItem(formItems[0].id, "theme", response.data.themes[0]);
        }
      }
    } catch (err) {
      console.error("加载主题列表失败:", err);
      const defaultThemes = ["公司调研", "白皮书调研", "市场调研", "需求分析"];
      setThemes(defaultThemes);
      if (formItems.length > 0 && !formItems[0].theme) {
        updateFormItem(formItems[0].id, "theme", defaultThemes[0]);
      }
    } finally {
      setLoadingThemes(false);
    }
  };

  // 添加新表单项
  const addFormItem = () => {
    const newId = String(Date.now());
    setFormItems([
      ...formItems,
      { 
        id: newId, 
        theme: themes[0] || "", 
        company_name: "", 
        interviewer_name: "", 
        purpose: "" 
      }
    ]);
  };

  // 复制表单项
  const duplicateFormItem = (id: string) => {
    const item = formItems.find(f => f.id === id);
    if (item) {
      const newId = String(Date.now());
      setFormItems([
        ...formItems,
        { ...item, id: newId }
      ]);
    }
  };

  // 删除表单项
  const deleteFormItem = (id: string) => {
    if (formItems.length === 1) {
      setError("至少保留一个表单项");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setFormItems(formItems.filter(f => f.id !== id));
  };

  // 更新表单项
  const updateFormItem = (id: string, field: keyof BatchFormItem, value: string) => {
    setFormItems(formItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // 验证表单
  const validateForm = (): string | null => {
    for (let i = 0; i < formItems.length; i++) {
      const item = formItems[i];
      if (!item.theme || !item.theme.trim()) {
        return `第 ${i + 1} 项：调研主题不能为空`;
      }
    }
    return null;
  };

  // 批量生成链接
  const generateLinks = async () => {
    setError("");
    setSuccess("");
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const savedPassword = localStorage.getItem("admin_password") || ADMIN_PASSWORD;
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://tantan.vercel.app";
      
      const items = formItems.map(item => ({
        theme: item.theme,
        company_name: item.company_name || null,
        interviewer_name: item.interviewer_name || null,
        purpose: item.purpose || null,
      }));

      const response = await axios.post(`${API_URL}/batch-links`, {
        items,
        expires_hours: expiresHours,
        max_uses: 0,
        write_to_feishu: syncToFeishu,
        base_url: baseUrl,
      }, {
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": savedPassword,
        },
      });

      if (response.data.success) {
        setGeneratedLinks(response.data.links || []);
        setSuccess(`成功生成 ${response.data.count} 个链接${response.data.feishu_write ? "，已同步到飞书" : ""}`);
        
        // 重置表单
        setFormItems([
          { id: String(Date.now()), theme: themes[0] || "", company_name: "", interviewer_name: "", purpose: "" }
        ]);
      } else {
        setError(response.data.error || "生成链接失败");
      }
    } catch (err) {
      console.error("生成链接失败:", err);
      setError(axios.isAxiosError(err) ? err.response?.data?.error || "网络请求失败" : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  // 复制所有链接
  const copyAllLinks = () => {
    const text = generatedLinks.map(link => 
      `主题：${link.theme}\t公司：${link.company_name || "-"}\t访谈者：${link.interviewer_name || "-"}\t链接：${link.link_url}`
    ).join("\n");
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  };

  // 下载链接
  const downloadLinks = () => {
    const headers = ["调研主题", "公司名称", "访谈者", "访谈目的", "访谈链接"];
    const rows = generatedLinks.map(link => [
      link.theme,
      link.company_name || "",
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
    a.download = `批量生成的访谈链接_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* 表单列表 */}
      <div className="bg-white rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">📝 批量创建访谈链接</h2>
          <div className="text-sm text-gray-500">
            共 {formItems.length} 个链接
          </div>
        </div>

        <div className="space-y-4">
          {formItems.map((item, index) => (
            <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-600">访谈链接 {index + 1}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => duplicateFormItem(item.id)}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                    title="复制此条"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteFormItem(item.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 调研主题 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    调研主题 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={item.theme}
                    onChange={(e) => updateFormItem(item.id, "theme", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {loadingThemes ? (
                      <option>加载中...</option>
                    ) : (
                      <>
                        {themes.length === 0 && <option value="">暂无主题</option>}
                        {themes.map(theme => (
                          <option key={theme} value={theme}>{theme}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">💡 从飞书问题库自动获取主题</p>
                </div>

                {/* 公司名称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    公司名称 <span className="text-gray-400">(选填)</span>
                  </label>
                  <input
                    type="text"
                    value={item.company_name}
                    onChange={(e) => updateFormItem(item.id, "company_name", e.target.value)}
                    placeholder="如：小米、字节跳动"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">💡 如白皮书调研等通用主题可留空</p>
                </div>

                {/* 访谈者 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    访谈者 <span className="text-gray-400">(选填)</span>
                  </label>
                  <input
                    type="text"
                    value={item.interviewer_name}
                    onChange={(e) => updateFormItem(item.id, "interviewer_name", e.target.value)}
                    placeholder="如：王总、李经理"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">💡 不确定访谈对象可留空</p>
                </div>

                {/* 访谈目的 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    访谈目的 <span className="text-gray-400">(选填)</span>
                  </label>
                  <input
                    type="text"
                    value={item.purpose}
                    onChange={(e) => updateFormItem(item.id, "purpose", e.target.value)}
                    placeholder="如：Q4需求调研"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">💡 用于内部备注</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addFormItem}
          className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          添加更多链接
        </button>
      </div>

      {/* 批量设置 */}
      <div className="bg-white rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">⚙️ 批量设置</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              有效期
            </label>
            <select
              value={expiresHours}
              onChange={(e) => setExpiresHours(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value={0}>永久有效</option>
              <option value={24}>1天</option>
              <option value={72}>3天</option>
              <option value={168}>7天</option>
              <option value={720}>30天</option>
            </select>
          </div>
          
          <div className="flex items-end md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncToFeishu}
                onChange={(e) => setSyncToFeishu(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-gray-700">同步到飞书多维表格</span>
            </label>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          {error}
        </div>
      )}

      {/* 成功提示 */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 flex items-center gap-2">
          <Check className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* 生成按钮 */}
      <div className="flex justify-end">
        <button
          onClick={generateLinks}
          disabled={loading || formItems.length === 0}
          className="flex items-center gap-2 px-8 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg font-medium"
        >
          {loading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              生成全部链接 ({formItems.length})
            </>
          )}
        </button>
      </div>

      {/* 生成结果 */}
      {generatedLinks.length > 0 && (
        <div className="bg-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-green-700">
              ✅ 已生成 {generatedLinks.length} 个链接
            </h2>
            <div className="flex gap-2">
              <button
                onClick={copyAllLinks}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                复制全部
              </button>
              <button
                onClick={downloadLinks}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                下载 CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">调研主题</th>
                  <th className="text-left p-3 font-medium">公司名称</th>
                  <th className="text-left p-3 font-medium">访谈者</th>
                  <th className="text-left p-3 font-medium">访谈目的</th>
                  <th className="text-left p-3 font-medium">链接</th>
                  <th className="text-left p-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {generatedLinks.map((link, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500">{index + 1}</td>
                    <td className="p-3 font-medium">{link.theme}</td>
                    <td className="p-3">{link.company_name || "-"}</td>
                    <td className="p-3">{link.interviewer_name || "-"}</td>
                    <td className="p-3">{link.purpose || "-"}</td>
                    <td className="p-3 font-mono text-xs text-purple-600 max-w-xs truncate">
                      {link.link_url}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(link.link_url);
                          alert("已复制");
                        }}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                        title="复制链接"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

