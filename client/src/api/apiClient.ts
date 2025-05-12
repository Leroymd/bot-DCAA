// api/apiClient.ts
import axios from 'axios';
import { 
  BotStatus, 
  TradingPair, 
  TopPair, 
  Signal, 
  PnlData, 
  BotSettings, 
  Trade,
  OrderFormData
} from '../types';

// Создаем экземпляр axios с базовыми настройками
const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Определение типов ответов API
interface ApiResponse {
  success: boolean;
  message?: string;
}

interface DataResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ScanResponse extends ApiResponse {
  pairs?: TopPair[];
}

// Функции для работы с API
export const api = {
  // Функции для работы с ботом
  bot: {
    getStatus: async (): Promise<BotStatus> => {
      const response = await apiClient.get<DataResponse<BotStatus>>('/bot/status');
      return response.data.data;
    },
    start: async (): Promise<ApiResponse> => {
      const response = await apiClient.post<ApiResponse>('/bot/start');
      return response.data;
    },
    stop: async (): Promise<ApiResponse> => {
      const response = await apiClient.post<ApiResponse>('/bot/stop');
      return response.data;
    }
  },
  
  // Функции для работы с парами
  pairs: {
    getActive: async (): Promise<TradingPair[]> => {
      const response = await apiClient.get<TradingPair[]>('/pairs/active');
      return response.data;
    },
    getTop: async (): Promise<TopPair[]> => {
      const response = await apiClient.get<TopPair[]>('/pairs/top');
      return response.data;
    },
    scan: async (): Promise<ScanResponse> => {
      const response = await apiClient.post<ScanResponse>('/pairs/scan');
      return response.data;
    },
    select: async (pair: string): Promise<ApiResponse> => {
      const response = await apiClient.post<ApiResponse>('/pairs/select', { pair });
      return response.data;
    }
  },
  
  // Функции для работы с сигналами
  signals: {
    getRecent: async (): Promise<Signal[]> => {
      const response = await apiClient.get<Signal[]>('/signals/recent');
      return response.data;
    },
    getIndicators: async (): Promise<{ [key: string]: any }> => {
      const response = await apiClient.get<DataResponse<{ [key: string]: any }>>('/signals/indicators');
      return response.data.data;
    }
  },
  
  // Функции для работы со статистикой
  performance: {
    getPnlData: async (days: number = 7): Promise<PnlData[]> => {
      const response = await apiClient.get<PnlData[]>(`/performance/pnl?days=${days}`);
      return response.data;
    },
    getTradeHistory: async (limit: number = 20): Promise<Trade[]> => {
      const response = await apiClient.get<Trade[]>(`/performance/trades?limit=${limit}`);
      return response.data;
    },
    getPerformance: async (): Promise<any> => {
      const response = await apiClient.get<DataResponse<any>>('/performance/data');
      return response.data.data;
    }
  },
  
  // Функции для работы с настройками
  settings: {
    get: async (): Promise<BotSettings> => {
      const response = await apiClient.get<DataResponse<BotSettings>>('/settings');
      return response.data.data;
    },
    update: async (settings: BotSettings): Promise<ApiResponse> => {
      const response = await apiClient.post<ApiResponse>('/settings', settings);
      return response.data;
    }
  },
  
  // Функции для работы с позициями
  position: {
    open: async (data: OrderFormData): Promise<ApiResponse> => {
      const response = await apiClient.post<ApiResponse>('/position/open', data);
      return response.data;
    },
    close: async (positionId: string): Promise<ApiResponse> => {
      const response = await apiClient.post<ApiResponse>('/position/close', { positionId });
      return response.data;
    }
  }
};