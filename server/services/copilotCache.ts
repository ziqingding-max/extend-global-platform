import { LRUCache } from 'lru-cache';
import { getDb } from "../db";
import { hasAnyRole } from "../../shared/roles";

// 缓存配置
interface CacheConfig {
  maxSize: number;
  ttl: number; // 毫秒
  checkPeriod: number; // 检查过期缓存的周期
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,
  ttl: 5 * 60 * 1000, // 5分钟
  checkPeriod: 60 * 1000, // 1分钟
};

// 缓存管理器
export class CopilotCacheManager {
  private userConfigCache: LRUCache<number, any>;
  private conversationCache: LRUCache<number, any>;
  private predictionsCache: LRUCache<number, any[]>;
  private shortcutsCache: LRUCache<number, any[]>;
  private dataContextCache: LRUCache<string, any>;
  private aiResponseCache: LRUCache<string, any>;
  
  private cleanupInterval: NodeJS.Timeout | null = null;
  private metrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    updates: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    const finalConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
    
    // 用户配置缓存
    this.userConfigCache = new LRUCache({
      max: 500,
      ttl: finalConfig.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // 对话缓存
    this.conversationCache = new LRUCache({
      max: 200,
      ttl: finalConfig.ttl * 2, // 对话缓存更久
      updateAgeOnGet: true,
    });

    // 预测缓存
    this.predictionsCache = new LRUCache({
      max: 300,
      ttl: 2 * 60 * 1000, // 2分钟，预测更新频繁
      updateAgeOnGet: true,
    });

    // 快捷操作缓存
    this.shortcutsCache = new LRUCache({
      max: 400,
      ttl: finalConfig.ttl,
      updateAgeOnGet: true,
    });

    // 数据上下文缓存
    this.dataContextCache = new LRUCache({
      max: 600,
      ttl: 3 * 60 * 1000, // 3分钟
      updateAgeOnGet: true,
    });

    // AI响应缓存
    this.aiResponseCache = new LRUCache({
      max: 800,
      ttl: 10 * 60 * 1000, // 10分钟，AI响应相对稳定
      updateAgeOnGet: true,
    });

    // 启动清理任务
    this.startCleanupTask(finalConfig.checkPeriod);
    
    // 监听缓存事件
    this.setupCacheEventListeners();
  }

  // 设置缓存事件监听器
  private setupCacheEventListeners() {
    // 监听缓存驱逐
    this.userConfigCache.addEventListener('evict', () => {
      this.metrics.evictions++;
    });

    this.conversationCache.addEventListener('evict', () => {
      this.metrics.evictions++;
    });
  }

  // 启动清理任务
  private startCleanupTask(period: number) {
    this.cleanupInterval = setInterval(() => {
      this.performMaintenance();
    }, period);
  }

  // 执行维护任务
  private performMaintenance() {
    // 清理过期缓存（LRU会自动处理，这里可以做额外的清理）
    const now = Date.now();
    
    // 可以在这里添加自定义的清理逻辑
    // 例如：记录缓存命中率、清理特定的过期数据等
    
    this.logMetrics();
  }

  // 记录缓存指标
  private logMetrics() {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests) * 100 : 0;
    
    console.log(`[CopilotCache] Hit rate: ${hitRate.toFixed(2)}%, Hits: ${this.metrics.hits}, Misses: ${this.metrics.misses}, Evictions: ${this.metrics.evictions}`);
  }

  // 用户配置缓存
  async getUserConfig(userId: number): Promise<any | null> {
    const cacheKey = userId;
    
    if (this.userConfigCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.userConfigCache.get(cacheKey) || null;
    }
    
    this.metrics.misses++;
    
    // 从数据库获取
    const db = await getDb();
    const configs = await db
      .select()
      .from(copilotUserConfigs)
      .where(eq(copilotUserConfigs.userId, userId))
      .limit(1);
    
    if (configs.length > 0) {
      this.userConfigCache.set(cacheKey, configs[0]);
      return configs[0];
    }
    
    return null;
  }

  setUserConfig(userId: number, config: any): void {
    const cacheKey = userId;
    this.userConfigCache.set(cacheKey, config);
    this.metrics.updates++;
  }

  // 对话缓存
  async getActiveConversation(userId: number): Promise<any | null> {
    const cacheKey = `conv_active_${userId}`;
    
    if (this.conversationCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.conversationCache.get(cacheKey) || null;
    }
    
    this.metrics.misses++;
    
    const db = await getDb();
    const conversations = await db
      .select()
      .from(copilotConversations)
      .where(and(
        eq(copilotConversations.userId, userId),
        eq(copilotConversations.isActive, true)
      ))
      .orderBy(desc(copilotConversations.lastMessageAt))
      .limit(1);
    
    if (conversations.length > 0) {
      this.conversationCache.set(cacheKey, conversations[0]);
      return conversations[0];
    }
    
    return null;
  }

  setActiveConversation(userId: number, conversation: any): void {
    const cacheKey = `conv_active_${userId}`;
    this.conversationCache.set(cacheKey, conversation);
    this.metrics.updates++;
  }

