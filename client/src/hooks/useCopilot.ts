import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

// Copilot状态接口
interface CopilotState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  context: any;
  predictions: CopilotPrediction[];
  shortcuts: CopilotShortcut[];
  userConfig: CopilotUserConfig | null;
}

interface CopilotPrediction {
  id: string;
  type: 'deadline_risk' | 'anomaly' | 'insight' | 'trend';
  title: string;
  description: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expiresAt?: Date;
  isDismissed?: boolean;
  suggestedAction?: {
    label: string;
    action: string;
    params?: Record<string, any>;
  };
}

interface CopilotShortcut {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: string;
  badge?: string;
  hotkey?: string;
  params?: Record<string, any>;
  usageCount?: number;
  lastUsedAt?: Date;
}

interface CopilotUserConfig {
  id: number;
  userId: number;
  preferences: any;
  hotkeys: any;
  enabledFeatures: string[];
  disabledPredictions: string[];
  theme: 'auto' | 'light' | 'dark';
  language: string;
  position: string;
  isEnabled: boolean;
}

interface OperationalContext {
  currentPage?: string;
  selectedCustomerId?: string;
  selectedEmployeeId?: string;
  selectedPayrollId?: string;
  payrollBatches?: any[];
  leaveRecords?: any[];
  userRole: string;
}

