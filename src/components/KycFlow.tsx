import React from 'react';
import { KycProvider } from '../contexts/KycContext';
import MobileRoute from '../pages/MobileRoute';
import QRCodePage from '../pages/QRCodePage';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';

export interface KycFlowProps {
  apiBaseUrl: string;
  sessionId: string;
  serverKey: string;
  deviceType?: string;
  startAtQr?: boolean;
  onClose?: () => void;
}

export const KycFlow: React.FC<KycFlowProps> = ({
  apiBaseUrl,
  sessionId,
  serverKey,
  deviceType,
  startAtQr = true,
  onClose,
}) => {
  return (
    <KycProvider
      apiBaseUrl={apiBaseUrl}
      sessionId={sessionId}
      serverKey={serverKey}
      deviceType={deviceType}
    >
      <MemoryRouter initialEntries={[startAtQr ? '/qr' : '/mobileroute']}>
        <Routes>
          <Route path="/" element={<Navigate to={startAtQr ? "/qr" : "/mobileroute"} replace />} />
          <Route path="/qr" element={<QRCodePage onClose={onClose} />} />
          <Route path="/mobileroute" element={<MobileRoute onClose={onClose} />} />
        </Routes>
      </MemoryRouter>
    </KycProvider>
  );
};

