import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import QRCodePage from './pages/QRCodePage';
import MobileRoute from './pages/MobileRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/qr" replace />} />
        <Route path="/qr" element={<QRCodePage />} />
        <Route path="/mobileroute" element={<MobileRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
