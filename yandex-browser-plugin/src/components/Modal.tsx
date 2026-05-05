import React from 'react';
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

const Modal = React.memo(function Modal({ onClose }: Props) {
  const mskTime = useClock();
  const isFullscreen = useInjectorStore((s) => s.isFullscreen);
  const toggleFullscreen = useInjectorStore((s) => s.toggleFullscreen);
  const authKey = useInjectorStore((s) => s.authKey);
  const isAuthenticated = authKey !== '';

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
            <div className="injector-main-grid">
              <div className="injector-left-panel">
                <ConfigForm />
                <Scheduler />
              </div>
              <div className="injector-log-sidebar">
                <LiveLog />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default Modal;
