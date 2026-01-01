import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isMobileDevice } from '../utils/deviceDetection';
import FaceScanModal from './FaceScanModal';
import '../index.css';

function MobileRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMobileDevice()) {
      navigate('/qr', { replace: true });
      return;
    }
  }, [navigate]);

  const handleClose = () => {
    navigate(-1);
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
