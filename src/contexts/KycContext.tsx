import React, { createContext, useContext, ReactNode } from 'react';
import { KycApiService, type KycApiConfig } from '../services/kycApiService';

interface KycContextValue {
  apiService: KycApiService | null;
  setApiConfig: (config: KycApiConfig) => void;
}

const KycContext = createContext<KycContextValue>({
  apiService: null,
  setApiConfig: () => {},
});

export const useKycContext = () => {
  const context = useContext(KycContext);
  if (!context) {
    throw new Error('useKycContext must be used within KycProvider');
  }
  return context;
};

interface KycProviderProps {
  children: ReactNode;
  apiBaseUrl: string;
  sessionId: string;
  serverKey: string;
  deviceType?: string;
}

export const KycProvider: React.FC<KycProviderProps> = ({
  children,
  apiBaseUrl,
  sessionId,
  serverKey,
  deviceType,
}) => {
  const [apiService, setApiService] = React.useState<KycApiService | null>(null);

  React.useEffect(() => {
    if (apiBaseUrl && sessionId && serverKey) {
      const service = new KycApiService({
        apiBaseUrl,
        sessionId,
        serverKey,
        deviceType,
      });
      setApiService(service);
    }
  }, [apiBaseUrl, sessionId, serverKey, deviceType]);

  const setApiConfig = React.useCallback((config: KycApiConfig) => {
    if (apiService) {
      apiService.updateConfig(config);
    } else {
      const service = new KycApiService(config);
      setApiService(service);
    }
  }, [apiService]);

  return (
    <KycContext.Provider value={{ apiService, setApiConfig }}>
      {children}
    </KycContext.Provider>
  );
};

