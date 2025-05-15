// client/src/components/BalanceInfo.tsx - новый компонент для отображения баланса
import React from 'react';
import { DollarSign, Wallet, ArrowUpCircle, ArrowDownCircle, TrendingUp, Percent } from 'lucide-react';
import { BalanceInfo as BalanceInfoType } from '../types';

interface BalanceInfoProps {
  balanceInfo: BalanceInfoType;
  compact?: boolean; // Флаг для компактного отображения (для шапки)
}

export const BalanceInfo: React.FC<BalanceInfoProps> = ({ balanceInfo, compact = false }) => {
  const { usdtBalance, walletBalance, available, unrealizedPnl, roi } = balanceInfo;

  // Компактная версия для шапки
  if (compact) {
    return (
      <div className="flex flex-col text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs">USDT:</span>
          <span className="font-medium">{usdtBalance.toFixed(4)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs">PnL:</span>
          <span className={`font-medium ${unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-xs">ROI:</span>
          <span className={`font-medium ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
          </span>
        </div>
      </div>
    );
  }

  // Полная версия для сайдбара
  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
      <h3 className="text-sm text-gray-400 mb-3">Информация о балансе</h3>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DollarSign className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-xs">USDT Balance</span>
          </div>
          <span className="font-medium">{usdtBalance.toFixed(4)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Wallet className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-xs">Wallet Balance</span>
          </div>
          <span className="font-medium">{walletBalance.toFixed(4)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ArrowUpCircle className="w-4 h-4 text-green-400 mr-2" />
            <span className="text-xs">Available</span>
          </div>
          <span className="font-medium">{available.toFixed(4)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <TrendingUp className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-xs">Unrealized PnL</span>
          </div>
          <span className={`font-medium ${unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(4)}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Percent className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-xs">ROI</span>
          </div>
          <span className={`font-medium ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};