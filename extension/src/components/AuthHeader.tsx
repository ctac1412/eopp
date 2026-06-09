import React, { useCallback, useEffect } from "react";
import { useInjectorStore } from "@/store";
import { getApiKeyStatus } from "@/api/background";

interface Props {
  onLogout: () => void;
}

const AuthHeader = React.memo(function AuthHeader({ onLogout }: Props) {
  const authKey = useInjectorStore((s) => s.authKey);
  const authKeyStatus = useInjectorStore((s) => s.authKeyStatus);
  const setAuthKeyStatus = useInjectorStore((s) => s.setAuthKeyStatus);

  useEffect(() => {
    if (authKey && !authKeyStatus) {
      getApiKeyStatus(authKey)
        .then((status) => {
          if (status.valid) {
            setAuthKeyStatus(status);
          }
        })
        .catch(() => {});
    }
  }, [authKey, authKeyStatus, setAuthKeyStatus]);

  const handleLogout = useCallback(() => {
    onLogout();
  }, [onLogout]);

  if (!authKey) return null;

  return (
    <div className="qn-auth-header">
      {authKeyStatus?.label && (
        <span className="qn-auth-header-label">
          {authKeyStatus.label}
        </span>
      )}
      <span className="qn-auth-header-remaining">
        {authKeyStatus?.remaining !== null && authKeyStatus?.remaining !== undefined
          ? authKeyStatus.remaining
          : "∞"}
      </span>
      <button
        className="qn-auth-header-logout"
        onClick={handleLogout}
        title="Выйти"
      >
        &times;
      </button>
    </div>
  );
});

export default AuthHeader;