  // 消息缓存
  async getConversationMessages(conversationId: number, limit: number = 100): Promise<any[]> {
    const cacheKey = `messages_${conversationId}_${limit}`;
    
    if (this.conversationCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.conversationCache.get(cacheKey) || [];
    }
    
    this.metrics.misses++;
    
    const db = await getDb();
    const messages = await db
      .select()
      .from(copilotMessages)
      .where(eq(copilotMessages.conversationId, conversationId))
      .orderBy(copilotMessages.createdAt)
      .limit(limit);
    
    this.conversationCache.set(cacheKey, messages);
    return messages;
  }

  // 预测缓存
  async getPredictions(userId: number): Promise<any[]> {
    const cacheKey = `predictions_${userId}`;
    
    if (this.predictionsCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.predictionsCache.get(cacheKey) || [];
    }
    
    this.metrics.misses++;
    
    const db = await getDb();
    const predictions = await db
      .select()
      .from(copilotPredictions)
      .where(and(
        eq(copilotPredictions.userId, userId),
        eq(copilotPredictions.isDismissed, false)
      ))
      .orderBy(desc(copilotPredictions.createdAt))
      .limit(20);
    
    this.predictionsCache.set(cacheKey, predictions);
    return predictions;
  }

  setPredictions(userId: number, predictions: any[]): void {
    const cacheKey = `predictions_${userId}`;
    this.predictionsCache.set(cacheKey, predictions);
    this.metrics.updates++;
  }

  // 快捷操作缓存
  async getShortcuts(userId: number): Promise<any[]> {
    const cacheKey = `shortcuts_${userId}`;
    
    if (this.shortcutsCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.shortcutsCache.get(cacheKey) || [];
    }
    
    this.metrics.misses++;
    
    const db = await getDb();
    const shortcuts = await db
      .select()
      .from(copilotShortcuts)
      .where(and(
        eq(copilotShortcuts.userId, userId),
        eq(copilotShortcuts.isActive, true)
      ))
      .orderBy(desc(copilotShortcuts.usageCount), desc(copilotShortcuts.lastUsedAt))
      .limit(20);
    
    this.shortcutsCache.set(cacheKey, shortcuts);
    return shortcuts;
  }

  setShortcuts(userId: number, shortcuts: any[]): void {
    const cacheKey = `shortcuts_${userId}`;
    this.shortcutsCache.set(cacheKey, shortcuts);
    this.metrics.updates++;
  }

  // 数据上下文缓存
  async getDataContext(cacheKey: string): Promise<any | null> {
    if (this.dataContextCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.dataContextCache.get(cacheKey) || null;
    }
    
    this.metrics.misses++;
    return null;
  }

  setDataContext(cacheKey: string, context: any): void {
    this.dataContextCache.set(cacheKey, context);
    this.metrics.updates++;
  }

  // AI响应缓存
  async getAIResponse(cacheKey: string): Promise<any | null> {
    if (this.aiResponseCache.has(cacheKey)) {
      this.metrics.hits++;
      return this.aiResponseCache.get(cacheKey) || null;
    }
    
    this.metrics.misses++;
    return null;
  }

  setAIResponse(cacheKey: string, response: any): void {
    this.aiResponseCache.set(cacheKey, response);
    this.metrics.updates++;
  }

  // 生成AI响应缓存键
  generateAIResponseCacheKey(userMessage: string, dataContext: any, userRole: string): string {
    const contextHash = this.hashObject(dataContext);
    const messageHash = this.hashString(userMessage);
    return `ai_response_${userRole}_${messageHash}_${contextHash}`;
  }

  // 生成数据上下文缓存键
  generateDataContextCacheKey(userId: number, message: string, context: any): string {
    const contextHash = this.hashObject(context);
    const messageHash = this.hashString(message);
    return `data_context_${userId}_${messageHash}_${contextHash}`;
  }

