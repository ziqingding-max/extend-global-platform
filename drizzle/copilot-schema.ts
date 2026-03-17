import { sqliteTable, integer, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============================================================================
// 16. COPILOT ASSISTANT EXTENSIONS
// ============================================================================

// Copilot用户配置表
export const copilotUserConfigs = sqliteTable(
  "copilot_user_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    preferences: text("preferences", { mode: "json" }), // JSON存储个性化配置
    hotkeys: text("hotkeys", { mode: "json" }), // 自定义快捷键配置
    enabledFeatures: text("enabledFeatures", { mode: "json" }), // 启用的功能列表
    disabledPredictions: text("disabledPredictions", { mode: "json" }), // 用户关闭的预测类型
    theme: text("theme", { length: 20 }).default("auto").notNull(), // auto/light/dark
    language: text("language", { length: 10 }).default("zh").notNull(),
    position: text("position", { length: 20 }).default("bottom-right").notNull(), // 悬浮球位置
    isEnabled: integer("isEnabled", { mode: "boolean" }).default(true).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cucUserIdIdx: uniqueIndex("cuc_user_id_idx").on(table.userId),
    cucEnabledIdx: index("cuc_enabled_idx").on(table.isEnabled),
  })
);

export type CopilotUserConfig = typeof copilotUserConfigs.$inferSelect;
export type InsertCopilotUserConfig = typeof copilotUserConfigs.$inferInsert;

// Copilot对话表
export const copilotConversations = sqliteTable(
  "copilot_conversations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    title: text("title", { length: 255 }),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    lastMessageAt: integer("lastMessageAt", { mode: "timestamp" }).defaultNow().notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    ccUserIdIdx: index("cc_user_id_idx").on(table.userId),
    ccActiveIdx: index("cc_active_idx").on(table.isActive),
    ccLastMessageIdx: index("cc_last_message_idx").on(table.lastMessageAt),
  })
);

export type CopilotConversation = typeof copilotConversations.$inferSelect;
export type InsertCopilotConversation = typeof copilotConversations.$inferInsert;

// Copilot消息表
export const copilotMessages = sqliteTable(
  "copilot_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversationId").notNull(),
    role: text("role", { length: 20 }).notNull(), // user, assistant, system
    content: text("content").notNull(),
    attachments: text("attachments", { mode: "json" }), // JSON存储附件信息
    metadata: text("metadata", { mode: "json" }), // JSON存储元数据
    cost: text("cost"), // AI调用成本
    processingTime: integer("processingTime"), // 处理时间（毫秒）
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
  },
  (table) => ({
    cmConversationIdIdx: index("cm_conversation_id_idx").on(table.conversationId),
    cmRoleIdx: index("cm_role_idx").on(table.role),
    cmCreatedIdx: index("cm_created_idx").on(table.createdAt),
  })
);

export type CopilotMessage = typeof copilotMessages.$inferSelect;
export type InsertCopilotMessage = typeof copilotMessages.$inferInsert;

// Copilot文件分析表
export const copilotFileAnalyses = sqliteTable(
  "copilot_file_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    fileName: text("fileName", { length: 255 }).notNull(),
    fileUrl: text("fileUrl").notNull(),
    fileKey: text("fileKey", { length: 500 }).notNull(), // S3 key
    fileSize: integer("fileSize").notNull(), // 文件大小（字节）
    mimeType: text("mimeType", { length: 100 }).notNull(),
    analysisType: text("analysisType", { length: 50 }).default("pending").notNull(), // invoice, contract, document, receipt, general
    status: text("status", { length: 20 }).default("pending").notNull(), // pending, processing, completed, failed
    analysisResult: text("analysisResult", { mode: "json" }), // JSON存储分析结果
    error: text("error"), // 错误信息
    cost: text("cost"), // AI分析成本
    processingTime: integer("processingTime"), // 处理时间（毫秒）
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cfaUserIdIdx: index("cfa_user_id_idx").on(table.userId),
    cfaStatusIdx: index("cfa_status_idx").on(table.status),
    cfaAnalysisTypeIdx: index("cfa_analysis_type_idx").on(table.analysisType),
    cfaCreatedIdx: index("cfa_created_idx").on(table.createdAt),
  })
);

