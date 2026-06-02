import { NativeModule, requireNativeModule } from 'expo-modules-core';
import type { VpnStartConfig, VpnStatus, VpnStatusEvent } from './Vpn.types';

type VpnModuleEvents = {
  /** Emitted on every tunnel state / throughput change. */
  onStatusChange: (event: VpnStatusEvent) => void;
};

declare class VpnModule extends NativeModule<VpnModuleEvents> {
  /** Triggers the system VPN-consent dialog if needed; resolves true once granted. */
  prepare(): Promise<boolean>;
  /** Starts the foreground VPN tunnel with a backend-issued config. */
  start(config: VpnStartConfig): Promise<void>;
  /** Tears the tunnel down. */
  stop(): Promise<void>;
  getStatus(): Promise<VpnStatus>;
}

// Resolved natively at runtime; only present in a dev/preview/production build
// where the module is linked (not in Expo Go).
export default requireNativeModule<VpnModule>('Vpn');
