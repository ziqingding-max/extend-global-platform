# FX汇差剥离引擎 (FX Stripping Engine)

在跨国薪酬结算业务中，汇率加价（FX Markup）是平台隐性利润的重要来源之一。Extend Global (EG) 平台通过 `fxStrippingEngine`（FX汇差剥离引擎），在发票生成与财务报表阶段，精确分离纯代收代付的成本与通过汇率加价产生的利润。

本文档详细说明该引擎的商业逻辑、计算公式及其在系统中的实现。

## 1. 商业逻辑与定义

### 1.1 什么是 FX Markup？
当终端客户（Client）需要支付一笔位于非本国货币区域的薪资时（例如：美国客户支付位于日本员工的 JPY 薪资），系统会向客户开具 USD 的账单。

在计算 USD 金额时，系统不会使用实时的银行间中准汇率（Mid-market Rate），而是会使用一个**包含加价的对客汇率**（Exchange Rate with Markup）。
* 例如：真实的 JPY/USD 汇率是 150，但系统向客户展示的汇率可能是 145。
* 客户为了支付 150,000 JPY 的薪资，实际上支付了 1,034.48 USD（150,000 / 145）。
* 而 EG 实际支付给当地 Vendor 的成本只有 1,000 USD（150,000 / 150）。
* 这其中的 34.48 USD 差额，就是 **FX Markup Revenue（汇差利润）**。

### 1.2 为什么需要“剥离”？
在传统的财务记账中，这笔 1,034.48 USD 通常被整体记录为“总收入（Gross Revenue）”，然后减去 1,000 USD 的“成本（COGS）”，得出 34.48 USD 的利润。

但在 B2B2B 的平台模式下，为了准确衡量平台的核心服务能力（如管理费收入）与金融杠杆能力（如汇率收入），我们需要在生成发票的那一刻，就将“总金额”**剥离（Strip）**成三个独立的部分：
1. **Pass-through Cost (代收代付成本)**：按无加价的基准汇率计算出的纯成本。
2. **FX Markup Revenue (汇差利润)**：由于汇率加价多收取的金额。
3. **Service Fee Revenue (服务费收入)**：按定价规则收取的固定或比例管理费。

## 2. 核心计算公式

引擎在处理每一张发票时，会遍历其中的所有费用明细项（Invoice Items），并应用以下公式进行拆解。

### 2.1 变量定义
* `localCurrencyTotal`: 当地货币（如 JPY）的用工总成本。
* `midMarketRate`: 基准汇率（无加价）。表示 1 单位结算货币兑换多少当地货币（例如 1 USD = 150 JPY）。
* `exchangeRateWithMarkup`: 对客汇率（含加价）。表示 1 单位结算货币兑换多少当地货币（例如 1 USD = 145 JPY）。注意，加价通常意味着对客汇率在数值上**小于**基准汇率（针对间接标价法）。

### 2.2 拆解公式
1. **客户结算总额 (Settlement Amount)**:
   `Settlement Amount = localCurrencyTotal / exchangeRateWithMarkup`

2. **代收代付成本 (Pass-through Cost)**:
   `Pass-through Cost = localCurrencyTotal / midMarketRate`

3. **汇差利润 (FX Markup Revenue)**:
   `FX Markup Revenue = Settlement Amount - Pass-through Cost`
   *或者数学上等价于：*
   `localCurrencyTotal * (1 / exchangeRateWithMarkup - 1 / midMarketRate)`

## 3. 引擎在系统中的实现流

`fxStrippingEngine`（位于 `server/services/fxStrippingEngine.ts`）主要在两个核心场景下被调用：

### 3.1 发票生成时的实时剥离
当 `dualLayerInvoiceService` 生成发票时，它会调用剥离引擎。引擎会计算出该发票中包含的 FX Markup，并将其作为一个隐性的属性存储在 `invoices` 表或相关的财务统计表中。
对于 Layer 2 发票（CP 开给 Client），这个剥离计算尤为重要，因为它决定了 CP 能够从汇率差中赚取多少额外的 Margin。

### 3.2 净额法 P&L 报表生成
在 Admin Portal 的 "Profit & Loss Report" 模块中，财务人员需要查看平台的真实净收入。剥离引擎会汇总指定时间段内的所有发票，生成如下结构的报表：

```text
Gross Billed Amount (总开票金额)
  - Pass-through Employment Costs (代收代付薪酬成本)
  - Pass-through Tax & Social (代收代付税费与社保)
--------------------------------------------------
= Net Revenue (净收入)

Breakdown of Net Revenue:
  + Service Fee Revenue (管理服务费收入)
  + FX Markup Revenue (汇差利润)
  + Setup/One-time Fees (一次性开户费)
```

## 4. 多币种发票的复杂性处理

在某些情况下，一份发票可能包含位于多个不同国家的员工（例如，一个客户同时为日本和英国的员工支付薪资，统一用 USD 结算）。

此时，剥离引擎必须在 **Invoice Item（费用明细）** 级别进行逐行计算：
1. 识别该明细项所属的当地货币（如 JPY, GBP）。
2. 获取该货币对 USD 的 `midMarketRate` 和 `exchangeRateWithMarkup`。
3. 逐行计算 `Pass-through Cost` 和 `FX Markup Revenue`。
4. 最后将所有明细项的剥离结果汇总，得出整张发票的总汇差利润。

通过这种底层的拆解与剥离，Extend Global 平台能够为管理层提供极其清晰的利润来源分析，同时也为 CP 提供了透明的收益分成依据。
