import { hasAnyRole } from "../../shared/roles";

// 简化的预测生成器
export class PredictionGenerator {
  static async generateOperationalPredictions(data: any): Promise<any[]> {
    const predictions: any[] = [];

    // 薪酬截止风险预测
    const payrollPrediction = this.analyzePayrollDeadline(data.payroll);
    if (payrollPrediction) {
      predictions.push(payrollPrediction);
    }

    // 休假异常预测
    const leavePredictions = this.analyzeLeaveAnomalies(data.leave);
    predictions.push(...leavePredictions);

    // 财务异常预测
    const financialPredictions = this.analyzeFinancialAnomalies(data.financial);
    predictions.push(...financialPredictions);

    // 员工状态预测
    const employeePredictions = this.analyzeEmployeeStatus(data.employees);
    predictions.push(...employeePredictions);

    return predictions;
  }

  private static analyzePayrollDeadline(payrollData: any): any | null {
    if (!payrollData?.stats) return null;

    const { draftCount, pendingCount } = payrollData.stats;
    const currentDay = new Date().getDate();
    const daysUntilDeadline = Math.max(0, 5 - currentDay);

    if (daysUntilDeadline <= 2 && (draftCount > 0 || pendingCount > 3)) {
      return {
        id: `payroll_deadline_${Date.now()}`,
        type: 'deadline_risk',
        title: '薪酬批次截止风险',
        description: `${draftCount}个薪酬批次仍在草稿状态，${pendingCount}个批次等待审批，距离截止仅剩${daysUntilDeadline}天`,
        confidence: 85,
        severity: daysUntilDeadline === 0 ? 'critical' : 'high',
        expiresAt: new Date(new Date().setDate(5)),
        suggestedAction: {
          label: '查看薪酬批次',
          action: 'navigate_payroll',
        },
      };
    }

    return null;
  }

  private static analyzeLeaveAnomalies(leaveData: any): any[] {
    const predictions: any[] = [];
    
    if (!leaveData?.stats) return predictions;

    const { pendingCount } = leaveData.stats;

    if (pendingCount > 5) {
      predictions.push({
        id: `leave_pending_${Date.now()}`,
        type: 'anomaly',
        title: '休假审批积压',
        description: `${pendingCount}条休假申请等待审批，可能存在审批延迟`,
        confidence: 75,
        severity: 'medium',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        suggestedAction: {
          label: '查看休假申请',
          action: 'navigate_leave',
        },
      });
    }

    return predictions;
  }

  private static analyzeFinancialAnomalies(financialData: any): any[] {
    const predictions: any[] = [];
    
    if (!financialData?.invoices) return predictions;

    const overdueInvoices = financialData.invoices.filter((inv: any) => 
      inv.status === 'overdue'
    );

    if (overdueInvoices.length > 3) {
      predictions.push({
        id: `overdue_invoices_${Date.now()}`,
        type: 'anomaly',
        title: '逾期发票过多',
        description: `${overdueInvoices.length}张发票已逾期，需要跟进催收`,
        confidence: 90,
        severity: 'high',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        suggestedAction: {
          label: '查看逾期发票',
          action: 'navigate_invoices',
          params: { filter: 'overdue' },
        },
      });
    }

    return predictions;
  }

  private static analyzeEmployeeStatus(employeeData: any): any[] {
    const predictions: any[] = [];
    
    if (!employeeData?.stats) return predictions;

    const { probationCount } = employeeData.stats;

    if (probationCount > 10) {
      predictions.push({
        id: `probation_employees_${Date.now()}`,
        type: 'insight',
        title: '试用期员工较多',
        description: `${probationCount}名员工处于试用期，需要关注转正评估`,
        confidence: 80,
        severity: 'low',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        suggestedAction: {
          label: '查看试用期员工',
          action: 'navigate_employees',
          params: { filter: 'probation' },
        },
      });
    }

    return predictions;
  }
}

// 简化的快捷操作生成器
export class QuickActionGenerator {
  static generateRoleBasedShortcuts(role: string): any[] {
    const baseActions = this.getBaseActions();
    const roleActions = this.getRoleSpecificActions(role);
    
    return [...baseActions, ...roleActions];
  }

  private static getBaseActions(): any[] {
    return [
      {
        id: 'quick_search',
        title: '快速搜索',
        description: '搜索员工、客户、文档等',
        icon: 'zap',
        action: 'open_search',
        hotkey: 'ctrl+shift+f',
        badge: 'hot',
      },
      {
        id: 'recent_activity',
        title: '最近活动',
        description: '查看最近的操作记录',
        icon: 'trending-up',
        action: 'show_recent_activity',
        hotkey: 'ctrl+shift+r',
      },
      {
        id: 'export_data',
        title: '导出数据',
        description: '导出当前页面数据',
        icon: 'file-text',
        action: 'export_current_data',
        hotkey: 'ctrl+shift+e',
      },
    ];
  }

  private static getRoleSpecificActions(role: string): any[] {
    const actions: any[] = [];

    if (hasAnyRole(role, ['admin', 'operations_manager'])) {
      actions.push(
        {
          id: 'payroll_overview',
          title: '薪酬概览',
          description: '查看本月薪酬状态',
          icon: 'dollar-sign',
          action: 'navigate_payroll',
          badge: 'new',
        },
        {
          id: 'leave_summary',
          title: '休假汇总',
          description: '查看休假统计',
          icon: 'calendar',
          action: 'navigate_leave',
        },
        {
          id: 'employee_status',
          title: '员工状态',
          description: '查看员工状态分布',
          icon: 'users',
          action: 'show_employee_status',
        }
      );
    }

    if (hasAnyRole(role, ['admin', 'finance_manager'])) {
      actions.push(
        {
          id: 'financial_dashboard',
          title: '财务仪表板',
          description: '查看财务概览',
          icon: 'bar-chart-3',
          action: 'navigate_finance',
        },
        {
          id: 'invoice_status',
          title: '发票状态',
          description: '查看发票统计',
          icon: 'file-text',
          action: 'show_invoice_status',
        }
      );
    }

    if (hasAnyRole(role, ['admin', 'customer_manager'])) {
      actions.push(
        {
          id: 'customer_overview',
          title: '客户概览',
          description: '查看客户统计',
          icon: 'users',
          action: 'navigate_customers',
        },
        {
          id: 'contract_status',
          title: '合同状态',
          description: '查看合同概览',
          icon: 'file-text',
          action: 'show_contract_status',
        }
      );
    }

    return actions;
  }
}