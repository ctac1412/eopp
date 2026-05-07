import React from "react";
import ConfigForm from "./ConfigForm";
import Scheduler from "./Scheduler";
import StatusBar from "./StatusBar";
import ProgressSteps from "./ProgressSteps";
import LiveLog from "./LiveLog";
import AuthGate from "./AuthGate";
import AuthHeader from "./AuthHeader";
import { useClock } from "@/hooks/useClock";
import { useInjectorStore } from "@/store";

interface Props {
  onClose: () => void;
}

const Modal = React.memo(function Modal({ onClose }: Props) {
  const mskTime = useClock();
  const isFullscreen = useInjectorStore((s) => s.isFullscreen);
  const toggleFullscreen = useInjectorStore((s) => s.toggleFullscreen);
  const authKey = useInjectorStore((s) => s.authKey);
  const authKeyStatus = useInjectorStore((s) => s.authKeyStatus);
  const authChecking = useInjectorStore((s) => s.authChecking);
  const authError = useInjectorStore((s) => s.authError);
  const clearAuthKey = useInjectorStore((s) => s.clearAuthKey);
  const updateField = useInjectorStore((s) => s.updateField);
  const isReady = authKey !== "" && authKeyStatus !== null && !authChecking;

  const handleLogout = () => {
    clearAuthKey();
    updateField("apiKey", "");
    localStorage.removeItem("_k");
  };

  return (
    <div className="qn-modal-overlay" onClick={onClose}>
      <div
        className={[
          "qn-modal",
          isFullscreen ? "qn-modal-fullscreen" : "qn-modal-wide",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qn-modal-header">
          <span className="qn-modal-title">Помощник</span>
          <div className="qn-header-center">
            {isReady && <AuthHeader onLogout={handleLogout} />}
            <StatusBar />
          </div>
          <div className="qn-header-right">
            <span className="qn-modal-clock">МСК: {mskTime}</span>
            <button
              className="qn-modal-fullscreen-btn"
              onClick={toggleFullscreen}
              title="Полноэкранный режим"
            >
              {isFullscreen ? "⛶" : "⛶"}
            </button>
            <button className="qn-modal-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>
        <ProgressSteps />
        <div className="qn-modal-body">
          {!isReady && <AuthGate onClose={onClose} />}
          {isReady && (
            <div className="qn-main-grid">
              <div className="qn-left-panel">
                <ConfigForm />
                <Scheduler />
              </div>
              <div className="qn-log-sidebar">
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
