import React, { useState } from 'react';
import { KycProvider } from '../contexts/KycContext';
import MobileRoute from '../pages/MobileRoute';
import QRCodePage from '../pages/QRCodePage';

export interface KycFlowProps {
  apiBaseUrl: string;
  sessionId: string;
  serverKey: string;
  deviceType?: string;
  startAtQr?: boolean;
  onClose?: () => void;
  mobileBaseUrl?: string;
}

type KycFlowView = 'qr' | 'mobileroute';

export const KycFlow: React.FC<KycFlowProps> = ({
  apiBaseUrl,
  sessionId,
  serverKey,
  deviceType,
  startAtQr = true,
  onClose,
  mobileBaseUrl = 'https://astra-sdk-rebuild.vercel.app',
}) => {
  const [currentView, setCurrentView] = useState<KycFlowView>(startAtQr ? 'qr' : 'mobileroute');

  const handleNavigate = (view: KycFlowView) => {
    setCurrentView(view);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <KycProvider
      apiBaseUrl={apiBaseUrl}
      sessionId={sessionId}
      serverKey={serverKey}
      deviceType={deviceType}
    >
      {currentView === 'qr' ? (
        <QRCodePage 
          onClose={handleClose} 
          onNavigate={handleNavigate}
          mobileBaseUrl={mobileBaseUrl}
          sessionId={sessionId}
          apiBaseUrl={apiBaseUrl}
          serverKey={serverKey}
        />
      ) : (
        <MobileRoute onClose={handleClose} onNavigate={handleNavigate} />
      )}
    </KycProvider>
  );
};

