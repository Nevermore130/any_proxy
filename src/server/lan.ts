import os from "node:os";

export type LanAddress = {
  interfaceName: string;
  address: string;
};

export function getLanAddresses(): LanAddress[] {
  const interfaces = os.networkInterfaces();
  const addresses: LanAddress[] = [];

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push({ interfaceName, address: entry.address });
      }
    }
  }

  return addresses;
}
