import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.reybaudcyclehub',
  appName: 'reybaud-cycle-hub',
  webDir: 'dist',
  server: {
    url: 'https://6a1f3174-a013-459c-8bd9-30c01c52e32a.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
