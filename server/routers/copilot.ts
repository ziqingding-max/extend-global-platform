import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { 
  protectedProcedure, 
  adminProcedure, 
  operationsManagerProcedure,
  financeManagerProcedure,
  customerManagerProcedure 
} from "../procedures";
import { router } from "../_core/trpc";
import { CopilotService } from "../services/copilotService";
import { PredictionGenerator, QuickActionGenerator } from "../services/copilotGenerators";
import { 
  copilotUserConfigs, 
  copilotConversations, 
  copilotMessages, 
  copilotFileAnalyses, 
  copilotPredictions, 
  copilotShortcuts, 
  copilotMetrics 
} from "../../drizzle/schema";
import { eq, and, desc, gte, inArray, sql, count, sum, avg } from "drizzle-orm";
import { getDb } from "../db";
import { hasAnyRole } from "../../shared/roles";
import { storagePut } from "../storage";

// 增强的输入验证schema
const attachmentSchema = z.object({
  type: z.enum(["image", "file"]),
  url: z.string().url(),
  name: z.string().min(1).max(255),
  mimeType: z.string().optional(),
  size: z.number().max(10 * 1024 * 1024).optional(), // 10MB限制
});

const contextSchema = z.object({
  currentPage: z.string().max(100).optional(),
  selectedCustomerId: z.string().max(50).optional(),
  selectedEmployeeId: z.string().max(50).optional(),
  selectedPayrollId: z.string().max(50).optional(),
  payrollBatches: z.array(z.any()).max(100).optional(),
  leaveRecords: z.array(z.any()).max(100).optional(),
  userRole: z.string().optional(),
}).strict();

const sendMessageInput = z.object({
  message: z.string().min(1).max(5000),
  attachments: z.array(attachmentSchema).max(5).optional(), // 最多5个附件
  context: contextSchema.optional(),
}).strict();

const updateUserConfigInput = z.object({
  preferences: z.object({}).passthrough().optional(),
  hotkeys: z.object({}).passthrough().optional(),
  enabledFeatures: z.array(z.string().max(50)).max(20).optional(),
  disabledPredictions: z.array(z.string().max(50)).max(20).optional(),
  theme: z.enum(["auto", "light", "dark"]).optional(),
  language: z.string().min(2).max(10).optional(),
  position: z.string().max(50).optional(),
  isEnabled: z.boolean().optional(),
}).strict();

const uploadFileInput = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB限制
  mimeType: z.string().max(100),
  analysisType: z.enum(["invoice", "contract", "document", "receipt", "general", "image", "spreadsheet"]),
}).strict();

const createShortcutInput = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  action: z.string().min(1).max(100),
  params: z.object({}).passthrough().optional(),
  icon: z.string().max(50).optional(),
  hotkey: z.string().max(50).optional(),
}).strict();

// 文件类型验证常量
const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheet: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  text: ['text/plain', 'text/csv'],
};

// 内容安全验证函数
function sanitizeContent(content: string): string {
  // 基础XSS防护
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

function validateFileType(mimeType: string, analysisType: string): boolean {
  switch (analysisType) {
    case 'image':
      return ALLOWED_MIME_TYPES.image.includes(mimeType);
    case 'document':
    case 'contract':
    case 'receipt':
      return [...ALLOWED_MIME_TYPES.document, ...ALLOWED_MIME_TYPES.text].includes(mimeType);
    case 'spreadsheet':
      return ALLOWED_MIME_TYPES.spreadsheet.includes(mimeType);
    case 'general':
      return true; // 通用类型接受所有
    default:
      return false;
  }
}

// 辅助函数：记录使用情况
async function recordUsage(userId: number, usageType: string, cost: number): Promise<void> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    // 获取或创建今日统计
    const existing = await db
      .select()
      .from(copilotMetrics)
      .where(and(
        eq(copilotMetrics.userId, userId),
        eq(copilotMetrics.date, today)
      ))
      .limit(1);
    
    if (existing.length === 0) {
      // 创建新记录
      await db
        .insert(copilotMetrics)
        .values({
          userId,
          date: today,
          messageCount: usageType === "message" ? 1 : 0,
          fileAnalysisCount: usageType === "file_upload" ? 1 : 0,
          predictionCount: 0,
          shortcutUsageCount: 0,
          totalCost: cost.toFixed(4),
          averageResponseTime: 0,
          createdAt: new Date(),
        });
    } else {
      // 更新现有记录
      const updateData: any = {
        totalCost: sql`${copilotMetrics.totalCost} + ${cost.toFixed(4)}`,
        updatedAt: new Date(),
      };
      
      if (usageType === "message") {
        updateData.messageCount = sql`${copilotMetrics.messageCount} + 1`;
      } else if (usageType === "file_upload") {
        updateData.fileAnalysisCount = sql`${copilotMetrics.fileAnalysisCount} + 1`;
      } else if (usageType === "shortcut") {
        updateData.shortcutUsageCount = sql`${copilotMetrics.shortcutUsageCount} + 1`;
      }
      
      await db
        .update(copilotMetrics)
        .set(updateData)
        .where(eq(copilotMetrics.id, existing[0].id));
    }
  } catch (error) {
    console.error("[CopilotRouter] Failed to record usage:", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "记录使用统计失败" });
  }
}

