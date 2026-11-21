import { useState } from 'react';
import { AuthPortal } from './components/AuthPortal';
import { RecoveryModal } from './components/RecoveryModal';
import { WalletDashboard } from './components/WalletDashboard';
import type { AuthResponse } from './lib/api';
import type { WalletDashboardData } from './types/wallet';

export default function App() {
  // Hold bearer token strictly in React memory (never persisted to localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<WalletDashboardData | null>(null);
  const [pendingRecoveryPhrase, setPendingRecoveryPhrase] = useState<string | null>(null);

  const handleAuthenticated = (res: AuthResponse) => {
    setToken(res.token);
    setDashboard(res.dashboard);
    if (res.recoveryPhrase) {
      setPendingRecoveryPhrase(res.recoveryPhrase);
    }
  };

  const handleLockWallet = () => {
    setToken(null);
    setDashboard(null);
    setPendingRecoveryPhrase(null);
  };

  if (!token || !dashboard) {
    return <AuthPortal onAuthenticated={handleAuthenticated} />;
  }

  return (
    <>
      <WalletDashboard
        token={token}
        data={dashboard}
        onDataChange={setDashboard}
        onLockWallet={handleLockWallet}
      />

      {pendingRecoveryPhrase && (
        <RecoveryModal
          recoveryPhrase={pendingRecoveryPhrase}
          walletAddress={dashboard.wallet.address}
          handle={dashboard.wallet.handle}
          onConfirmSaved={() => setPendingRecoveryPhrase(null)}
        />
      )}
    </>
  );
}