export function useCopilot() {
  const { user } = useAuth();
  const [state, setState] = useState<CopilotState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    context: null,
    predictions: [],
    shortcuts: [],
    userConfig: null,
  });

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 获取用户配置
  const getUserConfigQuery = trpc.copilot.getUserConfig.useQuery(undefined, {
    enabled: !!user && state.isInitialized,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    onSuccess: (data) => {
      setState(prev => ({ ...prev, userConfig: data }));
    },
    onError: (error) => {
      console.error('Failed to get user config:', error);
    },
  });

  // 获取预测
  const getPredictionsQuery = trpc.copilot.getPredictions.useQuery(undefined, {
    enabled: !!user && state.isInitialized,
    refetchInterval: 30 * 1000, // 30秒轮询
    onSuccess: (data) => {
      setState(prev => ({ ...prev, predictions: data }));
    },
    onError: (error) => {
      console.error('Failed to get predictions:', error);
    },
  });

  // 获取快捷操作
  const getShortcutsQuery = trpc.copilot.getShortcuts.useQuery(undefined, {
    enabled: !!user && state.isInitialized,
    staleTime: 60 * 1000, // 1分钟缓存
    onSuccess: (data) => {
      setState(prev => ({ ...prev, shortcuts: data }));
    },
    onError: (error) => {
      console.error('Failed to get shortcuts:', error);
    },
  });

  // 更新用户配置
  const updateUserConfigMutation = trpc.copilot.updateUserConfig.useMutation({
    onSuccess: (data) => {
      setState(prev => ({ ...prev, userConfig: data }));
    },
    onError: (error) => {
      console.error('Failed to update user config:', error);
      setState(prev => ({ ...prev, error: error.message }));
    },
  });

  // 初始化
  const initialize = useCallback(async () => {
    if (!user) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // 获取当前页面上下文
      const context = await detectCurrentContext();
      
      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        context,
      }));

      // 启动轮询
      startPolling();

    } catch (error) {
      console.error('Failed to initialize copilot:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : '初始化失败',
      }));
    }
  }, [user]);

  // 检测当前上下文
  const detectCurrentContext = async (): Promise<OperationalContext> => {
    const currentPath = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    // 基础上下文
    const context: OperationalContext = {
      userRole: user?.role || 'user',
      currentPage: currentPath,
    };

    // 从URL参数中提取相关ID
    const customerId = searchParams.get('customerId');
    const employeeId = searchParams.get('employeeId');
    const payrollId = searchParams.get('payrollId');

    if (customerId) {
      context.selectedCustomerId = customerId;
    }
    
    if (employeeId) {
      context.selectedEmployeeId = employeeId;
    }
    
    if (payrollId) {
      context.selectedPayrollId = payrollId;
    }

    // 根据页面类型获取相关数据
    if (currentPath.includes('/payroll')) {
      context.payrollBatches = await getPayrollContextData();
    }
    
    if (currentPath.includes('/leave')) {
      context.leaveRecords = await getLeaveContextData();
    }

    return context;
  };

  // 获取薪酬上下文数据
  const getPayrollContextData = async (): Promise<any[]> => {
    // 简化实现，返回空数组
    return [];
  };

  // 获取休假上下文数据
  const getLeaveContextData = async (): Promise<any[]> => {
    // 简化实现，返回空数组
    return [];
  };

  // 启动轮询
  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    // 智能轮询：根据用户活动调整频率
    let pollInterval = 30000; // 30秒默认
    
    if (document.hidden) {
      pollInterval = 120000; // 后台时2分钟
    } else if (state.userConfig?.enabledFeatures?.includes('real_time')) {
      pollInterval = 10000; // 实时模式10秒
    }

    pollingRef.current = setInterval(() => {
      // 轮询逻辑由React Query的refetchInterval处理
      // 这里可以添加额外的智能逻辑
      if (!document.hidden) {
        // 用户活跃时保持正常轮询
        getPredictionsQuery.refetch();
        getShortcutsQuery.refetch();
      }
    }, pollInterval);
  };

  // 停止轮询
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // 更新配置
  const updateConfig = useCallback(async (config: Partial<CopilotUserConfig>) => {
    if (!user) return;

    try {
      await updateUserConfigMutation.mutateAsync(config);
    } catch (error) {
      console.error('Failed to update config:', error);
      throw error;
    }
  }, [user, updateUserConfigMutation]);

  // 清理
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // 监听页面变化更新上下文
  useEffect(() => {
    const handleRouteChange = async () => {
      if (state.isInitialized) {
        const newContext = await detectCurrentContext();
        setState(prev => ({ ...prev, context: newContext }));
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [state.isInitialized]);

  // 监听用户活动
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (state.isInitialized) {
        startPolling(); // 重新计算轮询间隔
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isInitialized]);

  return {
    ...state,
    initialize,
    updateConfig,
    refetch: {
      predictions: getPredictionsQuery.refetch,
      shortcuts: getShortcutsQuery.refetch,
      config: getUserConfigQuery.refetch,
    },
  };
}

// 聊天相关的Hook
export function useCopilotChat() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 发送消息
  const sendMessageMutation = trpc.copilot.sendMessage.useMutation({
    onError: (error) => {
      console.error('Failed to send message:', error);
      setError(error.message);
    },
  });

  // 获取对话历史
  const getConversationHistoryQuery = trpc.copilot.getConversationHistory.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60 * 1000, // 1分钟缓存
  });

  // 发送消息
  const sendMessage = useCallback(async (params: {
    message: string;
    attachments?: Array<{
      type: 'image' | 'file';
      url: string;
      name: string;
      mimeType?: string;
    }>;
    context?: OperationalContext;
  }) => {
    if (!user) {
      throw new Error('用户未登录');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessageMutation.mutateAsync(params);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发送消息失败';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, sendMessageMutation]);

  // 清空对话历史
  const clearHistory = useCallback(async () => {
    if (!user) return;

    try {
      await trpc.copilot.clearConversationHistory.mutate();
      getConversationHistoryQuery.refetch();
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw error;
    }
  }, [user, getConversationHistoryQuery]);

  return {
    messages: getConversationHistoryQuery.data || [],
    isLoading,
    error,
    sendMessage,
    clearHistory,
    refetch: getConversationHistoryQuery.refetch,
  };
}

// 快捷键相关的Hook
export function useCopilotHotkeys() {
  const { user } = useAuth();
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  // 监听键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setPressedKeys(prev => new Set([...prev, key]));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setPressedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 检查快捷键是否被按下
  const isHotkeyPressed = useCallback((hotkey: string): boolean => {
    const parts = hotkey.toLowerCase().split('+');
    return parts.every(part => pressedKeys.has(part));
  }, [pressedKeys]);

  return {
    pressedKeys,
    isHotkeyPressed,
  };
}