export type CopilotFileAnalysis = typeof copilotFileAnalyses.$inferSelect;
export type InsertCopilotFileAnalysis = typeof copilotFileAnalyses.$inferInsert;

// Copilot预测表
export const copilotPredictions = sqliteTable(
  "copilot_predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    predictionType: text("predictionType", { length: 50 }).notNull(), // deadline_risk, anomaly, insight, trend
    title: text("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    confidence: integer("confidence").notNull(), // 0-100
    severity: text("severity", { length: 20 }).notNull(), // low, medium, high, critical
    predictionData: text("predictionData", { mode: "json" }), // JSON存储预测数据
    expiresAt: integer("expiresAt", { mode: "timestamp" }), // 预测过期时间
    isDismissed: integer("isDismissed", { mode: "boolean" }).default(false).notNull(),
    dismissedAt: integer("dismissedAt", { mode: "timestamp" }),
    suggestedAction: text("suggestedAction", { mode: "json" }), // JSON存储建议操作
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cpUserIdIdx: index("cp_user_id_idx").on(table.userId),
    cpTypeIdx: index("cp_type_idx").on(table.predictionType),
    cpSeverityIdx: index("cp_severity_idx").on(table.severity),
    cpDismissedIdx: index("cp_dismissed_idx").on(table.isDismissed),
    cpExpiresIdx: index("cp_expires_idx").on(table.expiresAt),
    cpCreatedIdx: index("cp_created_idx").on(table.createdAt),
  })
);

export type CopilotPrediction = typeof copilotPredictions.$inferSelect;
export type InsertCopilotPrediction = typeof copilotPredictions.$inferInsert;

// Copilot快捷操作表
export const copilotShortcuts = sqliteTable(
  "copilot_shortcuts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    title: text("title", { length: 100 }).notNull(),
    description: text("description", { length: 500 }),
    action: text("action", { length: 100 }).notNull(), // 执行的操作标识
    params: text("params", { mode: "json" }), // JSON存储操作参数
    icon: text("icon", { length: 50 }), // 图标标识
    badge: text("badge", { length: 20 }), // new, hot, beta等徽章
    hotkey: text("hotkey", { length: 50 }), // 快捷键，如 ctrl+shift+f
    usageCount: integer("usageCount").default(0).notNull(), // 使用次数
    lastUsedAt: integer("lastUsedAt", { mode: "timestamp" }),
    isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    csUserIdIdx: index("cs_user_id_idx").on(table.userId),
    csActionIdx: index("cs_action_idx").on(table.action),
    csActiveIdx: index("cs_active_idx").on(table.isActive),
    csUsageIdx: index("cs_usage_idx").on(table.usageCount),
    csLastUsedIdx: index("cs_last_used_idx").on(table.lastUsedAt),
  })
);

export type CopilotShortcut = typeof copilotShortcuts.$inferSelect;
export type InsertCopilotShortcut = typeof copilotShortcuts.$inferInsert;

// Copilot使用统计表
export const copilotMetrics = sqliteTable(
  "copilot_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    date: text("date").notNull(), // 统计日期 (YYYY-MM-DD格式)
    messageCount: integer("messageCount").default(0).notNull(), // 消息数量
    fileAnalysisCount: integer("fileAnalysisCount").default(0).notNull(), // 文件分析数量
    predictionCount: integer("predictionCount").default(0).notNull(), // 预测数量
    shortcutUsageCount: integer("shortcutUsageCount").default(0).notNull(), // 快捷操作使用次数
    totalCost: text("totalCost").default("0").notNull(), // 总成本（字符串存储金额）
    averageResponseTime: integer("averageResponseTime"), // 平均响应时间（毫秒）
    createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    cmUserIdIdx: index("cmet_user_id_idx").on(table.userId),
    cmDateIdx: uniqueIndex("cmet_date_idx").on(table.userId, table.date), // 每个用户每天一条记录
    cmCreatedIdx: index("cmet_created_idx").on(table.createdAt),
  })
);

export type CopilotMetric = typeof copilotMetrics.$inferSelect;
export type InsertCopilotMetric = typeof copilotMetrics.$inferInsert;

// ============================================================================
// 表关系定义
// ============================================================================

// 注意：关系定义需要引用主schema中的users表，这里只做类型定义
// 实际的关系定义应该在主schema文件中进行