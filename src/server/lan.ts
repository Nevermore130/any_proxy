import os from "node:os";

export type LanAddress = {
  interfaceName: string;
  address: string;
};

export function getLanAddresses(): LanAddress[] {
  const interfaces = os.networkInterfaces();
  const addresses: Array<LanAddress & { originalIndex: number }> = [];

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push({ interfaceName, address: entry.address, originalIndex: addresses.length });
      }
    }
  }

  return addresses
    .sort((left, right) => {
      const addressRankDelta = addressReachabilityRank(left.address) - addressReachabilityRank(right.address);
      if (addressRankDelta !== 0) {
        return addressRankDelta;
      }

      const interfaceRankDelta =
        interfaceReachabilityRank(left.interfaceName) - interfaceReachabilityRank(right.interfaceName);
      if (interfaceRankDelta !== 0) {
        return interfaceRankDelta;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map(({ interfaceName, address }) => ({ interfaceName, address }));
}

function addressReachabilityRank(address: string): number {
  if (isPrivateIpv4(address)) {
    return 0;
  }

  if (isLinkLocalIpv4(address)) {
    return 2;
  }

  return 1;
}

function interfaceReachabilityRank(interfaceName: string): number {
  const normalized = interfaceName.toLowerCase();

  if (/^(en|eth|wlan)\d*/.test(normalized)) {
    return 0;
  }

  if (/^(utun|tun|tap|ppp|ipsec|wg)\d*/.test(normalized) || normalized.includes("vpn")) {
    return 2;
  }

  if (/^(bridge|awdl|llw|vmnet|vboxnet|docker)\d*/.test(normalized)) {
    return 3;
  }

  return 1;
}

function isPrivateIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isLinkLocalIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  return Boolean(octets && octets[0] === 169 && octets[1] === 254);
}

function ipv4Octets(address: string): [number, number, number, number] | undefined {
  const octets = address.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return undefined;
  }

  return octets as [number, number, number, number];
}
