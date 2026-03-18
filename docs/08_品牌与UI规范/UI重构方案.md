# Extend Global - UI 架构重构方案 (Glassmorphism)

## 1. 设计理念与全局规范

基于最新的毛玻璃（Glassmorphism）参考图，我们将对 Extend Global 的三个核心门户（Admin, App/Client, Worker）进行全面的视觉与交互重构。

### 1.1 核心视觉特征
* **全局背景**：摒弃纯色背景，采用大面积的柔和流体渐变（粉紫/淡蓝/浅粉交织的极光渐变），营造梦幻、通透的氛围。
* **卡片材质**：所有内容容器采用毛玻璃质感（半透明白底 `rgba(255,255,255,0.6)` + 背景模糊 `backdrop-blur-xl` + 细腻的白色边框 `border-white/40`）。
* **阴影处理**：抛弃深色硬阴影，改用非常柔和、扩散的彩色发光阴影或浅灰投影。
* **排版规范**：大量留白（White space），圆角更大（`rounded-2xl` 或 `rounded-3xl`），字体颜色采用深灰/深紫而非纯黑，保持整体的柔和感。

### 1.2 导航架构重构（侧边栏 -> 顶部栏）
为了最大化释放横向空间，配合毛玻璃的通透感，所有门户的**左侧固定侧边栏（Sidebar）将被移除**，统一重构为**悬浮式顶部导航栏（Top Floating Navbar）**。

顶部导航栏设计规范：
* 居中悬浮，左右留有 Margin（不是顶满全宽的 Header）。
* 药丸形状（Pill shape），全圆角 `rounded-full`。
* 内部结构：左侧 Logo/公司名，中间是 Tab 导航项，右侧是用户头像/通知/设置。

---

## 2. 各门户导航映射方案

由于 Admin Portal 功能极其繁杂，简单的顶部 Tab 无法容纳所有入口，我们需要引入 **"主 Tab + 悬浮 Mega Menu (超级菜单)"** 的交互模式。

### 2.1 Admin Portal 导航映射
现有侧边栏分为 7 个 Group，重构为顶部 5 个主 Tab：

| 顶部主 Tab | 悬浮下拉菜单 (Mega Menu) 内容 |
| :--- | :--- |
| **Overview** | Dashboard, Profit & Loss, Reconciliation |
| **Clients & Sales** | Customers, People, Sales CRM, Quotations, Partners |
| **Operations** | Payroll, Adjustments, Reimbursements, Leave, Contractor Invoices |
| **Finance & Vendor** | Invoices, Release Tasks, Vendors, Vendor Bills |
| **System** | Settings, Knowledge Base, Country Guides |

### 2.2 App Portal (CP/Client) 导航映射
Client Portal 功能适中，适合扁平化的顶部 Tab 结构，超出部分放入 "More" 或右侧菜单。

| 顶部主 Tab | 对应路由 |
| :--- | :--- |
| **Dashboard** | `/portal/` |
| **Team** | `/portal/people`, `/portal/onboarding` |
| **Finance** | `/portal/invoices`, `/portal/wallet` |
| **Operations** | `/portal/payroll`, `/portal/leave`, `/portal/reimbursements` |
| **Toolkit** | Cost Simulator, Country Guide |

### 2.3 Worker Portal 导航映射
员工端功能最少，最适合这种极简的顶部药丸导航。

| 顶部主 Tab | 对应功能 (Employee / Contractor) |
| :--- | :--- |
| **Overview** | Dashboard |
| **Money** | Payslips (Emp) / Invoices (Cont) |
| **Time** | Leave (Emp) / Milestones (Cont) |
| **Docs** | Documents, Reimbursements |
| **Profile** | User Profile, Role Switch |

---

## 3. 核心页面布局模式

### 3.1 仪表盘 (Dashboard Layout)
* 顶部：悬浮导航栏。
* 上半部：欢迎语（大字体） + 核心 KPI 数据卡片（毛玻璃材质，横向排列）。
* 下半部：动态列表（Recent Activity）和图表卡片。

### 3.2 数据表格 (Data Table Layout)
由于表格数据密集，不适合全透明。
* 表格容器：采用不透明度更高的白色背景（`rgba(255,255,255,0.85)`），确保文字可读性。
* 表头：极简线条分隔，无底色。
* 操作区：搜索框和筛选按钮采用内凹的毛玻璃效果或简单的胶囊按钮。

### 3.3 详情抽屉 (Slide-out Drawer)
* 现有的全屏弹窗或右侧抽屉，将采用极强模糊效果的遮罩（`backdrop-blur-md`），抽屉本身采用半透明毛玻璃面板，从右侧滑出。

---

## 4. 技术实现路径 (Tailwind CSS)

在代码层面，我们需要扩展 Tailwind 配置来实现这种效果：

```javascript
// tailwind.config.js 扩展示例
module.exports = {
  theme: {
    extend: {
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        'glass-panel': 'linear-gradient(to bottom right, rgba(255,255,255,0.7), rgba(255,255,255,0.3))',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        'glass-inset': 'inset 0 0 0 1px rgba(255, 255, 255, 0.4)',
      }
    }
  }
}
```

基础卡片组件的 CSS 类组合将是：
`bg-white/40 backdrop-blur-xl border border-white/50 shadow-glass rounded-3xl`
