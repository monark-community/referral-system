'use client';

import { useState } from 'react';
import { useConnect, useAccount, useSignMessage, useDisconnect, useWriteContract } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet } from 'lucide-react';
import { walletAuth } from '@/lib/api/auth';
import { useAuth } from '@/contexts/auth-context';
import { WriteReferralContractHelper } from '@reffinity/blockchain-connector/writeReferralContractHelper';
import { join } from 'path';

interface WalletConnectStepProps {
  onSuccess: () => void;
  onReturningUser?: () => void;
}

export function WalletConnectStep({ onSuccess, onReturningUser }: WalletConnectStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const { login } = useAuth();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { writeContract } = useWriteContract();
  

  // Get MetaMask connector
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
      // Create a message for signing
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with Reffinity.\n\nTimestamp: ${timestamp}\nWallet: ${address}`;

      // Request signature from wallet
      const signature = await signMessageAsync({ message });

      // Send to backend for verification
      const response = await walletAuth(address, signature, message);

      // Store token and user data
      login(response.token, response.user);

      // If returning user, skip onboarding and go to dashboard
      if (!response.isNewUser && onReturningUser) {
        onReturningUser();
        return;
      }

      const joinProgramContext = await WriteReferralContractHelper.joinProgramContext();

      writeContract({
        ...joinProgramContext,
        args: [],
      })

      // Move to next step
      onSuccess();
    } catch (err) {
      console.error('Authentication error:', err);
      if (err instanceof Error) {
        if (err.message.includes('User rejected')) {
          setError('Signature request was rejected. Please try again.');
        } else {
          setError(err.message || 'Authentication failed. Please try again.');
        }
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError(null);
  };

  return (
    <div className="flex flex-col items-center py-4">
      {/* Wallet Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Wallet className="h-10 w-10 text-primary" />
      </div>

      {/* Title */}
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Connect Your Wallet
      </h3>

      {/* Description */}
      <p className="mb-6 text-center text-sm text-muted-foreground">
        {isConnected
          ? 'Sign a message to verify your wallet ownership and create your account.'
          : 'Connect your MetaMask wallet to get started with Reffinity.'}
      </p>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-4 w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Connected State */}
      {isConnected && address && (
        <div className="mb-4 w-full rounded-lg border border-border bg-secondary/50 p-3">
          <p className="text-xs text-muted-foreground">Connected Wallet</p>
          <p className="font-mono text-sm text-foreground">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
        </div>
      )}

      {/* Action Buttons */}
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
                  <path
                    d="M28.2295 23.5334L24.7346 29.1333L32.2282 31.1999L34.3839 23.6526L28.2295 23.5334Z"
                    fill="#E27625"
                  />
                  <path
                    d="M1.27271 23.6526L3.41681 31.1999L10.8987 29.1333L7.41553 23.5334L1.27271 23.6526Z"
                    fill="#E27625"
                  />
                  <path
                    d="M10.4706 14.5149L8.39209 17.6507L15.7921 17.9883L15.5516 9.97461L10.4706 14.5149Z"
                    fill="#E27625"
                  />
                  <path
                    d="M25.1505 14.5149L19.9929 9.88379L19.8241 17.9883L27.2124 17.6507L25.1505 14.5149Z"
                    fill="#E27625"
                  />
                  <path
                    d="M10.8987 29.1334L15.3435 26.9942L11.4909 23.7017L10.8987 29.1334Z"
                    fill="#E27625"
                  />
                  <path
                    d="M20.2776 26.9942L24.7346 29.1334L24.1307 23.7017L20.2776 26.9942Z"
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
                  Authenticating...
                </>
              ) : (
                'Sign & Continue'
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

      {/* MetaMask Install Link */}
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
  );
}