// Copilot路由
export const copilotRouter = router({
  // 获取用户配置
  getUserConfig: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        
        const configs = await db
          .select()
          .from(copilotUserConfigs)
          .where(eq(copilotUserConfigs.userId, ctx.user.id))
          .limit(1);
        
        if (configs.length === 0) {
          // 创建默认配置
          const [newConfig] = await db
            .insert(copilotUserConfigs)
            .values({
              userId: ctx.user.id,
              preferences: {
                showCostInfo: true,
                showProcessingTime: true,
                autoSaveConversations: true,
                enableRealTime: false,
              },
              hotkeys: {
                toggleCopilot: "ctrl+shift+c",
                quickActions: "ctrl+shift+a",
                focusInput: "ctrl+shift+f",
              },
              enabledFeatures: ["chat", "predictions", "shortcuts", "fileUpload"],
              disabledPredictions: [],
              theme: "auto",
              language: ctx.user.language || "zh",
              position: "bottom-right",
              isEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          
          return newConfig;
        }
        
        return configs[0];
      } catch (error) {
        console.error("[CopilotRouter] Failed to get user config:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "获取用户配置失败" });
      }
    }),

  // 更新用户配置
  updateUserConfig: protectedProcedure
    .input(updateUserConfigInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        
        const existing = await db
          .select()
          .from(copilotUserConfigs)
          .where(eq(copilotUserConfigs.userId, ctx.user.id))
          .limit(1);
        
        if (existing.length === 0) {
          // 创建新配置
          const [newConfig] = await db
            .insert(copilotUserConfigs)
            .values({
              userId: ctx.user.id,
              preferences: input.preferences || {},
              hotkeys: input.hotkeys || {},
              enabledFeatures: input.enabledFeatures || ["chat", "predictions", "shortcuts"],
              disabledPredictions: input.disabledPredictions || [],
              theme: input.theme || "auto",
              language: input.language || ctx.user.language || "zh",
              position: input.position || "bottom-right",
              isEnabled: input.isEnabled !== false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          
          return newConfig;
        }
        
        // 更新现有配置
        const [updated] = await db
          .update(copilotUserConfigs)
          .set({ 
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(copilotUserConfigs.id, existing[0].id))
          .returning();
        
        return updated;
      } catch (error) {
        console.error("[CopilotRouter] Failed to update user config:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "更新用户配置失败" });
      }
    }),

  // 发送消息
  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ ctx, input }) => {
      try {
        // 内容安全验证
        const sanitizedMessage = sanitizeContent(input.message);
        
        // 验证附件
        if (input.attachments && input.attachments.length > 0) {
          for (const attachment of input.attachments) {
            if (!validateFileType(attachment.mimeType || '', 'general')) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `不支持的文件类型: ${attachment.mimeType}` });
            }
          }
        }
        
        const copilotService = new CopilotService(ctx.user.id, ctx.user.role);
        
        const response = await copilotService.processChatMessage(
          sanitizedMessage,
          input.context,
          input.attachments
        );
        
        // 记录使用统计
        await recordUsage(ctx.user.id, "message", response.costEstimate || 0);
        
        return response;
      } catch (error) {
        console.error("[CopilotRouter] Failed to process message:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "处理消息失败，请稍后重试" });
      }
    }),

  // 获取对话历史
  getConversationHistory: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        
        // 获取活跃的对话
        const conversations = await db
          .select()
          .from(copilotConversations)
          .where(and(
            eq(copilotConversations.userId, ctx.user.id),
            eq(copilotConversations.isActive, true)
          ))
          .orderBy(desc(copilotConversations.lastMessageAt))
          .limit(1);
        
        if (conversations.length === 0) {
          return [];
        }
        
        // 获取对话消息
        const messages = await db
          .select()
          .from(copilotMessages)
          .where(eq(copilotMessages.conversationId, conversations[0].id))
          .orderBy(copilotMessages.createdAt)
          .limit(100);
        
        return messages.map(msg => ({
          id: msg.id.toString(),
          role: msg.role,
          content: msg.content,
          attachments: msg.attachments,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
        }));
      } catch (error) {
        console.error("[CopilotRouter] Failed to get conversation history:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "获取对话历史失败" });
      }
    }),

  // 清空对话历史
  clearConversationHistory: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const db = await getDb();
        
        // 获取用户的活跃对话
        const conversations = await db
          .select({ id: copilotConversations.id })
          .from(copilotConversations)
          .where(and(
            eq(copilotConversations.userId, ctx.user.id),
            eq(copilotConversations.isActive, true)
          ));
        
        if (conversations.length > 0) {
          // 删除相关消息
          await db
            .delete(copilotMessages)
            .where(eq(copilotMessages.conversationId, conversations[0].id));
          
          // 标记对话为非活跃
          await db
            .update(copilotConversations)
            .set({ 
              isActive: false,
              updatedAt: new Date() 
            })
            .where(eq(copilotConversations.id, conversations[0].id));
        }
        
        return { success: true };
      } catch (error) {
        console.error("[CopilotRouter] Failed to clear conversation history:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "清空对话历史失败" });
      }
    }),

  // 获取预测
  getPredictions: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        
        // 获取用户配置
        const userConfig = await db
          .select()
          .from(copilotUserConfigs)
          .where(eq(copilotUserConfigs.userId, ctx.user.id))
          .limit(1);
        
        if (userConfig.length === 0 || !userConfig[0].isEnabled) {
          return [];
        }
        
        const disabledTypes = userConfig[0].disabledPredictions || [];
        
        // 获取活跃预测
        const predictions = await db
          .select()
          .from(copilotPredictions)
          .where(and(
            eq(copilotPredictions.userId, ctx.user.id),
            eq(copilotPredictions.isDismissed, false)
          ))
          .orderBy(desc(copilotPredictions.createdAt))
          .limit(20);
        
        // 过滤用户禁用的预测类型
        return predictions.filter(p => !disabledTypes.includes(p.predictionType));
      } catch (error) {
        console.error("[CopilotRouter] Failed to get predictions:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "获取预测失败" });
      }
    }),

  // 忽略预测
  dismissPrediction: protectedProcedure
    .input(z.object({ predictionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        
        await db
          .update(copilotPredictions)
          .set({ 
            isDismissed: true,
            dismissedAt: new Date(),
            updatedAt: new Date()
          })
          .where(and(
            eq(copilotPredictions.id, input.predictionId),
            eq(copilotPredictions.userId, ctx.user.id)
          ));
        
        return { success: true };
      } catch (error) {
        console.error("[CopilotRouter] Failed to dismiss prediction:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "忽略预测失败" });
      }
    }),

  // 获取快捷操作
  getShortcuts: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        
        // 获取用户自定义快捷操作
        const userShortcuts = await db
          .select()
          .from(copilotShortcuts)
          .where(and(
            eq(copilotShortcuts.userId, ctx.user.id),
            eq(copilotShortcuts.isActive, true)
          ))
          .orderBy(desc(copilotShortcuts.usageCount), desc(copilotShortcuts.lastUsedAt))
          .limit(20);
        
        // 生成基于角色的推荐快捷操作
        const roleBasedShortcuts = QuickActionGenerator.generateRoleBasedShortcuts(ctx.user.role);
        
        // 合并并去重
        const allShortcuts = [...userShortcuts, ...roleBasedShortcuts];
        
        return allShortcuts.map(shortcut => ({
          id: shortcut.id.toString(),
          title: shortcut.title,
          description: shortcut.description,
          icon: shortcut.icon,
          action: shortcut.action,
          badge: shortcut.badge,
          hotkey: shortcut.hotkey,
          params: shortcut.params,
          usageCount: shortcut.usageCount || 0,
          lastUsedAt: shortcut.lastUsedAt,
        }));
      } catch (error) {
        console.error("[CopilotRouter] Failed to get shortcuts:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "获取快捷操作失败" });
      }
    }),

  // 创建快捷操作
  createShortcut: protectedProcedure
    .input(createShortcutInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        
        const [shortcut] = await db
          .insert(copilotShortcuts)
          .values({
            userId: ctx.user.id,
            title: input.title,
            description: input.description,
            action: input.action,
            params: input.params || {},
            icon: input.icon,
            hotkey: input.hotkey,
            usageCount: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        
        return shortcut;
      } catch (error) {
        console.error("[CopilotRouter] Failed to create shortcut:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建快捷操作失败" });
      }
    }),

  // 更新快捷操作使用统计
  updateShortcutUsage: protectedProcedure
    .input(z.object({ shortcutId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        
        await db
          .update(copilotShortcuts)
          .set({
            usageCount: sql`${copilotShortcuts.usageCount} + 1`,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(copilotShortcuts.id, input.shortcutId),
            eq(copilotShortcuts.userId, ctx.user.id)
          ));
        
        return { success: true };
      } catch (error) {
        console.error("[CopilotRouter] Failed to update shortcut usage:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "更新快捷操作使用统计失败" });
      }
    }),

  // 上传文件并分析
  uploadFile: protectedProcedure
    .input(uploadFileInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        
        // 验证文件类型
        if (!validateFileType(input.mimeType, input.analysisType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `不支持的文件类型: ${input.mimeType} for analysis type: ${input.analysisType}` });
        }
        
        // 创建文件分析记录
        const [analysis] = await db
          .insert(copilotFileAnalyses)
          .values({
            userId: ctx.user.id,
            fileName: input.fileName,
            fileUrl: "", // 将在上传后更新
            fileKey: "", // 将在上传后更新
            fileSize: input.fileSize,
            mimeType: input.mimeType,
            analysisType: input.analysisType,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        
        // 记录使用统计
        await recordUsage(ctx.user.id, "file_upload", 0.01); // 小额成本
        
        return {
          analysisId: analysis.id,
          uploadUrl: "", // 这里应该返回预签名URL
          status: "pending",
        };
      } catch (error) {
        console.error("[CopilotRouter] Failed to create file analysis:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建文件分析失败" });
      }
    }),

  // 获取使用统计
  getUsageStats: protectedProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        
        const startDate = input?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const endDate = input?.endDate || new Date().toISOString().slice(0, 10);
        
        const stats = await db
          .select({
            totalMessages: sum(copilotMetrics.messageCount),
            totalFileAnalyses: sum(copilotMetrics.fileAnalysisCount),
            totalPredictions: sum(copilotMetrics.predictionCount),
            totalShortcuts: sum(copilotMetrics.shortcutUsageCount),
            totalCost: sum(copilotMetrics.totalCost),
            avgResponseTime: avg(copilotMetrics.averageResponseTime),
          })
          .from(copilotMetrics)
          .where(and(
            eq(copilotMetrics.userId, ctx.user.id),
            sql`${copilotMetrics.date} >= ${startDate}`,
            sql`${copilotMetrics.date} <= ${endDate}`
          ));
        
        return stats[0];
      } catch (error) {
        console.error("[CopilotRouter] Failed to get usage stats:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "获取使用统计失败" });
      }
    }),
});