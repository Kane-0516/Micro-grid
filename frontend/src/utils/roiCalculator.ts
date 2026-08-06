import type { ConfigData } from '@/types/index';

export interface ROIYearData {
  year: number;
  cumulativeCost: number;
  cumulativeSavings: number;
  netValue: number;
  roi: number; // 投资回报率
}

export interface ROICalculationResult {
  totalCost: number;
  annualSavings: number;
  roiYears: number;
  yearData: ROIYearData[];
}

/**
 * 计算投资回报年限和年度数据
 * 这是一个简化的计算模型，实际应用中需要更复杂的财务计算
 */
export function calculateROI(config: ConfigData): ROICalculationResult {
  let totalCost = 0;
  let annualSavings = 0;
  
  // 基础成本计算
  const bracketCostPerSet = 50000; // 每套折叠支架成本（示例）
  const inverterCost = 30000; // 每台逆变器成本（示例）
  const batteryCostPerDay = 100000; // 每支撑一天的储能成本（示例）
  const emsCost: Record<string, number> = {
    edge: 50000,
    cloud: 80000,
    prediction: 120000,
  };
  
  // 计算折叠支架成本
  totalCost += config.bracketSets * bracketCostPerSet;
  
  // 计算逆变器成本（DIY场景）
  if (config.scenario === 'diy' && config.inverterCount) {
    totalCost += config.inverterCount * inverterCost;
  } else {
    // 默认逆变器数量等于折叠支架数量
    totalCost += config.bracketSets * inverterCost;
  }
  
  // 计算储能成本
  totalCost += (config.storageDays ?? 1) * batteryCostPerDay;
  
  // 计算EMS成本
  totalCost += emsCost[config.emsControlMethod] ?? 50000;
  
  // 如果有发电机，增加集成成本
  if (config.hasGenerator) {
    totalCost += 30000; // 发电机集成成本
  }
  
  // 计算年度节省（简化模型）
  // 假设每年节省电费 = 系统容量的某个百分比
  const systemCapacity = config.bracketSets * 32 * 0.4; // 假设每块组件0.4kW
  annualSavings = systemCapacity * 1000 * 0.8; // 假设每kW每年节省800元
  
  // 如果有发电机，增加维护成本节省
  if (config.hasGenerator) {
    annualSavings += 20000; // 减少发电机使用，节省维护成本
  }
  
  // 根据EMS类型调整节省
  if (config.emsControlMethod === 'prediction') {
    annualSavings *= 1.15; // 预测控制可额外节省15%
  } else if (config.emsControlMethod === 'cloud') {
    annualSavings *= 1.08; // 云端控制可额外节省8%
  }
  
  // 计算投资回报年限
  let roiYears = 0;
  if (annualSavings > 0) {
    roiYears = totalCost / annualSavings;
    roiYears = Math.round(roiYears * 10) / 10; // 保留一位小数
  }
  
  // 生成年度数据（最多20年）
  const yearData: ROIYearData[] = [];
  const maxYears = Math.max(20, Math.ceil(roiYears || 10) + 5);
  
  for (let year = 0; year <= maxYears; year++) {
    const cumulativeSavings = year * annualSavings;
    const netValue = cumulativeSavings - totalCost;
    const roi = totalCost > 0 ? ((cumulativeSavings - totalCost) / totalCost) * 100 : 0;
    
    yearData.push({
      year,
      cumulativeCost: totalCost,
      cumulativeSavings,
      netValue,
      roi: Math.round(roi * 10) / 10,
    });
  }
  
  // 确保至少有一些数据
  if (yearData.length === 0) {
    yearData.push({
      year: 0,
      cumulativeCost: totalCost,
      cumulativeSavings: 0,
      netValue: -totalCost,
      roi: -100,
    });
  }
  
  return {
    totalCost,
    annualSavings,
    roiYears,
    yearData,
  };
}
