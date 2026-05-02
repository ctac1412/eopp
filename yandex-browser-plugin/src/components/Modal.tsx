import React, { useCallback } from 'react';
import ConfigForm from './ConfigForm';
import Scheduler from './Scheduler';
import StatusBar from './StatusBar';
import ProgressSteps from './ProgressSteps';
import LiveLog from './LiveLog';
import AuthGate from './AuthGate';
import { useClock } from '@/hooks/useClock';
import { useInjectorStore } from '@/store';

interface Props {
  onClose: () => void;
}

const maskKey = (key: string) => {
  if (key.length <= 2) return '••••';
  return key[0] + '•'.repeat(key.length - 2) + key[key.length - 1];
};

const Modal = React.memo(function Modal({ onClose }: Props) {
  const mskTime = useClock();
  const isFullscreen = useInjectorStore((s) => s.isFullscreen);
  const toggleFullscreen = useInjectorStore((s) => s.toggleFullscreen);
  const authKey = useInjectorStore((s) => s.authKey);
  const clearAuthKey = useInjectorStore((s) => s.clearAuthKey);
  const updateField = useInjectorStore((s) => s.updateField);
  const isAuthenticated = authKey !== '';

  const handleLogout = useCallback(() => {
    clearAuthKey();
    updateField('apiKey', '');
  }, [clearAuthKey, updateField]);

  return (
    <div className="injector-modal-overlay" onClick={onClose}>
      <div
        className={[
          'injector-modal',
          isFullscreen ? 'injector-modal-fullscreen' : 'injector-modal-wide',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="injector-modal-header">
          <span className="injector-modal-title">
            Настройки{' '}
            <a
              className="injector-server-link"
              href="https://china.alabai.netcraze.pro"
              target="_blank"
              rel="noopener"
            >
              Капчи ↗
            </a>
          </span>
          <div className="injector-header-center">
            <StatusBar />
          </div>
          <div className="injector-header-right">
            {isAuthenticated && (
              <>
                <span className="injector-modal-auth-key">Ключ: {maskKey(authKey)}</span>
                <button className="injector-modal-logout-btn" onClick={handleLogout}>Выйти</button>
              </>
            )}
            <span className="injector-modal-clock">МСК: {mskTime}</span>
            <button className="injector-modal-fullscreen-btn" onClick={toggleFullscreen} title="Полноэкранный режим">
              {isFullscreen ? '⛶' : '⛶'}
            </button>
            <button className="injector-modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <ProgressSteps />
        <div className="injector-modal-body">
          {!isAuthenticated && <AuthGate onClose={onClose} />}
          {isAuthenticated && (
            <>
              <ConfigForm />
              <LiveLog />
              <Scheduler />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default Modal;
