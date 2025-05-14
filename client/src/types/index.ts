// client/src/types/index.ts - обновленная версия с новыми типами
// client/src/types/index.ts - обновленная версия
export interface BotStatus {
  isActive: boolean;
  balance: number;
  totalProfit: number;
  profitPercentage: number;
  todayProfit: number;
  todayProfitPercentage: number;
  winRate: number;
  totalTrades: number;
  avgProfit: number;
  withdrawn: number;
  lastScan: string | null;
}

export interface TradingPair {
  id: string;
  pair: string;
  status: 'active' | 'waiting';
  position?: 'LONG' | 'SHORT';
  profit?: number;
  time?: string;
  signals?: number;
  entryPrice?: number;
  currentPrice?: number;
}

export interface TopPair {
  pair: string;
  strength: number;
  signals: number;
  volume: string;
}

export interface Signal {
  id: string;
  pair: string;
  type: 'BUY' | 'SELL';
  strength: number;
  time: string;
  status: 'executed' | 'pending';
  reason?: string;
}

export interface PnlData {
  date: string;
  pnl: number;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  closePrice: number;
  entryTime: string;
  closeTime: string;
  pnl: number;
  pnlUSDT: number;
  result: 'win' | 'loss';
}

export interface BotSettings {
  pacLength: number;
  fastEMAlength: number;
  mediumEMAlength: number;
  pullbackLookback: number;
  useHAcandles: boolean;
  positionSize: number;
  leverage: number;
  takeProfitPercentage: number;
  stopLossPercentage: number;
  maxTradeDurationMinutes: number;
  trailingStop?: {
    enabled: boolean;
    activationPercentage: number;
    stopDistance: number;
  }
}

export interface OrderFormData {
  symbol: string;
  type: 'LONG' | 'SHORT';
  size: string;
  leverage: number;
  takeProfitPrice?: string;
  stopLossPrice?: string;
}

export interface TpSlFormData {
  takeProfitPrice: string;
  stopLossPrice: string;
}

export interface TrailingStopFormData {
  callbackRatio: string;
}

export interface PositionDetails {
  positionId: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  pnl: number;
  pnlPercentage: number;
  margin: number;
  markPrice: number;
  liquidationPrice: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  hasTrailingStop: boolean;
  entryTime: string;
  updateTime: string;
  status: 'active' | 'closing' | 'closed';
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
}