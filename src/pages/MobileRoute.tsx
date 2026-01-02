import { useEffect, useState } from 'react';
import { isMobileDevice } from '../utils/deviceDetection';
import FaceScanModal from './FaceScanModal';
import { KycProvider } from '../contexts/KycContext';
import '../index.css';

interface MobileRouteProps {
  onClose?: () => void;
  onNavigate?: (view: 'qr' | 'mobileroute') => void;
}

// Inner component that uses the context
function MobileRouteContent({ onClose, onComplete }: { onClose?: () => void; onComplete?: (image: string) => void }) {
  return <FaceScanModal onClose={onClose} onComplete={onComplete} />;
}

function MobileRoute({ onClose, onNavigate }: MobileRouteProps = {}) {
  const [config, setConfig] = useState<{
    apiBaseUrl: string;
    sessionId: string;
    serverKey: string;
  } | null>(null);

  useEffect(() => {
    if (!isMobileDevice() && onNavigate) {
      onNavigate('qr');
      return;
    }

    // If accessed standalone (via URL), get config from URL params
    const searchParams = new URLSearchParams(window.location.search);
    const sessionId = searchParams.get('sessionId');
    const apiBaseUrl = searchParams.get('apiBaseUrl') || searchParams.get('apiUrl') || '';
    const serverKey = searchParams.get('serverKey') || '';

    if (sessionId && apiBaseUrl && serverKey) {
      setConfig({
        apiBaseUrl,
        sessionId,
        serverKey,
      });
    } else if (sessionId) {
      // Try to get from localStorage or use defaults
      // For now, we'll need these to be passed via URL
      console.error('Missing required parameters: apiBaseUrl and serverKey must be in URL');
    }
  }, [onNavigate]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleComplete = (capturedImage: string) => {
    // Handle completion - send captured image to backend or parent
    console.log('Face capture completed with image:', capturedImage.substring(0, 50) + '...');
    // You can emit an event, call a callback, or navigate here
  };

  if (!isMobileDevice()) {
    return null;
  }

  // If we have config from URL (standalone mode), wrap in provider
  if (config) {
    return (
      <KycProvider
        apiBaseUrl={config.apiBaseUrl}
        sessionId={config.sessionId}
        serverKey={config.serverKey}
        deviceType="mobile"
      >
        <MobileRouteContent onClose={handleClose} onComplete={handleComplete} />
      </KycProvider>
    );
  }

  // If used within SDK (has onNavigate), it should already be wrapped in provider
  // But we'll still wrap it to be safe
  if (onNavigate) {
    // This means it's being used within the SDK component
    // The provider should already be there, but we'll render the content directly
    return <MobileRouteContent onClose={handleClose} onComplete={handleComplete} />;
  }

  // Fallback: show error if no config
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[1000]">
      <div className="bg-white p-6 rounded-lg text-center max-w-md mx-4">
        <p className="text-red-600 mb-2">Missing Configuration</p>
        <p className="text-sm text-gray-600">
          Please ensure the URL includes sessionId, apiBaseUrl, and serverKey parameters.
        </p>
      </div>
    </div>
  );
}

export default MobileRoute;
