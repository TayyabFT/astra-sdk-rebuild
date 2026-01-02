import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import '../index.css';

interface QRCodePageProps {
  onClose?: () => void;
  onNavigate?: (view: 'qr' | 'mobileroute') => void;
  mobileBaseUrl?: string;
  sessionId?: string;
  apiBaseUrl?: string;
  serverKey?: string;
}

function QRCodePage({ onClose, onNavigate, mobileBaseUrl = 'https://astra-sdk-rebuild.vercel.app', sessionId, apiBaseUrl, serverKey }: QRCodePageProps = {}) {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    // Get search params from current URL
    const searchParams = new URLSearchParams(window.location.search);
    
    // Add required params to query string for mobile route
    if (sessionId) {
      searchParams.set('sessionId', sessionId);
    }
    if (apiBaseUrl) {
      searchParams.set('apiBaseUrl', apiBaseUrl);
    }
    if (serverKey) {
      searchParams.set('serverKey', serverKey);
    }
    
    const mobileRoute = '/mobileroute';
    const queryString = searchParams.toString();
    const fullUrl = `${mobileBaseUrl}${mobileRoute}${queryString ? `?${queryString}` : ''}`;
    
    setQrUrl(fullUrl);
  }, [mobileBaseUrl, sessionId, apiBaseUrl, serverKey]);

  const handleCopyUrl = async () => {
    if (qrUrl) {
      try {
        await navigator.clipboard.writeText(qrUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black p-4 sm:p-6 md:p-8 z-[1000]">
      {/* Background pattern overlay */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }}></div>
      
      <div className="relative bg-[rgba(20,20,20,0.95)] backdrop-blur-sm rounded-2xl p-5 sm:p-6 md:p-7 max-w-[450px] w-full h-[80vh] flex flex-col text-center shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10">
        <button 
          className="absolute top-5 right-5 bg-transparent border-none text-white cursor-pointer p-2 flex items-center justify-center rounded transition-colors hover:bg-white/10 active:bg-white/20" 
          onClick={handleClose} 
          aria-label="Close"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="flex flex-col items-center gap-3 sm:gap-4 flex-1 overflow-y-auto custom__scrollbar">
          <h1 className="m-0 text-white text-xl sm:text-2xl font-semibold leading-tight">Continue on Mobile</h1>
          <p className="m-0 text-white text-sm sm:text-base opacity-90 leading-relaxed">
            Scan this QR on your phone to capture your face and document
          </p>
          
          {qrUrl && (
            <div className="flex justify-center items-center p-3 sm:p-4 bg-black rounded-xl border-2 border-white shadow-lg">
              <QRCodeSVG
                value={qrUrl}
                size={180}
                level="H"
                includeMargin={true}
                bgColor="#000000"
                fgColor="#FFFFFF"
              />
            </div>
          )}

          <div className="w-full text-left mt-auto">
            <p className="m-0 mb-2 text-white text-xs sm:text-sm opacity-80">Or open:</p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 sm:p-3 bg-white/10 rounded-lg border border-white/20">
              <code className="flex-1 text-white text-xs sm:text-sm break-all text-left m-0 font-mono">{qrUrl}</code>
              <button 
                className="bg-transparent border-none text-white cursor-pointer p-1.5 flex items-center justify-center rounded transition-colors flex-shrink-0 hover:bg-white/10 active:bg-white/20 self-end sm:self-auto" 
                onClick={handleCopyUrl}
                aria-label="Copy URL"
                title={copied ? 'Copied!' : 'Copy URL'}
              >
                {copied ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button 
            className="w-full py-3 sm:py-4 px-6 bg-gradient-to-r from-[#FF842D] to-[#FF2D55] border-none rounded-lg text-white text-sm sm:text-base font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(255,107,53,0.4)] active:translate-y-0" 
            onClick={handleRefresh}
          >
            I've completed on mobile - Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

export default QRCodePage;