  // 简单的哈希函数
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return this.hashString(str);
  }

  // 批量清除缓存
  async invalidateUserCache(userId: number): Promise<void> {
    // 清除用户相关的所有缓存
    this.userConfigCache.delete(userId);
    this.conversationCache.delete(`conv_active_${userId}`);
    this.predictionsCache.delete(`predictions_${userId}`);
    this.shortcutsCache.delete(`shortcuts_${userId}`);
    
    console.log(`[CopilotCache] Invalidated cache for user ${userId}`);
  }

  // 清除特定类型的缓存
  async invalidateCacheByType(type: 'predictions' | 'shortcuts' | 'conversations'): Promise<void> {
    switch (type) {
      case 'predictions':
        this.predictionsCache.clear();
        break;
      case 'shortcuts':
        this.shortcutsCache.clear();
        break;
      case 'conversations':
        // 只清除对话缓存，保留其他缓存
        const keysToDelete: string[] = [];
        for (const key of this.conversationCache.keys()) {
          if (key.startsWith('conv_')) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => this.conversationCache.delete(key));
        break;
    }
    
    console.log(`[CopilotCache] Invalidated ${type} cache`);
  }

  // 获取缓存统计
  getCacheStats(): any {
    return {
      userConfig: {
        size: this.userConfigCache.size,
        maxSize: this.userConfigCache.max,
      },
      conversation: {
        size: this.conversationCache.size,
        maxSize: this.conversationCache.max,
      },
      predictions: {
        size: this.predictionsCache.size,
        maxSize: this.predictionsCache.max,
      },
      shortcuts: {
        size: this.shortcutsCache.size,
        maxSize: this.shortcutsCache.max,
      },
      dataContext: {
        size: this.dataContextCache.size,
        maxSize: this.dataContextCache.max,
      },
      aiResponse: {
        size: this.aiResponseCache.size,
        maxSize: this.aiResponseCache.max,
      },
      metrics: { ...this.metrics },
    };
  }

  // 清理资源
  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // 清空所有缓存
    this.userConfigCache.clear();
    this.conversationCache.clear();
    this.predictionsCache.clear();
    this.shortcutsCache.clear();
    this.dataContextCache.clear();
    this.aiResponseCache.clear();
    
    console.log('[CopilotCache] Cleanup completed');
  }
}

// 预加载管理器
export class CopilotPreloader {
  private cacheManager: CopilotCacheManager;
  private preloadQueue: Array<() => Promise<void>> = [];
  private isPreloading = false;

  constructor(cacheManager: CopilotCacheManager) {
    this.cacheManager = cacheManager;
  }

  // 预加载用户数据
  async preloadUserData(userId: number): Promise<void> {
    if (this.isPreloading) return;
    
    this.isPreloading = true;
    
    try {
      // 并行预加载多个数据类型
      const preloadTasks = [
        () => this.cacheManager.getUserConfig(userId),
        () => this.cacheManager.getActiveConversation(userId),
        () => this.cacheManager.getPredictions(userId),
        () => this.cacheManager.getShortcuts(userId),
      ];

      await Promise.allSettled(preloadTasks.map(task => task()));
      
      console.log(`[CopilotPreloader] Preloaded data for user ${userId}`);
    } catch (error) {
      console.error('[CopilotPreloader] Preload failed:', error);
    } finally {
      this.isPreloading = false;
    }
  }

  // 智能预加载（基于用户行为）
  async smartPreload(userId: number, context: any): Promise<void> {
    // 基于用户角色和当前页面预加载相关数据
    const { currentPage, userRole } = context;
    
    const preloadTasks = [];
    
    // 基于页面预加载
    if (currentPage?.includes('/payroll')) {
      preloadTasks.push(() => this.preloadPayrollData(userId));
    }
    
    if (currentPage?.includes('/leave')) {
      preloadTasks.push(() => this.preloadLeaveData(userId));
    }
    
    if (currentPage?.includes('/finance')) {
      preloadTasks.push(() => this.preloadFinancialData(userId));
    }
    
    // 基于角色预加载
    if (hasAnyRole(userRole, ['admin', 'operations_manager'])) {
      preloadTasks.push(() => this.preloadOperationalData(userId));
    }
    
    if (hasAnyRole(userRole, ['admin', 'finance_manager'])) {
      preloadTasks.push(() => this.preloadFinancialData(userId));
    }
    
    await Promise.allSettled(preloadTasks.map(task => task()));
  }

  private async preloadPayrollData(userId: number): Promise<void> {
    // 预加载薪酬相关数据
    console.log(`[CopilotPreloader] Preloading payroll data for user ${userId}`);
  }

  private async preloadLeaveData(userId: number): Promise<void> {
    // 预加载休假相关数据
    console.log(`[CopilotPreloader] Preloading leave data for user ${userId}`);
  }

  private async preloadFinancialData(userId: number): Promise<void> {
    // 预加载财务相关数据
    console.log(`[CopilotPreloader] Preloading financial data for user ${userId}`);
  }

  private async preloadOperationalData(userId: number): Promise<void> {
    // 预加载运营相关数据
    console.log(`[CopilotPreloader] Preloading operational data for user ${userId}`);
  }
}

// 单例实例
let cacheManagerInstance: CopilotCacheManager | null = null;
let preloaderInstance: CopilotPreloader | null = null;

export function getCopilotCacheManager(): CopilotCacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CopilotCacheManager();
  }
  return cacheManagerInstance;
}

export function getCopilotPreloader(): CopilotPreloader {
  if (!preloaderInstance) {
    const cacheManager = getCopilotCacheManager();
    preloaderInstance = new CopilotPreloader(cacheManager);
  }
  return preloaderInstance;
}

// 清理函数
export async function cleanupCopilotCache(): Promise<void> {
  if (cacheManagerInstance) {
    await cacheManagerInstance.cleanup();
    cacheManagerInstance = null;
  }
  
  if (preloaderInstance) {
    preloaderInstance = null;
  }
  
  console.log('[CopilotCache] All cache resources cleaned up');
}