import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import '@solana/wallet-adapter-react-ui/styles.css'
import Monitor from './Monitor'
import { SyncProvider } from './src/sync'

const wallets = [new PhantomWalletAdapter()]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint="https://solana.publicnode.com">
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SyncProvider>
            <Monitor />
          </SyncProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
)
