export type LocalAddressFetchInit = RequestInit & {
  targetAddressSpace?: "local"
}

export function buildFetchInit(
  url: string,
  init: RequestInit = {}
): LocalAddressFetchInit {
  if (!isLoopbackUrl(url)) {
    return init
  }

  return {
    ...init,
    targetAddressSpace: "local",
  }
}

export function isLoopbackUrl(url: string) {
  try {
    const parsed = new URL(url)

    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1"
    )
  } catch {
    return false
  }
}
