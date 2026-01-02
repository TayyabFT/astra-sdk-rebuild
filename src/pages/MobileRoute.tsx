import { useEffect } from 'react';
import { isMobileDevice } from '../utils/deviceDetection';
import FaceScanModal from './FaceScanModal';
import '../index.css';

interface MobileRouteProps {
  onClose?: () => void;
  onNavigate?: (view: 'qr' | 'mobileroute') => void;
}

function MobileRoute({ onClose, onNavigate }: MobileRouteProps = {}) {
  useEffect(() => {
    if (!isMobileDevice() && onNavigate) {
      onNavigate('qr');
      return;
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

  return <FaceScanModal onClose={handleClose} onComplete={handleComplete} />;
}

export default MobileRoute;
