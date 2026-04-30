import React from 'react';
import ConfigForm from './ConfigForm';
import Scheduler from './Scheduler';
import StatusBar from './StatusBar';
import ProgressSteps from './ProgressSteps';
import LiveLog from './LiveLog';
import { useClock } from '@/hooks/useClock';

interface Props {
  onClose: () => void;
}

const Modal = React.memo(function Modal({ onClose }: Props) {
  const mskTime = useClock();

  return (
    <div className="injector-modal-overlay" onClick={onClose}>
      <div className="injector-modal injector-modal-wide" onClick={(e) => e.stopPropagation()}>
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
            <button className="injector-modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <ProgressSteps />
        <div className="injector-modal-body">
          <ConfigForm />
          <LiveLog />
          <Scheduler />
        </div>
      </div>
    </div>
  );
});

export default Modal;
