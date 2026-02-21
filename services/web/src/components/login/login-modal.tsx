'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnect, useAccount, useSignMessage, useDisconnect } from 'wagmi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet } from 'lucide-react';
import { walletAuth } from '@/lib/api/auth';
import { useAuth } from '@/contexts/auth-context';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const router = useRouter();
  const { login } = useAuth();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const metaMaskConnector = connectors.find(
    (c) => c.name === 'MetaMask' || c.id === 'metaMask'
  );

  const handleConnect = async () => {
    setError(null);

    if (!metaMaskConnector) {
      setError('MetaMask is not available. Please install MetaMask to continue.');
      return;
    }

    try {
      connect({ connector: metaMaskConnector });
    } catch (err) {
      console.error('Connection error:', err);
      setError('Failed to connect wallet. Please try again.');
    }
  };

  const handleAuthenticate = async () => {
    if (!address) return;

    setError(null);
    setIsAuthenticating(true);

    try {
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with Reffinity.\n\nTimestamp: ${timestamp}\nWallet: ${address}`;

      const signature = await signMessageAsync({ message });
      const response = await walletAuth(address, signature, message);

      if (response.isNewUser) {
        setError('No existing account found for this wallet. Please use "Join the Program" to sign up.');
        return;
      }

      login(response.token, response.user);
      onClose();
      router.push('/referrals');
    } catch (err) {
      console.error('Login error:', err);
      if (err instanceof Error) {
        if (err.message.includes('User rejected')) {
          setError('Signature request was rejected. Please try again.');
        } else {
          setError(err.message || 'Login failed. Please try again.');
        }
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError(null);
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" onClose={handleClose}>
        <DialogHeader>
          <DialogTitle>Welcome Back</DialogTitle>
          <DialogDescription>
            Connect your MetaMask wallet to log back in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-10 w-10 text-primary" />
          </div>

          <p className="mb-6 text-center text-sm text-muted-foreground">
            {isConnected
              ? 'Sign a message to verify your wallet and restore your session.'
              : 'Connect your MetaMask wallet to continue.'}
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4 w-full">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isConnected && address && (
            <div className="mb-4 w-full rounded-lg border border-border bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Connected Wallet</p>
              <p className="font-mono text-sm text-foreground">
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
            </div>
          )}

          <div className="flex w-full flex-col gap-3">
            {!isConnected ? (
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg
                      className="mr-2 h-5 w-5"
                      viewBox="0 0 35 33"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M32.9582 1L19.8241 10.7183L22.2665 4.99099L32.9582 1Z"
                        fill="#E17726"
                      />
                      <path
                        d="M2.66296 1L15.6851 10.809L13.3541 4.99098L2.66296 1Z"
                        fill="#E27625"
                      />
                    </svg>
                    Connect MetaMask
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating}
                  className="w-full"
                >
                  {isAuthenticating ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Signing in...
                    </>
                  ) : (
                    'Sign & Login'
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDisconnect}
                  disabled={isAuthenticating}
                  className="w-full"
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>

          {!metaMaskConnector && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Don&apos;t have MetaMask?{' '}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Install it here
              </a>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
